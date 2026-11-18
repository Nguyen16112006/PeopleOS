// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

import { useState } from 'react'
import { call, type Delivery, type Webhook } from '../api'
import { Card, ErrorBox, Secret, Status, fmt, useLoad } from '../ui'
import { useConfirm } from '../confirm'

const ENTITIES: [string, string][] = [['employee', 'Nhân viên'], ['contract', 'Hợp đồng'], ['leave_request', 'Đơn nghỉ phép'], ['payroll', 'Bảng lương']]
const OPS = ['created', 'updated', 'deleted']

export default function Webhooks({ projectId }: { projectId: string }) {
  const hooks = useLoad(() => call<Webhook[]>(`/v1/projects/${projectId}/webhooks`), [projectId])
  const confirm = useConfirm()
  const log = useLoad(() => call<Delivery[]>(`/v1/projects/${projectId}/webhook-deliveries`), [projectId])
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<string[]>(['employee.created'])
  const [secret, setSecret] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const toggle = (e: string) => setEvents(es => (es.includes(e) ? es.filter(x => x !== e) : [...es, e]))

  async function create() {
    setErr(null); setNotice(null)
    try {
      const r = await call<Webhook & { secret: string }>(`/v1/projects/${projectId}/webhooks`, { method: 'POST', body: { url, events } })
      setSecret(r.secret); setUrl(''); hooks.reload()
    } catch (e) { setErr((e as Error).message) }
  }
  async function act(fn: () => Promise<unknown>, done: string) {
    setErr(null); setNotice(null)
    try { await fn(); setNotice(done); hooks.reload(); log.reload() } catch (e) { setErr((e as Error).message) }
  }

  return (
    <>
      {secret && <Secret label="Khóa bí mật của webhook (dùng để kiểm tra chữ ký X-PeopleOS-Signature)" value={secret} onClose={() => setSecret(null)} />}
      <Card title="Địa chỉ nhận sự kiện">
        <ErrorBox message={hooks.error ?? err} />
        {notice && <p className="ok" role="status">{notice}</p>}
        {hooks.data?.length === 0 ? <p className="empty">Chưa có địa chỉ nào nhận sự kiện.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>URL</th><th>Sự kiện</th><th /></tr></thead>
              <tbody>
                {hooks.data?.map(h => (
                  <tr key={h.id}>
                    <td style={{ wordBreak: 'break-all' }}>{h.url}</td>
                    <td>{h.events.map(e => <code key={e} style={{ marginRight: 6 }}>{e}</code>)}</td>
                    <td className="actions">
                      <button className="ghost small" onClick={() => void act(() => call(`/v1/projects/${projectId}/webhooks/${h.id}/test`, { method: 'POST' }), 'Đã gửi sự kiện thử. Xem kết quả ở nhật ký bên dưới.')}>Gửi thử</button>
                      <button className="danger small" onClick={async () => { if (await confirm({ title: 'Xóa webhook này?', confirmLabel: 'Xóa webhook', body: <>PeopleOS sẽ ngừng gửi sự kiện tới <code>{h.url}</code>. Nhật ký gửi cũ vẫn được giữ.</> })) void act(() => call(`/v1/projects/${projectId}/webhooks/${h.id}`, { method: 'DELETE' }), 'Đã xóa webhook.') }}>Xóa</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Thêm địa chỉ nhận">
        <label>URL <span className="opt">(https, truy cập được từ Internet)</span>
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://api.anphat.vn/hooks/peopleos" />
        </label>
        <p className="hint" style={{ marginBottom: 6 }}>Chọn sự kiện muốn nhận</p>
        {ENTITIES.map(([key, label]) => (
          <div key={key}>
            <b style={{ fontSize: 14 }}>{label}</b>
            <div className="chips">
              {OPS.map(o => `${key}.${o}`).map(e => (
                <label key={e} className="inline"><input type="checkbox" checked={events.includes(e)} onChange={() => toggle(e)} /><code>{e}</code></label>
              ))}
            </div>
          </div>
        ))}
        <button disabled={!url.trim() || events.length === 0} onClick={() => void create()}>Thêm webhook</button>
      </Card>

      <Card title="Nhật ký gửi sự kiện" right={<button className="ghost small" onClick={log.reload}>Làm mới</button>}>
        {log.data?.length === 0 ? <p className="empty">Chưa có sự kiện nào được gửi.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Sự kiện</th><th>Trạng thái</th><th>Số lần thử</th><th>Mã phản hồi</th><th>Thời điểm</th><th /></tr></thead>
              <tbody>
                {log.data?.map(d => (
                  <tr key={d.id}>
                    <td><code>{d.event_type}</code></td>
                    <td><Status value={d.status} failedLabel="Đang thử lại" /></td>
                    <td>{d.attempts}</td>
                    <td title={d.last_error ?? ''}>{d.last_status ?? '—'}</td>
                    <td>{fmt(d.created_at)}</td>
                    <td className="actions">{d.status !== 'pending' && (
                      <button className="ghost small" onClick={() => void act(() => call(`/v1/projects/${projectId}/webhook-deliveries/${d.id}/replay`, { method: 'POST' }), 'Đã xếp lịch gửi lại.')}>Gửi lại</button>
                    )}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}
