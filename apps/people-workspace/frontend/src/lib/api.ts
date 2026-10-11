import { getToken, primaryRole } from './keycloak'

export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:9080'
export const WS_URL: string = import.meta.env.VITE_WS_URL ?? 'ws://localhost:9080/ws'

async function authHeaders(): Promise<Record<string, string>> {
  return { Authorization: `Bearer ${await getToken()}` }
}

function errorText(body: any, status: number): string {
  const d = body?.detail
  if (typeof d === 'string') return d
  if (Array.isArray(d)) return d.map((e) => e.msg ?? JSON.stringify(e)).join('; ')
  return body?.message ?? body?.error ?? `Lỗi HTTP ${status}`
}

/** Gọi GraphQL (Hasura) qua API Gateway - quyền dữ liệu do Hasura quyết định theo vai trò. */
export async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${API_URL}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-hasura-role': primaryRole(), ...(await authHeaders()) },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.errors) throw new Error(json.errors?.[0]?.message ?? errorText(json, res.status))
  return json.data as T
}

/** Gọi REST của BFF qua API Gateway. */
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(await authHeaders()) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(errorText(json, res.status))
  return json as T
}

/** Tải tệp (PDF) cần header Authorization nên phải fetch -> blob -> lưu. */
export async function download(path: string, filename: string): Promise<void> {
  const res = await fetch(`${API_URL}${path}`, { headers: await authHeaders() })
  if (!res.ok) throw new Error(errorText(await res.json().catch(() => ({})), res.status))
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function upload<T>(path: string, file: File): Promise<T> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${API_URL}${path}`, { method: 'POST', headers: await authHeaders(), body: form })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(errorText(json, res.status))
  return json as T
}
