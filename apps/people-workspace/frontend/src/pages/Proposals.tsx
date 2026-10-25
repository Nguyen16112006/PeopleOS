// SPDX-License-Identifier: Apache-2.0
import { useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { Empty, ErrorBox, errMsg, Loading, PageHeader, ProposalBadge, StepBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { useToast } from '@/hooks/toast'
import { useQuery } from '@/hooks/useQuery'
import { api } from '@/lib/api'
import { fmtDate, vnd } from '@/lib/format'

const QE = `query Team($uid: uuid!) {
  employees(where: {user_id: {_neq: $uid}, status: {_neq: "terminated"}}, order_by: {full_name: asc}) { id full_name job_title }
}`
const QP = `query Proposals {
  salary_proposals(order_by: {created_at: desc}) {
    id proposal_type current_amount proposed_amount reason status created_at
    employee { full_name } proposer { full_name }
    approval_steps(order_by: {step_order: asc}) { id approver_role status }
  }
}`

export default function Proposals() {
  const { user } = useAuth()
  const { push } = useToast()
  const team = useQuery<{ employees: any[] }>(QE, { uid: user.sub })
  const list = useQuery<{ salary_proposals: any[] }>(QP)
  const [form, setForm] = useState({ employee_id: '', proposal_type: 'raise', proposed_amount: '', reason: '' })
  const [sending, setSending] = useState(false)
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSending(true)
    try {
      await api('/api/salary-proposals', 'POST', { ...form, proposed_amount: Number(form.proposed_amount) })
      push({ title: 'Đã gửi đề xuất', message: 'Chuỗi duyệt: HR → Kế toán → Giám đốc. Bạn sẽ nhận thông báo realtime.', kind: 'success' })
      setForm((f) => ({ ...f, proposed_amount: '', reason: '' }))
      list.reload()
    } catch (x) { push({ title: 'Không gửi được đề xuất', message: errMsg(x), kind: 'error' }) }
    finally { setSending(false) }
  }

  if (team.loading || list.loading) return <Loading />
  if (team.error || list.error) return <ErrorBox message={(team.error || list.error)!} />
  return (
    <div>
      <PageHeader title="Đề xuất tăng lương / phụ cấp" description={user.role === 'manager' ? 'Đề xuất cho nhân viên trong nhóm của bạn. Quy trình duyệt: HR → Kế toán → Giám đốc.' : 'Theo dõi các đề xuất tăng lương. Quy trình duyệt: HR thẩm định → Kế toán kiểm ngân sách → Giám đốc duyệt cuối.'} />
      <div className="grid gap-4 lg:grid-cols-3">
        {user.role === 'manager' && <Card>
          <CardHeader><CardTitle>Tạo đề xuất</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-3">
              <Field label="Nhân viên">
                <Select value={form.employee_id} onChange={(e) => set('employee_id', e.target.value)} required>
                  <option value="">— Chọn nhân viên —</option>
                  {team.data!.employees.map((x) => <option key={x.id} value={x.id}>{x.full_name} · {x.job_title}</option>)}
                </Select>
              </Field>
              <Field label="Loại đề xuất">
                <Select value={form.proposal_type} onChange={(e) => set('proposal_type', e.target.value)}>
                  <option value="raise">Tăng lương cơ bản</option><option value="allowance">Tăng phụ cấp</option>
                </Select>
              </Field>
              <Field label="Mức đề xuất mới (đ/tháng)"><Input type="number" min={1} step={100000} value={form.proposed_amount} onChange={(e) => set('proposed_amount', e.target.value)} required /></Field>
              <Field label="Lý do"><Textarea value={form.reason} onChange={(e) => set('reason', e.target.value)} required minLength={5} placeholder="Thành tích, phạm vi công việc mới…" /></Field>
              <Button type="submit" className="w-full" disabled={sending}>{sending ? 'Đang gửi…' : 'Gửi đề xuất'}</Button>
              <p className="text-xs text-muted-foreground">Mức mới phải cao hơn mức hiện tại trong hợp đồng; hệ thống sẽ báo nếu chưa hợp lệ.</p>
            </form>
          </CardContent>
        </Card>}
        <Card className={user.role === 'manager' ? 'lg:col-span-2' : 'lg:col-span-3'}>
          <CardHeader><CardTitle>Các đề xuất</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {list.data!.salary_proposals.length === 0 && <Empty text="Chưa có đề xuất nào" />}
            {list.data!.salary_proposals.map((p) => (
              <div key={p.id} className="rounded-md border p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{p.employee.full_name} · {p.proposal_type === 'raise' ? 'Lương cơ bản' : 'Phụ cấp'}</p>
                    <p>{vnd(p.current_amount)} → <span className="font-semibold text-emerald-700">{vnd(p.proposed_amount)}</span></p>
                    <p className="text-xs text-muted-foreground">{p.proposer.full_name} đề xuất ngày {fmtDate(p.created_at)} - {p.reason}</p>
                  </div>
                  <ProposalBadge status={p.status} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  {p.approval_steps.map((s: any, i: number) => (
                    <div key={s.id} className="flex items-center gap-1.5">{i > 0 && <span className="text-slate-300">→</span>}
                      <span>{({ hr: 'HR', accountant: 'Kế toán', director: 'Giám đốc' } as Record<string, string>)[s.approver_role]}</span><StepBadge status={s.status} /></div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
