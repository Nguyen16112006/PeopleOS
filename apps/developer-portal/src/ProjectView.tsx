// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

import { useState } from 'react'
import { call, GATEWAY_URL, type Project } from './api'
import { Card, CodeBlock, ErrorBox, PageHead, Status, fmt, planLabel, useLoad } from './ui'
import Keys from './tabs/Keys'
import Schema from './tabs/Schema'
import Fields from './tabs/Fields'
import Webhooks from './tabs/Webhooks'
import Users from './tabs/Users'
import Usage from './tabs/Usage'

export const SECTIONS = [
  { key: 'overview', label: 'Tổng quan' },
  { key: 'keys', label: 'API key' },
  { key: 'schema', label: 'Bảng dữ liệu riêng' },
  { key: 'fields', label: 'Trường tùy chỉnh' },
  { key: 'webhooks', label: 'Webhook' },
  { key: 'users', label: 'Người dùng ứng dụng' },
  { key: 'usage', label: 'Lượt gọi API' },
] as const
export type Section = (typeof SECTIONS)[number]['key']

const DESCRIPTION: Record<Section, string> = {
  overview: 'Thông tin kết nối và ví dụ gọi API đầu tiên.',
  keys: 'Khóa dùng cho máy chủ của bạn gọi API. Khóa chỉ hiện đầy đủ một lần khi tạo.',
  schema: 'Tạo bảng dữ liệu riêng cho ứng dụng, dùng chung cơ chế phân quyền và cô lập theo tenant của PeopleOS.',
  fields: 'Thêm thông tin riêng vào hồ sơ nhân viên mà không cần sửa cơ sở dữ liệu.',
  webhooks: 'PeopleOS gửi sự kiện tới máy chủ của bạn khi dữ liệu thay đổi.',
  users: 'Tạo tài khoản để nhân viên đăng nhập vào ứng dụng bạn xây trên dự án này.',
  usage: 'Số lượt gọi API theo ngày và hạn mức của gói.',
}

export default function ProjectView({ id, section, onSection, onDeleted }: {
  id: string; section: Section; onSection: (s: Section) => void; onDeleted: () => void
}) {
  const { data: p, error } = useLoad(() => call<Project>(`/v1/projects/${id}`), [id])
  const [delError, setDelError] = useState<string | null>(null)
  const title = SECTIONS.find(s => s.key === section)?.label ?? ''

  async function remove() {
    if (!p || !window.confirm(`Xóa dự án "${p.name}"? Mọi API key sẽ bị thu hồi và các bảng dữ liệu riêng bị xóa. Không thể hoàn tác.`)) return
    try { await call<void>(`/v1/projects/${id}`, { method: 'DELETE' }); onDeleted() } catch (e) { setDelError((e as Error).message) }
  }

  if (!p) return <><ErrorBox message={error} />{!error && <p className="loading-screen">Đang tải dự án…</p>}</>

  return (
    <>
      <PageHead title={section === 'overview' ? p.name : title} description={DESCRIPTION[section]}
        right={section === 'overview' ? <Status value={p.status} failedLabel="Khởi tạo lỗi" /> : undefined} />
      <ErrorBox message={error ?? delError} />

      {section === 'overview' && (
        <>
          <Card title="Thông tin kết nối">
            <dl className="facts">
              <div><dt>Mã dự án</dt><dd><code>{p.short_id}</code></dd></div>
              <div><dt>Gói dịch vụ</dt><dd>{planLabel(p.plan)}</dd></div>
              <div><dt>Ngày tạo</dt><dd>{fmt(p.created_at)}</dd></div>
            </dl>
            <p className="hint">Gọi endpoint dữ liệu GraphQL bằng API key của dự án. Thay <code>&lt;API_KEY&gt;</code> bằng khóa bạn tạo ở mục API key.</p>
            <CodeBlock code={`curl -X POST ${GATEWAY_URL}/v1/data \\
  -H "X-API-Key: <API_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{"query":"{ employees(limit: 5) { id full_name } }"}'`} />
            <p className="hint">Bảng dữ liệu riêng của dự án có tên GraphQL bắt đầu bằng <code>ext_{p.short_id}_</code>. Muốn tạo hoặc ghi dữ liệu, dùng khóa có quyền đọc và ghi.</p>
            <div className="row center">
              <button onClick={() => onSection('keys')}>Tạo API key</button>
              <button className="ghost" onClick={() => onSection('webhooks')}>Thiết lập webhook</button>
            </div>
          </Card>
          <Card title="Xóa dự án" className="danger-zone">
            <p className="hint">Thu hồi toàn bộ API key, xóa bảng dữ liệu riêng và tài khoản người dùng của dự án.</p>
            <button className="danger" onClick={() => void remove()}>Xóa dự án này</button>
          </Card>
        </>
      )}
      {section === 'keys' && <Keys projectId={id} />}
      {section === 'schema' && <Schema projectId={id} shortId={p.short_id} />}
      {section === 'fields' && <Fields projectId={id} />}
      {section === 'webhooks' && <Webhooks projectId={id} />}
      {section === 'users' && <Users projectId={id} />}
      {section === 'usage' && <Usage projectId={id} />}
    </>
  )
}
