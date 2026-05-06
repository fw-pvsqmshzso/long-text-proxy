// 仅声明我们关心的 OpenAI 协议子集
export type Role = "system" | "user" | "assistant"
export interface ChatMessage {
  role: Role
  content: string
  name?: string
}
export interface ChatCompletionRequest {
  model: string
  messages: ChatMessage[]
  stream?: boolean
  temperature?: number
  top_p?: number
  max_tokens?: number
  stop?: string | string[]
  // 工具相关字段会被无视（v0.1 不支持）
  [key: string]: unknown
}
export interface ChatCompletionChunk {
  id: string
  object: "chat.completion.chunk"
  created: number
  model: string
  choices: Array<{
    index: number
    delta: { role?: Role; content?: string }
    finish_reason: "stop" | "length" | "content_filter" | null
  }>
}
