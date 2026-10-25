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

const KIND_LABEL: Record<string, string> = { resignation: 'Xin nghỉ việc', termination: 'Chấm dứt hợp đồng' }
const STAGE_LABEL: Record<string, string> = {
  manager: 'Chờ Quản lý xác nhận', director_confirm: 'Chờ Giám đốc xác nhận', hr_review: 'HR kiểm tra hợp đồng, thời gian báo trước',
  director_decision: 'Chờ Giám đốc quyết định', handover: 'Bàn giao công việc, tài sản', timesheet: 'HR chốt công',
  final_payroll: 'Kế toán tính lương cuối kỳ', director_payroll: 'Chờ Giám đốc duyệt lương cuối', payment: 'Kế toán chi trả',
  terminate: 'HR chấm dứt hợp đồng', done: 'Hoàn tất', closed: 'Đã đóng',
}
const APPROVE_LABEL: Record<string, string> = {
  handover: 'Xác nhận đã bàn giao', timesheet: 'Đã chốt công', final_payroll: 'Gửi Giám đốc duyệt', payment: 'Đã chi trả', terminate: 'Chấm dứt hợp đồng',
}
const CAN_REJECT = ['manager', 'director_confirm', 'hr_review', 'director_decision', 'director_payroll']
const STAGES_BY_ROLE: Record<string, string[]> = {
  manager: ['manager'],
  director: ['director_confirm', 'director_decision', 'director_payroll'],
  hr: ['hr_review', 'handover', 'timesheet', 'terminate'],
  accountant: ['final_payroll', 'payment'],
}
const today = () => new Date().toISOString().slice(0, 10)

const QM = `query MyOffboarding($uid: uuid!) {
  offboarding_cases(where: {employee: {user_id: {_eq: $uid}}}, order_by: {created_at: desc}) {
    id kind reason stage status proposed_last_day last_working_day final_pay_amount created_at
  }
}`
const QQ = `query OffboardingQueue($stages: [String!]!, $uid: uuid!) {
  offboarding_cases(where: {status: {_eq: "open"}, stage: {_in: $stages}, employee: {user_id: {_neq: $uid}}}, order_by: {created_at: asc}) {
    id kind reason stage proposed_last_day last_working_day final_pay_amount created_at employee { full_name department job_title }
  }
}`
const QT = `query MyTeam($uid: uuid!) {
  employees(where: {manager: {user_id: {_eq: $uid}}, status: {_neq: "terminated"}}, order_by: {full_name: asc}) { id full_name }
}`

