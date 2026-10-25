// SPDX-License-Identifier: Apache-2.0
import { useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { Empty, ErrorBox, errMsg, Loading, PageHeader } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { useToast } from '@/hooks/toast'
import { useQuery } from '@/hooks/useQuery'
import { api } from '@/lib/api'
import { fmtDate, vnd } from '@/lib/format'

const CLOSING_LABEL: Record<string, string> = { open: 'Chưa bắt đầu', hr_confirmed: 'HR đã xác nhận, chờ Kế toán quyết toán', settled: 'Đã quyết toán' }
const REPORT_LABEL: Record<string, string> = { draft: 'Bản nháp', submitted: 'Chờ Giám đốc duyệt', approved: 'Đã duyệt', returned: 'Bị trả lại' }
const BUDGET_LABEL: Record<string, string> = { proposed: 'Chờ Giám đốc duyệt', approved: 'Đã duyệt' }

const QCert = `query MyTaxCertificates($uid: uuid!) {
  tax_certificates(where: {employee: {user_id: {_eq: $uid}}}, order_by: {year: desc}) {
    id year months gross_total insurance_total taxable_total pit_withheld net_total dependents tax_code issued_at
  }
}`
const QMgmt = `query TaxMgmt($y: smallint!, $by: smallint!) {
  closing: tax_year_closings_by_pk(year: $y) { year status hr_confirmed_at settled_at certificates_issued }
  budget: hr_budgets_by_pk(year: $by) { year payroll_fund headcount_plan note status approved_at }
}`
const QReport = `query TaxReport($y: smallint!) {
  report: annual_reports_by_pk(year: $y) { year status figures prepared_at approved_at director_comment }
}`

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="text-base font-semibold">{value}</div></div>
)

