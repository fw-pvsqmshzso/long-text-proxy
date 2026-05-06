import { estimateTokens } from "../tokenizer"
import { config } from "../config"
import type { ChatMessage } from "../types"

// 把超长内容按 \n 切成 N 段，每段尽量 ≤ 目标 token 数
function splitByNewline(content: string, targetTokens: number): string[] {
    if (estimateTokens(content) <= targetTokens) return [content]

    const lines = content.split("\n")
    const chunks: string[] = []
    let cur = ""
    for (const line of lines) {
        const candidate = cur === "" ? line : cur + "\n" + line
        if (estimateTokens(candidate) > targetTokens && cur !== "") {
            chunks.push(cur)
            cur = line
        } else {
            cur = candidate
        }
    }
    if (cur !== "") chunks.push(cur)

    // 兜底：单行仍超硬上限（minified JSON / base64 等），按字符均分强切
    const final: string[] = []
    for (const c of chunks) {
        if (estimateTokens(c) <= config.CHUNK_HARD_LIMIT) {
            final.push(c)
        } else {
            const partsCount = Math.ceil(estimateTokens(c) / targetTokens)
            const sliceLen = Math.ceil(c.length / partsCount)
            for (let i = 0; i < c.length; i += sliceLen) {
                final.push(c.slice(i, i + sliceLen))
            }
        }
    }
    return final
}

// 把所有消息按顺序拼成一个大文本（带角色标记），整体切成多段 user 消息
// 中间夹 fake assistant ack，让 AI 看着像正常分段对话
export function expandLongMessages(messages: ChatMessage[]): ChatMessage[] {
    const target = config.CHUNK_TARGET_TOKENS

    const roleLabel = (r: string) =>
        r === "system" ? "[系统]" : r === "user" ? "[用户]" : "[角色]"
    const flat = messages
        .map(m => `${roleLabel(m.role)}\n${m.content}`)
        .join("\n\n")

    if (estimateTokens(flat) <= target) {
        return messages
    }

    const chunks = splitByNewline(flat, target)
    const expanded: ChatMessage[] = []

    for (let j = 0; j < chunks.length; j++) {
        const idx = j + 1
        const total = chunks.length
        const chunk = chunks[j]!
        const isLast = j === chunks.length - 1

        if (!isLast) {
            expanded.push({
                role: "user",
                content: `【对话上下文 ${idx}/${total}，未完。请仅回复"已收到 ${idx}/${total}"，不要做任何其他回应】\n\n${chunk}`,
            })
            expanded.push({
                role: "assistant",
                content: `已收到 ${idx}/${total}，等待后续`,
            })
        } else {
            expanded.push({
                role: "user",
                content: `【对话上下文 ${idx}/${total}，已完。以上 ${total} 段拼起来是完整的设定、世界书、聊天记录和当前发言。请按你的角色身份继续对话，直接进入下一句台词，不要总结、不要说"我看完了"】\n\n${chunk}`,
            })
        }
    }

    return expanded
}
