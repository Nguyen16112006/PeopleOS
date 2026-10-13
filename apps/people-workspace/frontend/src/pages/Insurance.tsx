import {
  Building2,
  CalendarDays,
  CreditCard,
  HeartPulse,
  History,
  ShieldCheck,
  Wallet,
} from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { Empty, ErrorBox, Loading } from '@/components/common'
import { useQuery } from '@/hooks/useQuery'
import { vnd } from '@/lib/format'

const Q = `query Insurance($uid: uuid!) {
  employees(where: {user_id: {_eq: $uid}}, limit: 1) { social_insurance_no health_insurance_no }
  insurance_records(where: {employee: {user_id: {_eq: $uid}}}, order_by: {period: desc}) {
    id period insured_salary bhxh_employee bhyt_employee bhtn_employee bhxh_employer bhyt_employer bhtn_employer
  }
}`

export default function Insurance() {
  const { user } = useAuth()
  const { data, loading, error } = useQuery<any>(Q, { uid: user.sub })

  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} />

  const rows: any[] = data.insurance_records
  const emp = data.employees[0]
  const sum = (k: string) => rows.reduce((s, r) => s + Number(r[k]), 0)
  const employee = sum('bhxh_employee') + sum('bhyt_employee') + sum('bhtn_employee')
  const employer = sum('bhxh_employer') + sum('bhyt_employer') + sum('bhtn_employer')
  const ym = (d: string) => `${d.slice(5, 7)}/${d.slice(0, 4)}`

  return (
    <div className="-mt-4 space-y-6">
      {/* Title Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">BHXH / BHYT</h1>
        <p className="mt-1 text-base font-medium text-slate-500">
          Quá trình đóng bảo hiểm do công ty kê khai hằng tháng (tham khảo - đối chiếu với ứng dụng VssID)
        </p>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Số sổ BHXH */}
        <div className="rounded-2xl border border-slate-100/90 bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_25px_rgba(0,0,0,0.05)] transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Số sổ BHXH
            </span>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB]">
              <ShieldCheck className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 font-mono text-xl font-bold tracking-tight text-slate-900">
            {emp?.social_insurance_no || '—'}
          </p>
          <p className="mt-1 text-xs font-medium text-slate-400">Bảo hiểm xã hội Việt Nam</p>
        </div>

        {/* Card 2: Số thẻ BHYT */}
        <div className="rounded-2xl border border-slate-100/90 bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_25px_rgba(0,0,0,0.05)] transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Số thẻ BHYT
            </span>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <HeartPulse className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 font-mono text-xl font-bold tracking-tight text-slate-900">
            {emp?.health_insurance_no || '—'}
          </p>
          <p className="mt-1 text-xs font-medium text-slate-400">Khám chữa bệnh BHYT</p>
        </div>

        {/* Card 3: Số tháng đã đóng */}
        <div className="rounded-2xl border border-slate-100/90 bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_25px_rgba(0,0,0,0.05)] transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Thời gian đóng
            </span>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FAF5FF] text-[#9333EA]">
              <CalendarDays className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            {rows.length} <span className="text-sm font-semibold text-slate-500">tháng</span>
          </p>
          <p className="mt-1 text-xs font-medium text-slate-400">Tích lũy thời gian tham gia</p>
        </div>

        {/* Card 4: Tổng trích nộp */}
        <div className="rounded-2xl border border-[#DCFCE7] bg-[#F2FBF7] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_25px_rgba(0,0,0,0.05)] transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              Bạn / DN đã đóng
            </span>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#DCFCE7] text-[#16A34A]">
              <Building2 className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-sm font-bold tracking-tight text-slate-900">
            {vnd(employee)} <span className="font-normal text-slate-400">/</span> {vnd(employer)}
          </p>
          <p className="mt-1 text-xs font-medium text-slate-500">
            NLĐ đóng 10,5% · Doanh nghiệp 21,5%
          </p>
        </div>
      </div>

      {/* Main Details Table Card */}
      <div className="rounded-2xl border border-slate-100/90 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB]">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Chi tiết theo tháng</h2>
              <p className="text-xs font-medium text-slate-400">
                Lịch sử các kỳ đóng bảo hiểm và chi tiết số tiền trích nộp
              </p>
            </div>
          </div>

          <span className="self-start sm:self-center rounded-full bg-slate-100 px-3 py-1 font-mono text-xs font-semibold text-slate-600">
            {rows.length} kỳ kê khai
          </span>
        </div>

        <div className="mt-4">
          {rows.length === 0 ? (
            <Empty text="Chưa có dữ liệu đóng bảo hiểm" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4 rounded-l-xl">Kỳ đóng</th>
                    <th className="py-3 px-4">Lương đóng BH</th>
                    <th className="py-3 px-4">BHXH (8%)</th>
                    <th className="py-3 px-4">BHYT (1,5%)</th>
                    <th className="py-3 px-4">BHTN (1%)</th>
                    <th className="py-3 px-4 rounded-r-xl">DN đóng (21,5%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => {
                    const employerTotal =
                      Number(r.bhxh_employer) + Number(r.bhyt_employer) + Number(r.bhtn_employer)
                    return (
                      <tr
                        key={r.id}
                        className="hover:bg-slate-50/60 transition-colors"
                      >
                        <td className="py-3.5 px-4 font-mono font-semibold text-slate-900">
                          {ym(r.period)}
                        </td>
                        <td className="py-3.5 px-4 font-medium text-slate-700">
                          {vnd(r.insured_salary)}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600">{vnd(r.bhxh_employee)}</td>
                        <td className="py-3.5 px-4 text-slate-600">{vnd(r.bhyt_employee)}</td>
                        <td className="py-3.5 px-4 text-slate-600">{vnd(r.bhtn_employee)}</td>
                        <td className="py-3.5 px-4 font-semibold text-[#1D4ED8]">
                          {vnd(employerTotal)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
