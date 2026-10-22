import { useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { Empty, ErrorBox, errMsg, Loading, PageHeader } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/form'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { useToast } from '@/hooks/toast'
import { useQuery } from '@/hooks/useQuery'
import { api } from '@/lib/api'
import { monthLabel, vnd } from '@/lib/format'

const RUN_STATUS: Record<string, string> = {
  timesheet_closed: 'Đã chốt công, chờ Kế toán tính lương', calculated: 'Chờ HR rà soát', hr_reviewed: 'Chờ Giám đốc duyệt',
  approved: 'Đã duyệt, chờ Kế toán chi trả', paid: 'Đã chi trả',
}
const COMPLAINT_STATUS: Record<string, string> = { open: 'Chờ HR xử lý', adjusting: 'Chờ Kế toán điều chỉnh', resolved: 'Đã điều chỉnh', rejected: 'Bị từ chối' }

const QRuns = `query PayrollRuns {
  payroll_runs(order_by: [{period_year: desc}, {period_month: desc}], limit: 12) {
    id period_year period_month status employee_count total_gross total_net return_comment
  }
}`
const QRows = `query PayrollRows($y: smallint!, $m: smallint!) {
  payrolls(where: {period_year: {_eq: $y}, period_month: {_eq: $m}}, order_by: {employee: {full_name: asc}}) {
    id status base_salary allowance overtime_pay bonus gross personal_income_tax net_salary employee { full_name department }
  }
}`
const QEmps = `query PayrollEmployees { employees(where: {status: {_eq: "active"}}, order_by: {full_name: asc}) { id full_name department } }`
const QCompl = `query ComplaintQueue($statuses: [String!]!) {
  payslip_complaints(where: {status: {_in: $statuses}}, order_by: {created_at: asc}) {
    id message status hr_note employee { full_name } payroll { period_year period_month net_salary overtime_pay bonus }
  }
}`

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
  const [adj, setAdj] = useState<Record<string, { ot: string; bonus: string }>>({})
  const [busy, setBusy] = useState(false)
  const [fix, setFix] = useState<Record<string, { ot: string; bonus: string; note: string }>>({})

  const reloadAll = () => { runs.reload(); rows.reload(); emps.reload(); compl.reload() }
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try { await fn(); push({ title: ok, kind: 'success' }); reloadAll(); return true }
    catch (x) { push({ title: 'Không thực hiện được', message: errMsg(x), kind: 'error' }); return false }
    finally { setBusy(false) }
  }
  const reason = (title: string) => window.prompt(title) ?? undefined

  if (runs.loading) return <Loading />
  if (runs.error) return <ErrorBox message={runs.error} />

  const list: any[] = runs.data.payroll_runs
  const calcAdjustments = () => Object.entries(adj)
    .filter(([, v]) => v.ot || v.bonus)
    .map(([employeeId, v]) => ({ employeeId, overtimePay: v.ot ? Number(v.ot) : undefined, bonus: v.bonus ? Number(v.bonus) : undefined }))

  return (
    <div>
      <PageHeader title="Kỳ lương hằng tháng" description="HR chốt công → Kế toán tính lương → HR rà soát → Giám đốc duyệt → Kế toán chi trả và phát hành phiếu lương. Nhân viên có thể khiếu nại phiếu lương." />

      {isHr && (
        <Card className="mb-4">
          <CardHeader><CardTitle>Chốt công và tạo kỳ lương</CardTitle></CardHeader>
          <CardContent>
            <form className="flex flex-wrap items-end gap-3" onSubmit={async (e) => {
              e.preventDefault()
              await act(() => api('/api/payroll-runs', 'POST', { year: Number(form.year), month: Number(form.month) }), 'Đã chốt công và tạo kỳ lương')
            }}>
              <Field label="Năm"><Input type="number" className="w-28" min={2020} max={2100} value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))} required /></Field>
              <Field label="Tháng">
                <Select value={form.month} onChange={(e) => setForm((f) => ({ ...f, month: e.target.value }))}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>Tháng {m}</option>)}
                </Select>
              </Field>
              <Button type="submit" disabled={busy}>Chốt công</Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="mb-4">
        <CardHeader><CardTitle>Các kỳ lương</CardTitle></CardHeader>
        <CardContent>
          {list.length === 0 ? <Empty text="Chưa có kỳ lương nào" /> : (
            <Table>
              <THead><TR><TH>Kỳ</TH><TH>Trạng thái</TH><TH>Số phiếu</TH><TH>Tổng lương gộp</TH><TH>Tổng thực nhận</TH><TH /></TR></THead>
              <TBody>
                {list.map((r) => (
                  <TR key={r.id} className={r.id === runId ? 'bg-muted/40' : undefined}>
                    <TD className="cursor-pointer font-medium" onClick={() => setRunId(r.id)}>{monthLabel(r.period_year, r.period_month)}</TD>
                    <TD>
                      <Badge variant={r.status === 'paid' ? 'success' : 'warning'}>{RUN_STATUS[r.status]}</Badge>
                      {r.status === 'timesheet_closed' && r.return_comment && <div className="mt-1 text-xs text-destructive">Bị trả lại: {r.return_comment}</div>}
                    </TD>
                    <TD>{r.employee_count}</TD><TD>{vnd(r.total_gross)}</TD><TD>{vnd(r.total_net)}</TD>
                    <TD className="whitespace-nowrap">
                      {isHr && r.status === 'calculated' && <>
                        <Button size="sm" disabled={busy} onClick={() => act(() => api(`/api/payroll-runs/${r.id}/hr-review`, 'POST', { decision: 'approve' }), 'Đã rà soát, chuyển Giám đốc')}>Rà soát xong</Button>{' '}
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => api(`/api/payroll-runs/${r.id}/hr-review`, 'POST', { decision: 'reject', comment: reason('Lý do trả lại Kế toán') }), 'Đã trả lại Kế toán')}>Trả lại</Button>
                      </>}
                      {isDir && r.status === 'hr_reviewed' && <>
                        <Button size="sm" disabled={busy} onClick={() => act(() => api(`/api/payroll-runs/${r.id}/decision`, 'POST', { decision: 'approve' }), 'Đã duyệt bảng lương')}>Duyệt</Button>{' '}
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => api(`/api/payroll-runs/${r.id}/decision`, 'POST', { decision: 'reject', comment: reason('Lý do trả lại') }), 'Đã trả lại Kế toán')}>Trả lại</Button>
                      </>}
                      {isAcc && r.status === 'approved' && <Button size="sm" disabled={busy} onClick={() => act(() => api(`/api/payroll-runs/${r.id}/pay`, 'POST'), 'Đã chi trả và phát hành phiếu lương')}>Chi trả</Button>}
                      {isAcc && r.status === 'timesheet_closed' && <Button size="sm" variant="outline" onClick={() => setRunId(r.id)}>Tính lương…</Button>}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {isAcc && run?.status === 'timesheet_closed' && (
        <Card className="mb-4">
          <CardHeader><CardTitle>Tính lương {monthLabel(run.period_year, run.period_month)}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Nhập tiền làm thêm giờ và thưởng theo số liệu HR đã chốt (để trống nếu không có). Lương cơ bản và phụ cấp lấy từ hợp đồng đang hiệu lực; lương tính đủ tháng.</p>
            {emps.loading ? <Loading /> : emps.error ? <ErrorBox message={emps.error} /> : (
              <Table>
                <THead><TR><TH>Nhân viên</TH><TH>Làm thêm giờ (đ)</TH><TH>Thưởng (đ)</TH></TR></THead>
                <TBody>
                  {emps.data.employees.map((e: any) => (
                    <TR key={e.id}>
                      <TD>{e.full_name}<div className="text-xs text-muted-foreground">{e.department}</div></TD>
                      <TD><Input type="number" min={0} className="h-8 w-40" value={adj[e.id]?.ot ?? ''} onChange={(ev) => setAdj((s) => ({ ...s, [e.id]: { ot: ev.target.value, bonus: s[e.id]?.bonus ?? '' } }))} /></TD>
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
                <THead><TR><TH>Nhân viên</TH><TH>Lương cơ bản</TH><TH>Phụ cấp</TH><TH>Làm thêm</TH><TH>Thưởng</TH><TH>Gộp</TH><TH>Thuế TNCN</TH><TH>Thực nhận</TH></TR></THead>
                <TBody>
                  {rows.data.payrolls.map((p: any) => (
                    <TR key={p.id}>
                      <TD>{p.employee?.full_name}<div className="text-xs text-muted-foreground">{p.employee?.department}</div></TD>
                      <TD>{vnd(p.base_salary)}</TD><TD>{vnd(p.allowance)}</TD><TD>{vnd(p.overtime_pay)}</TD><TD>{vnd(p.bonus)}</TD>
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
                      <TD>{monthLabel(c.payroll.period_year, c.payroll.period_month)}<div className="text-xs text-muted-foreground">Thực nhận {vnd(c.payroll.net_salary)}</div></TD>
                      <TD className="max-w-[18rem]">{c.message}{c.hr_note && <div className="text-xs text-muted-foreground">HR: {c.hr_note}</div>}</TD>
                      <TD><Badge variant="warning">{COMPLAINT_STATUS[c.status]}</Badge></TD>
                      <TD className="whitespace-nowrap">
                        {isHr && <>
                          <Button size="sm" disabled={busy} onClick={() => act(() => api(`/api/payslip-complaints/${c.id}/review`, 'POST', { decision: 'forward', note: reason('Ghi chú cho Kế toán (không bắt buộc)') }), 'Đã chuyển Kế toán điều chỉnh')}>Chuyển Kế toán</Button>{' '}
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => api(`/api/payslip-complaints/${c.id}/review`, 'POST', { decision: 'reject', note: reason('Lý do từ chối') }), 'Đã từ chối khiếu nại')}>Từ chối</Button>
                        </>}
                        {isAcc && (
                          <span className="inline-flex flex-wrap items-center gap-2">
                            <Input type="number" min={0} className="h-8 w-32" placeholder={`Làm thêm (hiện ${c.payroll.overtime_pay})`} value={fix[c.id]?.ot ?? ''} onChange={(e) => setFix((s) => ({ ...s, [c.id]: { ot: e.target.value, bonus: s[c.id]?.bonus ?? '', note: s[c.id]?.note ?? '' } }))} />
                            <Input type="number" min={0} className="h-8 w-32" placeholder={`Thưởng (hiện ${c.payroll.bonus})`} value={fix[c.id]?.bonus ?? ''} onChange={(e) => setFix((s) => ({ ...s, [c.id]: { ot: s[c.id]?.ot ?? '', bonus: e.target.value, note: s[c.id]?.note ?? '' } }))} />
                            <Button size="sm" disabled={busy || (!fix[c.id]?.ot && !fix[c.id]?.bonus)} onClick={() => act(() => api(`/api/payslip-complaints/${c.id}/adjust`, 'POST', {
                              overtimePay: fix[c.id]?.ot ? Number(fix[c.id].ot) : undefined, bonus: fix[c.id]?.bonus ? Number(fix[c.id].bonus) : undefined, note: reason('Ghi chú điều chỉnh (không bắt buộc)') }), 'Đã điều chỉnh phiếu lương')}>Điều chỉnh</Button>
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
