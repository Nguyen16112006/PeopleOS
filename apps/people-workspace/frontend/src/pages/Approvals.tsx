// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

import { Check } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { Empty, ErrorBox, Loading, PageHeader, Stepper } from '@/components/common'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/hooks/confirm'
import { useToast } from '@/hooks/toast'
import { useQuery } from '@/hooks/useQuery'
import { api } from '@/lib/api'
import { fmtDate, fmtDays, LEAVE_TYPES, vnd } from '@/lib/format'
import { cn } from '@/lib/utils'

// Đơn nghỉ phép được duyệt theo giai đoạn: Quản lý (nhân viên) → HR (kiểm ngày phép) → Giám đốc
const STAGE_BY_ROLE: Record<string, string> = { manager: 'manager', hr: 'hr', director: 'director' }
const PROPOSAL_STEPS_BY_ROLE: Record<string, string[]> = { hr: ['pending_hr'], accountant: ['pending_accountant'], director: ['pending_director'] }
const ROLE_NAME: Record<string, string> = { hr: 'HR thẩm định', accountant: 'Kế toán kiểm ngân sách', director: 'Giám đốc duyệt' }

const QL = `query PendingLeave($uid: uuid!, $stage: String!, $year: smallint!, $today: date!) {
  leave_requests(where: {status: {_eq: "pending"}, stage: {_eq: $stage}, employee: {user_id: {_neq: $uid}}}, order_by: {created_at: asc}) {
    id employee_id leave_type start_date end_date days reason
    employee { full_name job_title department leave_balances(where: {year: {_eq: $year}}) { entitled_days used_days } }
  }
  others: leave_requests(where: {status: {_in: ["approved", "pending"]}, end_date: {_gte: $today}}) {
    id employee_id start_date end_date employee { full_name department }
  }
}`
const QP = `query PendingProposals($steps: [String!]!) {
  salary_proposals(where: {status: {_in: $steps}}, order_by: {created_at: asc}) {
    id proposal_type current_amount proposed_amount reason status
    employee { full_name job_title } proposer { full_name }
    approval_steps(order_by: {step_order: asc}) { id step_order approver_role status comment approver { full_name } }
  }
}`

const overlaps = (a: { start_date: string; end_date: string }, b: { start_date: string; end_date: string }) =>
  a.start_date <= b.end_date && b.start_date <= a.end_date

