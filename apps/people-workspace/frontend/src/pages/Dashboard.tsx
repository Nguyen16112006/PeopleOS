// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

import { CalendarCheck, CalendarDays, ChevronRight, CheckSquare, Plus, TrendingUp, Wallet, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { ErrorBox, Loading } from '@/components/common'
import { useMe } from '@/hooks/useMe'
import { useQuery } from '@/hooks/useQuery'
import { fmtDate, fmtDays, monthLabel, ROLE_LABEL, vnd } from '@/lib/format'
import { navLabel } from '@/lib/nav'
import { callName, usePrefs } from '@/lib/prefs'
import { cn } from '@/lib/utils'

const Q = `query Dash($uid: uuid!, $year: smallint!) {
  employees(where: {user_id: {_eq: $uid}}, limit: 1) { full_name job_title department hire_date }
  leave_balances(where: {employee: {user_id: {_eq: $uid}}, year: {_eq: $year}}) { entitled_days used_days }
  payrolls(where: {employee: {user_id: {_eq: $uid}}}, order_by: [{period_year: desc}, {period_month: desc}], limit: 1) { period_month period_year gross net_salary }
  leave_requests(where: {employee: {user_id: {_eq: $uid}}, status: {_eq: "pending"}}) { id }
}`
const QA = `query Approver($uid: uuid!, $steps: [String!]!, $stage: String!) {
  leave: leave_requests_aggregate(where: {status: {_eq: "pending"}, stage: {_eq: $stage}, employee: {user_id: {_neq: $uid}}}) { aggregate { count } }
  proposals: salary_proposals_aggregate(where: {status: {_in: $steps}}) { aggregate { count } }
}`

const APPROVERS = ['manager', 'hr', 'accountant', 'director']
const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
const DAY_NAMES = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy']

type Counts = { leave: { aggregate: { count: number } }; proposals: { aggregate: { count: number } } }
type Todo = { to: string; icon: LucideIcon; title: string; detail: string; attention?: boolean }

function useApproverCounts() {
  const { user } = useAuth()
  // Mỗi vai trò chỉ thấy việc đang chờ đúng bước của mình
  const steps = ({ hr: ['pending_hr'], accountant: ['pending_accountant'], director: ['pending_director'] } as Record<string, string[]>)[user.role] ?? ['__none__']
  const stage = ({ manager: 'manager', hr: 'hr', director: 'director' } as Record<string, string>)[user.role] ?? '__none__'
  const { data } = useQuery<Counts>(QA, { uid: user.sub, steps, stage }, APPROVERS.includes(user.role))
  return data ?? undefined
}

function greeting(d: Date) {
  const h = d.getHours()
  return h < 11 ? 'Chào buổi sáng' : h < 14 ? 'Chào buổi trưa' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối'
}

function ThisWeek() {
  const today = new Date()
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d })
  return (
    <section className="po-panel">
      <div className="po-panel-head">
        <h2>{DAY_NAMES[today.getDay()]}, {today.getDate()}/{today.getMonth() + 1}/{today.getFullYear()}</h2>
        <Link to="/timesheet">Bảng công</Link>
      </div>
      <div className="po-week">
        {days.map((d) => {
          const isToday = d.toDateString() === today.toDateString()
          const weekend = d.getDay() === 0 || d.getDay() === 6
          return (
            <div key={d.toISOString()} className={cn('po-day', weekend && 'weekend', isToday && 'today')} aria-current={isToday ? 'date' : undefined}>
              {WEEKDAYS[d.getDay()]}<b>{d.getDate()}</b>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const { data, loading, error } = useQuery<any>(Q, { uid: user.sub, year: new Date().getFullYear() })
  const meInfo = useMe()
  const counts = useApproverCounts()
  const { prefs, topVisits } = usePrefs()
  const frequent = topVisits(4).filter((v) => navLabel(v.path))
  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} />

  const me = data.employees[0]
  const bal = data.leave_balances[0]
  const pay = data.payrolls[0]
  const entitled = bal ? Number(bal.entitled_days) : 0
  const remaining = bal ? entitled - Number(bal.used_days) : 0
  const pendingLeave: number = data.leave_requests.length
  const leaveToApprove = counts && user.role !== 'accountant' ? counts.leave.aggregate.count : 0
  const proposalsToApprove = counts && user.role !== 'manager' ? counts.proposals.aggregate.count : 0
  const isApprover = APPROVERS.includes(user.role)

  const todos: Todo[] = []
  if (leaveToApprove) todos.push({ to: '/approvals', icon: CheckSquare, attention: true, title: `Duyệt ${leaveToApprove} đơn nghỉ phép`, detail: 'Các đơn này đang chờ đúng bước của bạn.' })
  if (proposalsToApprove) todos.push({ to: '/approvals', icon: TrendingUp, attention: true, title: `Duyệt ${proposalsToApprove} đề xuất lương`, detail: 'Tăng lương, thưởng hoặc thăng chức.' })
  if (pendingLeave) todos.push({ to: '/leave', icon: CalendarDays, title: `${pendingLeave} đơn nghỉ của bạn đang chờ duyệt`, detail: 'Bạn sẽ nhận thông báo khi có kết quả.' })
  if (pay) todos.push({ to: '/payslips', icon: Wallet, title: `Phiếu lương ${monthLabel(pay.period_year, pay.period_month).toLowerCase()} đã có`, detail: 'Kiểm tra các khoản và gửi khiếu nại nếu thấy sai.' })
  todos.push({ to: '/timesheet', icon: CalendarCheck, title: 'Chấm công và đăng ký làm thêm giờ', detail: 'Bảng công tháng này là căn cứ tính lương.' })

  return (
    <div>
      <div className="po-greeting">
        <div>
          <h1>{greeting(new Date())}, {callName(user.name, prefs.salutation)}</h1>
          <p>{me ? `${me.job_title}, ${me.department}` : `${ROLE_LABEL[user.role] ?? ''}. Tài khoản chưa liên kết với hồ sơ nhân sự.`}</p>
        </div>
        {/* Người duyệt: việc chính là xử lý hàng đợi; còn lại: xin nghỉ là việc hay làm nhất */}
        {leaveToApprove + proposalsToApprove > 0
          ? <div className="flex flex-wrap gap-2">
              <Link to="/leave" className="po-btn po-btn-secondary"><Plus aria-hidden="true" /> Xin nghỉ phép</Link>
              <Link to="/approvals" className="po-btn po-btn-primary"><CheckSquare aria-hidden="true" /> Duyệt {leaveToApprove + proposalsToApprove} việc đang chờ</Link>
            </div>
          : <Link to="/leave" className="po-btn po-btn-primary"><Plus aria-hidden="true" /> Xin nghỉ phép</Link>}
      </div>

      <div className="po-panel po-figures">
        <Link to="/leave" className="po-figure">
          <div className="po-figure-label">Phép năm còn lại</div>
          <div className="po-figure-value">{bal ? fmtDays(remaining) : '—'}<small>{bal ? `/ ${fmtDays(entitled)} ngày` : ''}</small></div>
          {bal && <div className="po-meter" role="img" aria-label={`Còn ${remaining} trên ${entitled} ngày`}><i style={{ width: `${entitled ? (remaining / entitled) * 100 : 0}%` }} /></div>}
        </Link>
        <Link to="/payslips" className="po-figure">
          <div className="po-figure-label">{pay ? `Thực nhận ${monthLabel(pay.period_year, pay.period_month).toLowerCase()}` : 'Lương gần nhất'}</div>
          <div className="po-figure-value">{pay ? vnd(pay.net_salary) : '—'}</div>
          <div className="po-figure-note">{pay ? `Tổng thu nhập ${vnd(pay.gross)}` : 'Chưa có phiếu lương nào.'}</div>
        </Link>
        {isApprover && (
          <Link to="/approvals" className="po-figure">
            <div className="po-figure-label">Đang chờ bạn duyệt</div>
            <div className="po-figure-value">{counts ? leaveToApprove + proposalsToApprove : '—'}</div>
            <div className={cn('po-figure-note', leaveToApprove + proposalsToApprove > 0 && 'attention')}>
              {counts && leaveToApprove + proposalsToApprove > 0 ? 'Mở trang Phê duyệt để xử lý' : 'Không có việc nào tồn đọng'}
            </div>
          </Link>
        )}
      </div>

      <div className="po-dash-cols">
        <section className="po-panel">
          <div className="po-panel-head"><h2>Việc cần làm</h2></div>
          <ul className="po-todo">
            {todos.map((t) => (
              <li key={t.title}>
                <Link to={t.to}>
                  <span className={cn('po-todo-icon', t.attention && 'attention')}><t.icon aria-hidden="true" /></span>
                  <span className="po-todo-copy"><strong>{t.title}</strong><span>{t.detail}</span></span>
                  <ChevronRight className="po-todo-chevron" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <div className="po-side-stack">
          <ThisWeek />
          {frequent.length > 0 && (
            <section className="po-panel">
              <div className="po-panel-head"><h2>Bạn hay mở</h2><Link to="/settings">Ghim trang</Link></div>
              <ul className="po-frequent">
                {frequent.map((v) => (
                  <li key={v.path}><Link to={v.path}>{navLabel(v.path)}<span>{v.count} ngày trong 30 ngày qua</span></Link></li>
                ))}
              </ul>
            </section>
          )}
          {me && (
            <section className="po-panel">
              <div className="po-panel-head"><h2>Công việc của bạn</h2><Link to="/profile">Hồ sơ</Link></div>
              <dl className="po-facts">
                <div><dt>Phòng ban</dt><dd>{me.department}</dd></div>
                <div><dt>Quản lý trực tiếp</dt><dd>{meInfo?.employee?.manager?.full_name ?? 'Chưa có'}</dd></div>
                <div><dt>Ngày vào làm</dt><dd>{fmtDate(me.hire_date)}</dd></div>
              </dl>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
