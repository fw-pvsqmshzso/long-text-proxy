// 粗略 token 估算：CJK 字符 ≈ 1 token，ASCII ≈ 0.3 token
// 偏保守，确保不会低估实际 token 数
// 如需精确可换成 js-tiktoken（cl100k_base）
export function estimateTokens(text: string): number {
  let cjk = 0
  let ascii = 0
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code > 127) cjk++
    else ascii++
  }
  return Math.ceil(cjk * 1.0 + ascii * 0.3)
}
