import {
  CalendarDays,
  ChevronRight,
  Download,
  Loader2,
  Receipt,
  ShieldCheck,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { Empty, ErrorBox, errMsg, Loading } from '@/components/common'
import { useToast } from '@/hooks/toast'
import { useQuery } from '@/hooks/useQuery'
import { download } from '@/lib/api'
import { fmtDate, monthLabel, vnd } from '@/lib/format'
import { cn } from '@/lib/utils'

const Q = `query Payslips($uid: uuid!) {
  payrolls(where: {employee: {user_id: {_eq: $uid}}}, order_by: [{period_year: desc}, {period_month: desc}]) {
    id period_year period_month base_salary allowance overtime_pay bonus gross insured_salary
    bhxh_employee bhyt_employee bhtn_employee taxable_income personal_income_tax net_salary paid_at
  }
}`

function PayslipRow({
  label,
  value,
  strong,
  minus,
  highlight,
}: {
  label: string
  value: number | string | null | undefined
  strong?: boolean
  minus?: boolean
  highlight?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between py-2.5 text-sm border-b border-slate-100 last:border-0',
        strong && 'font-bold text-slate-900',
        highlight && 'bg-blue-50/50 -mx-3 px-3 rounded-lg py-2 my-0.5'
      )}
    >
      <span className={cn('text-slate-500 font-medium', strong && 'text-slate-900 font-semibold')}>
        {label}
      </span>
      <span
        className={cn(
          'text-slate-800 font-semibold',
          strong && 'text-slate-900 font-bold',
          minus && 'text-rose-600',
          highlight && 'text-[#1D4ED8] font-bold text-base'
        )}
      >
        {minus ? '− ' : ''}
        {vnd(value)}
      </span>
    </div>
  )
}

