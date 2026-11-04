// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

import { useState } from 'react'
import { call, type SchemaVersion, type TableInfo } from '../api'
import { Card, ErrorBox, fmt, useLoad } from '../ui'

const TYPES = ['text', 'int', 'bigint', 'numeric', 'boolean', 'date', 'timestamptz', 'uuid', 'jsonb'] as const
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
    if (!window.confirm(`Xóa bảng "${name}" và toàn bộ dữ liệu trong đó?`)) return
    try { await call(`/v1/projects/${projectId}/schema/tables/${name}`, { method: 'DELETE' }); refresh() } catch (e) { setErr((e as Error).message) }
  }

  return (
    <>
      <Card title="Bảng của bạn">
        <ErrorBox message={tables.error ?? err} />
        {tables.data?.length === 0 && <p>Chưa có bảng tùy chỉnh.</p>}
        {tables.data?.map(t => (
          <div key={t.table} className="table-box">
            <div className="row between"><b>{t.table}</b><button className="danger" onClick={() => void drop(t.table)}>Xóa</button></div>
            <small>GraphQL: <code>ext_{shortId}_{t.table}</code></small>
            <ul>{t.columns.map(c => <li key={c.name}><code>{c.name}</code> {c.type}{c.nullable ? '' : ' · bắt buộc'}</li>)}</ul>
          </div>
        ))}
      </Card>
      <Card title="Thêm bảng">
        <p><small>Hệ thống tự thêm <code>id</code>, <code>tenant_id</code>, <code>created_at</code> và bật cô lập dữ liệu theo tenant. Bạn không gửi SQL.</small></p>
        <label>Tên bảng<input value={table} onChange={e => setTable(e.target.value)} placeholder="bonus_plan" /></label>
        {cols.map((c, i) => (
          <div className="row" key={i}>
            <input value={c.name} onChange={e => upd(i, { name: e.target.value })} placeholder="tên cột" />
            <select value={c.type} onChange={e => upd(i, { type: e.target.value as Col['type'] })}>{TYPES.map(t => <option key={t}>{t}</option>)}</select>
            <label className="inline"><input type="checkbox" checked={!c.nullable} onChange={e => upd(i, { nullable: !e.target.checked })} />bắt buộc</label>
            <label className="inline"><input type="checkbox" checked={c.unique} onChange={e => upd(i, { unique: e.target.checked })} />duy nhất</label>
            <label className="inline"><input type="checkbox" checked={c.references} onChange={e => upd(i, { references: e.target.checked, type: e.target.checked ? 'uuid' : c.type })} />→ employees</label>
          </div>
        ))}
        <div className="row">
          <button className="ghost" onClick={() => setCols(cs => [...cs, blank()])}>+ Thêm cột</button>
          <button disabled={!table.trim() || !cols.some(c => c.name.trim())} onClick={() => void create()}>Tạo bảng</button>
        </div>
      </Card>
      <Card title="Lịch sử phiên bản">
        <table>
          <thead><tr><th>#</th><th>Hành động</th><th>Bảng</th><th>Lúc</th></tr></thead>
          <tbody>{versions.data?.map(v => <tr key={v.version}><td>{v.version}</td><td>{v.action}</td><td>{v.table_name}</td><td>{fmt(v.created_at)}</td></tr>)}</tbody>
        </table>
      </Card>
    </>
  )
}
