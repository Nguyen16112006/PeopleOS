// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

import { useState } from 'react'
import { call, type CustomFieldDef } from '../api'
import { Card, ErrorBox, useLoad } from '../ui'

const TYPES = ['string', 'number', 'boolean', 'date', 'enum'] as const

export default function Fields({ projectId }: { projectId: string }) {
  const { data, error, reload } = useLoad(() => call<CustomFieldDef[]>(`/v1/projects/${projectId}/custom-fields`), [projectId])
  const [key, setKey] = useState('')
  const [type, setType] = useState<(typeof TYPES)[number]>('string')
  const [required, setRequired] = useState(false)
  const [options, setOptions] = useState('')
  const [err, setErr] = useState<string | null>(null)

  async function add() {
    setErr(null)
    try {
      await call(`/v1/projects/${projectId}/custom-fields`, {
        method: 'POST',
        body: { entity: 'employee', key, type, required, options: type === 'enum' ? options.split(',').map(s => s.trim()).filter(Boolean) : null },
      })
      setKey(''); setOptions(''); setRequired(false); reload()
    } catch (e) { setErr((e as Error).message) }
  }
  async function remove(f: CustomFieldDef) {
    if (!window.confirm(`Gỡ trường "${f.key}"? Giá trị đã lưu trong hồ sơ nhân viên sẽ bị xóa.`)) return
    try { await call(`/v1/projects/${projectId}/custom-fields/${f.entity}/${f.key}`, { method: 'DELETE' }); reload() } catch (e) { setErr((e as Error).message) }
  }

  return (
    <>
      <Card title="Trường tùy chỉnh của nhân viên">
        <ErrorBox message={error ?? err} />
        <p><small>Lưu trong cột <code>custom</code> (JSON) của bảng <code>employees</code>, kiểm tra kiểu dữ liệu ở cơ sở dữ liệu - không cần DDL.</small></p>
        <table>
          <thead><tr><th>Khóa</th><th>Kiểu</th><th>Bắt buộc</th><th>Giá trị</th><th /></tr></thead>
          <tbody>
            {data?.map(f => (
              <tr key={f.key}><td><code>{f.key}</code></td><td>{f.type}</td><td>{f.required ? 'có' : ''}</td><td>{f.options?.join(', ')}</td>
                <td><button className="danger" onClick={() => void remove(f)}>Gỡ</button></td></tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="Thêm trường">
        <div className="row">
          <label>Khóa<input value={key} onChange={e => setKey(e.target.value)} placeholder="level" /></label>
          <label>Kiểu<select value={type} onChange={e => setType(e.target.value as (typeof TYPES)[number])}>{TYPES.map(t => <option key={t}>{t}</option>)}</select></label>
          <label className="inline"><input type="checkbox" checked={required} onChange={e => setRequired(e.target.checked)} />bắt buộc</label>
        </div>
        {type === 'enum' && <label>Các giá trị (cách nhau bởi dấu phẩy)<input value={options} onChange={e => setOptions(e.target.value)} placeholder="junior, senior" /></label>}
        <button disabled={!key.trim()} onClick={() => void add()}>Thêm trường</button>
      </Card>
    </>
  )
}