export default function Payslips() {
  const { user } = useAuth()
  const { push } = useToast()
  const { data, loading, error } = useQuery<{ payrolls: any[] }>(Q, { uid: user.sub })
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (data && !selected && data.payrolls[0]) {
      setSelected(data.payrolls[0].id)
    }
  }, [data, selected])

  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} />
  const list = data!.payrolls
  const p = list.find((x) => x.id === selected)

  const dl = async () => {
    if (!p) return
    setBusy(true)
    try {
      await download(
        `/api/payslips/${p.id}/download`,
        `payslip-${p.period_year}-${String(p.period_month).padStart(2, '0')}.pdf`
      )
    } catch (e) {
      push({ title: 'Không tải được phiếu lương', message: errMsg(e), kind: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="-mt-4 space-y-6">
      {/* Title Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Bảng lương</h1>
        <p className="mt-1 text-base font-medium text-slate-500">
          Phiếu lương chi tiết theo tháng, minh bạch thu nhập và các khoản khấu trừ
        </p>
      </div>

      {list.length === 0 ? (
        <Empty text="Chưa có phiếu lương" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column: Danh sách các kỳ lương */}
          <div className="rounded-2xl border border-slate-100/90 bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] lg:col-span-1">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB]">
                <CalendarDays className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Các kỳ lương</h2>
                <p className="text-xs font-medium text-slate-400">{list.length} kỳ gần nhất</p>
              </div>
            </div>

            <div className="mt-4 max-h-[32rem] space-y-2 overflow-y-auto pr-1">
              {list.map((x) => {
                const isSelected = x.id === selected
                return (
                  <button
                    key={x.id}
                    onClick={() => setSelected(x.id)}
                    className={cn(
                      'group flex w-full items-center justify-between rounded-xl px-4 py-3.5 text-left transition-all',
                      isSelected
                        ? 'bg-[#1D68F2] text-white shadow-sm'
                        : 'bg-slate-50/70 text-slate-700 hover:bg-slate-100/80 border border-slate-100/80'
                    )}
                  >
                    <div>
                      <p className={cn('text-sm font-semibold', isSelected ? 'text-white' : 'text-slate-800')}>
                        {monthLabel(x.period_year, x.period_month)}
                      </p>
                      <p
                        className={cn(
                          'mt-0.5 text-xs font-medium',
                          isSelected ? 'text-blue-100' : 'text-slate-400'
                        )}
                      >
                        Net: {vnd(x.net_salary)}
                      </p>
                    </div>
                    <ChevronRight
                      className={cn(
                        'h-4 w-4 transition-transform',
                        isSelected ? 'text-white translate-x-0.5' : 'text-slate-400 group-hover:translate-x-0.5'
                      )}
                    />
                  </button>
                )
              })}
            </div>
          </div>

          {/* Right Column: Chi tiết phiếu lương được chọn */}
          {p && (
            <div className="space-y-6 lg:col-span-2">
              {/* Header card of selected payslip */}
              <div className="rounded-2xl border border-slate-100/90 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#DCFCE7] text-[#16A34A]">
                      <Wallet className="h-6 w-6" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">
                        {monthLabel(p.period_year, p.period_month)}
                      </h2>
                      <p className="mt-0.5 text-xs font-medium text-slate-400">
                        Ngày chi trả: {fmtDate(p.paid_at)}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={dl}
                    disabled={busy}
                    className="flex items-center gap-2 rounded-xl bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 transition-colors self-start sm:self-auto"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    <span>{busy ? 'Đang tải…' : 'Tải PDF'}</span>
                  </button>
                </div>

                {/* Net Income Banner matching Dashboard card style */}
                <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-[#DCFCE7] bg-[#F2FBF7] p-6">
                  <div>
                    <span className="text-sm font-semibold text-slate-600">Thực nhận (Net Salary)</span>
                    <p className="mt-1 text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
                      {vnd(p.net_salary)}
                    </p>
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      Tổng thu nhập Gross: <span className="font-semibold text-slate-700">{vnd(p.gross)}</span>
                    </p>
                  </div>
                  <div className="hidden sm:flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#DCFCE7] text-[#16A34A]">
                    <Wallet className="h-7 w-7" />
                  </div>
                </div>

                {/* 2 Breakdown Columns: Thu nhập vs Khấu trừ */}
                <div className="mt-6 grid gap-6 sm:grid-cols-2">
                  {/* Cột 1: Thu nhập */}
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-5">
                    <div className="flex items-center gap-2.5 border-b border-slate-200/80 pb-3 mb-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB]">
                        <TrendingUp className="h-4 w-4" />
                      </div>
                      <h3 className="text-sm font-bold text-slate-900">Khoản thu nhập</h3>
                    </div>

                    <div className="divide-y divide-slate-100">
                      <PayslipRow label="Lương cơ bản" value={p.base_salary} />
                      <PayslipRow label="Phụ cấp" value={p.allowance} />
                      <PayslipRow label="Làm thêm giờ" value={p.overtime_pay} />
                      <PayslipRow label="Thưởng" value={p.bonus} />
                      <PayslipRow label="Tổng thu nhập (Gross)" value={p.gross} strong highlight />
                    </div>
                  </div>

                  {/* Cột 2: Khấu trừ */}
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-5">
                    <div className="flex items-center gap-2.5 border-b border-slate-200/80 pb-3 mb-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                        <Receipt className="h-4 w-4" />
                      </div>
                      <h3 className="text-sm font-bold text-slate-900">Khoản khấu trừ</h3>
                    </div>

                    <div className="divide-y divide-slate-100">
                      <PayslipRow label="BHXH (8%)" value={p.bhxh_employee} minus />
                      <PayslipRow label="BHYT (1,5%)" value={p.bhyt_employee} minus />
                      <PayslipRow label="BHTN (1%)" value={p.bhtn_employee} minus />
                      <PayslipRow label="Thuế TNCN" value={p.personal_income_tax} minus />
                      <PayslipRow label="Thu nhập tính thuế" value={p.taxable_income} />
                      {p.insured_salary != null && (
                        <PayslipRow label="Mức lương đóng BH" value={p.insured_salary} />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
