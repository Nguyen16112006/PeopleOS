// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

import { call, type Usage as UsageData } from '../api'
import { Card, ErrorBox, useLoad } from '../ui'

export default function Usage({ projectId }: { projectId: string }) {
  const { data, error, reload } = useLoad(() => call<UsageData>(`/v1/projects/${projectId}/usage?days=30`), [projectId])
  const pct = data ? Math.min(100, Math.round((data.today.requests / data.daily_quota) * 100)) : 0
  const max = Math.max(1, ...(data?.days.map(d => d.requests) ?? [1]))

  return (
    <>
      <Card title="Hôm nay" right={<button className="ghost" onClick={reload}>Làm mới</button>}>
        <ErrorBox message={error} />
        {data && (
          <>
            <p><b>{data.today.requests.toLocaleString('vi-VN')}</b> / {data.daily_quota.toLocaleString('vi-VN')} request (gói {data.plan}) · còn {data.today.remaining.toLocaleString('vi-VN')}</p>
            <div className="bar"><div style={{ width: `${pct}%` }} className={pct >= 90 ? 'hot' : ''} /></div>
            <small>Vượt hạn mức, gateway trả HTTP 429. Số liệu cập nhật theo lô (vài giây trễ).</small>
          </>
        )}
      </Card>
      <Card title="30 ngày gần nhất">
        <table>
          <thead><tr><th>Ngày</th><th>Request</th><th /><th>4xx</th><th>5xx</th><th>Dung lượng trả về</th></tr></thead>
          <tbody>
            {data?.days.map(d => (
              <tr key={d.day}>
                <td>{d.day}</td><td>{d.requests.toLocaleString('vi-VN')}</td>
                <td style={{ width: '40%' }}><div className="bar thin"><div style={{ width: `${(d.requests / max) * 100}%` }} /></div></td>
                <td>{d.errors_4xx}</td><td>{d.errors_5xx}</td><td>{(d.bytes_out / 1024).toFixed(1)} KB</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.days.length === 0 && <p>Chưa có request nào qua API key.</p>}
      </Card>
    </>
  )
}
