// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

import { useState } from 'react'
import { call, type Delivery, type Webhook } from '../api'
import { Card, ErrorBox, Secret, fmt, useLoad } from '../ui'

const EVENTS = ['employee', 'contract', 'leave_request', 'payroll'].flatMap(e => ['created', 'updated', 'deleted'].map(o => `${e}.${o}`))

export default function Webhooks({ projectId }: { projectId: string }) {
  const hooks = useLoad(() => call<Webhook[]>(`/v1/projects/${projectId}/webhooks`), [projectId])
  const log = useLoad(() => call<Delivery[]>(`/v1/projects/${projectId}/webhook-deliveries`), [projectId])
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<string[]>(['employee.created'])
  const [secret, setSecret] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const toggle = (e: string) => setEvents(es => (es.includes(e) ? es.filter(x => x !== e) : [...es, e]))

  async function create() {
    setErr(null)
    try {
      const r = await call<Webhook & { secret: string }>(`/v1/projects/${projectId}/webhooks`, { method: 'POST', body: { url, events } })
      setSecret(r.secret); setUrl(''); hooks.reload()
    } catch (e) { setErr((e as Error).message) }
  }
  async function act(fn: () => Promise<unknown>) {
    setErr(null)
    try { await fn(); hooks.reload(); log.reload() } catch (e) { setErr((e as Error).message) }
  }

  return (
    <>
      {secret && <Secret label="Webhook secret (dùng để kiểm tra chữ ký X-PeopleOS-Signature)" value={secret} onClose={() => setSecret(null)} />}
      <Card title="Endpoint webhook">
        <ErrorBox message={hooks.error ?? err} />
        <table>
          <thead><tr><th>URL</th><th>Sự kiện</th><th /></tr></thead>
          <tbody>
            {hooks.data?.map(h => (
              <tr key={h.id}>
                <td>{h.url}</td><td>{h.events.join(', ')}</td>
                <td className="row">
                  <button className="ghost" onClick={() => void act(() => call(`/v1/projects/${projectId}/webhooks/${h.id}/test`, { method: 'POST' }))}>Gửi thử</button>
                  <button className="danger" onClick={() => void act(() => call(`/v1/projects/${projectId}/webhooks/${h.id}`, { method: 'DELETE' }))}>Xóa</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="Thêm endpoint">
        <label>URL (https, địa chỉ công cộng)<input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://api.acme.vn/hooks/peopleos" /></label>
        <div className="chips">{EVENTS.map(e => <label key={e} className="inline"><input type="checkbox" checked={events.includes(e)} onChange={() => toggle(e)} />{e}</label>)}</div>
        <button disabled={!url.trim() || events.length === 0} onClick={() => void create()}>Thêm webhook</button>
      </Card>
      <Card title="Nhật ký giao" right={<button className="ghost" onClick={log.reload}>Làm mới</button>}>
        <table>
          <thead><tr><th>Sự kiện</th><th>Trạng thái</th><th>Lần thử</th><th>Mã</th><th>Lúc</th><th /></tr></thead>
          <tbody>
            {log.data?.map(d => (
              <tr key={d.id}>
                <td>{d.event_type}</td><td><span className={`pill ${d.status}`}>{d.status}</span></td><td>{d.attempts}</td>
                <td title={d.last_error ?? ''}>{d.last_status ?? '—'}</td><td>{fmt(d.created_at)}</td>
                <td>{d.status !== 'pending' && <button className="ghost" onClick={() => void act(() => call(`/v1/projects/${projectId}/webhook-deliveries/${d.id}/replay`, { method: 'POST' }))}>Giao lại</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  )
}
