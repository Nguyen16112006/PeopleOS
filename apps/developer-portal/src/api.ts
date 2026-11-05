// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

import { freshToken } from './auth'

export const PLATFORM_API: string = import.meta.env.VITE_PLATFORM_API ?? 'http://localhost:9080/platform'
export const GATEWAY_URL: string = import.meta.env.VITE_GATEWAY_URL ?? 'http://localhost:9080'

export type Project = { id: string; short_id: string; name: string; plan: string; tier: string; status: string; created_at: string }
export type ApiKey = { id: string; name: string; prefix: string; scope: string; env: string; created_at: string; revoked_at: string | null }
export type TableInfo = { table: string; columns: { name: string; type: string; nullable: boolean }[] }
export type SchemaVersion = { version: number; table_name: string; action: string; created_at: string }
export type CustomFieldDef = { entity: string; key: string; type: string; required: boolean; options: string[] | null }
export type Webhook = { id: string; url: string; events: string[]; active: boolean; created_at: string }
export type Delivery = { id: string; event_type: string; status: string; attempts: number; last_status: number | null; last_error: string | null; created_at: string }

export async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(PLATFORM_API + path, {
    method: init.method ?? 'GET',
    headers: { Authorization: `Bearer ${await freshToken()}`, 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  if (res.status === 204) return undefined as T
  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const detail = (data as { detail?: unknown } | null)?.detail
    throw new Error(typeof detail === 'string' ? detail : `Lỗi ${res.status}`)
  }
  return data as T
}

export type Usage = { plan: string; daily_quota: number; today: { requests: number; remaining: number }; days: { day: string; requests: number; errors_4xx: number; errors_5xx: number; bytes_out: number }[] }
