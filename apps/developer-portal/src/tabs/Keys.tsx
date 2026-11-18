// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

import { useState } from 'react'
import { call, type ApiKey } from '../api'
import { Card, ErrorBox, Secret, fmt, useLoad } from '../ui'
import { useConfirm } from '../confirm'

const SCOPE: Record<string, string> = { read: 'Chỉ đọc', write: 'Đọc và ghi' }
const ENV: Record<string, string> = { sandbox: 'Thử nghiệm', live: 'Chính thức' }

export default function Keys({ projectId }: { projectId: string }) {
  const { data, error, reload } = useLoad(() => call<ApiKey[]>(`/v1/projects/${projectId}/api-keys`), [projectId])
  const confirm = useConfirm()
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
    if (!await confirm({ title: `Thu hồi khóa "${k.name}"?`, confirmLabel: 'Thu hồi khóa',
      body: <>Khóa <code>{k.prefix}…</code> ngừng hoạt động ngay; ứng dụng đang dùng khóa này sẽ nhận lỗi 401 cho tới khi đổi sang khóa mới.</> })) return
    try { await call<void>(`/v1/projects/${projectId}/api-keys/${k.id}`, { method: 'DELETE' }); reload() } catch (e) { setErr((e as Error).message) }
  }

  return (
    <>
      {fresh && <Secret label="API key vừa tạo" value={fresh} onClose={() => setFresh(null)} />}
      <Card title="Khóa đang có">
        <ErrorBox message={error ?? err} />
        {data?.length === 0 ? <p className="empty">Dự án chưa có API key nào.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Tên</th><th>Tiền tố</th><th>Quyền</th><th>Môi trường</th><th>Ngày tạo</th><th /></tr></thead>
              <tbody>
                {data?.map(k => (
                  <tr key={k.id} className={k.revoked_at ? 'muted' : ''}>
                    <td>{k.name}</td><td><code>{k.prefix}…</code></td><td>{SCOPE[k.scope] ?? k.scope}</td><td>{ENV[k.env] ?? k.env}</td><td>{fmt(k.created_at)}</td>
                    <td className="actions">{k.revoked_at ? `Thu hồi ${fmt(k.revoked_at)}` : <button className="danger small" onClick={() => void revoke(k)}>Thu hồi</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card title="Tạo API key">
        <label>Tên gợi nhớ<input value={name} onChange={e => setName(e.target.value)} placeholder="Ví dụ: máy chủ backend" /></label>
        <div className="row">
          <label>Quyền
            <select value={scope} onChange={e => setScope(e.target.value as 'read' | 'write')}>
              <option value="read">Chỉ đọc</option><option value="write">Đọc và ghi</option>
            </select>
          </label>
          <label>Môi trường
            <select value={env} onChange={e => setEnv(e.target.value as 'sandbox' | 'live')}>
              <option value="sandbox">Thử nghiệm (sandbox)</option><option value="live">Chính thức (live)</option>
            </select>
          </label>
          <button disabled={!name.trim()} onClick={() => void create()}>Tạo khóa</button>
        </div>
      </Card>
    </>
  )
}
