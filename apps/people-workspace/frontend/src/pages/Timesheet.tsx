// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

import { LogIn, LogOut, Send } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { Empty, ErrorBox, errMsg, Loading, PageHeader } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/form'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { useRealtime } from '@/hooks/realtime'
import { useConfirm } from '@/hooks/confirm'
import { useToast } from '@/hooks/toast'
import { useMe } from '@/hooks/useMe'
import { useQuery } from '@/hooks/useQuery'
import { api } from '@/lib/api'
import { LEAVE_TYPES, monthLabel } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Bảng công tháng do BFF tính trực tiếp từ chấm công và đơn nghỉ đã duyệt (GET /api/timesheets). */
interface TimesheetView {
  id: string | null; employee_id: string; year: number; month: number; status: string; review_note: string | null; editable: boolean
  standard_days: number; work_days: number; paid_leave_days: number; holiday_days: number; unpaid_leave_days: number
  absent_days: number; paid_days: number; ot_weekday_hours: number; ot_weekend_hours: number; ot_holiday_hours: number
  missing_dates: string[]
}

const DAY_STATUS: Record<string, string> = {
  present: 'Làm tại văn phòng', remote: 'Làm từ xa', business_trip: 'Công tác', holiday: 'Nghỉ lễ (hưởng lương)',
  paid_leave: 'Nghỉ hưởng lương', unpaid_leave: 'Nghỉ không lương', absent: 'Vắng không phép',
}
const SELF_STATUSES = ['present', 'remote', 'business_trip']
const OT_TYPE: Record<string, string> = { weekday: 'Ngày thường (150%)', weekend: 'Ngày nghỉ tuần (200%)', holiday: 'Ngày lễ (300%)' }
const TS_STATUS: Record<string, string> = { open: 'Đang chấm công', submitted: 'Chờ xác nhận', confirmed: 'Đã xác nhận', closed: 'Đã chốt công' }
const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

const QDays = `query TimesheetDays($eid: uuid!, $from: date!, $to: date!) {
  attendance_records(where: {employee_id: {_eq: $eid}, work_date: {_gte: $from, _lte: $to}}, order_by: {work_date: asc}) {
    id work_date check_in check_out status work_days overtime_hours overtime_type note source
  }
  leave_requests(where: {employee_id: {_eq: $eid}, status: {_in: ["approved", "pending"]}, start_date: {_lte: $to}, end_date: {_gte: $from}}) {
    leave_type status start_date end_date
  }
}`
const QQueue = `query TimesheetQueue {
  timesheets(where: {status: {_eq: "submitted"}}, order_by: {submitted_at: asc}) {
    id period_year period_month standard_days work_days paid_leave_days holiday_days unpaid_leave_days absent_days
    ot_weekday_hours ot_weekend_hours ot_holiday_hours submitted_at
    employee { id user_id full_name department manager_id }
  }
}`
const QCompany = `query TimesheetCompany($y: smallint!, $m: smallint!) {
  employees(where: {status: {_eq: "active"}}, order_by: {full_name: asc}) { id user_id full_name department }
  timesheets(where: {period_year: {_eq: $y}, period_month: {_eq: $m}}) {
    id employee_id status standard_days work_days paid_leave_days holiday_days unpaid_leave_days absent_days
    ot_weekday_hours ot_weekend_hours ot_holiday_hours
  }
}`

/** Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD (khớp cách BFF xác định ngày công). */
const todayVN = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())
const pad = (n: number) => String(n).padStart(2, '0')
const num = (n: number | string | null | undefined) => (n == null ? '—' : String(Number(n)).replace('.', ','))
const time = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }) : '—'
const otHours = (t: { ot_weekday_hours: number; ot_weekend_hours: number; ot_holiday_hours: number }) =>
  Number(t.ot_weekday_hours) + Number(t.ot_weekend_hours) + Number(t.ot_holiday_hours)
const paidDays = (t: { work_days: number; paid_leave_days: number; holiday_days: number }) =>
  Number(t.work_days) + Number(t.paid_leave_days) + Number(t.holiday_days)

function StatusBadge({ status }: { status: string }) {
  return <Badge variant={status === 'closed' || status === 'confirmed' ? 'success' : status === 'submitted' ? 'warning' : 'secondary'}>{TS_STATUS[status] ?? status}</Badge>
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-lg border bg-white px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-xl font-semibold', tone === 'good' && 'text-emerald-700', tone === 'bad' && 'text-red-600')}>{value}</p>
    </div>
  )
}

