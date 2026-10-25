// SPDX-License-Identifier: Apache-2.0
import { Check, X } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { Empty, ErrorBox, errMsg, Loading, PageHeader, StepBadge } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/form'
import { useToast } from '@/hooks/toast'
import { useQuery } from '@/hooks/useQuery'
import { api } from '@/lib/api'
import { fmtDate, LEAVE_TYPES, vnd } from '@/lib/format'
import { cn } from '@/lib/utils'

// Đơn nghỉ phép được duyệt theo giai đoạn: Quản lý (nhân viên) → HR (kiểm ngày phép) → Giám đốc
const STAGE_BY_ROLE: Record<string, string> = { manager: 'manager', hr: 'hr', director: 'director' }
const PROPOSAL_STEPS_BY_ROLE: Record<string, string[]> = { hr: ['pending_hr'], accountant: ['pending_accountant'], director: ['pending_director'] }

const QL = `query PendingLeave($uid: uuid!, $stage: String!) {
  leave_requests(where: {status: {_eq: "pending"}, stage: {_eq: $stage}, employee: {user_id: {_neq: $uid}}}, order_by: {created_at: asc}) {
    id leave_type start_date end_date days reason employee { full_name job_title }
  }
}`
const QP = `query PendingProposals($steps: [String!]!) {
  salary_proposals(where: {status: {_in: $steps}}, order_by: {created_at: asc}) {
    id proposal_type current_amount proposed_amount reason status
    employee { full_name job_title } proposer { full_name }
    approval_steps(order_by: {step_order: asc}) { id step_order approver_role status comment approver { full_name } }
  }
}`

function DecisionBar({ onDecide, busy }: { onDecide: (d: 'approve' | 'reject', note: string) => void; busy: boolean }) {
  const [note, setNote] = useState('')
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Input className="max-w-xs" placeholder="Ghi chú / lý do (tuỳ chọn)" value={note} onChange={(e) => setNote(e.target.value)} />
      <Button size="sm" variant="success" disabled={busy} onClick={() => onDecide('approve', note)}><Check className="h-4 w-4" /> Duyệt</Button>
      <Button size="sm" variant="destructive" disabled={busy} onClick={() => onDecide('reject', note)}><X className="h-4 w-4" /> Từ chối</Button>
    </div>
  )
}

