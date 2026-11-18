// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

import { useState } from 'react'
import { call, type CustomFieldDef } from '../api'
import { Card, ErrorBox, useLoad } from '../ui'
import { useConfirm } from '../confirm'

const TYPES = ['string', 'number', 'boolean', 'date', 'enum'] as const
const TYPE_LABEL: Record<string, string> = { string: 'Văn bản', number: 'Số', boolean: 'Có / không', date: 'Ngày', enum: 'Danh sách chọn' }

export default function Fields({ projectId }: { projectId: string }) {
  const { data, error, reload } = useLoad(() => call<CustomFieldDef[]>(`/v1/projects/${projectId}/custom-fields`), [projectId])
  const confirm = useConfirm()
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
    if (!await confirm({ title: `Gỡ trường "${f.key}"?`, confirmLabel: 'Gỡ trường', body: 'Giá trị đã lưu trong hồ sơ của mọi nhân viên cho trường này sẽ bị xóa.' })) return
    try { await call(`/v1/projects/${projectId}/custom-fields/${f.entity}/${f.key}`, { method: 'DELETE' }); reload() } catch (e) { setErr((e as Error).message) }
  }

  return (
    <>
      <Card title="Trường của hồ sơ nhân viên">
        <ErrorBox message={error ?? err} />
        <p className="hint">Giá trị được lưu trong cột <code>custom</code> (JSON) của bảng <code>employees</code> và được kiểm tra kiểu ngay ở cơ sở dữ liệu.</p>
        {data?.length === 0 ? <p className="empty">Chưa có trường tùy chỉnh nào.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Khóa</th><th>Kiểu</th><th>Bắt buộc</th><th>Giá trị cho phép</th><th /></tr></thead>
              <tbody>
                {data?.map(f => (
                  <tr key={f.key}>
                    <td><code>{f.key}</code></td><td>{TYPE_LABEL[f.type] ?? f.type}</td><td>{f.required ? 'Có' : 'Không'}</td><td>{f.options?.join(', ') ?? ''}</td>
                    <td className="actions"><button className="danger small" onClick={() => void remove(f)}>Gỡ</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card title="Thêm trường">
        <div className="row">
          <label>Khóa<input value={key} onChange={e => setKey(e.target.value)} placeholder="Ví dụ: level" /></label>
          <label>Kiểu
            <select value={type} onChange={e => setType(e.target.value as (typeof TYPES)[number])}>
              {TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
          </label>
          <label className="inline" style={{ height: 40 }}><input type="checkbox" checked={required} onChange={e => setRequired(e.target.checked)} />Bắt buộc</label>
        </div>
        {type === 'enum' && (
          <label style={{ marginTop: 14 }}>Các giá trị cho phép <span className="opt">(cách nhau bằng dấu phẩy)</span>
            <input value={options} onChange={e => setOptions(e.target.value)} placeholder="junior, senior" />
          </label>
        )}
        <div style={{ marginTop: 14 }}><button disabled={!key.trim()} onClick={() => void add()}>Thêm trường</button></div>
      </Card>
    </>
  )
}