export default function TaxYear() {
  const { user } = useAuth()
  const { push } = useToast()
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear)
  const [busy, setBusy] = useState(false)
  const [budget, setBudget] = useState({ payrollFund: '', headcountPlan: '', note: '' })

  const isHr = user.role === 'hr'
  const isAcc = user.role === 'accountant'
  const isDir = user.role === 'director'
  const mgmt = isHr || isAcc || isDir

  const certs = useQuery<any>(QCert, { uid: user.sub })
  const m = useQuery<any>(QMgmt, { y: year, by: year + 1 }, mgmt)
  const r = useQuery<any>(QReport, { y: year }, isAcc || isDir)

  const reload = () => { certs.reload(); m.reload(); r.reload() }
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try { await fn(); push({ title: ok, kind: 'success' }); reload(); return true }
    catch (x) { push({ title: 'Không thực hiện được', message: errMsg(x), kind: 'error' }); return false }
    finally { setBusy(false) }
  }
  const post = (path: string, ok: string, body?: unknown) => run(() => api(`/api/tax-year/${year}${path}`, 'POST', body), ok)

  if (certs.loading) return <Loading />
  if (certs.error) return <ErrorBox message={certs.error} />

  const closing = m.data?.closing
  const bud = m.data?.budget
  const report = r.data?.report
  const f = report?.figures
  const settled = closing?.status === 'settled'

  const submitBudget = async (e: React.FormEvent) => {
    e.preventDefault()
    if (await post('/budget', 'Đã gửi đề xuất ngân sách', { payrollFund: Number(budget.payrollFund), headcountPlan: budget.headcountPlan ? Number(budget.headcountPlan) : undefined, note: budget.note || undefined })) {
      setBudget({ payrollFund: '', headcountPlan: '', note: '' })
    }
  }

  return (
    <div>
      <PageHeader title="Thuế và báo cáo năm" description="Cuối năm: HR xác nhận người phụ thuộc và mã số thuế → Kế toán quyết toán, hệ thống phát hành chứng từ → Kế toán lập báo cáo tài chính năm → Giám đốc duyệt → ngân sách năm sau." />

      <Card className="mb-4">
        <CardContent className="flex items-end gap-3 pt-4">
          <Field label="Năm">
            <Select value={String(year)} onChange={(e) => setYear(Number(e.target.value))}>
              {[thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
          </Field>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle>Chứng từ khấu trừ thuế TNCN của tôi</CardTitle></CardHeader>
          <CardContent>
            {certs.data.tax_certificates.length === 0 ? <Empty text="Chưa có chứng từ nào. Chứng từ được phát hành tự động sau khi Kế toán quyết toán thuế năm." /> : (
              <Table>
                <THead><TR><TH>Năm</TH><TH>Số tháng</TH><TH>Thu nhập gộp</TH><TH>BHXH, BHYT, BHTN</TH><TH>Thu nhập tính thuế</TH><TH>Thuế TNCN đã khấu trừ</TH><TH>Thực nhận</TH><TH>Người phụ thuộc</TH><TH>MST</TH><TH>Ngày cấp</TH></TR></THead>
                <TBody>
                  {certs.data.tax_certificates.map((c: any) => (
                    <TR key={c.id} className={c.year === year ? 'bg-muted/40' : undefined}>
                      <TD>{c.year}</TD><TD>{c.months}</TD><TD>{vnd(c.gross_total)}</TD><TD>{vnd(c.insurance_total)}</TD><TD>{vnd(c.taxable_total)}</TD>
                      <TD className="font-medium">{vnd(c.pit_withheld)}</TD><TD>{vnd(c.net_total)}</TD><TD>{c.dependents}</TD><TD>{c.tax_code ?? '—'}</TD><TD>{fmtDate(c.issued_at)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {mgmt && (
          <Card>
            <CardHeader><CardTitle>Quyết toán thuế TNCN năm {year}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {m.loading ? <Loading /> : m.error ? <ErrorBox message={m.error} /> : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={settled ? 'success' : closing ? 'warning' : 'secondary'}>{CLOSING_LABEL[closing?.status ?? 'open']}</Badge>
                    {closing?.hr_confirmed_at && <span className="text-xs text-muted-foreground">HR xác nhận: {fmtDate(closing.hr_confirmed_at)}</span>}
                    {closing?.settled_at && <span className="text-xs text-muted-foreground">Quyết toán: {fmtDate(closing.settled_at)} · {closing.certificates_issued} chứng từ</span>}
                  </div>
                  {isHr && <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Xác nhận dữ liệu người phụ thuộc và mã số thuế của mọi nhân viên có lương năm {year}. Hệ thống sẽ báo nếu còn người thiếu mã số thuế.</p>
                    <Button disabled={busy || settled} onClick={() => post('/hr-confirm', 'Đã xác nhận dữ liệu thuế')}>Xác nhận người phụ thuộc và mã số thuế</Button>
                  </div>}
                  {isAcc && <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Chỉ quyết toán được sau khi HR xác nhận. Chứng từ khấu trừ sẽ được phát hành tự động cho từng nhân viên.</p>
                    <Button disabled={busy || closing?.status !== 'hr_confirmed'} onClick={() => post('/settle', 'Đã quyết toán và phát hành chứng từ')}>Quyết toán thuế TNCN và phát hành chứng từ</Button>
                  </div>}
                </>
              )}
            </CardContent>
          </Card>
        )}

        {(isAcc || isDir) && (
          <Card>
            <CardHeader><CardTitle>Báo cáo tài chính năm {year}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {r.loading ? <Loading /> : r.error ? <ErrorBox message={r.error} /> : !report ? (
                <>
                  <Empty text="Chưa có báo cáo cho năm này" />
                  {isAcc && <Button disabled={busy || !settled} onClick={() => post('/report/submit', 'Đã lập và gửi báo cáo')}>Lập và gửi báo cáo cho Giám đốc</Button>}
                  {isAcc && !settled && <p className="text-xs text-muted-foreground">Cần quyết toán thuế TNCN năm {year} trước.</p>}
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={report.status === 'approved' ? 'success' : report.status === 'returned' ? 'destructive' : 'warning'}>{REPORT_LABEL[report.status]}</Badge>
                    {report.prepared_at && <span className="text-xs text-muted-foreground">Lập ngày {fmtDate(report.prepared_at)}</span>}
                  </div>
                  {report.director_comment && <p className="text-sm text-destructive">Giám đốc: {report.director_comment}</p>}
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Stat label="Số nhân viên" value={String(f?.headcount ?? 0)} />
                    <Stat label="Tổng lương gộp" value={vnd(f?.gross_total ?? 0)} />
                    <Stat label="Tổng thực nhận" value={vnd(f?.net_total ?? 0)} />
                    <Stat label="Thuế TNCN khấu trừ" value={vnd(f?.pit_total ?? 0)} />
                    <Stat label="Bảo hiểm (người lao động)" value={vnd(f?.employee_insurance_total ?? 0)} />
                    <Stat label="Bảo hiểm (doanh nghiệp)" value={vnd(f?.employer_insurance_total ?? 0)} />
                    <Stat label="Tổng chi phí nhân sự" value={vnd(f?.employer_cost_total ?? 0)} />
                  </div>
                  {(f?.by_department ?? []).length > 0 && (
                    <Table>
                      <THead><TR><TH>Phòng ban</TH><TH>Số người</TH><TH>Lương gộp</TH></TR></THead>
                      <TBody>{f.by_department.map((d: any) => <TR key={d.department}><TD>{d.department}</TD><TD>{d.headcount}</TD><TD>{vnd(d.gross)}</TD></TR>)}</TBody>
                    </Table>
                  )}
                  {isAcc && report.status !== 'approved' && report.status !== 'submitted' && (
                    <Button disabled={busy || !settled} onClick={() => post('/report/submit', 'Đã gửi lại báo cáo')}>Cập nhật số liệu và gửi lại</Button>
                  )}
                  {isDir && report.status === 'submitted' && (
                    <div className="flex gap-2">
                      <Button disabled={busy} onClick={() => post('/report/approve', 'Đã duyệt báo cáo')}>Duyệt báo cáo</Button>
                      <Button variant="ghost" disabled={busy} onClick={() => { const comment = window.prompt('Lý do trả lại (không bắt buộc)') ?? undefined; post('/report/return', 'Đã trả lại Kế toán', { comment }) }}>Trả lại</Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}

        {mgmt && (
          <Card>
            <CardHeader><CardTitle>Ngân sách nhân sự và quỹ lương năm {year + 1}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {m.loading ? <Loading /> : bud ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={bud.status === 'approved' ? 'success' : 'warning'}>{BUDGET_LABEL[bud.status]}</Badge>
                    {bud.approved_at && <span className="text-xs text-muted-foreground">Duyệt ngày {fmtDate(bud.approved_at)}</span>}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Stat label="Quỹ lương" value={vnd(bud.payroll_fund)} />
                    <Stat label="Kế hoạch nhân sự" value={`${bud.headcount_plan} người`} />
                    <Stat label="Ghi chú" value={bud.note ?? '—'} />
                  </div>
                  {isDir && bud.status === 'proposed' && (
                    <div className="space-y-1">
                      <Button disabled={busy || report?.status !== 'approved'} onClick={() => post('/budget/approve', 'Đã duyệt ngân sách')}>Duyệt ngân sách</Button>
                      {report?.status !== 'approved' && <p className="text-xs text-muted-foreground">Cần duyệt báo cáo tài chính năm {year} trước.</p>}
                    </div>
                  )}
                </div>
              ) : <Empty text="Chưa có đề xuất ngân sách" />}
              {isAcc && bud?.status !== 'approved' && (
                <form onSubmit={submitBudget} className="grid gap-3 md:grid-cols-4">
                  <Field label="Quỹ lương đề xuất (đ)"><Input type="number" min={1} value={budget.payrollFund} onChange={(e) => setBudget((b) => ({ ...b, payrollFund: e.target.value }))} required /></Field>
                  <Field label="Kế hoạch nhân sự (người)"><Input type="number" min={0} value={budget.headcountPlan} onChange={(e) => setBudget((b) => ({ ...b, headcountPlan: e.target.value }))} /></Field>
                  <Field label="Ghi chú"><Textarea value={budget.note} onChange={(e) => setBudget((b) => ({ ...b, note: e.target.value }))} /></Field>
                  <div className="flex items-end"><Button type="submit" disabled={busy}>{bud ? 'Cập nhật đề xuất' : 'Gửi đề xuất'}</Button></div>
                </form>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
