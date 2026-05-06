// 续写时用于过滤「过渡语」和「重复开头」
// 流式场景：前 ~200 字符进入缓冲区清洗一次，之后转直通
const TRANSITIONAL_PATTERNS: RegExp[] = [
  /^(好的|当然|没问题|明白|收到|继续|让我继续|那么继续|嗯)[，,。.：:!]?\s*/,
  /^[（(【\[]?(接[上前]文|续上文|续)[）)】\]]?\s*[：:。.,，]*\s*\n*/,
  /^—{2,}\s*\n*/,
  /^（继续）\s*/,
  /^\(continued\)\s*/i,
]
// 检测续写第一段是否完整重复了截断前最后一行
function stripLeadingRepeat(continuation: string, prevTail: string): string {
  const tailLines = prevTail.split("\n").filter((l) => l.trim().length > 0)
  if (tailLines.length === 0) return continuation
  const lastLine = tailLines[tailLines.length - 1]!.trim()
  if (lastLine.length < 8) return continuation // 太短不可信
  const lines = continuation.split("\n")
  for (let i = 0; i < Math.min(3, lines.length); i++) {
    const line = lines[i]!.trim()
    if (line === lastLine || (line.length > 8 && lastLine.includes(line))) {
      return lines.slice(i + 1).join("\n").replace(/^\n+/, "")
    }
  }
  return continuation
}
export function cleanContinuation(buffer: string, prevTail: string): string {
  let s = buffer
  for (const re of TRANSITIONAL_PATTERNS) {
    s = s.replace(re, "")
  }
  s = stripLeadingRepeat(s, prevTail)
  return s
}
