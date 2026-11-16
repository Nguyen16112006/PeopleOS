// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

import { useState } from 'react'
import { call, type SchemaVersion, type TableInfo } from '../api'
import { Card, ErrorBox, Icon, fmt, useLoad } from '../ui'

const TYPES = ['text', 'int', 'bigint', 'numeric', 'boolean', 'date', 'timestamptz', 'uuid', 'jsonb'] as const
const ACTION: Record<string, string> = { create_table: 'Tạo bảng', drop_table: 'Xóa bảng', create: 'Tạo bảng', drop: 'Xóa bảng' }
type Col = { name: string; type: (typeof TYPES)[number]; nullable: boolean; unique: boolean; references: boolean }
const blank = (): Col => ({ name: '', type: 'text', nullable: true, unique: false, references: false })

export default function Schema({ projectId, shortId }: { projectId: string; shortId: string }) {
  const tables = useLoad(() => call<TableInfo[]>(`/v1/projects/${projectId}/schema/tables`), [projectId])
  const versions = useLoad(() => call<SchemaVersion[]>(`/v1/projects/${projectId}/schema/versions`), [projectId])
  const [table, setTable] = useState('')
  const [cols, setCols] = useState<Col[]>([blank()])
  const [err, setErr] = useState<string | null>(null)

  const upd = (i: number, patch: Partial<Col>) => setCols(cs => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  const refresh = () => { tables.reload(); versions.reload() }

  async function create() {
    setErr(null)
    const columns = cols.filter(c => c.name.trim()).map(c => ({
      name: c.name.trim(), type: c.type, nullable: c.nullable, unique: c.unique, references: c.references ? 'employees' : null,
    }))
    try {
      await call(`/v1/projects/${projectId}/schema/tables`, { method: 'POST', body: { table, columns } })
      setTable(''); setCols([blank()]); refresh()
    } catch (e) { setErr((e as Error).message) }
  }
  async function drop(name: string) {
    if (!window.confirm(`Xóa bảng "${name}" cùng toàn bộ dữ liệu trong đó? Không thể hoàn tác.`)) return
    try { await call(`/v1/projects/${projectId}/schema/tables/${name}`, { method: 'DELETE' }); refresh() } catch (e) { setErr((e as Error).message) }
  }

  return (
    <>
      <Card title="Bảng đã tạo">
        <ErrorBox message={tables.error ?? err} />
        {tables.data?.length === 0 && <p className="empty">Dự án chưa có bảng dữ liệu riêng.</p>}
        {tables.data?.map(t => (
          <div key={t.table} className="table-box">
            <div className="row between">
              <div><b>{t.table}</b><br /><small className="hint">Tên trong GraphQL: <code>ext_{shortId}_{t.table}</code></small></div>
              <button className="danger small" onClick={() => void drop(t.table)}>Xóa bảng</button>
            </div>
            <ul>{t.columns.map(c => <li key={c.name}><code>{c.name}</code> {c.type}{c.nullable ? '' : ', bắt buộc'}</li>)}</ul>
          </div>
        ))}
      </Card>

      <Card title="Tạo bảng mới">
        <p className="hint">Hệ thống tự thêm các cột <code>id</code>, <code>tenant_id</code>, <code>created_at</code> và bật cô lập dữ liệu theo tenant. Bạn không cần viết SQL.</p>
        <label>Tên bảng<input value={table} onChange={e => setTable(e.target.value)} placeholder="Ví dụ: bonus_plan" /></label>
        <p className="hint" style={{ marginBottom: 8 }}>Các cột</p>
        {cols.map((c, i) => (
          <div className="col-row" key={i}>
            <input value={c.name} onChange={e => upd(i, { name: e.target.value })} placeholder="Tên cột" aria-label={`Tên cột ${i + 1}`} />
            <select value={c.type} onChange={e => upd(i, { type: e.target.value as Col['type'] })} aria-label={`Kiểu cột ${i + 1}`}>{TYPES.map(t => <option key={t}>{t}</option>)}</select>
            <label className="inline"><input type="checkbox" checked={!c.nullable} onChange={e => upd(i, { nullable: !e.target.checked })} />Bắt buộc</label>
            <label className="inline"><input type="checkbox" checked={c.unique} onChange={e => upd(i, { unique: e.target.checked })} />Không trùng</label>
            <label className="inline" title="Cột kiểu uuid trỏ tới bảng employees">
              <input type="checkbox" checked={c.references} onChange={e => upd(i, { references: e.target.checked, type: e.target.checked ? 'uuid' : c.type })} />Liên kết nhân viên
            </label>
            {cols.length > 1
              ? <button className="icon-btn" onClick={() => setCols(cs => cs.filter((_, j) => j !== i))} aria-label={`Bỏ cột ${i + 1}`}><Icon.close /></button>
              : <span />}
          </div>
        ))}
        <div className="row center">
          <button className="ghost" onClick={() => setCols(cs => [...cs, blank()])}><Icon.plus /> Thêm cột</button>
          <button disabled={!table.trim() || !cols.some(c => c.name.trim())} onClick={() => void create()}>Tạo bảng</button>
        </div>
      </Card>

      <Card title="Lịch sử thay đổi">
        {versions.data?.length === 0 ? <p className="empty">Chưa có thay đổi nào.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Phiên bản</th><th>Thay đổi</th><th>Bảng</th><th>Thời điểm</th></tr></thead>
              <tbody>{versions.data?.map(v => <tr key={v.version}><td>{v.version}</td><td>{ACTION[v.action] ?? v.action}</td><td><code>{v.table_name}</code></td><td>{fmt(v.created_at)}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}
