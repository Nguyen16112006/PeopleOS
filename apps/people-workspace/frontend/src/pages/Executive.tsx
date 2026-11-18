// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

import { Link } from 'react-router-dom'
import { BarList, GroupedColumns } from '@/components/charts'
import { ErrorBox, Loading, PageHeader } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { useQuery } from '@/hooks/useQuery'
import { fmtDate, fmtDays, LEAVE_TYPES, monthLabel, vnd } from '@/lib/format'

const Q = `query Executive {
  v_kpi_summary { headcount onboarding_count active_contracts avg_base_salary pending_leave pending_proposals expiring_contracts latest_year latest_month latest_gross latest_net latest_employer_cost }
  v_headcount_by_department(order_by: {headcount: desc}) { department headcount avg_base_salary total_base_salary }
  v_payroll_monthly(order_by: [{period_year: asc}, {period_month: asc}]) { period_year period_month employees gross_total net_total pit_total employee_insurance_total employer_insurance_total employer_cost }
  v_leave_summary { leave_type status requests days }
  v_contracts_expiring(order_by: {days_left: asc}) { id contract_no full_name department end_date days_left }
}`

const short = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} tỷ` : `${(n / 1e6).toFixed(1)} tr`)

export default function Executive() {
  const { data, loading, error, reload } = useQuery<any>(Q)
  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} onRetry={reload} />
  const k = data.v_kpi_summary[0]
  const months: any[] = data.v_payroll_monthly
  const last = months[months.length - 1]
  const prev = months[months.length - 2]
  const cost = Number(k?.latest_employer_cost ?? 0)
  const change = prev && Number(prev.employer_cost) > 0 ? ((Number(last.employer_cost) - Number(prev.employer_cost)) / Number(prev.employer_cost)) * 100 : null
  const pending = Number(k?.pending_leave ?? 0) + Number(k?.pending_proposals ?? 0)
  const leaveByType = Object.entries(
    (data.v_leave_summary as any[]).filter((r) => r.status === 'approved').reduce((acc: Record<string, number>, r) => {
      acc[r.leave_type] = (acc[r.leave_type] ?? 0) + Number(r.days); return acc }, {}),
  ).map(([t, v]) => ({ label: LEAVE_TYPES[t] ?? t, value: v as number }))

  return (
    <div>
      <PageHeader title="Báo cáo điều hành" description="Chi phí nhân sự, quy mô và những việc cần quyết định." />
      {k && (
        <section className="po-panel po-exec-lead" aria-label="Chỉ số chính">
          <div className="po-exec-main">
            <div className="po-figure-label">Chi phí nhân sự {last ? monthLabel(k.latest_year, k.latest_month).toLowerCase() : ''}</div>
            <div className="po-exec-value">{last ? vnd(cost) : 'Chưa có kỳ lương đã chi'}</div>
            {last && (
              <p className="po-figure-note">
                Gồm lương gộp {vnd(k.latest_gross)} và bảo hiểm công ty đóng.
                {change != null && <> {change >= 0 ? 'Tăng' : 'Giảm'} {Math.abs(change).toFixed(1).replace('.', ',')}% so với tháng trước.</>}
              </p>
            )}
          </div>
          <dl className="po-exec-facts">
            <div><dt>Đang làm việc</dt><dd>{k.headcount} người{Number(k.onboarding_count) > 0 && <small> + {k.onboarding_count} mới vào</small>}</dd></div>
            <div><dt>Lương cơ bản trung bình</dt><dd>{vnd(k.avg_base_salary)}</dd></div>
            <div><dt>Chờ duyệt</dt><dd>{pending > 0 ? <Link to="/approvals">{pending} việc</Link> : 'Không có'}</dd></div>
            <div><dt>Hợp đồng hết hạn trong 60 ngày</dt><dd className={Number(k.expiring_contracts) > 0 ? 'warn' : undefined}>{k.expiring_contracts}</dd></div>
          </dl>
        </section>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Chi phí lương theo tháng</CardTitle><CardDescription>Lương gộp, thực nhận và tổng chi phí công ty (triệu đồng)</CardDescription></CardHeader>
          <CardContent>
            <GroupedColumns labels={months.map((m) => `T${m.period_month}`)} format={(n) => vnd(n)}
              series={[
                { name: 'Lương gộp', color: 'bg-blue-500', values: months.map((m) => Number(m.gross_total)) },
                { name: 'Thực nhận', color: 'bg-emerald-500', values: months.map((m) => Number(m.net_total)) },
                { name: 'Chi phí công ty', color: 'bg-amber-500', values: months.map((m) => Number(m.employer_cost)) },
              ]} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Nhân sự theo phòng ban</CardTitle></CardHeader>
          <CardContent>
            <BarList items={data.v_headcount_by_department.map((d: any) => ({ label: d.department, value: d.headcount, hint: `Lương cơ bản TB ${vnd(d.avg_base_salary)}` }))} format={(n) => `${n} người`} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Nghỉ phép đã duyệt năm nay</CardTitle><CardDescription>Tổng số ngày theo loại</CardDescription></CardHeader>
          <CardContent>{leaveByType.length ? <BarList items={leaveByType} format={(n) => `${fmtDays(n)} ngày`} color="bg-emerald-500" /> : <p className="text-sm text-muted-foreground">Chưa có đơn nghỉ nào được duyệt năm nay.</p>}</CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Hợp đồng sắp hết hạn trong 90 ngày</CardTitle></CardHeader>
          <CardContent>
            {data.v_contracts_expiring.length === 0 ? <p className="text-sm text-muted-foreground">Không có hợp đồng nào sắp hết hạn</p> : (
              <Table>
                <THead><TR><TH>Hợp đồng</TH><TH>Nhân viên</TH><TH>Phòng ban</TH><TH>Hết hạn</TH><TH>Còn lại</TH></TR></THead>
                <TBody>
                  {data.v_contracts_expiring.map((c: any) => (
                    <TR key={c.id}><TD className="font-medium">{c.contract_no}</TD><TD>{c.full_name}</TD><TD>{c.department}</TD><TD>{fmtDate(c.end_date)}</TD>
                      <TD><Badge variant={c.days_left <= 30 ? 'destructive' : 'warning'}>{c.days_left} ngày</Badge></TD></TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
