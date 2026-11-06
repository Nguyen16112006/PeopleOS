// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

import { useState } from 'react'
import { call, GATEWAY_URL, type Project } from './api'
import { Card, ErrorBox, useLoad } from './ui'
import Keys from './tabs/Keys'
import Schema from './tabs/Schema'
import Fields from './tabs/Fields'
import Webhooks from './tabs/Webhooks'
import Users from './tabs/Users'
import Usage from './tabs/Usage'

const TABS = ['Tổng quan', 'API Keys', 'Schema', 'Trường tùy chỉnh', 'Webhooks', 'Người dùng', 'Sử dụng'] as const

export default function ProjectView({ id, onBack }: { id: string; onBack: () => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Tổng quan')
  const { data: p, error } = useLoad(() => call<Project>(`/v1/projects/${id}`), [id])
  const [delError, setDelError] = useState<string | null>(null)

  async function remove() {
    if (!p || !window.confirm(`Xóa project "${p.name}"? Toàn bộ API key bị thu hồi và schema tùy chỉnh bị xóa.`)) return
    try { await call<void>(`/v1/projects/${id}`, { method: 'DELETE' }); onBack() } catch (e) { setDelError((e as Error).message) }
  }

  return (
    <>
      <button className="ghost" onClick={onBack}>← Tất cả project</button>
      <ErrorBox message={error ?? delError} />
      {p && (
        <>
          <h2>{p.name} <span className={`pill ${p.status}`}>{p.status}</span></h2>
          <div className="tabs">{TABS.map(t => <button key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
          {tab === 'Tổng quan' && (
            <Card title="Thông tin kết nối">
              <p>Mã project: <code>{p.short_id}</code> · Gói: <b>{p.plan}</b></p>
              <p>Endpoint dữ liệu (GraphQL) dùng API key:</p>
              <pre>{`curl -X POST ${GATEWAY_URL}/v1/data \\
  -H "X-API-Key: <API_KEY>" -H "Content-Type: application/json" \\
  -d '{"query":"{ employees(limit: 5) { id full_name } }"}'`}</pre>
              <p>Bảng tùy chỉnh có tiền tố GraphQL <code>ext_{p.short_id}_</code>. Chỉ tạo/ghi bằng khóa phạm vi <b>write</b>.</p>
              <button className="danger" onClick={() => void remove()}>Xóa project</button>
            </Card>
          )}
          {tab === 'API Keys' && <Keys projectId={id} />}
          {tab === 'Schema' && <Schema projectId={id} shortId={p.short_id} />}
          {tab === 'Trường tùy chỉnh' && <Fields projectId={id} />}
          {tab === 'Webhooks' && <Webhooks projectId={id} />}
          {tab === 'Người dùng' && <Users projectId={id} />}
          {tab === 'Sử dụng' && <Usage projectId={id} />}
        </>
      )}
    </>
  )
}
