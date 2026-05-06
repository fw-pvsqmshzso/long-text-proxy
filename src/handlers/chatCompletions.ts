import { config } from "../config"
import { estimateTokens } from "../tokenizer"
import { callUpstream, parseSSE } from "../upstream"
import { OutputStateMachine } from "../chunking/stateMachine"
import { expandLongMessages } from "../chunking/input"
import { cleanContinuation } from "../postprocess"
import type { ChatCompletionRequest, ChatMessage } from "../types"

const CONTINUATION_PROMPT = `请从上文断点处精确续写。要求：(1) 不要重复任何已有内容；(2) 不要任何过渡语句（如"好的"、"继续"、"接上文"等）；(3) 保持完全相同的格式、缩进、标题层级、列表序号；(4) 直接从下一个字符开始。`

interface RunResult {
  finishReason: "stop" | "length"
}

// 核心编排：返回异步生成器，逐段产出「客户端可见」的 content 文本
async function* runConversation(
  upstreamUrl: string,
  apiKey: string,
  initialMessages: ChatMessage[],
  baseUpstreamReq: {
    model: string
    temperature?: number
    top_p?: number
    max_tokens?: number
    stop?: string | string[]
  },
  signal: AbortSignal,
): AsyncGenerator<string, RunResult, void> {
  let messages: ChatMessage[] = [...initialMessages]
  let totalAssembled = ""
  let continuations = 0

  while (true) {
    const isContinuation = continuations > 0
    const upstream = await callUpstream(upstreamUrl, apiKey, { ...baseUpstreamReq, messages }, signal)
    const sm = new OutputStateMachine()
    let roundContent = ""
    let cut = false

    // 续写时第一段缓冲清洗
    let cleaning = isContinuation
    let cleanBuffer = ""
    const CLEAN_BUFFER_LEN = 200
    const prevTail = totalAssembled.slice(-300)

    for await (const delta of parseSSE(upstream)) {
      roundContent += delta
      sm.feed(delta)

      if (cleaning) {
        cleanBuffer += delta
        if (cleanBuffer.length >= CLEAN_BUFFER_LEN) {
          const cleaned = cleanContinuation(cleanBuffer, prevTail)
          if (cleaned.length > 0) {
            yield cleaned
            totalAssembled += cleaned
          }
          cleanBuffer = ""
          cleaning = false
        }
      } else {
        yield delta
        totalAssembled += delta
      }

      // 截断判定
      const roundTokens = estimateTokens(roundContent)
      if (roundTokens >= config.OUTPUT_HARD_CUT) {
        cut = true
        break
      }
      if (
        roundTokens >= config.OUTPUT_SOFT_CUT &&
        sm.isClean() &&
        roundContent.endsWith("\n")
      ) {
        cut = true
        break
      }
    }

    // 上游流结束时清洗缓冲若有残留则放出
    if (cleaning && cleanBuffer.length > 0) {
      const cleaned = cleanContinuation(cleanBuffer, prevTail)
      if (cleaned.length > 0) {
        yield cleaned
        totalAssembled += cleaned
      }
    }

    if (!cut) return { finishReason: "stop" }
    continuations++
    if (continuations >= config.MAX_CONTINUATIONS) return { finishReason: "length" }

    // 构造续写请求
    messages = [
      ...initialMessages,
      { role: "assistant", content: totalAssembled },
      { role: "user", content: CONTINUATION_PROMPT },
    ]
  }
}

function chunkSSE(id: string, model: string, content: string): string {
  return `data: ${JSON.stringify({
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta: { content }, finish_reason: null }],
  })}\n\n`
}

function finalSSE(id: string, model: string, reason: "stop" | "length"): string {
  return `data: ${JSON.stringify({
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta: {}, finish_reason: reason }],
  })}\n\ndata: [DONE]\n\n`
}

// credentials 由 server.ts 从 SQLite 查出后传入
export async function handleChatCompletions(
  req: Request,
  credentials: { upstream_url: string; api_key: string; model: string },
): Promise<Response> {
  let body: ChatCompletionRequest
  try {
    body = await req.json() as ChatCompletionRequest
  } catch {
    return new Response(JSON.stringify({ error: { message: "invalid json" } }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }
  if (!Array.isArray(body.messages)) {
    return new Response(JSON.stringify({ error: { message: "messages must be array" } }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  console.log(`  → chat/completions: ${body.messages.length} messages, stream=${body.stream}, total_chars=${body.messages.reduce((s, m) => s + (typeof m.content === 'string' ? m.content.length : 0), 0)}`)

  // 输入分块
  const initialMessages = expandLongMessages(body.messages as ChatMessage[])
  console.log(`  → after expandLongMessages: ${initialMessages.length} messages`)
  const wantStream = body.stream === true
  const responseId = `chatcmpl-${crypto.randomUUID()}`
  const model = credentials.model

  const baseUpstreamReq = {
    model,
    temperature: body.temperature,
    top_p: body.top_p,
    max_tokens: body.max_tokens,
    stop: body.stop,
  }

  const ac = new AbortController()
  req.signal.addEventListener("abort", () => ac.abort())

  if (wantStream) {
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const enc = new TextEncoder()
        try {
          const gen = runConversation(credentials.upstream_url, credentials.api_key, initialMessages, baseUpstreamReq, ac.signal)
          let finishReason: "stop" | "length" = "stop"
          while (true) {
            const r = await gen.next()
            if (r.done) {
              finishReason = r.value.finishReason
              break
            }
            controller.enqueue(enc.encode(chunkSSE(responseId, model, r.value)))
          }
          controller.enqueue(enc.encode(finalSSE(responseId, model, finishReason)))
        } catch (err: any) {
          controller.enqueue(
            enc.encode(
              `data: ${JSON.stringify({ error: { message: err?.message ?? String(err) } })}\n\ndata: [DONE]\n\n`,
            ),
          )
        }
        controller.close()
      },
    })
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    })
  } else {
    try {
      let collected = ""
      const gen = runConversation(credentials.upstream_url, credentials.api_key, initialMessages, baseUpstreamReq, ac.signal)
      let finishReason: "stop" | "length" = "stop"
      while (true) {
        const r = await gen.next()
        if (r.done) {
          finishReason = r.value.finishReason
          break
        }
        collected += r.value
      }
      return new Response(
        JSON.stringify({
          id: responseId,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: collected },
              finish_reason: finishReason,
            },
          ],
        }),
        { headers: { "Content-Type": "application/json; charset=utf-8" } },
      )
    } catch (err: any) {
      return new Response(
        JSON.stringify({ error: { message: err?.message ?? String(err) } }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      )
    }
  }
}
