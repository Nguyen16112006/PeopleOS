// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState } from 'react'
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

const CYCLE_STATUS: Record<string, string> = { open: 'Đang mở', review: 'Chờ Giám đốc duyệt', approved: 'Đã duyệt' }
const EVAL_STATUS: Record<string, string> = { submitted: 'Đã đánh giá', consolidated: 'HR đã tổng hợp', approved: 'Đã duyệt' }
const RATING: Record<string, string> = { excellent: 'Xuất sắc', good: 'Tốt', meets: 'Đạt', needs_improvement: 'Cần cải thiện' }
const ratingVariant = (r: string) => (r === 'excellent' || r === 'good' ? 'success' : r === 'meets' ? 'secondary' : 'destructive')

const QC = `query KpiCycles { kpi_cycles(order_by: [{year: desc}, {quarter: desc}]) { id name year quarter status } }`
const QMine = `query KpiMine($cid: uuid!, $uid: uuid!) {
  goals: kpi_goals(where: {cycle_id: {_eq: $cid}, employee: {user_id: {_eq: $uid}}}, order_by: {created_at: asc}) { id title description target weight }
  evals: kpi_evaluations(where: {cycle_id: {_eq: $cid}, employee: {user_id: {_eq: $uid}}}) { id score rating comment status employee_feedback goal_scores }
}`
const QTeam = `query KpiTeam($cid: uuid!, $uid: uuid!) {
  members: employees(where: {manager: {user_id: {_eq: $uid}}, status: {_neq: "terminated"}}, order_by: {full_name: asc}) { id full_name job_title }
  goals: kpi_goals(where: {cycle_id: {_eq: $cid}, employee: {manager: {user_id: {_eq: $uid}}}}, order_by: {created_at: asc}) { id employee_id title target weight }
  evals: kpi_evaluations(where: {cycle_id: {_eq: $cid}, employee: {manager: {user_id: {_eq: $uid}}}}) { id employee_id score rating comment status goal_scores }
}`
const QAll = `query KpiAll($cid: uuid!) {
  kpi_evaluations(where: {cycle_id: {_eq: $cid}}, order_by: {score: desc}) {
    id score rating status employee { full_name department } evaluator { full_name }
  }
}`

const now = new Date()

