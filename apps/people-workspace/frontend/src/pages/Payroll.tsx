// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { Empty, ErrorBox, errMsg, Loading, PageHeader, StatusBadge, Stepper } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/form'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { useConfirm } from '@/hooks/confirm'
import { useToast } from '@/hooks/toast'
import { useQuery } from '@/hooks/useQuery'
import { api } from '@/lib/api'
import { monthLabel, vnd } from '@/lib/format'

const RUN_STATUS: Record<string, string> = {
  timesheet_closed: 'Đã chốt công, chờ Kế toán tính lương', calculated: 'Chờ HR rà soát', hr_reviewed: 'Chờ Giám đốc duyệt',
  approved: 'Đã duyệt, chờ Kế toán chi trả', paid: 'Đã chi trả',
}
const RUN_STEPS = ['Chốt công', 'Kế toán tính lương', 'HR rà soát', 'Giám đốc duyệt', 'Chi trả']
const RUN_STEP_INDEX: Record<string, number> = { timesheet_closed: 1, calculated: 2, hr_reviewed: 3, approved: 4, paid: 5 }
const COMPLAINT_STATUS: Record<string, string> = { open: 'Chờ HR xử lý', adjusting: 'Chờ Kế toán điều chỉnh', resolved: 'Đã điều chỉnh', rejected: 'Bị từ chối' }

const QRuns = `query PayrollRuns {
  payroll_runs(order_by: [{period_year: desc}, {period_month: desc}], limit: 12) {
    id period_year period_month status employee_count total_gross total_net return_comment
  }
}`
const QRows = `query PayrollRows($y: smallint!, $m: smallint!) {
  payrolls(where: {period_year: {_eq: $y}, period_month: {_eq: $m}}, order_by: {employee: {full_name: asc}}) {
    id status base_salary allowance overtime_pay bonus gross personal_income_tax net_salary standard_days paid_days overtime_hours employee { full_name department }
  }
}`
const QEmps = `query PayrollEmployees { employees(where: {status: {_eq: "active"}}, order_by: {full_name: asc}) { id full_name department } }`
const QSheets = `query PayrollTimesheets($y: smallint!, $m: smallint!) {
  timesheets(where: {period_year: {_eq: $y}, period_month: {_eq: $m}}) {
    employee_id status standard_days work_days paid_leave_days holiday_days ot_weekday_hours ot_weekend_hours ot_holiday_hours
  }
  employees_aggregate(where: {status: {_eq: "active"}}) { aggregate { count } }
}`
const QCompl = `query ComplaintQueue($statuses: [String!]!) {
  payslip_complaints(where: {status: {_in: $statuses}}, order_by: {created_at: asc}) {
    id message status hr_note employee { full_name } payroll { period_year period_month net_salary overtime_pay bonus }
  }
}`

const days = (n: number | string | null | undefined) => (n == null ? '—' : String(Number(n)).replace('.', ','))

const now = new Date()
const defaultMonth = now.getMonth() === 0 ? 12 : now.getMonth()          // tháng trước
const defaultYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()

