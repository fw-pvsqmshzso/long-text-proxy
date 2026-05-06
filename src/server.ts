import { config } from "./config"
import { handleChatCompletions } from "./handlers/chatCompletions"
import { handleHealth } from "./handlers/health"
import { fetchModels, normalizeApiKey, normalizeUpstreamBaseUrl } from "./upstream"
import { insertKey, lookupKey } from "./db"
import { networkInterfaces } from "node:os"

function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  })
}

function unauthorized(): Response {
  return json({ error: { message: "unauthorized" } }, 401)
}

function notFound(): Response {
  return json({ error: { message: "not found" } }, 404)
}

function maskSecret(value: string): string {
  if (value.length <= 12) return `${value.slice(0, 4)}…(${value.length})`
  return `${value.slice(0, 8)}…${value.slice(-4)}(${value.length})`
}

function getReachableOrigins(port: number): string[] {
  const origins: string[] = []
  for (const iface of Object.values(networkInterfaces())) {
    for (const item of iface ?? []) {
      if (item.family !== "IPv4" || item.internal) continue
      origins.push(`http://${item.address}:${port}`)
    }
  }
  return [...new Set(origins)].sort((a, b) => scoreOrigin(a) - scoreOrigin(b))
}

function scoreOrigin(origin: string): number {
  if (/http:\/\/192\.168\./.test(origin)) return 0
  if (/http:\/\/10\./.test(origin)) return 1
  if (/http:\/\/172\.(1[6-9]|2\d|3[0-1])\./.test(origin)) return 2
  return 3
}

// 返回给酒馆的 /v1/models —— 根据 proxy key 查库返回对应模型
function handleModelsForProxy(proxyKey: string): Response {
  const row = lookupKey(proxyKey)
  if (!row) return unauthorized()
  return json({
    object: "list",
    data: [{
      id: row.model,
      object: "model",
      created: Math.floor(Date.now() / 1000),
      owned_by: "proxy",
    }],
  })
}

function hasEnvUpstream(): boolean {
  return Boolean(config.UPSTREAM_BASE_URL && config.UPSTREAM_API_KEY && config.UPSTREAM_MODEL)
}

function isEnvAuthToken(token: string): boolean {
  return Boolean(config.AUTH_TOKEN && token === config.AUTH_TOKEN)
}

function handleModelsForEnv(): Response {
  return json({
    object: "list",
    data: [{
      id: config.UPSTREAM_MODEL,
      object: "model",
      created: Math.floor(Date.now() / 1000),
      owned_by: "proxy-env",
    }],
  })
}

const server = Bun.serve({
  port: config.LISTEN_PORT,
  hostname: config.LISTEN_HOST,
  async fetch(req) {
    const url = new URL(req.url)
    const path = url.pathname.replace(/\/+$/, "") || "/"

    // 请求级日志（健康检查不打，免得刷屏）
    if (path !== "/health" && path !== "/") {
      console.log(`[${new Date().toISOString()}] ${req.method} ${path}`)
    }

    // --- 公开端点（不需要鉴权） ---

    if (path === "/health") return handleHealth()

    // 前端页面
    if ((req.method === "GET" || req.method === "HEAD") && path === "/") {
      return new Response(Bun.file("./src/frontend.html"), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      })
    }

    // 背景图
    if (req.method === "GET" && path === "/bg.jpg") {
      return new Response(Bun.file("./src/008.jpg"), {
        headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" },
      })
    }


    // 当前机器可被其它设备访问的地址。代码在谁电脑上跑，就返回谁电脑的地址；不硬编码任何人的 IP。
    if (req.method === "GET" && path === "/api/addresses") {
      return json({ origins: getReachableOrigins(config.LISTEN_PORT) })
    }

    // 验证 key 并拉取模型列表
    if (req.method === "POST" && path === "/api/models") {
      try {
        const body = await req.json() as { url?: string; key?: string }
        if (!body.url || !body.key) return json({ error: "missing url or key" }, 400)
        const url = normalizeUpstreamBaseUrl(body.url)
        const key = normalizeApiKey(body.key)
        console.log(`  → /api/models upstream=${url}`)
        const models = await fetchModels(url, key)
        return json({ models })
      } catch (err: any) {
        console.log(`  → /api/models failed: ${err?.message ?? String(err)}`)
        return json({ error: err?.message ?? String(err) }, 400)
      }
    }

    // 注册：生成 proxy key
    if (req.method === "POST" && path === "/api/register") {
      try {
        const body = await req.json() as { url?: string; key?: string; model?: string }
        if (!body.url || !body.key || !body.model) return json({ error: "missing url, key, or model" }, 400)
        const url = normalizeUpstreamBaseUrl(body.url)
        const key = normalizeApiKey(body.key)
        const proxyKey = `sk-ltp-${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`
        insertKey(proxyKey, url, key, body.model)
        return json({ proxyKey })
      } catch (err: any) {
        return json({ error: err?.message ?? String(err) }, 500)
      }
    }

    // --- 需要鉴权的端点（酒馆调用） ---

    const auth = req.headers.get("authorization") ?? ""
    const token = auth.replace(/^Bearer\s+/i, "")
    if (!token) return unauthorized()

    const row = lookupKey(token)
    const envAuthorized = isEnvAuthToken(token) && hasEnvUpstream()
    if (!row && !envAuthorized) return unauthorized()

    if (req.method === "GET" && (path === "/v1/models" || path === "/models")) {
      return row ? handleModelsForProxy(token) : handleModelsForEnv()
    }

    if (
      req.method === "POST" &&
      (path === "/v1/chat/completions" || path === "/chat/completions")
    ) {
      return handleChatCompletions(req, row ? {
        upstream_url: row.upstream_url,
        api_key: row.api_key,
        model: row.model,
      } : {
        upstream_url: config.UPSTREAM_BASE_URL,
        api_key: config.UPSTREAM_API_KEY,
        model: config.UPSTREAM_MODEL,
      })
    }

    return notFound()
  },
})

console.log(`[long-text-proxy] listening on http://${config.LISTEN_HOST}:${server.port}`)