export default function Kpi() {
  const { user } = useAuth()
  const { push } = useToast()
  const cycles = useQuery<any>(QC, {})
  const [cycleId, setCycleId] = useState('')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState({ year: String(now.getFullYear()), quarter: String(Math.floor(now.getMonth() / 3) + 1) })
  const [showOpen, setShowOpen] = useState(false)

  useEffect(() => {
    const list = cycles.data?.kpi_cycles ?? []
    if (!cycleId && list.length > 0) setCycleId(list[0].id)
  }, [cycles.data, cycleId])

  const cid = cycleId || '00000000-0000-0000-0000-000000000000'
  const mine = useQuery<any>(QMine, { cid, uid: user.sub })
  const team = useQuery<any>(QTeam, { cid, uid: user.sub })
  const overview = useQuery<any>(QAll, { cid })

  const cycle = (cycles.data?.kpi_cycles ?? []).find((c: any) => c.id === cycleId)
  const isHr = user.role === 'hr'
  const isDirector = user.role === 'director'

  const reloadAll = () => { cycles.reload(); mine.reload(); team.reload(); overview.reload() }
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try { await fn(); push({ title: ok, kind: 'success' }); reloadAll(); return true }
    catch (x) { push({ title: 'Không thực hiện được', message: errMsg(x), kind: 'error' }); return false }
    finally { setBusy(false) }
  }

  if (cycles.loading) return <Loading />
  if (cycles.error) return <ErrorBox message={cycles.error} />

  const openCycle = async (e: React.FormEvent) => {
    e.preventDefault()
    if (await run(() => api('/api/kpi/cycles', 'POST', { year: Number(open.year), quarter: Number(open.quarter) }), 'Đã mở chu kỳ đánh giá')) setShowOpen(false)
  }

  return (
    <div>
      <PageHeader title="Đánh giá KPI theo quý" description="HR mở chu kỳ → quản lý trực tiếp giao mục tiêu và chấm điểm → HR tổng hợp → Giám đốc duyệt → nhân viên xem kết quả và phản hồi." />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-3 pt-4">
          <Field label="Chu kỳ">
            <Select value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
              {(cycles.data?.kpi_cycles ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          {cycle && <Badge variant={cycle.status === 'approved' ? 'success' : cycle.status === 'review' ? 'warning' : 'secondary'}>{CYCLE_STATUS[cycle.status]}</Badge>}
          {isHr && cycle?.status === 'open' && (
            <Button disabled={busy} onClick={() => run(() => api(`/api/kpi/cycles/${cycle.id}/consolidate`, 'POST'), 'Đã tổng hợp, chuyển Giám đốc duyệt')}>Tổng hợp và gửi duyệt</Button>
          )}
          {isDirector && cycle?.status === 'review' && (
            <>
              <Button disabled={busy} onClick={() => run(() => api(`/api/kpi/cycles/${cycle.id}/approve`, 'POST'), 'Đã duyệt kết quả')}>Duyệt kết quả</Button>
              <Button variant="ghost" disabled={busy} onClick={() => { const comment = window.prompt('Lý do trả lại (không bắt buộc)') ?? undefined; run(() => api(`/api/kpi/cycles/${cycle.id}/return`, 'POST', { comment }), 'Đã trả lại HR') }}>Trả lại</Button>
            </>
          )}
          {isHr && <Button variant="ghost" onClick={() => setShowOpen((v) => !v)}>{showOpen ? 'Đóng' : 'Mở chu kỳ mới'}</Button>}
        </CardContent>
        {isHr && showOpen && (
          <CardContent>
            <form onSubmit={openCycle} className="flex flex-wrap items-end gap-3">
              <Field label="Năm"><Input type="number" className="w-28" min={2020} max={2100} value={open.year} onChange={(e) => setOpen((o) => ({ ...o, year: e.target.value }))} required /></Field>
              <Field label="Quý">
                <Select value={open.quarter} onChange={(e) => setOpen((o) => ({ ...o, quarter: e.target.value }))}>
                  {[1, 2, 3, 4].map((q) => <option key={q} value={q}>Quý {q}</option>)}
                </Select>
              </Field>
              <Button type="submit" disabled={busy}>Mở chu kỳ</Button>
            </form>
          </CardContent>
        )}
      </Card>

      {!cycle ? <Empty text={isHr ? 'Chưa có chu kỳ nào. Hãy mở chu kỳ đầu tiên.' : 'Chưa có chu kỳ đánh giá nào.'} /> : (
        <div className="space-y-4">
          <MyKpi q={mine} cycle={cycle} busy={busy} run={run} />
          <TeamKpi q={team} cycle={cycle} busy={busy} run={run} />
          {(isHr || isDirector) && <Overview q={overview} />}
        </div>
      )}
    </div>
  )
}

function MyKpi({ q, cycle, busy, run }: { q: any; cycle: any; busy: boolean; run: (fn: () => Promise<unknown>, ok: string) => Promise<boolean> }) {
  const [text, setText] = useState('')
  if (q.loading) return <Loading />
  if (q.error) return <ErrorBox message={q.error} />
  const goals: any[] = q.data.goals
  const ev = q.data.evals[0]
  const scoreOf = (gid: string) => (ev?.goal_scores ?? []).find((s: any) => s.goalId === gid)?.achievement
  return (
    <Card>
      <CardHeader><CardTitle>KPI của tôi · {cycle.name}</CardTitle></CardHeader>
      <CardContent>
        {goals.length === 0 ? <Empty text="Quản lý trực tiếp chưa giao mục tiêu cho bạn trong chu kỳ này" /> : (
          <Table>
            <THead><TR><TH>Mục tiêu</TH><TH>Chỉ tiêu</TH><TH>Trọng số</TH>{ev && <TH>Mức hoàn thành</TH>}</TR></THead>
            <TBody>
              {goals.map((g) => (
                <TR key={g.id}>
                  <TD>{g.title}{g.description && <div className="text-xs text-muted-foreground">{g.description}</div>}</TD>
                  <TD>{g.target ?? '—'}</TD><TD>{g.weight}%</TD>
                  {ev && <TD>{scoreOf(g.id) ?? '—'}%</TD>}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        {ev ? (
          <div className="mt-4 space-y-2 rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold">{Number(ev.score).toFixed(1)} điểm</span>
              <Badge variant={ratingVariant(ev.rating)}>{RATING[ev.rating]}</Badge>
            </div>
            {ev.comment && <p className="text-sm text-muted-foreground">Nhận xét của quản lý: {ev.comment}</p>}
            {ev.employee_feedback ? <p className="text-sm">Phản hồi của bạn: {ev.employee_feedback}</p> : (
              <div className="space-y-2">
                <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Ý kiến của bạn về kết quả (không bắt buộc đồng ý)" />
                <Button size="sm" disabled={busy || !text.trim()} onClick={() => run(() => api(`/api/kpi/evaluations/${ev.id}/feedback`, 'POST', { feedback: text }), 'Đã gửi phản hồi')}>Gửi phản hồi</Button>
              </div>
            )}
          </div>
        ) : goals.length > 0 && <p className="mt-3 text-sm text-muted-foreground">Kết quả sẽ hiển thị sau khi Giám đốc duyệt.</p>}
      </CardContent>
    </Card>
  )
}

function TeamKpi({ q, cycle, busy, run }: { q: any; cycle: any; busy: boolean; run: (fn: () => Promise<unknown>, ok: string) => Promise<boolean> }) {
  const [empId, setEmpId] = useState('')
  const [goal, setGoal] = useState({ title: '', target: '', weight: '' })
  const [scores, setScores] = useState<Record<string, string>>({})
  const [comment, setComment] = useState('')
  const members: any[] = q.data?.members ?? []
  const goals = (q.data?.goals ?? []).filter((g: any) => g.employee_id === empId)
  const ev = (q.data?.evals ?? []).find((e: any) => e.employee_id === empId)
  const total = goals.reduce((s: number, g: any) => s + g.weight, 0)
  const isOpen = cycle.status === 'open'

  useEffect(() => {
    const init: Record<string, string> = {}
    for (const s of ev?.goal_scores ?? []) init[s.goalId] = String(s.achievement)
    setScores(init); setComment(ev?.comment ?? '')
  }, [empId, ev?.id])

  if (q.loading) return <Loading />
  if (q.error) return <ErrorBox message={q.error} />
  if (members.length === 0) return null

  const addGoal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (await run(() => api('/api/kpi/goals', 'POST', { cycleId: cycle.id, employeeId: empId, title: goal.title, target: goal.target || undefined, weight: Number(goal.weight) }), 'Đã giao mục tiêu')) setGoal({ title: '', target: '', weight: '' })
  }
  const submitEval = () => run(() => api('/api/kpi/evaluations', 'POST', {
    cycleId: cycle.id, employeeId: empId, comment: comment || undefined,
    scores: goals.map((g: any) => ({ goalId: g.id, achievement: Number(scores[g.id] ?? 0) })),
  }), 'Đã lưu đánh giá')

  return (
    <Card>
      <CardHeader><CardTitle>Nhóm của tôi · giao mục tiêu và đánh giá</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <Field label="Chọn nhân viên">
          <Select value={empId} onChange={(e) => setEmpId(e.target.value)}>
            <option value="">— Chọn —</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.full_name} · {m.job_title}</option>)}
          </Select>
        </Field>

        {empId && (
          <>
            <Table>
              <THead><TR><TH>Mục tiêu</TH><TH>Chỉ tiêu</TH><TH>Trọng số</TH><TH>{isOpen ? 'Mức hoàn thành (0-100)' : 'Mức hoàn thành'}</TH><TH /></TR></THead>
              <TBody>
                {goals.map((g: any) => (
                  <TR key={g.id}>
                    <TD>{g.title}</TD><TD>{g.target ?? '—'}</TD><TD>{g.weight}%</TD>
                    <TD>
                      {isOpen ? <Input type="number" min={0} max={100} className="h-8 w-24" value={scores[g.id] ?? ''} onChange={(e) => setScores((s) => ({ ...s, [g.id]: e.target.value }))} />
                        : (ev?.goal_scores ?? []).find((s: any) => s.goalId === g.id)?.achievement ?? '—'}
                    </TD>
                    <TD>{isOpen && <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => api(`/api/kpi/goals/${g.id}`, 'DELETE'), 'Đã xóa mục tiêu')}>Xóa</Button>}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <p className="text-sm text-muted-foreground">Tổng trọng số: <b>{total}%</b>{total !== 100 && isOpen && ' (cần đúng 100% mới đánh giá được)'}</p>

            {isOpen && total < 100 && (
              <form onSubmit={addGoal} className="grid gap-3 md:grid-cols-4">
                <Field label="Mục tiêu"><Input value={goal.title} onChange={(e) => setGoal((g) => ({ ...g, title: e.target.value }))} required /></Field>
                <Field label="Chỉ tiêu"><Input value={goal.target} onChange={(e) => setGoal((g) => ({ ...g, target: e.target.value }))} placeholder="Ví dụ: ≥ 95% đúng hạn" /></Field>
                <Field label={`Trọng số (còn ${100 - total}%)`}><Input type="number" min={1} max={100 - total} value={goal.weight} onChange={(e) => setGoal((g) => ({ ...g, weight: e.target.value }))} required /></Field>
                <div className="flex items-end"><Button type="submit" disabled={busy}>Giao mục tiêu</Button></div>
              </form>
            )}

            {isOpen && goals.length > 0 && total === 100 && (
              <div className="space-y-2">
                <Field label="Nhận xét"><Textarea value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
                <Button disabled={busy || goals.some((g: any) => scores[g.id] === undefined || scores[g.id] === '')} onClick={submitEval}>{ev ? 'Cập nhật đánh giá' : 'Lưu đánh giá'}</Button>
              </div>
            )}
            {ev && <p className="text-sm">Kết quả hiện tại: <b>{Number(ev.score).toFixed(1)}</b> điểm · <Badge variant={ratingVariant(ev.rating)}>{RATING[ev.rating]}</Badge> · {EVAL_STATUS[ev.status]}</p>}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function Overview({ q }: { q: any }) {
  if (q.loading) return <Loading />
  if (q.error) return <ErrorBox message={q.error} />
  const rows: any[] = q.data.kpi_evaluations
  return (
    <Card>
      <CardHeader><CardTitle>Tổng hợp chu kỳ ({rows.length} đánh giá)</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? <Empty text="Chưa có đánh giá nào" /> : (
          <Table>
            <THead><TR><TH>Nhân viên</TH><TH>Người đánh giá</TH><TH>Điểm</TH><TH>Xếp loại</TH><TH>Trạng thái</TH></TR></THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD>{r.employee?.full_name}<div className="text-xs text-muted-foreground">{r.employee?.department}</div></TD>
                  <TD>{r.evaluator?.full_name ?? '—'}</TD><TD>{Number(r.score).toFixed(1)}</TD>
                  <TD><Badge variant={ratingVariant(r.rating)}>{RATING[r.rating]}</Badge></TD><TD>{EVAL_STATUS[r.status]}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