export default function Payroll() {
  const { user } = useAuth()
  const { push } = useToast()
  const isHr = user.role === 'hr'
  const isAcc = user.role === 'accountant'
  const isDir = user.role === 'director'

  const runs = useQuery<any>(QRuns, {})
  const [runId, setRunId] = useState('')
  const run = (runs.data?.payroll_runs ?? []).find((r: any) => r.id === runId)
  const rows = useQuery<any>(QRows, { y: run?.period_year ?? 0, m: run?.period_month ?? 0 }, !!run && (isHr || isAcc))
  const emps = useQuery<any>(QEmps, {}, isAcc)
  const compl = useQuery<any>(QCompl, { statuses: isHr ? ['open'] : ['adjusting'] }, isHr || isAcc)

  const [form, setForm] = useState({ year: String(defaultYear), month: String(defaultMonth) })
  // Bảng công: HR xem tình hình xác nhận của tháng sắp chốt; Kế toán xem bảng công đã chốt của kỳ đang tính
  const sheetPeriod = isHr ? { y: Number(form.year) || 0, m: Number(form.month) || 0 } : { y: run?.period_year ?? 0, m: run?.period_month ?? 0 }
  const sheets = useQuery<any>(QSheets, sheetPeriod, isHr || (isAcc && !!run))
  const sheetList: any[] = sheets.data?.timesheets ?? []
  const sheetByEmp = new Map<string, any>(sheetList.map((t) => [t.employee_id, t]))
  const countBy = (s: string) => sheetList.filter((t) => t.status === s).length
  const activeCount: number = sheets.data?.employees_aggregate?.aggregate?.count ?? 0
  const [adj, setAdj] = useState<Record<string, { ot: string; bonus: string }>>({})
  const [busy, setBusy] = useState(false)
  const [fix, setFix] = useState<Record<string, { ot: string; bonus: string; note: string }>>({})

  const reloadAll = () => { runs.reload(); rows.reload(); emps.reload(); compl.reload(); sheets.reload() }
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try { await fn(); push({ title: ok, kind: 'success' }); reloadAll(); return true }
    catch (x) { push({ title: 'Không thực hiện được', message: errMsg(x), kind: 'error' }); return false }
    finally { setBusy(false) }
  }
  const confirm = useConfirm()
  /** Trả lại / từ chối: bắt buộc ghi lý do; Huỷ thì không gửi gì. */
  const withReason = async (title: string, confirmLabel: string, fn: (note: string) => Promise<unknown>, ok: string, required = true) => {
    const r = await confirm({ title, confirmLabel, tone: 'danger', note: { label: 'Lý do', required, placeholder: 'Ghi rõ cần sửa gì để người nhận xử lý nhanh.' } })
    if (r) await act(() => fn(r.note ?? ''), ok)
  }

  if (runs.loading) return <Loading />
  if (runs.error) return <ErrorBox message={runs.error} />

  const list: any[] = runs.data.payroll_runs
  const calcAdjustments = () => Object.entries(adj)
    .filter(([, v]) => v.ot || v.bonus)
    .map(([employeeId, v]) => ({ employeeId, overtimePay: v.ot ? Number(v.ot) : undefined, bonus: v.bonus ? Number(v.bonus) : undefined }))

  return (
    <div>
      <PageHeader title="Kỳ lương" description="Theo dõi từng kỳ lương từ lúc chốt công đến khi chi trả và phát hành phiếu lương." />
      <details className="po-howto">
        <summary>Quy trình gồm những bước nào?</summary>
        <p>Nhân viên gửi bảng công, quản lý xác nhận. HR chốt công, Kế toán tính lương theo ngày công, HR rà soát, Giám đốc duyệt, rồi Kế toán chi trả và phát hành phiếu lương. Nhân viên có thể khiếu nại ngay trên phiếu lương của mình.</p>
      </details>

      <Card className="mb-4">
        <CardHeader><CardTitle>Các kỳ lương</CardTitle></CardHeader>
        <CardContent>
          {list.length === 0 ? <Empty text="Chưa có kỳ lương nào" /> : (
            <Table>
              <THead><TR><TH>Kỳ</TH><TH>Tiến trình</TH><TH>Số phiếu</TH><TH>Tổng lương gộp</TH><TH>Tổng thực nhận</TH><TH /></TR></THead>
              <TBody>
                {list.map((r) => (
                  <TR key={r.id} className={r.id === runId ? 'bg-muted/40' : undefined}>
                    <TD className="font-medium">
                      {(isHr || isAcc)
                        ? <button type="button" className="text-left font-medium text-primary hover:underline" aria-pressed={r.id === runId} onClick={() => setRunId(r.id)}>{monthLabel(r.period_year, r.period_month)}</button>
                        : monthLabel(r.period_year, r.period_month)}
                    </TD>
                    <TD>
                      <StatusBadge status={r.status} map={RUN_STATUS} />
                      <div className="mt-2"><Stepper compact label={`Tiến trình kỳ ${monthLabel(r.period_year, r.period_month)}`} steps={RUN_STEPS} current={RUN_STEP_INDEX[r.status] ?? 0} returned={r.status === 'timesheet_closed' && !!r.return_comment} /></div>
                      {r.status === 'timesheet_closed' && r.return_comment && <div className="mt-1 text-[13.5px] text-destructive">Bị trả lại: {r.return_comment}</div>}
                    </TD>
                    <TD>{r.employee_count}</TD><TD>{vnd(r.total_gross)}</TD><TD>{vnd(r.total_net)}</TD>
                    <TD className="whitespace-nowrap">
                      {isHr && r.status === 'calculated' && <>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => api(`/api/payroll-runs/${r.id}/hr-review`, 'POST', { decision: 'approve' }), 'Đã rà soát, chuyển Giám đốc')}>Rà soát xong</Button>{' '}
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => withReason(`Trả lại kỳ ${monthLabel(r.period_year, r.period_month)} cho Kế toán?`, 'Trả lại Kế toán', (comment) => api(`/api/payroll-runs/${r.id}/hr-review`, 'POST', { decision: 'reject', comment }), 'Đã trả lại Kế toán')}>Trả lại</Button>
                      </>}
                      {isDir && r.status === 'hr_reviewed' && <>
                        <Button size="sm" disabled={busy} onClick={async () => {
                          const ok = await confirm({ title: `Duyệt bảng lương ${monthLabel(r.period_year, r.period_month).toLowerCase()}?`, body: 'Sau khi duyệt, Kế toán có thể chi trả.', confirmLabel: 'Duyệt bảng lương',
                            summary: [{ label: 'Số phiếu lương', value: r.employee_count }, { label: 'Tổng lương gộp', value: vnd(r.total_gross) }, { label: 'Tổng thực nhận', value: vnd(r.total_net) }] })
                          if (ok) act(() => api(`/api/payroll-runs/${r.id}/decision`, 'POST', { decision: 'approve' }), 'Đã duyệt bảng lương')
                        }}>Duyệt</Button>{' '}
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => withReason(`Trả lại kỳ ${monthLabel(r.period_year, r.period_month)}?`, 'Trả lại Kế toán', (comment) => api(`/api/payroll-runs/${r.id}/decision`, 'POST', { decision: 'reject', comment }), 'Đã trả lại Kế toán')}>Trả lại</Button>
                      </>}
                      {isAcc && r.status === 'approved' && <Button size="sm" disabled={busy} onClick={async () => {
                        const ok = await confirm({ title: `Chi trả lương ${monthLabel(r.period_year, r.period_month).toLowerCase()}?`,
                          body: 'Chỉ xác nhận sau khi ngân hàng đã chuyển khoản xong. Hệ thống sẽ phát hành phiếu lương và báo cho từng nhân viên.',
                          caution: 'Không thể hoàn tác: phiếu lương được đóng dấu "Đã chi" và gửi ngay cho nhân viên.',
                          summary: [{ label: 'Số người nhận', value: r.employee_count }, { label: 'Tổng thực nhận đã chuyển', value: vnd(r.total_net), emphasis: true }],
                          confirmLabel: `Đã chuyển ${vnd(r.total_net)}` })
                        if (ok) act(() => api(`/api/payroll-runs/${r.id}/pay`, 'POST'), 'Đã chi trả và phát hành phiếu lương')
                      }}>Chi trả…</Button>}
                      {isAcc && r.status === 'timesheet_closed' && <Button size="sm" variant="outline" onClick={() => setRunId(r.id)}>Tính lương…</Button>}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {isHr && (
        <Card className="mb-4">
          <CardHeader><CardTitle>Chốt công tháng mới</CardTitle></CardHeader>
          <CardContent>
            <form className="flex flex-wrap items-end gap-3" onSubmit={async (e) => {
              e.preventDefault()
              const pending = countBy('submitted') + Math.max(0, activeCount - sheetList.length) + countBy('open')
              const r = await confirm({
                title: `Chốt công tháng ${form.month}/${form.year}?`,
                body: 'Sau khi chốt, bảng công bị khoá và không ai sửa được nữa. Kỳ lương mới được tạo để Kế toán tính lương.',
                summary: [
                  { label: 'Đã xác nhận', value: `${countBy('confirmed')} người` },
                  { label: 'Chưa xác nhận hoặc chưa gửi', value: `${pending} người`, caution: pending > 0 },
                  { label: 'Nhân viên đang làm việc', value: `${activeCount} người` },
                ],
                caution: pending > 0 ? `${pending} người chưa được quản lý xác nhận bảng công. Nếu chốt bây giờ, công của họ lấy theo số liệu hệ thống và họ không sửa được nữa.` : undefined,
                confirmLabel: pending > 0 ? `Vẫn chốt công (${pending} người chưa xác nhận)` : 'Chốt công',
              })
              if (r) await act(() => api('/api/payroll-runs', 'POST', { year: Number(form.year), month: Number(form.month) }), 'Đã chốt công và tạo kỳ lương')
            }}>
              <Field label="Năm"><Input type="number" className="w-28" min={2020} max={2100} value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))} required /></Field>
              <Field label="Tháng">
                <Select value={form.month} onChange={(e) => setForm((f) => ({ ...f, month: e.target.value }))}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>Tháng {m}</option>)}
                </Select>
              </Field>
              <Button type="submit" disabled={busy}>Chốt công</Button>
            </form>
            {sheets.data && (
              <p className="mt-3 max-w-[62ch] text-sm text-muted-foreground">
                Bảng công tháng {form.month}/{form.year}: <span className="font-medium text-foreground">{countBy('confirmed')}</span> đã xác nhận, <span className="font-medium text-foreground">{countBy('submitted')}</span> chờ xác nhận, <span className="font-medium text-foreground">{Math.max(0, activeCount - sheetList.length) + countBy('open')}</span> chưa gửi (trên {activeCount} nhân viên đang làm việc).
                {' '}Khi chốt, bảng công bị khóa và số liệu được tính lại từ chấm công và đơn nghỉ đã duyệt; người chưa gửi vẫn được chốt theo số liệu hệ thống. Rà soát ở mục <Link className="text-primary hover:underline" to="/timesheet">Bảng công</Link> trước khi chốt.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {isAcc && run?.status === 'timesheet_closed' && (
        <Card className="mb-4">
          <CardHeader><CardTitle>Tính lương {monthLabel(run.period_year, run.period_month)}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="max-w-[62ch] text-sm text-muted-foreground">Lương cơ bản và phụ cấp (theo hợp đồng đang hiệu lực) được tính theo ngày công hưởng lương trên bảng công đã chốt. Tiền làm thêm giờ tự tính từ số giờ trên bảng công (150% ngày thường, 200% ngày nghỉ hằng tuần, 300% ngày lễ); chỉ nhập khi cần ghi đè. Thưởng để trống nếu không có.</p>
            {emps.loading ? <Loading /> : emps.error ? <ErrorBox message={emps.error} /> : (
              <Table>
                <THead><TR><TH>Nhân viên</TH><TH>Ngày công</TH><TH>Giờ làm thêm</TH><TH>Làm thêm giờ (đ)</TH><TH>Thưởng (đ)</TH></TR></THead>
                <TBody>
                  {emps.data.employees.map((e: any) => (
                    <TR key={e.id}>
                      <TD>{e.full_name}<div className="text-xs text-muted-foreground">{e.department}</div></TD>
                      {(() => {
                        const t = sheetByEmp.get(e.id)
                        if (!t) return <><TD className="text-muted-foreground">Đủ tháng (không có bảng công)</TD><TD>—</TD></>
                        return <>
                          <TD>{days(Number(t.work_days) + Number(t.paid_leave_days) + Number(t.holiday_days))} / {days(t.standard_days)}</TD>
                          <TD>{days(Number(t.ot_weekday_hours) + Number(t.ot_weekend_hours) + Number(t.ot_holiday_hours))}</TD>
                        </>
                      })()}
                      <TD><Input type="number" min={0} className="h-8 w-40" placeholder="Tự tính" value={adj[e.id]?.ot ?? ''} onChange={(ev) => setAdj((s) => ({ ...s, [e.id]: { ot: ev.target.value, bonus: s[e.id]?.bonus ?? '' } }))} /></TD>
                      <TD><Input type="number" min={0} className="h-8 w-40" value={adj[e.id]?.bonus ?? ''} onChange={(ev) => setAdj((s) => ({ ...s, [e.id]: { ot: s[e.id]?.ot ?? '', bonus: ev.target.value } }))} /></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
            <Button disabled={busy} onClick={() => act(() => api(`/api/payroll-runs/${run.id}/calculate`, 'POST', { adjustments: calcAdjustments() }), 'Đã tính lương, chuyển HR rà soát')}>Tính lương và gửi HR rà soát</Button>
          </CardContent>
        </Card>
      )}

      {(isHr || isAcc) && run && run.status !== 'timesheet_closed' && (
        <Card className="mb-4">
          <CardHeader><CardTitle>Chi tiết bảng lương {monthLabel(run.period_year, run.period_month)}</CardTitle></CardHeader>
          <CardContent>
            {rows.loading ? <Loading /> : rows.error ? <ErrorBox message={rows.error} /> : (
              <Table>
                <THead><TR><TH>Nhân viên</TH><TH>Ngày công</TH><TH>Lương cơ bản</TH><TH>Phụ cấp</TH><TH>Làm thêm</TH><TH>Thưởng</TH><TH>Gộp</TH><TH>Thuế TNCN</TH><TH>Thực nhận</TH></TR></THead>
                <TBody>
                  {rows.data.payrolls.map((p: any) => (
                    <TR key={p.id}>
                      <TD>{p.employee?.full_name}<div className="text-xs text-muted-foreground">{p.employee?.department}</div></TD>
                      <TD className="whitespace-nowrap">{p.standard_days == null ? 'Đủ tháng' : `${days(p.paid_days)} / ${days(p.standard_days)}`}</TD>
                      <TD>{vnd(p.base_salary)}</TD><TD>{vnd(p.allowance)}</TD><TD>{vnd(p.overtime_pay)}{Number(p.overtime_hours) > 0 && <div className="text-xs text-muted-foreground">{days(p.overtime_hours)} giờ</div>}</TD><TD>{vnd(p.bonus)}</TD>
                      <TD>{vnd(p.gross)}</TD><TD>{vnd(p.personal_income_tax)}</TD><TD className="font-medium">{vnd(p.net_salary)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {(isHr || isAcc) && (
        <Card>
          <CardHeader><CardTitle>Khiếu nại phiếu lương {isHr ? 'chờ HR xử lý' : 'chờ Kế toán điều chỉnh'}</CardTitle></CardHeader>
          <CardContent>
            {compl.loading ? <Loading /> : compl.error ? <ErrorBox message={compl.error} /> : compl.data.payslip_complaints.length === 0 ? <Empty text="Không có khiếu nại nào đang chờ" /> : (
              <Table>
                <THead><TR><TH>Nhân viên</TH><TH>Kỳ</TH><TH>Nội dung</TH><TH>Trạng thái</TH><TH /></TR></THead>
                <TBody>
                  {compl.data.payslip_complaints.map((c: any) => (
                    <TR key={c.id}>
                      <TD>{c.employee?.full_name}</TD>
                      <TD>{monthLabel(c.payroll.period_year, c.payroll.period_month)}
                        <dl className="mt-1 grid w-fit grid-cols-[auto_auto] gap-x-4 text-[13.5px] text-muted-foreground">
                          <dt>Làm thêm</dt><dd className="text-right tabular-nums">{vnd(c.payroll.overtime_pay)}</dd>
                          <dt>Thưởng</dt><dd className="text-right tabular-nums">{vnd(c.payroll.bonus)}</dd>
                          <dt>Thực nhận</dt><dd className="text-right font-medium tabular-nums text-foreground">{vnd(c.payroll.net_salary)}</dd>
                        </dl>
                      </TD>
                      <TD className="max-w-[18rem]">{c.message}{c.hr_note && <div className="text-xs text-muted-foreground">HR: {c.hr_note}</div>}</TD>
                      <TD><StatusBadge status={c.status} map={COMPLAINT_STATUS} /></TD>
                      <TD className="whitespace-nowrap">
                        {isHr && <>
                          <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
                            const r = await confirm({ title: 'Chuyển Kế toán điều chỉnh?', body: `Khiếu nại của ${c.employee?.full_name ?? 'nhân viên'} sẽ được chuyển Kế toán tính lại phiếu.`, confirmLabel: 'Chuyển Kế toán', note: { label: 'Ghi chú cho Kế toán' } })
                            if (r) act(() => api(`/api/payslip-complaints/${c.id}/review`, 'POST', { decision: 'forward', note: r.note }), 'Đã chuyển Kế toán điều chỉnh')
                          }}>Chuyển Kế toán</Button>{' '}
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => withReason('Từ chối khiếu nại này?', 'Từ chối khiếu nại', (note) => api(`/api/payslip-complaints/${c.id}/review`, 'POST', { decision: 'reject', note }), 'Đã từ chối khiếu nại')}>Từ chối</Button>
                        </>}
                        {isAcc && (
                          <span className="inline-flex flex-wrap items-center gap-2">
                            <Input type="number" min={0} className="h-8 w-32" aria-label="Tiền làm thêm giờ mới" placeholder="Làm thêm mới" value={fix[c.id]?.ot ?? ''} onChange={(e) => setFix((s) => ({ ...s, [c.id]: { ot: e.target.value, bonus: s[c.id]?.bonus ?? '', note: s[c.id]?.note ?? '' } }))} />
                            <Input type="number" min={0} className="h-8 w-32" aria-label="Thưởng mới" placeholder="Thưởng mới" value={fix[c.id]?.bonus ?? ''} onChange={(e) => setFix((s) => ({ ...s, [c.id]: { ot: s[c.id]?.ot ?? '', bonus: e.target.value, note: s[c.id]?.note ?? '' } }))} />
                            <Button size="sm" disabled={busy || (!fix[c.id]?.ot && !fix[c.id]?.bonus)} onClick={async () => {
                              const r = await confirm({ title: 'Điều chỉnh phiếu lương?', body: 'Phiếu lương được tính lại và nhân viên nhận thông báo.', confirmLabel: 'Điều chỉnh',
                                summary: [
                                  ...(fix[c.id]?.ot ? [{ label: 'Làm thêm giờ', value: `${vnd(c.payroll.overtime_pay)} → ${vnd(fix[c.id].ot)}` }] : []),
                                  ...(fix[c.id]?.bonus ? [{ label: 'Thưởng', value: `${vnd(c.payroll.bonus)} → ${vnd(fix[c.id].bonus)}` }] : []),
                                ], note: { label: 'Ghi chú điều chỉnh' } })
                              if (r) act(() => api(`/api/payslip-complaints/${c.id}/adjust`, 'POST', {
                                overtimePay: fix[c.id]?.ot ? Number(fix[c.id].ot) : undefined, bonus: fix[c.id]?.bonus ? Number(fix[c.id].bonus) : undefined, note: r.note }), 'Đã điều chỉnh phiếu lương')
                            }}>Điều chỉnh…</Button>
                          </span>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