export default function Timesheet() {
  const { user } = useAuth()
  const { push } = useToast()
  const confirm = useConfirm()
  const { tick } = useRealtime()
  const me = useMe()
  const myId = me?.employee?.id ?? ''
  const isHr = user.role === 'hr'
  const canConfirm = ['manager', 'hr', 'director'].includes(user.role)
  const seesOthers = ['manager', 'hr', 'accountant', 'director'].includes(user.role)

  const today = todayVN()
  const [period, setPeriod] = useState({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) })
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null)   // đang xem bảng công của người khác
  const employeeId = target?.id ?? myId
  const own = !target
  const lastDay = new Date(period.year, period.month, 0).getDate()
  const from = `${period.year}-${pad(period.month)}-01`
  const to = `${period.year}-${pad(period.month)}-${pad(lastDay)}`
  const isFuture = from > today

  const days = useQuery<any>(QDays, { eid: employeeId, from, to }, !!employeeId && !isFuture)
  const queue = useQuery<any>(QQueue, {}, canConfirm)
  const company = useQuery<any>(QCompany, { y: period.year, m: period.month }, seesOthers)

  const [view, setView] = useState<TimesheetView | null>(null)
  const [viewError, setViewError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  useEffect(() => {
    if (!employeeId || isFuture) { setView(null); return }
    let cancelled = false
    api<TimesheetView>(`/api/timesheets?year=${period.year}&month=${period.month}${own ? '' : `&employee_id=${employeeId}`}`)
      .then((v) => { if (!cancelled) { setView(v); setViewError(null) } })
      .catch((e) => { if (!cancelled) { setView(null); setViewError(errMsg(e)) } })
    return () => { cancelled = true }
  }, [employeeId, own, period.year, period.month, isFuture, version, tick])

  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState<{ date: string; status: string; workDays: string; overtimeHours: string; overtimeType: string; note: string } | null>(null)
  const reloadAll = useCallback(() => { days.reload(); queue.reload(); company.reload(); setVersion((v) => v + 1) }, [days, queue, company])
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try { await fn(); push({ title: ok, kind: 'success' }); reloadAll(); return true }
    catch (x) { push({ title: 'Không thực hiện được', message: errMsg(x), kind: 'error' }); return false }
    finally { setBusy(false) }
  }

  if (me === null) return <Loading />
  if (!myId) return <div><PageHeader title="Bảng công" /><Empty text={user.role === 'hr' ? 'Tài khoản này chưa được liên kết với hồ sơ nhân sự nên chưa chấm công được. Liên kết tài khoản ở trang hồ sơ nhân viên.' : 'Tài khoản của bạn chưa được liên kết với hồ sơ nhân sự nên chưa chấm công được. Hãy nhắn HR để được liên kết.'} /></div>

  const records: any[] = days.data?.attendance_records ?? []
  const leaves: any[] = days.data?.leave_requests ?? []
  const byDate = new Map(records.map((r) => [r.work_date as string, r]))
  const todayRec = own && today >= from && today <= to ? byDate.get(today) : undefined
  const showToday = own && today >= from && today <= to
  const editable = !!view?.editable
  const missing = new Set(view?.missing_dates ?? [])

  const openEdit = (date: string, weekend: boolean) => {
    const r = byDate.get(date)
    setEdit({
      date, status: r?.status ?? 'present', workDays: String(r ? Number(r.work_days) : 1),
      overtimeHours: r && Number(r.overtime_hours) > 0 ? String(Number(r.overtime_hours)) : '',
      overtimeType: r?.overtime_type ?? (weekend ? 'weekend' : 'weekday'), note: r?.note ?? '',
    })
  }
  const saveEdit = async () => {
    if (!edit) return
    const working = SELF_STATUSES.includes(edit.status)
    const done = await act(() => api('/api/attendance/days', 'PUT', {
      employeeId: own ? undefined : employeeId, workDate: edit.date, status: edit.status,
      workDays: working ? Number(edit.workDays) : undefined,
      overtimeHours: edit.overtimeHours ? Number(edit.overtimeHours) : 0,
      overtimeType: edit.overtimeType, note: edit.note || undefined,
    }), 'Đã lưu công ngày ' + edit.date.slice(8) + '/' + edit.date.slice(5, 7))
    if (done) setEdit(null)
  }
  const decide = async (id: string, decision: 'approve' | 'reject') => {
    let note: string | undefined
    if (decision === 'reject') {
      const r = await confirm({ title: 'Trả lại bảng công?', confirmLabel: 'Trả lại', tone: 'danger', note: { label: 'Lý do trả lại', required: true, placeholder: 'Ví dụ: ngày 12 thiếu giờ làm thêm.' } })
      if (!r) return
      note = r.note
    }
    return act(() => api(`/api/timesheets/${id}/decision`, 'POST', { decision, note: note ?? undefined }), decision === 'approve' ? 'Đã xác nhận bảng công' : 'Đã trả lại bảng công')
  }

  // Hàng chờ xác nhận: bỏ bảng công của chính mình; Giám đốc chỉ xác nhận cho người không có quản lý trực tiếp
  const pending: any[] = (queue.data?.timesheets ?? []).filter((t: any) =>
    t.employee?.user_id !== user.sub && (user.role !== 'director' || !t.employee?.manager_id))
  const sheetByEmp = new Map<string, any>((company.data?.timesheets ?? []).map((t: any) => [t.employee_id, t]))
  const colleagues: any[] = (company.data?.employees ?? []).filter((e: any) => e.user_id !== user.sub)

  return (
    <div>
      <PageHeader title="Bảng công"
        description="Chấm công hằng ngày, khai làm thêm giờ và gửi bảng công tháng." howto={{ q: 'Bảng công được dùng thế nào?', a: 'Cuối tháng bạn gửi bảng công. Quản lý trực tiếp (hoặc HR) xác nhận, HR chốt công, rồi Kế toán tính lương theo số ngày công đã chốt.' }}
        actions={
          <div className="flex items-end gap-2">
            <Field label="Năm"><Input type="number" className="h-9 w-24" min={2020} max={2100} value={period.year}
              onChange={(e) => { setEdit(null); setPeriod((p) => ({ ...p, year: Number(e.target.value) || p.year })) }} /></Field>
            <Field label="Tháng">
              <Select value={period.month} onChange={(e) => { setEdit(null); setPeriod((p) => ({ ...p, month: Number(e.target.value) })) }}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>Tháng {m}</option>)}
              </Select>
            </Field>
          </div>
        } />

      {showToday && (
        <Card className="mb-4">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <p className="text-sm font-medium">Hôm nay, {today.slice(8)}/{today.slice(5, 7)}/{today.slice(0, 4)}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Giờ vào: <span className="font-medium text-foreground">{time(todayRec?.check_in)}</span> · Giờ ra: <span className="font-medium text-foreground">{time(todayRec?.check_out)}</span>
              </p>
            </div>
            <div className="flex gap-2">
              <Button disabled={busy || !editable || !!todayRec?.check_in} onClick={() => act(() => api('/api/attendance/check-in', 'POST'), 'Đã chấm công vào')}>
                <LogIn className="h-4 w-4" /> Chấm công vào
              </Button>
              <Button variant="outline" disabled={busy || !editable || !todayRec?.check_in || !!todayRec?.check_out} onClick={() => act(() => api('/api/attendance/check-out', 'POST'), 'Đã chấm công ra')}>
                <LogOut className="h-4 w-4" /> Chấm công ra
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mb-4">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>
            {own ? 'Bảng công của tôi' : `Bảng công của ${target.name}`} · {monthLabel(period.year, period.month)}
            {view && <span className="ml-2 align-middle"><StatusBadge status={view.status} /></span>}
          </CardTitle>
          <div className="flex gap-2">
            {!own && <Button size="sm" variant="ghost" onClick={() => { setEdit(null); setTarget(null) }}>Về bảng công của tôi</Button>}
            {own && view?.status === 'open' && (
              <Button size="sm" disabled={busy} onClick={async () => {
                if (missing.size > 0 && !await confirm({ title: 'Gửi bảng công còn thiếu ngày?', confirmLabel: `Vẫn gửi (${missing.size} ngày trống)`,
                  caution: `Còn ${missing.size} ngày chưa chấm công. Các ngày này sẽ bị tính là vắng không lương.`,
                  body: 'Bạn có thể quay lại khai bù những ngày còn trống trước khi gửi.' })) return
                act(() => api('/api/timesheets/submit', 'POST', period), 'Đã gửi bảng công để xác nhận')
              }}><Send className="h-4 w-4" /> Gửi bảng công</Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isFuture ? <Empty text="Chưa đến kỳ công này" /> : viewError ? <ErrorBox message={viewError} /> : !view || days.loading ? <Loading /> : days.error ? <ErrorBox message={days.error} /> : (
            <>
              {view.review_note && view.status === 'open' && <ErrorBox message={`Bảng công bị trả lại: ${view.review_note}`} />}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
                <Stat label="Công chuẩn" value={num(view.standard_days)} />
                <Stat label="Công hưởng lương" value={num(view.paid_days)} tone="good" />
                <Stat label="Nghỉ hưởng lương, lễ" value={num(view.paid_leave_days + view.holiday_days)} />
                <Stat label="Nghỉ không lương" value={num(view.unpaid_leave_days)} />
                <Stat label="Vắng, chưa chấm" value={num(view.absent_days)} tone={view.absent_days > 0 ? 'bad' : undefined} />
                <Stat label="Giờ làm thêm" value={num(otHours(view))} />
              </div>

              {edit && (
                <form className="flex flex-wrap items-end gap-3 rounded-lg border bg-slate-50 p-4" onSubmit={(e) => { e.preventDefault(); saveEdit() }}>
                  <p className="w-full text-sm font-medium">Khai công ngày {edit.date.slice(8)}/{edit.date.slice(5, 7)}</p>
                  <Field label="Loại ngày">
                    <Select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                      {Object.entries(DAY_STATUS).filter(([k]) => !own || SELF_STATUSES.includes(k)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </Select>
                  </Field>
                  {SELF_STATUSES.includes(edit.status) && (
                    <Field label="Số công">
                      <Select value={edit.workDays} onChange={(e) => setEdit({ ...edit, workDays: e.target.value })}>
                        <option value="1">Cả ngày (1)</option><option value="0.5">Nửa ngày (0,5)</option><option value="0">Chỉ làm thêm (0)</option>
                      </Select>
                    </Field>
                  )}
                  <Field label="Giờ làm thêm"><Input type="number" className="w-28" min={0} max={12} step={0.5} value={edit.overtimeHours} onChange={(e) => setEdit({ ...edit, overtimeHours: e.target.value })} /></Field>
                  <Field label="Hệ số làm thêm">
                    <Select value={edit.overtimeType} onChange={(e) => setEdit({ ...edit, overtimeType: e.target.value })}>
                      {Object.entries(OT_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </Select>
                  </Field>
                  <Field label="Ghi chú"><Input className="w-64" maxLength={500} value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></Field>
                  <Button type="submit" disabled={busy}>Lưu</Button>
                  <Button type="button" variant="ghost" onClick={() => setEdit(null)}>Hủy</Button>
                </form>
              )}

              <Table>
                <THead><TR><TH>Ngày</TH><TH>Giờ vào</TH><TH>Giờ ra</TH><TH>Loại ngày</TH><TH>Công</TH><TH>Làm thêm</TH><TH>Ghi chú</TH><TH /></TR></THead>
                <TBody>
                  {Array.from({ length: lastDay }, (_, i) => i + 1).map((d) => {
                    const date = `${period.year}-${pad(period.month)}-${pad(d)}`
                    const dow = new Date(period.year, period.month - 1, d).getDay()
                    const weekend = dow === 0 || dow === 6
                    const r = byDate.get(date)
                    const leave = leaves.find((l) => l.start_date <= date && l.end_date >= date)
                    const future = date > today
                    if (weekend && !r) return null   // cuối tuần chỉ hiện khi có làm thêm
                    return (
                      <TR key={date} className={cn(weekend && 'bg-slate-50', date === today && 'bg-blue-50/60')}>
                        <TD className="whitespace-nowrap font-medium">{WEEKDAYS[dow]} {pad(d)}/{pad(period.month)}</TD>
                        <TD>{time(r?.check_in)}</TD><TD>{time(r?.check_out)}</TD>
                        <TD>
                          {r ? DAY_STATUS[r.status] ?? r.status
                            : leave ? <span className={leave.status === 'pending' ? 'text-amber-700' : undefined}>{LEAVE_TYPES[leave.leave_type]} ({leave.status === 'pending' ? 'đơn chờ duyệt' : 'đơn đã duyệt'})</span>
                            : future ? <span className="text-muted-foreground">—</span>
                            : <span className="text-red-600">{missing.has(date) ? 'Chưa chấm công' : '—'}</span>}
                          {r?.source === 'hr' && <span className="ml-1 text-xs text-muted-foreground">(HR ghi nhận)</span>}
                        </TD>
                        <TD>{r && !weekend ? num(r.work_days) : '—'}</TD>
                        <TD>{r && Number(r.overtime_hours) > 0 ? `${num(r.overtime_hours)} giờ · ${r.overtime_type === 'weekday' ? '150%' : r.overtime_type === 'weekend' ? '200%' : '300%'}` : '—'}</TD>
                        <TD className="max-w-[14rem] truncate text-muted-foreground">{r?.note ?? ''}</TD>
                        <TD>{editable && (isHr && !own ? true : !future) && <Button size="sm" variant="ghost" onClick={() => openEdit(date, weekend)}>{r ? 'Sửa' : 'Khai công'}</Button>}</TD>
                      </TR>
                    )
                  })}
                </TBody>
              </Table>
              {editable && (
                <p className="text-xs text-muted-foreground">
                  Làm thêm vào thứ 7, chủ nhật: khai ngày{' '}
                  <input type="date" aria-label="Chọn ngày cuối tuần để khai công" className="h-8 rounded-[7px] border border-input bg-card px-2"
                    min={`${period.year}-${pad(period.month)}-01`} max={`${period.year}-${pad(period.month)}-${pad(lastDay)}`}
                    onChange={(ev) => {
                      if (!ev.target.value) return
                      const dow = new Date(ev.target.value + 'T00:00:00').getDay()
                      openEdit(ev.target.value, dow === 0 || dow === 6)
                      ev.target.value = ''
                    }} />. Nghỉ phép, nghỉ ốm: tạo đơn ở mục Nghỉ phép, đơn được duyệt sẽ tự tính vào bảng công.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {canConfirm && (
        <Card className="mb-4">
          <CardHeader><CardTitle>Bảng công chờ tôi xác nhận</CardTitle></CardHeader>
          <CardContent>
            {queue.loading ? <Loading /> : queue.error ? <ErrorBox message={queue.error} /> : pending.length === 0 ? <Empty text="Không có bảng công nào đang chờ" /> : (
              <Table>
                <THead><TR><TH>Nhân viên</TH><TH>Kỳ</TH><TH>Công hưởng lương</TH><TH>Không lương, vắng</TH><TH>Giờ làm thêm</TH><TH /></TR></THead>
                <TBody>
                  {pending.map((t) => (
                    <TR key={t.id}>
                      <TD>{t.employee?.full_name}<div className="text-xs text-muted-foreground">{t.employee?.department}</div></TD>
                      <TD>{monthLabel(t.period_year, t.period_month)}</TD>
                      <TD>{num(paidDays(t))} / {num(t.standard_days)}</TD>
                      <TD className={Number(t.absent_days) > 0 ? 'text-red-600' : undefined}>{num(Number(t.unpaid_leave_days) + Number(t.absent_days))}</TD>
                      <TD>{num(otHours(t))}</TD>
                      <TD className="whitespace-nowrap">
                        <Button size="sm" variant="ghost" onClick={() => { setEdit(null); setPeriod({ year: t.period_year, month: t.period_month }); setTarget({ id: t.employee.id, name: t.employee.full_name }) }}>Xem chi tiết</Button>{' '}
                        <Button size="sm" disabled={busy} onClick={() => decide(t.id, 'approve')}>Xác nhận</Button>{' '}
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => decide(t.id, 'reject')}>Trả lại</Button>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {seesOthers && (
        <Card>
          <CardHeader><CardTitle>{user.role === 'manager' ? 'Bảng công của nhóm' : 'Bảng công toàn công ty'} · {monthLabel(period.year, period.month)}</CardTitle></CardHeader>
          <CardContent>
            {company.loading ? <Loading /> : company.error ? <ErrorBox message={company.error} /> : colleagues.length === 0 ? <Empty text="Không có nhân viên nào" /> : (
              <Table>
                <THead><TR><TH>Nhân viên</TH><TH>Trạng thái</TH><TH>Công hưởng lương</TH><TH>Không lương, vắng</TH><TH>Giờ làm thêm</TH><TH /></TR></THead>
                <TBody>
                  {colleagues.map((e) => {
                    const t = sheetByEmp.get(e.id)
                    return (
                      <TR key={e.id} className={e.id === target?.id ? 'bg-muted/40' : undefined}>
                        <TD>{e.full_name}<div className="text-xs text-muted-foreground">{e.department}</div></TD>
                        <TD>{t ? <StatusBadge status={t.status} /> : <Badge variant="secondary">Chưa gửi</Badge>}</TD>
                        <TD>{t ? `${num(paidDays(t))} / ${num(t.standard_days)}` : '—'}</TD>
                        <TD className={t && Number(t.absent_days) > 0 ? 'text-red-600' : undefined}>{t ? num(Number(t.unpaid_leave_days) + Number(t.absent_days)) : '—'}</TD>
                        <TD>{t ? num(otHours(t)) : '—'}</TD>
                        <TD><Button size="sm" variant="ghost" onClick={() => { setEdit(null); setTarget({ id: e.id, name: e.full_name }); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>{isHr ? 'Xem và sửa công' : 'Xem'}</Button></TD>
                      </TR>
                    )
                  })}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
