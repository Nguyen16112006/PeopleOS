import {
  Calendar,
  CalendarDays,
  Clock,
  History,
  Loader2,
  PlusCircle,
  Send,
  XCircle,
} from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { Empty, ErrorBox, errMsg, LeaveBadge, Loading } from '@/components/common'
import { useToast } from '@/hooks/toast'
import { useQuery } from '@/hooks/useQuery'
import { api } from '@/lib/api'
import { fmtDate, LEAVE_TYPES } from '@/lib/format'

const Q = `query MyLeave($uid: uuid!, $year: smallint!) {
  leave_balances(where: {employee: {user_id: {_eq: $uid}}, year: {_eq: $year}}) { entitled_days used_days sick_days_used }
  leave_requests(where: {employee: {user_id: {_eq: $uid}}}, order_by: {created_at: desc}) {
    id leave_type start_date end_date days reason status decision_note approver { full_name }
  }
}`

const today = () => new Date().toISOString().slice(0, 10)

export default function Leave() {
  const { user } = useAuth()
  const { push } = useToast()
  const { data, loading, error, reload } = useQuery<any>(Q, {
    uid: user.sub,
    year: new Date().getFullYear(),
  })
  const [form, setForm] = useState({
    leave_type: 'annual',
    start_date: today(),
    end_date: today(),
    reason: '',
  })
  const [sending, setSending] = useState(false)
  const set = (k: string, v: string) =>
    setForm((f) => ({
      ...f,
      [k]: v,
      ...(k === 'start_date' && v > f.end_date ? { end_date: v } : {}),
    }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSending(true)
    try {
      const r = await api<{ days: number }>('/api/leave-requests', 'POST', form)
      push({
        title: 'Đã gửi đơn nghỉ phép',
        message: `${r.days} ngày làm việc - đang chờ quản lý duyệt`,
        kind: 'success',
      })
      setForm((f) => ({ ...f, reason: '' }))
      reload()
    } catch (x) {
      push({ title: 'Không gửi được đơn', message: errMsg(x), kind: 'error' })
    } finally {
      setSending(false)
    }
  }

  const cancel = async (id: string) => {
    try {
      await api(`/api/leave-requests/${id}/cancel`, 'POST')
      push({ title: 'Đã huỷ đơn', kind: 'success' })
      reload()
    } catch (x) {
      push({ title: 'Không huỷ được', message: errMsg(x), kind: 'error' })
    }
  }

  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} />
  const bal = data.leave_balances[0]
  const left = bal ? Number(bal.entitled_days) - Number(bal.used_days) : 0

  return (
    <div className="-mt-4 space-y-6">
      {/* Title Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Nghỉ phép / Nghỉ ốm</h1>
        <p className="mt-1 text-base font-medium text-slate-500">
          Gửi đơn nghỉ phép, theo dõi phê duyệt và nhận thông báo theo thời gian thực
        </p>
      </div>

      {/* Top 3 Stat Cards */}
      <div className="grid gap-5 sm:grid-cols-3">
        {/* Card 1: Phép năm được hưởng */}
        <div className="rounded-2xl border border-slate-100/90 bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_25px_rgba(0,0,0,0.05)] transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Phép năm được hưởng
            </span>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB]">
              <Calendar className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            {bal ? Number(bal.entitled_days) : '—'}{' '}
            <span className="text-sm font-semibold text-slate-500">ngày</span>
          </p>
          <p className="mt-1 text-xs font-medium text-slate-400">Tiêu chuẩn năm hiện tại</p>
        </div>

        {/* Card 2: Đã sử dụng */}
        <div className="rounded-2xl border border-slate-100/90 bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_25px_rgba(0,0,0,0.05)] transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Đã sử dụng
            </span>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <Clock className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            {bal ? Number(bal.used_days) : '—'}{' '}
            <span className="text-sm font-semibold text-slate-500">ngày</span>
          </p>
          <p className="mt-1 text-xs font-medium text-slate-400">
            Nghỉ ốm đã dùng: {bal ? Number(bal.sick_days_used) : 0} ngày
          </p>
        </div>

        {/* Card 3: Ngày phép còn lại (Phong cách giống card Tổng quan) */}
        <div className="rounded-2xl border border-[#DCFCE7] bg-[#F2FBF7] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_25px_rgba(0,0,0,0.05)] transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
              Ngày phép còn lại
            </span>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#DCFCE7] text-[#16A34A]">
              <CalendarDays className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            {bal ? left : '—'}{' '}
            <span className="text-sm font-semibold text-slate-500">
              / {bal ? Number(bal.entitled_days) : 12} ngày
            </span>
          </p>
          <p className="mt-1 text-xs font-medium text-emerald-700">Khả dụng cho năm nay</p>
        </div>
      </div>

      {/* Main Grid: Form Tạo đơn vs Danh sách đơn */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Form Tạo đơn mới */}
        <div className="rounded-2xl border border-slate-100/90 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] lg:col-span-1">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB]">
              <PlusCircle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Tạo đơn mới</h2>
              <p className="text-xs font-medium text-slate-400">Gửi đơn nghỉ phép tới quản lý</p>
            </div>
          </div>

          <form onSubmit={submit} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Loại nghỉ</label>
              <select
                value={form.leave_type}
                onChange={(e) => set('leave_type', e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {Object.entries(LEAVE_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Từ ngày</label>
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => set('start_date', e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Đến ngày</label>
                <input
                  type="date"
                  min={form.start_date}
                  value={form.end_date}
                  onChange={(e) => set('end_date', e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Lý do</label>
              <textarea
                value={form.reason}
                onChange={(e) => set('reason', e.target.value)}
                placeholder="Ví dụ: nghỉ phép năm, việc gia đình, khám bệnh…"
                rows={3}
                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={sending}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#2563EB] py-2.5 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              <span>{sending ? 'Đang gửi…' : 'Gửi đơn'}</span>
            </button>

            <div className="rounded-xl bg-slate-50 p-3 border border-slate-100 text-xs text-slate-500 leading-relaxed">
              💡 Số ngày được tính tự động theo ngày làm việc (Thứ 2 – Thứ 6), không tính ngày nghỉ lễ.
            </div>
          </form>
        </div>

        {/* Danh sách đơn của tôi */}
        <div className="rounded-2xl border border-slate-100/90 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] lg:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB]">
                <History className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Đơn của tôi</h2>
                <p className="text-xs font-medium text-slate-400">
                  Lịch sử và trạng thái xử lý các đơn đã gửi
                </p>
              </div>
            </div>

            <span className="self-start sm:self-center rounded-full bg-slate-100 px-3 py-1 font-mono text-xs font-semibold text-slate-600">
              {data.leave_requests.length} đơn đã gửi
            </span>
          </div>

          <div className="mt-4">
            {data.leave_requests.length === 0 ? (
              <Empty text="Bạn chưa có đơn nghỉ nào" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      <th className="py-3 px-4 rounded-l-xl">Loại nghỉ</th>
                      <th className="py-3 px-4">Thời gian</th>
                      <th className="py-3 px-4 text-center whitespace-nowrap">Số ngày</th>
                      <th className="py-3 px-4">Trạng thái</th>
                      <th className="py-3 px-4">Ghi chú / Lý do</th>
                      <th className="py-3 px-4 rounded-r-xl text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.leave_requests.map((r: any) => (
                      <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3.5 px-4 font-semibold text-slate-800">
                          {LEAVE_TYPES[r.leave_type] ?? r.leave_type}
                        </td>
                        <td className="py-3.5 px-4 font-medium text-slate-600 whitespace-nowrap">
                          {r.start_date === r.end_date
                            ? fmtDate(r.start_date)
                            : `${fmtDate(r.start_date)} → ${fmtDate(r.end_date)}`}
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-slate-900 whitespace-nowrap">
                          <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs whitespace-nowrap">
                            {Number(r.days)} ngày
                          </span>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <LeaveBadge status={r.status} />
                        </td>
                        <td className="py-3.5 px-4 max-w-[14rem] truncate text-slate-500 text-xs">
                          {r.decision_note
                            ? `${r.approver?.full_name ? r.approver.full_name + ': ' : ''}${r.decision_note}`
                            : r.reason || '—'}
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          {r.status === 'pending' && (
                            <button
                              onClick={() => cancel(r.id)}
                              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 transition-colors"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              <span>Huỷ đơn</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
