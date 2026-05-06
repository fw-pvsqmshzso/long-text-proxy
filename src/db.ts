import { Database } from "bun:sqlite"

const db = new Database("data.db")
db.run("PRAGMA journal_mode=WAL")

db.run(`
  CREATE TABLE IF NOT EXISTS keys (
    proxy_key TEXT PRIMARY KEY,
    upstream_url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    model TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )
`)

export function insertKey(proxyKey: string, upstreamUrl: string, apiKey: string, model: string) {
  db.run(
    "INSERT INTO keys (proxy_key, upstream_url, api_key, model, created_at) VALUES (?, ?, ?, ?, ?)",
    [proxyKey, upstreamUrl, apiKey, model, Date.now()]
  )
}

export function lookupKey(proxyKey: string): { upstream_url: string; api_key: string; model: string } | null {
  return db.query("SELECT upstream_url, api_key, model FROM keys WHERE proxy_key = ?").get(proxyKey) as any
}
