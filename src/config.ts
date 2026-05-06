// 环境变量加载与校验 — 所有变量均有默认值，启动无需任何配置
function num(name: string, def: number): number {
    const v = process.env[name]
    if (!v) return def
    const n = Number(v)
    if (!Number.isFinite(n)) throw new Error(`Invalid number env ${name}: ${v}`)
    return n
}

function str(name: string, def: string): string {
    return process.env[name] ?? def
}

function bool(name: string, def: boolean): boolean {
    const v = process.env[name]
    if (!v) return def
    return v === "1" || v.toLowerCase() === "true"
}

export const config = {
    UPSTREAM_BASE_URL: str("UPSTREAM_BASE_URL", "").replace(/\/+$/, ""),
    UPSTREAM_API_KEY: str("UPSTREAM_API_KEY", ""),
    UPSTREAM_MODEL: str("UPSTREAM_MODEL", ""),
    LISTEN_PORT: num("LISTEN_PORT", 8787),
    LISTEN_HOST: str("LISTEN_HOST", "0.0.0.0"),
    AUTH_TOKEN: str("AUTH_TOKEN", ""),
    CHUNK_TARGET_TOKENS: num("CHUNK_TARGET_TOKENS", 2000),
    CHUNK_HARD_LIMIT: num("CHUNK_HARD_LIMIT", 2500),
    OUTPUT_SOFT_CUT: num("OUTPUT_SOFT_CUT", 9000),
    OUTPUT_HARD_CUT: num("OUTPUT_HARD_CUT", 9500),
    MAX_CONTINUATIONS: num("MAX_CONTINUATIONS", 20),
    LOG_LEVEL: str("LOG_LEVEL", "info"),
    LOG_PROMPTS: bool("LOG_PROMPTS", false),
} as const
