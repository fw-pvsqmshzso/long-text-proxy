// 流式接收时维护「是否处于不可切断结构内」的状态
// 用于判断哪里是「安全切点」
export class OutputStateMachine {
  private inFence = false        // ``` 三重反引号代码块
  private inInlineCode = false   // 单反引号内
  private inMathBlock = false    // $$ 块级公式
  private bracketDepth = 0       // { [ ( 嵌套深度
  private last3 = ""             // 最近 3 个字符（识别 ``` $$）
  private escapeNext = false     // \ 转义

  feed(text: string): void {
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]!
      this.last3 = (this.last3 + ch).slice(-3)
      if (this.escapeNext) {
        this.escapeNext = false
        continue
      }
      if (ch === "\\") {
        this.escapeNext = true
        continue
      }
      // 三重反引号优先级最高
      if (this.last3 === "```") {
        this.inFence = !this.inFence
        this.last3 = ""
        continue
      }
      // 处于代码块内，仅追踪闭合的 ```，其他都跳过
      if (this.inFence) continue
      // 块级公式 $$
      if (ch === "$" && this.last3.endsWith("$$")) {
        this.inMathBlock = !this.inMathBlock
        this.last3 = ""
        continue
      }
      if (this.inMathBlock) continue
      // 单反引号
      if (ch === "`") {
        this.inInlineCode = !this.inInlineCode
        continue
      }
      if (this.inInlineCode) continue
      // 括号嵌套
      if (ch === "{" || ch === "[" || ch === "(") {
        this.bracketDepth++
      } else if (ch === "}" || ch === "]" || ch === ")") {
        if (this.bracketDepth > 0) this.bracketDepth--
      }
    }
  }

  isClean(): boolean {
    return (
      !this.inFence &&
      !this.inInlineCode &&
      !this.inMathBlock &&
      this.bracketDepth === 0 &&
      !this.escapeNext
    )
  }
}
