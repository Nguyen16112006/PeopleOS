// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

import { call, type Usage as UsageData } from '../api'
import { Card, ErrorBox, num, planLabel, useLoad } from '../ui'

const dayLabel = (d: string) => new Date(d).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })

export default function Usage({ projectId }: { projectId: string }) {
  const { data, error, reload } = useLoad(() => call<UsageData>(`/v1/projects/${projectId}/usage?days=30`), [projectId])
  const pct = data ? Math.min(100, Math.round((data.today.requests / data.daily_quota) * 100)) : 0
  const max = Math.max(1, ...(data?.days.map(d => d.requests) ?? [1]))

  return (
    <>
      <Card title="Hôm nay" right={<button className="ghost small" onClick={reload}>Làm mới</button>}>
        <ErrorBox message={error} />
        {data && (
          <>
            <p className="big-number">{num(data.today.requests)} <small>/ {num(data.daily_quota)} lượt gọi</small></p>
            <div className="meter" role="img" aria-label={`Đã dùng ${pct}% hạn mức hôm nay`}><div style={{ width: `${pct}%` }} className={pct >= 90 ? 'hot' : ''} /></div>
            <p className="hint" style={{ margin: '10px 0 0' }}>
              Còn {num(data.today.remaining)} lượt trong hạn mức gói {planLabel(data.plan)}. Khi hết hạn mức, gateway trả mã HTTP 429.
              Số liệu được cập nhật theo lô nên có thể chậm vài giây.
            </p>
          </>
        )}
      </Card>
      <Card title="30 ngày gần nhất">
        {data?.days.length === 0 ? <p className="empty">Chưa có lượt gọi nào bằng API key.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Ngày</th><th>Lượt gọi</th><th style={{ width: '32%' }} /><th>Lỗi 4xx</th><th>Lỗi 5xx</th><th>Dữ liệu trả về</th></tr></thead>
              <tbody>
                {data?.days.map(d => (
                  <tr key={d.day}>
                    <td>{dayLabel(d.day)}</td><td>{num(d.requests)}</td>
                    <td><div className="meter thin"><div style={{ width: `${(d.requests / max) * 100}%` }} /></div></td>
                    <td>{num(d.errors_4xx)}</td><td>{num(d.errors_5xx)}</td><td>{(d.bytes_out / 1024).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} KB</td>
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