function LeaveTab() {
  const { user } = useAuth()
  const { push } = useToast()
  const { data, loading, error, reload } = useQuery<{ leave_requests: any[] }>(QL, { uid: user.sub, stage: STAGE_BY_ROLE[user.role] ?? '__none__' })
  const [busy, setBusy] = useState(false)
  const decide = async (id: string, decision: string, note: string) => {
    setBusy(true)
    try { await api(`/api/leave-requests/${id}/decision`, 'POST', { decision, note: note || null }); push({ title: decision === 'approve' ? 'Đã duyệt đơn nghỉ' : 'Đã từ chối đơn nghỉ', kind: 'success' }); reload() }
    catch (e) { push({ title: 'Không thực hiện được', message: errMsg(e), kind: 'error' }) }
    finally { setBusy(false) }
  }
  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} />
  if (!data!.leave_requests.length) return <Empty text="Không có đơn nghỉ phép nào đang chờ bạn duyệt" />
  return (
    <div className="space-y-3">
      {data!.leave_requests.map((r) => (
        <Card key={r.id}>
          <CardContent className="pt-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{r.employee.full_name} <span className="font-normal text-muted-foreground">· {r.employee.job_title}</span></p>
                <p className="text-sm text-muted-foreground">{LEAVE_TYPES[r.leave_type]} · {fmtDate(r.start_date)}{r.start_date !== r.end_date && ` → ${fmtDate(r.end_date)}`} · {Number(r.days)} ngày</p>
                {r.reason && <p className="mt-1 text-sm">Lý do: {r.reason}</p>}
              </div>
              <Badge variant="warning">Chờ duyệt</Badge>
            </div>
            <DecisionBar busy={busy} onDecide={(d, n) => decide(r.id, d, n)} />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function ProposalTab() {
  const { user } = useAuth()
  const { push } = useToast()
  const steps = PROPOSAL_STEPS_BY_ROLE[user.role] ?? ['__none__']
  const { data, loading, error, reload } = useQuery<{ salary_proposals: any[] }>(QP, { steps })
  const [busy, setBusy] = useState(false)
  const decide = async (id: string, decision: string, comment: string) => {
    setBusy(true)
    try {
      const r = await api<{ status: string }>(`/api/salary-proposals/${id}/decision`, 'POST', { decision, comment: comment || null })
      push({ title: r.status === 'approved' ? 'Đề xuất đã duyệt hoàn tất' : r.status === 'rejected' ? 'Đã từ chối đề xuất' : 'Đã duyệt - chuyển cấp tiếp theo', kind: 'success' })
      reload()
    } catch (e) { push({ title: 'Không thực hiện được', message: errMsg(e), kind: 'error' }) }
    finally { setBusy(false) }
  }
  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} />
  if (!data!.salary_proposals.length) return <Empty text="Không có đề xuất tăng lương nào đang chờ duyệt" />
  return (
    <div className="space-y-3">
      {data!.salary_proposals.map((p) => {
        const mine = p.status === `pending_${user.role}`
        return (
          <Card key={p.id}>
            <CardContent className="pt-5">
              <p className="font-medium">{p.employee.full_name} <span className="font-normal text-muted-foreground">· {p.employee.job_title}</span></p>
              <p className="text-sm">
                {p.proposal_type === 'raise' ? 'Tăng lương cơ bản' : 'Tăng phụ cấp'}: <span className="text-muted-foreground line-through">{vnd(p.current_amount)}</span> →{' '}
                <span className="font-semibold text-emerald-700">{vnd(p.proposed_amount)}</span>
                <span className="ml-1 text-muted-foreground">(+{vnd(p.proposed_amount - p.current_amount)})</span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">Đề xuất bởi {p.proposer.full_name} - {p.reason}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                {p.approval_steps.map((s: any, i: number) => (
                  <div key={s.id} className="flex items-center gap-2">
                    {i > 0 && <span className="text-slate-300">→</span>}
                    <span className={cn('font-medium', s.status === 'pending' && 'text-amber-700')}>{({ hr: 'HR', accountant: 'Kế toán', director: 'Giám đốc' } as Record<string, string>)[s.approver_role]}</span>
                    <StepBadge status={s.status} />
                    {s.comment && <span className="text-muted-foreground">({s.approver?.full_name}: {s.comment})</span>}
                  </div>
                ))}
              </div>
              {mine ? <DecisionBar busy={busy} onDecide={(d, n) => decide(p.id, d, n)} /> : <p className="mt-3 text-xs text-muted-foreground">Đang chờ cấp duyệt khác.</p>}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

export default function Approvals() {
  const { user } = useAuth()
  const canProposals = ['hr', 'accountant', 'director'].includes(user.role)
  const canLeave = ['manager', 'hr', 'director'].includes(user.role)
  const [tab, setTab] = useState<'leave' | 'proposal'>(canLeave ? 'leave' : 'proposal')
  return (
    <div>
      <PageHeader title="Phê duyệt" description={user.role === 'manager' ? 'Đơn nghỉ phép của nhân viên trong nhóm bạn' : user.role === 'accountant' ? 'Đề xuất tăng lương chờ bạn kiểm tra ngân sách' : 'Đơn nghỉ phép và đề xuất tăng lương đang chờ bạn xử lý'} />
      {canProposals && canLeave && (
        <div className="mb-4 inline-flex rounded-lg border bg-white p-1 text-sm">
          {([['leave', 'Đơn nghỉ phép'], ['proposal', 'Đề xuất tăng lương']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={cn('rounded-md px-4 py-1.5 font-medium', tab === k ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-100')}>{label}</button>
          ))}
        </div>
      )}
      {canLeave && (tab === 'leave' || !canProposals) ? <LeaveTab /> : <ProposalTab />}
    </div>
  )
}
