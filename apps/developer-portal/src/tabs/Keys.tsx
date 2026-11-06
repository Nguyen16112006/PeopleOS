// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

import { useState } from 'react'
import { call, type ApiKey } from '../api'
import { Card, ErrorBox, Secret, fmt, useLoad } from '../ui'

export default function Keys({ projectId }: { projectId: string }) {
  const { data, error, reload } = useLoad(() => call<ApiKey[]>(`/v1/projects/${projectId}/api-keys`), [projectId])
  const [name, setName] = useState('')
  const [scope, setScope] = useState<'read' | 'write'>('read')
  const [env, setEnv] = useState<'sandbox' | 'live'>('sandbox')
  const [fresh, setFresh] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function create() {
    setErr(null)
    try {
      const r = await call<ApiKey & { key: string }>(`/v1/projects/${projectId}/api-keys`, { method: 'POST', body: { name, scope, env } })
      setFresh(r.key); setName(''); reload()
    } catch (e) { setErr((e as Error).message) }
  }
  async function revoke(k: ApiKey) {
    if (!window.confirm(`Thu hồi khóa ${k.prefix}…? Ứng dụng đang dùng khóa này sẽ ngừng hoạt động.`)) return
    try { await call<void>(`/v1/projects/${projectId}/api-keys/${k.id}`, { method: 'DELETE' }); reload() } catch (e) { setErr((e as Error).message) }
  }

  return (
    <>
      {fresh && <Secret label="API key mới" value={fresh} onClose={() => setFresh(null)} />}
      <Card title="API keys">
        <ErrorBox message={error ?? err} />
        <table>
          <thead><tr><th>Tên</th><th>Tiền tố</th><th>Phạm vi</th><th>Môi trường</th><th>Tạo lúc</th><th /></tr></thead>
          <tbody>
            {data?.map(k => (
              <tr key={k.id} className={k.revoked_at ? 'muted' : ''}>
                <td>{k.name}</td><td><code>{k.prefix}…</code></td><td>{k.scope}</td><td>{k.env}</td><td>{fmt(k.created_at)}</td>
                <td>{k.revoked_at ? 'đã thu hồi' : <button className="danger" onClick={() => void revoke(k)}>Thu hồi</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="Tạo API key">
        <label>Tên<input value={name} onChange={e => setName(e.target.value)} placeholder="server-backend" /></label>
        <div className="row">
          <label>Phạm vi<select value={scope} onChange={e => setScope(e.target.value as 'read' | 'write')}><option value="read">read (chỉ đọc)</option><option value="write">write (đọc + ghi)</option></select></label>
          <label>Môi trường<select value={env} onChange={e => setEnv(e.target.value as 'sandbox' | 'live')}><option value="sandbox">sandbox</option><option value="live">live</option></select></label>
        </div>
        <button disabled={!name.trim()} onClick={() => void create()}>Tạo khóa</button>
      </Card>
    </>
  )
}
