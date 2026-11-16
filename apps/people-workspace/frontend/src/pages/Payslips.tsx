// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

import { Download, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { Empty, ErrorBox, errMsg, Loading, PageHeader } from '@/components/common'
import { Stamp } from '@/components/Stamp'
import { useToast } from '@/hooks/toast'
import { useQuery } from '@/hooks/useQuery'
import { download } from '@/lib/api'
import { fmtDate, monthLabel, vnd } from '@/lib/format'
import { cn } from '@/lib/utils'

const Q = `query Payslips($uid: uuid!) {
  payrolls(where: {employee: {user_id: {_eq: $uid}}}, order_by: [{period_year: desc}, {period_month: desc}]) {
    id period_year period_month base_salary allowance overtime_pay bonus gross insured_salary
    bhxh_employee bhyt_employee bhtn_employee taxable_income personal_income_tax net_salary paid_at
    standard_days paid_days overtime_hours
  }
  employees(where: {user_id: {_eq: $uid}}, limit: 1) { full_name employee_code }
}`

const num = (v: unknown) => String(Number(v)).replace('.', ',')
const plain = (n: number | string | null | undefined) => (n == null ? '—' : new Intl.NumberFormat('vi-VN').format(Number(n)))

function Line({ label, value, minus, strong }: { label: string; value: number | string | null | undefined; minus?: boolean; strong?: boolean }) {
  if (!strong && (value == null || Number(value) === 0)) return null
  return (
    <div className={cn('po-slip-line', strong && 'strong')}>
      <span>{label}</span>
      <span>{minus && Number(value) > 0 ? '−' : ''}{plain(value)}</span>
    </div>
  )
}

export default function Payslips() {
  const { user } = useAuth()
  const { push } = useToast()
  const { data, loading, error } = useQuery<{ payrolls: any[]; employees: any[] }>(Q, { uid: user.sub })
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (data && !selected && data.payrolls[0]) setSelected(data.payrolls[0].id)
  }, [data, selected])

  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} />
  const list = data!.payrolls
  const me = data!.employees?.[0]
  const p = list.find((x) => x.id === selected)
  const latest = list[0]

  const dl = async () => {
    if (!p) return
    setBusy(true)
    try {
      await download(`/api/payslips/${p.id}/download`, `payslip-${p.period_year}-${String(p.period_month).padStart(2, '0')}.pdf`)
    } catch (e) {
      push({ title: 'Không tải được phiếu lương', message: errMsg(e), kind: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader title="Phiếu lương"
        description={latest
          ? latest.paid_at
            ? `Lương ${monthLabel(latest.period_year, latest.period_month).toLowerCase()} đã chi ngày ${fmtDate(latest.paid_at)}. Thấy khoản nào chưa đúng, hãy báo HR để được xem lại.`
            : `Lương ${monthLabel(latest.period_year, latest.period_month).toLowerCase()} đang chờ chi.`
          : undefined} />

      {list.length === 0 ? (
        <Empty text="Bạn chưa có phiếu lương nào. Phiếu lương xuất hiện ở đây sau khi kế toán tính lương và giám đốc duyệt." />
      ) : (
        <>
          <div className="po-month-tabs" role="tablist" aria-label="Chọn tháng">
            {list.map((x) => (
              <button key={x.id} type="button" role="tab" aria-selected={x.id === selected}
                className={cn('po-chip', x.id === selected && 'selected')} onClick={() => setSelected(x.id)}>
                {monthLabel(x.period_year, x.period_month)}
              </button>
            ))}
          </div>

          {p && (
            <article className="po-slip" aria-label={`Phiếu lương ${monthLabel(p.period_year, p.period_month).toLowerCase()}`}>
              <header className="po-slip-head">
                <h2>Phiếu lương {monthLabel(p.period_year, p.period_month).toLowerCase()}</h2>
                <span>{me?.full_name ?? user.name}{me?.employee_code ? `, mã NV ${me.employee_code}` : ''}</span>
              </header>
              {p.standard_days != null && (
                <p className="po-slip-meta">
                  Công chuẩn {num(p.standard_days)} ngày, hưởng lương {num(p.paid_days)} ngày
                  {Number(p.overtime_hours) > 0 ? `, làm thêm ${num(p.overtime_hours)} giờ` : ''}.
                </p>
              )}

              <div className="po-slip-cols">
                <section>
                  <h3>Thu nhập</h3>
                  <Line label={p.standard_days != null ? 'Lương theo ngày công' : 'Lương cơ bản'} value={p.base_salary} />
                  <Line label={p.standard_days != null ? 'Phụ cấp theo ngày công' : 'Phụ cấp'} value={p.allowance} />
                  <Line label="Làm thêm giờ" value={p.overtime_pay} />
                  <Line label="Thưởng" value={p.bonus} />
                  <Line label="Tổng thu nhập" value={p.gross} strong />
                </section>
                <section>
                  <h3>Khấu trừ</h3>
                  <Line label={p.insured_salary != null ? `BHXH 8% trên ${plain(p.insured_salary)}` : 'BHXH 8%'} value={p.bhxh_employee} minus strong />
                  <Line label="BHYT 1,5%" value={p.bhyt_employee} minus strong />
                  <Line label="BHTN 1%" value={p.bhtn_employee} minus strong />
                  <Line label="Thuế TNCN" value={p.personal_income_tax} minus strong />
                </section>
              </div>
              {p.taxable_income != null && (
                <p className="po-slip-note">Thu nhập tính thuế sau giảm trừ: {vnd(p.taxable_income)}.</p>
              )}

              <div className="po-slip-net">
                <span>Thực nhận</span>
                <strong>{vnd(p.net_salary)}</strong>
              </div>

              <div className="po-slip-foot">
                <button type="button" className="po-btn po-btn-primary" onClick={dl} disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
                  {busy ? 'Đang tải phiếu…' : 'Tải phiếu lương PDF'}
                </button>
                <div className="po-slip-seal">
                  <span>Xác nhận chi lương</span>
                  {p.paid_at
                    ? <Stamp label="Đã chi" date={fmtDate(p.paid_at)} size={116} />
                    : <span className="po-slip-pending">Chưa chi lương kỳ này</span>}
                </div>
              </div>
            </article>
          )}
        </>
      )}
    </div>
  )
}