export default function Offboarding() {
  const { user } = useAuth()
  const { push } = useToast()
  const stages = STAGES_BY_ROLE[user.role]
  const mine = useQuery<any>(QM, { uid: user.sub })
  const queue = useQuery<any>(QQ, { stages: stages ?? ['__none__'], uid: user.sub })
  const team = useQuery<any>(QT, { uid: user.sub })
  const [resign, setResign] = useState({ reason: '', lastWorkingDay: '' })
  const [term, setTerm] = useState({ employeeId: '', reason: '', lastWorkingDay: '' })
  const [inputs, setInputs] = useState<Record<string, { day?: string; pay?: string }>>({})
  const [busy, setBusy] = useState(false)

  const reloadAll = () => { mine.reload(); queue.reload(); team.reload() }
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try { await fn(); push({ title: ok, kind: 'success' }); reloadAll(); return true }
    catch (x) { push({ title: 'Không thực hiện được', message: errMsg(x), kind: 'error' }); return false }
    finally { setBusy(false) }
  }

  const submitResign = async (e: React.FormEvent) => {
    e.preventDefault()
    if (await run(() => api('/api/offboarding/resignations', 'POST', resign), 'Đã gửi đơn xin nghỉ việc')) setResign({ reason: '', lastWorkingDay: '' })
  }
  const submitTerm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (await run(() => api('/api/offboarding/terminations', 'POST', term), 'Đã gửi đề xuất chấm dứt hợp đồng')) setTerm({ employeeId: '', reason: '', lastWorkingDay: '' })
  }
  const act = (c: any, decision: 'approve' | 'reject') => {
    const inp = inputs[c.id] ?? {}
    const comment = decision === 'reject' ? window.prompt('Lý do (không bắt buộc)') ?? undefined : undefined
    const body: any = { decision, comment }
    if (decision === 'approve' && (c.stage === 'manager' || c.stage === 'director_confirm')) body.lastWorkingDay = inp.day || c.proposed_last_day
    if (decision === 'approve' && c.stage === 'final_payroll') {
      if (!inp.pay) { push({ title: 'Cần nhập số tiền lương cuối kỳ', kind: 'error' }); return }
      body.finalPayAmount = Number(inp.pay)
    }
    return run(() => api(`/api/offboarding/${c.id}/action`, 'POST', body), decision === 'approve' ? 'Đã xử lý' : 'Đã từ chối')
  }
  const setInp = (id: string, patch: { day?: string; pay?: string }) => setInputs((s) => ({ ...s, [id]: { ...s[id], ...patch } }))

  if (mine.loading) return <Loading />
  if (mine.error) return <ErrorBox message={mine.error} />

  return (
    <div>
      <PageHeader title="Nghỉ việc" description="Quy trình: Quản lý (hoặc Giám đốc) xác nhận → HR kiểm tra → bàn giao → chốt công → Kế toán tính lương cuối → Giám đốc duyệt → chi trả → chấm dứt hợp đồng. Tài khoản tự khóa vào ngày làm việc cuối." />

      {stages && (
        <Card className="mb-4">
          <CardHeader><CardTitle>Chờ bạn xử lý</CardTitle></CardHeader>
          <CardContent>
            {queue.loading ? <Loading /> : queue.error ? <ErrorBox message={queue.error} /> : queue.data.offboarding_cases.length === 0 ? <Empty text="Không có hồ sơ nào đang chờ" /> : (
              <Table>
                <THead><TR><TH>Nhân viên</TH><TH>Loại</TH><TH>Lý do</TH><TH>Bước hiện tại</TH><TH>Thông tin cần nhập</TH><TH /></TR></THead>
                <TBody>
                  {queue.data.offboarding_cases.map((c: any) => (
                    <TR key={c.id}>
                      <TD>{c.employee?.full_name}<div className="text-xs text-muted-foreground">{c.employee?.department} · {c.employee?.job_title}</div></TD>
                      <TD>{KIND_LABEL[c.kind]}</TD>
                      <TD className="max-w-[14rem] truncate text-muted-foreground">{c.reason}</TD>
                      <TD>{STAGE_LABEL[c.stage]}{c.last_working_day && <div className="text-xs text-muted-foreground">Ngày làm việc cuối: {fmtDate(c.last_working_day)}</div>}</TD>
                      <TD>
                        {(c.stage === 'manager' || c.stage === 'director_confirm') && (
                          <Input type="date" className="h-8 w-40" value={inputs[c.id]?.day ?? c.proposed_last_day ?? ''} onChange={(e) => setInp(c.id, { day: e.target.value })} />
                        )}
                        {c.stage === 'final_payroll' && (
                          <Input type="number" min={0} className="h-8 w-40" placeholder="Lương cuối kỳ (đ)" value={inputs[c.id]?.pay ?? ''} onChange={(e) => setInp(c.id, { pay: e.target.value })} />
                        )}
                        {c.stage === 'director_payroll' && <span className="text-sm">Lương cuối kỳ: {c.final_pay_amount != null ? vnd(c.final_pay_amount) : '—'}</span>}
                      </TD>
                      <TD className="whitespace-nowrap">
                        <Button size="sm" disabled={busy} onClick={() => act(c, 'approve')}>{APPROVE_LABEL[c.stage] ?? 'Duyệt'}</Button>{' '}
                        {CAN_REJECT.includes(c.stage) && <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(c, 'reject')}>{c.stage === 'director_payroll' ? 'Trả lại Kế toán' : 'Từ chối'}</Button>}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <Card>
            <CardHeader><CardTitle>Xin nghỉ việc</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={submitResign} className="space-y-3">
                <Field label="Ngày làm việc cuối đề xuất"><Input type="date" min={today()} value={resign.lastWorkingDay} onChange={(e) => setResign((f) => ({ ...f, lastWorkingDay: e.target.value }))} required /></Field>
                <Field label="Lý do"><Textarea value={resign.reason} onChange={(e) => setResign((f) => ({ ...f, reason: e.target.value }))} required minLength={5} /></Field>
                <Button type="submit" disabled={busy} className="w-full">Gửi đơn</Button>
                <p className="text-xs text-muted-foreground">{user.role === 'employee' ? 'Đơn do quản lý trực tiếp xác nhận trước.' : user.role === 'director' ? 'Đơn chuyển thẳng cho HR.' : 'Đơn do Giám đốc xác nhận trước.'}</p>
              </form>
            </CardContent>
          </Card>

          {user.role === 'manager' && (
            <Card>
              <CardHeader><CardTitle>Đề xuất chấm dứt hợp đồng</CardTitle></CardHeader>
              <CardContent>
                <form onSubmit={submitTerm} className="space-y-3">
                  <Field label="Nhân viên trong nhóm">
                    <Select value={term.employeeId} onChange={(e) => setTerm((f) => ({ ...f, employeeId: e.target.value }))} required>
                      <option value="">— Chọn nhân viên —</option>
                      {(team.data?.employees ?? []).map((m: any) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                    </Select>
                  </Field>
                  <Field label="Ngày làm việc cuối đề xuất"><Input type="date" min={today()} value={term.lastWorkingDay} onChange={(e) => setTerm((f) => ({ ...f, lastWorkingDay: e.target.value }))} required /></Field>
                  <Field label="Lý do"><Textarea value={term.reason} onChange={(e) => setTerm((f) => ({ ...f, reason: e.target.value }))} required minLength={5} /></Field>
                  <Button type="submit" disabled={busy} className="w-full">Gửi HR thẩm định</Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Hồ sơ của tôi</CardTitle></CardHeader>
          <CardContent>
            {mine.data.offboarding_cases.length === 0 ? <Empty text="Bạn chưa có hồ sơ nghỉ việc nào" /> : (
              <Table>
                <THead><TR><TH>Ngày gửi</TH><TH>Loại</TH><TH>Ngày làm việc cuối</TH><TH>Trạng thái</TH></TR></THead>
                <TBody>
                  {mine.data.offboarding_cases.map((c: any) => (
                    <TR key={c.id}>
                      <TD>{fmtDate(c.created_at)}</TD><TD>{KIND_LABEL[c.kind]}</TD>
                      <TD>{fmtDate(c.last_working_day ?? c.proposed_last_day)}</TD>
                      <TD><Badge variant={c.status === 'rejected' ? 'destructive' : c.status === 'completed' ? 'success' : 'warning'}>{c.status === 'rejected' ? 'Bị từ chối' : STAGE_LABEL[c.stage]}</Badge></TD>
                    </TR>
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
