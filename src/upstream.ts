import type { ChatMessage } from "./types"

export function normalizeUpstreamBaseUrl(upstreamUrl: string): string {
  return upstreamUrl
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/(?:v1\/)?(?:chat\/completions|models)$/i, "")
}

export function normalizeApiKey(apiKey: string): string {
  return apiKey.trim().replace(/^Bearer\s+/i, "").trim()
}

export interface UpstreamRequest {
  model: string
  messages: ChatMessage[]
  temperature?: number
  top_p?: number
  max_tokens?: number
  stop?: string | string[]
}

// 调用上游：始终用 stream=true，方便我们边收边判断截断
// 凭据由调用方传入，不再从 config 读
export async function callUpstream(
  upstreamUrl: string,
  apiKey: string,
  req: UpstreamRequest,
  signal?: AbortSignal,
): Promise<Response> {
  const base = normalizeUpstreamBaseUrl(upstreamUrl)
  const normalizedKey = normalizeApiKey(apiKey)
  const chatUrl = base.endsWith("/v1") ? `${base}/chat/completions` : `${base}/v1/chat/completions`
  const resp = await fetch(chatUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${normalizedKey}`,
    },
    body: JSON.stringify({ ...req, stream: true }),
    signal,
  })
  if (!resp.ok || !resp.body) {
    const errText = await resp.text().catch(() => "")
    throw new Error(`Upstream ${resp.status}: ${errText.slice(0, 500)}`)
  }
  return resp
}

// 拉取上游模型列表
export async function fetchModels(upstreamUrl: string, apiKey: string): Promise<string[]> {
  const base = normalizeUpstreamBaseUrl(upstreamUrl)
  const normalizedKey = normalizeApiKey(apiKey)
  const modelsUrl = base.endsWith("/v1") ? `${base}/models` : `${base}/v1/models`
  const resp = await fetch(modelsUrl, {
    headers: { Authorization: `Bearer ${normalizedKey}` },
  })
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "")
    throw new Error(`Models fetch failed ${resp.status}: ${errText.slice(0, 300)}`)
  }
  const data = await resp.json() as any
  const models: string[] = (data.data ?? []).map((m: any) => m.id).filter(Boolean)
  models.sort()
  return models
}

// 解析 OpenAI SSE 流，按 content delta 字符串产出
export async function* parseSSE(resp: Response): AsyncGenerator<string, void, void> {
  const reader = resp.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const event = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      for (const line of event.split("\n")) {
        if (!line.startsWith("data:")) continue
        const data = line.slice(5).trim()
        if (data === "[DONE]") return
        try {
          const obj = JSON.parse(data)
          const delta: string | undefined = obj?.choices?.[0]?.delta?.content
          if (typeof delta === "string" && delta.length > 0) {
            yield delta
          }
        } catch {
          // 忽略解析失败（保活心跳等）
        }
      }
    }
  }
}