/** Ghi chú tuỳ chọn gửi kèm khi duyệt (giữ tính năng ghi chú như trước), gập lại cho gọn. */
function ApproveNote({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  if (!open && !value) return <button type="button" className="mt-2 text-[13.5px] font-medium text-primary hover:underline" onClick={() => setOpen(true)}>+ Thêm ghi chú khi duyệt</button>
  return (
    <label className="mt-2 block max-w-md text-[13.5px]">
      <span className="text-muted-foreground">Ghi chú khi duyệt (không bắt buộc)</span>
      <input className="mt-1 h-9 w-full rounded-[7px] border border-input bg-card px-2.5 text-[14.5px]" value={value} autoFocus onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

/** Duyệt: gửi sau 5 giây, có thể hoàn tác. Từ chối: bắt buộc ghi lý do. */
function useDecisions(reload: () => void) {
  const { deferred, push } = useToast()
  const confirm = useConfirm()
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const hide = (ids: string[], on: boolean) => setHidden((h) => { const n = new Set(h); ids.forEach((i) => (on ? n.add(i) : n.delete(i))); return n })

  const approve = (ids: string[], title: string, call: (id: string) => Promise<unknown>) => {
    hide(ids, true)
    deferred({
      title,
      commit: async () => { for (const id of ids) await call(id) },
      onDone: reload,
      onUndo: () => hide(ids, false),
    })
  }
  const reject = async (id: string, title: string, call: (note: string) => Promise<unknown>, ok: string) => {
    const r = await confirm({ title, confirmLabel: 'Từ chối', tone: 'danger',
      note: { label: 'Lý do từ chối', required: true, placeholder: 'Người đề nghị sẽ đọc lý do này.' } })
    if (!r) return
    hide([id], true)
    try { await call(r.note!); push({ title: ok, kind: 'success' }); reload() }
    catch (e) { hide([id], false); push({ title: 'Không thực hiện được', message: e instanceof Error ? e.message : String(e), kind: 'error' }) }
  }
  return { hidden, approve, reject }
}

function LeaveTab() {
  const { user } = useAuth()
  const today = new Date().toISOString().slice(0, 10)
  const { data, loading, error, reload } = useQuery<{ leave_requests: any[]; others: any[] }>(QL,
    { uid: user.sub, stage: STAGE_BY_ROLE[user.role] ?? '__none__', year: new Date().getFullYear(), today })
  const { hidden, approve, reject } = useDecisions(reload)
  const confirm = useConfirm()
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [notes, setNotes] = useState<Record<string, string>>({})
  const list = useMemo(() => (data?.leave_requests ?? []).filter((r) => !hidden.has(r.id)), [data, hidden])

  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} onRetry={reload} />
  if (!list.length) return <Empty text="Không còn đơn nghỉ phép nào chờ bạn duyệt." />

  const callApprove = (id: string) => api(`/api/leave-requests/${id}/decision`, 'POST', { decision: 'approve', note: notes[id]?.trim() || null })
  const leftOf = (r: any) => { const b = r.employee.leave_balances?.[0]; return b ? Number(b.entitled_days) - Number(b.used_days) : null }
  const isOver = (r: any) => { const left = leftOf(r); return left != null && r.leave_type === 'annual' && Number(r.days) > left }
  // Duyệt hàng loạt chỉ áp dụng cho đơn trong hạn mức; đơn vượt hạn mức phải xem và xác nhận từng đơn
  const bulkable = list.filter((r) => !isOver(r))
  const pickedList = bulkable.filter((r) => picked.has(r.id))
  const approveOver = async (r: any) => {
    const left = leftOf(r)!
    const ok = await confirm({
      title: `Duyệt đơn vượt hạn mức của ${r.employee.full_name}?`,
      summary: [
        { label: 'Phép năm còn lại', value: `${fmtDays(left)} ngày` },
        { label: 'Số ngày xin nghỉ', value: `${fmtDays(r.days)} ngày` },
        { label: 'Vượt hạn mức', value: `${fmtDays(Number(r.days) - left)} ngày`, caution: true },
      ],
      caution: 'Phần vượt sẽ bị trừ vào phép năm sau hoặc tính là nghỉ không lương, theo quy chế công ty. Hãy chắc rằng nhân viên đã biết điều này.',
      confirmLabel: 'Vẫn duyệt',
    })
    if (ok) approve([r.id], `Đã duyệt đơn nghỉ của ${r.employee.full_name}`, callApprove)
  }
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  return (
    <div className="space-y-3">
      <div className="po-bulkbar">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" disabled={!bulkable.length} checked={!!bulkable.length && pickedList.length === bulkable.length} onChange={(e) => setPicked(e.target.checked ? new Set(bulkable.map((r) => r.id)) : new Set())} />
          Chọn tất cả đơn trong hạn mức ({bulkable.length}{bulkable.length < list.length ? `/${list.length}` : ''})
        </label>
        <Button size="sm" disabled={!pickedList.length} onClick={() => {
          approve(pickedList.map((r) => r.id), `Đã duyệt ${pickedList.length} đơn nghỉ`, callApprove)
          setPicked(new Set())
        }}><Check className="h-4 w-4" aria-hidden="true" /> Duyệt {pickedList.length || ''} đơn đã chọn</Button>
      </div>
      {list.map((r) => {
        const bal = r.employee.leave_balances?.[0]
        const left = bal ? Number(bal.entitled_days) - Number(bal.used_days) : null
        const clash = (data!.others ?? []).filter((o) => o.id !== r.id && o.employee_id !== r.employee_id
          && o.employee?.department === r.employee.department && overlaps(o, r))
        const over = left != null && r.leave_type === 'annual' && Number(r.days) > left
        return (
          <article key={r.id} className="po-approval">
            <input type="checkbox" className="mt-1" aria-label={`Chọn đơn của ${r.employee.full_name}`} disabled={over}
              title={over ? 'Đơn vượt hạn mức phải duyệt riêng' : undefined} checked={!over && picked.has(r.id)} onChange={() => toggle(r.id)} />
            <div className="min-w-0 flex-1">
              <h2>{r.employee.full_name} <span>· {r.employee.job_title}</span></h2>
              <p className="po-approval-what">{LEAVE_TYPES[r.leave_type] ?? r.leave_type}, {fmtDate(r.start_date)}{r.start_date !== r.end_date && ` đến ${fmtDate(r.end_date)}`} · <b>{fmtDays(r.days)} ngày</b></p>
              {r.reason && <p className="po-approval-reason">“{r.reason}”</p>}
              <ul className="po-approval-context">
                {left != null && <li className={cn(over && 'warn')}>{over ? `Vượt hạn mức: còn ${left} ngày phép năm, xin ${fmtDays(r.days)} ngày` : `Còn ${left}/${Number(bal.entitled_days)} ngày phép năm`}</li>}
                <li className={cn(clash.length > 0 && 'warn')}>
                  {clash.length === 0 ? 'Không ai cùng phòng nghỉ trùng ngày'
                    : `${clash.length} người cùng phòng nghỉ trùng ngày: ${clash.slice(0, 3).map((c) => c.employee?.full_name).join(', ')}${clash.length > 3 ? '…' : ''}`}
                </li>
              </ul>
              <ApproveNote value={notes[r.id] ?? ''} onChange={(v) => setNotes((n) => ({ ...n, [r.id]: v }))} />
            </div>
            <div className="po-approval-actions">
              {over
                ? <Button size="sm" variant="outline" className="po-btn-caution" onClick={() => approveOver(r)}>Duyệt vượt hạn mức…</Button>
                : <Button size="sm" onClick={() => approve([r.id], `Đã duyệt đơn nghỉ của ${r.employee.full_name}`, callApprove)}><Check className="h-4 w-4" aria-hidden="true" /> Duyệt</Button>}
              <Button size="sm" variant="outline" onClick={() => reject(r.id, `Từ chối đơn nghỉ của ${r.employee.full_name}?`,
                (note) => api(`/api/leave-requests/${r.id}/decision`, 'POST', { decision: 'reject', note }), 'Đã từ chối đơn nghỉ')}>Từ chối…</Button>
            </div>
          </article>
        )
      })}
    </div>
  )
}

function ProposalTab() {
  const { user } = useAuth()
  const steps = PROPOSAL_STEPS_BY_ROLE[user.role] ?? ['__none__']
  const { data, loading, error, reload } = useQuery<{ salary_proposals: any[] }>(QP, { steps })
  const { hidden, approve, reject } = useDecisions(reload)
  const [notes, setNotes] = useState<Record<string, string>>({})
  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} onRetry={reload} />
  const list = data!.salary_proposals.filter((p) => !hidden.has(p.id))
  if (!list.length) return <Empty text="Không còn đề xuất tăng lương nào chờ bạn duyệt." />
  return (
    <div className="space-y-3">
      {list.map((p) => {
        const mine = p.status === `pending_${user.role}`
        const diff = Number(p.proposed_amount) - Number(p.current_amount)
        const pct = Number(p.current_amount) > 0 ? Math.round((diff / Number(p.current_amount)) * 1000) / 10 : null
        const order: string[] = p.approval_steps.map((s: any) => s.approver_role)
        const cur = p.approval_steps.findIndex((s: any) => s.status !== 'approved')
        return (
          <article key={p.id} className="po-approval">
            <div className="min-w-0 flex-1">
              <h2>{p.employee.full_name} <span>· {p.employee.job_title}</span></h2>
              <p className="po-approval-what">
                {p.proposal_type === 'raise' ? 'Tăng lương cơ bản' : 'Tăng phụ cấp'}: {vnd(p.current_amount)} → <b>{vnd(p.proposed_amount)}</b>
                <span className="text-muted-foreground"> (+{vnd(diff)}{pct != null ? `, +${String(pct).replace('.', ',')}%` : ''})</span>
              </p>
              <p className="po-approval-reason">Đề xuất bởi {p.proposer.full_name}: “{p.reason}”</p>
              <div className="mt-2">
                <Stepper label="Các cấp duyệt" steps={order.map((r) => ROLE_NAME[r] ?? r)} current={cur === -1 ? order.length : cur}
                  returned={p.approval_steps.some((s: any) => s.status === 'rejected')} />
              </div>
              {p.approval_steps.filter((s: any) => s.comment).map((s: any) => (
                <p key={s.id} className="mt-1 text-[13.5px] text-muted-foreground">{s.approver?.full_name}: {s.comment}</p>
              ))}
              {mine && <ApproveNote value={notes[p.id] ?? ''} onChange={(v) => setNotes((n) => ({ ...n, [p.id]: v }))} />}
            </div>
            {mine ? (
              <div className="po-approval-actions">
                <Button size="sm" onClick={() => approve([p.id], `Đã duyệt đề xuất của ${p.employee.full_name}`,
                  (id) => api(`/api/salary-proposals/${id}/decision`, 'POST', { decision: 'approve', comment: notes[id]?.trim() || null }))}><Check className="h-4 w-4" aria-hidden="true" /> Duyệt</Button>
                <Button size="sm" variant="outline" onClick={() => reject(p.id, `Từ chối đề xuất cho ${p.employee.full_name}?`,
                  (comment) => api(`/api/salary-proposals/${p.id}/decision`, 'POST', { decision: 'reject', comment }), 'Đã từ chối đề xuất')}>Từ chối…</Button>
              </div>
            ) : <p className="text-[13.5px] text-muted-foreground">Đang chờ cấp duyệt khác.</p>}
          </article>
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
  const tabs = [['leave', 'Đơn nghỉ phép'], ['proposal', 'Đề xuất tăng lương']] as const
  return (
    <div>
      <PageHeader title="Phê duyệt" description={user.role === 'manager' ? 'Đơn nghỉ phép của nhân viên trong nhóm bạn.' : user.role === 'accountant' ? 'Đề xuất tăng lương chờ bạn kiểm tra ngân sách.' : 'Đơn nghỉ phép và đề xuất tăng lương đang chờ bạn xử lý.'} />
      {canProposals && canLeave && (
        <div className="po-month-tabs" role="tablist" aria-label="Loại việc cần duyệt">
          {tabs.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={cn('po-chip', tab === k && 'selected')} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
      )}
      <div role={canProposals && canLeave ? 'tabpanel' : undefined}>
        {canLeave && (tab === 'leave' || !canProposals) ? <LeaveTab /> : <ProposalTab />}
      </div>
    </div>
  )
}
