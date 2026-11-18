// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

import { Download, Loader2, MessageSquareWarning } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { Empty, ErrorBox, errMsg, Loading, PageHeader, StatusBadge } from '@/components/common'
import { Stamp } from '@/components/Stamp'
import { useToast } from '@/hooks/toast'
import { useQuery } from '@/hooks/useQuery'
import { api, download } from '@/lib/api'
import { fmtDate, fmtDateTime, monthLabel, plainNum, vnd } from '@/lib/format'
import { cn } from '@/lib/utils'

const Q = `query Payslips($uid: uuid!) {
  payrolls(where: {employee: {user_id: {_eq: $uid}}}, order_by: [{period_year: desc}, {period_month: desc}]) {
    id status period_year period_month base_salary allowance overtime_pay bonus gross insured_salary
    bhxh_employee bhyt_employee bhtn_employee taxable_income personal_income_tax net_salary paid_at
    standard_days paid_days overtime_hours
  }
  employees(where: {user_id: {_eq: $uid}}, limit: 1) { full_name employee_code }
  payslip_complaints(where: {employee: {user_id: {_eq: $uid}}}, order_by: {created_at: desc}) {
    id payroll_id message status hr_note adjustment_note created_at
  }
}`

const COMPLAINT_STATUS: Record<string, string> = {
  open: 'HR đang xem xét', adjusting: 'Kế toán đang điều chỉnh', resolved: 'Đã điều chỉnh', rejected: 'HR không chấp nhận',
}

/** Giải thích thuật ngữ ngay trên phiếu, người không làm nhân sự cũng đọc được. */
const TERMS: Record<string, string> = {
  'Công chuẩn': 'Số ngày làm việc tiêu chuẩn của tháng, không tính ngày nghỉ hằng tuần.',
  BHXH: 'Bảo hiểm xã hội: phần người lao động đóng 8% trên mức lương đóng bảo hiểm, dùng cho lương hưu, ốm đau, thai sản.',
  BHYT: 'Bảo hiểm y tế: người lao động đóng 1,5%, dùng khi khám chữa bệnh.',
  BHTN: 'Bảo hiểm thất nghiệp: người lao động đóng 1%, được trợ cấp khi mất việc.',
  'Thuế TNCN': 'Thuế thu nhập cá nhân, tính trên thu nhập sau khi trừ bảo hiểm và giảm trừ gia cảnh.',
  'giảm trừ': 'Giảm trừ gia cảnh: 11 triệu đồng/tháng cho bản thân và 4,4 triệu đồng/tháng cho mỗi người phụ thuộc đã đăng ký.',
}
/** Thuật ngữ bấm/chạm được: mở một ô giải thích ngắn ngay bên dưới (không chỉ dựa vào hover). */
function Term({ k, children }: { k: keyof typeof TERMS; children?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    const close = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc) }
  }, [open])
  return (
    <span ref={ref} className="po-term-wrap">
      <button type="button" className="po-term" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>{children ?? k}</button>
      {open && <span id={id} role="note" className="po-term-tip">{TERMS[k]}</span>}
    </span>
  )
}

const num = (v: unknown) => String(Number(v)).replace('.', ',')
const n0 = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)

function Line({ label, value, minus, strong, className }: { label: React.ReactNode; value: number | string | null | undefined; minus?: boolean; strong?: boolean; className?: string }) {
  if (!strong && (value == null || Number(value) === 0)) return null
  return (
    <div className={cn('po-slip-line', strong && 'strong', className)}>
      <span>{label}</span>
      <span>{minus && Number(value) > 0 ? '−' : ''}{plainNum(value)}</span>
    </div>
  )
}

function Complaint({ payroll, existing, onFiled, open, setOpen }: { payroll: any; existing?: any; onFiled: () => void; open: boolean; setOpen: (v: boolean) => void }) {
  const { push } = useToast()
  const [line, setLine] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const active = existing && (existing.status === 'open' || existing.status === 'adjusting')

  if (existing) {
    return (
      <section className="po-complaint" aria-label="Khiếu nại phiếu lương">
        <div className="po-complaint-status">
          <h3>Khiếu nại của bạn</h3>
          <StatusBadge status={existing.status} map={COMPLAINT_STATUS} />
          <span className="text-[13.5px] text-muted-foreground">gửi lúc {fmtDateTime(existing.created_at)}</span>
        </div>
        <p className="mt-1">“{existing.message}”</p>
        {existing.hr_note && <p className="mt-1">HR: {existing.hr_note}</p>}
        {existing.adjustment_note && <p className="mt-1">Kế toán: {existing.adjustment_note}</p>}
        {!active && existing.status === 'rejected' && (
          <p className="mt-2">Nếu vẫn thấy chưa đúng, bạn có thể gửi khiếu nại mới kèm thông tin bổ sung.</p>
        )}
        {!active && existing.status === 'rejected' && !open && (
          <button type="button" className="po-btn po-btn-secondary mt-3" onClick={() => setOpen(true)}>Gửi khiếu nại mới</button>
        )}
        {open && ComplaintForm()}
      </section>
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const message = (line ? `[${line}] ` : '') + text.trim()
    if (text.trim().length < 10) return
    setBusy(true)
    try {
      await api('/api/payslip-complaints', 'POST', { payrollId: payroll.id, message })
      push({ title: 'Đã gửi khiếu nại tới HR', message: 'Bạn sẽ nhận thông báo khi HR xử lý xong.', kind: 'success' })
      setOpen(false); setText(''); setLine(''); onFiled()
    } catch (x) {
      push({ title: 'Chưa gửi được khiếu nại', message: errMsg(x), kind: 'error' })
    } finally { setBusy(false) }
  }

  function ComplaintForm() {
    return (
      <form onSubmit={submit} className="mt-3">
        <label className="block text-sm font-medium" htmlFor="po-complaint-line">Khoản bạn thấy chưa đúng</label>
        <select id="po-complaint-line" className="mt-1.5 h-10 w-full max-w-sm rounded-[7px] border border-input bg-card px-3" value={line} onChange={(e) => setLine(e.target.value)}>
          <option value="">Không rõ khoản nào / nhiều khoản</option>
          <option>Ngày công</option><option>Lương theo ngày công</option><option>Phụ cấp</option><option>Làm thêm giờ</option>
          <option>Thưởng</option><option>Bảo hiểm</option><option>Thuế TNCN</option>
        </select>
        <label className="mt-3 block text-sm font-medium" htmlFor="po-complaint-text">Mô tả ngắn</label>
        <textarea id="po-complaint-text" rows={3} value={text} onChange={(e) => setText(e.target.value)} minLength={10} maxLength={1000} required
          placeholder="Ví dụ: tháng này tôi làm thêm 12 giờ ngày thường nhưng phiếu chỉ ghi 8 giờ." />
        <div className="po-complaint-actions">
          <button type="submit" className="po-btn po-btn-primary" disabled={busy || text.trim().length < 10}>
            {busy && <Loader2 className="animate-spin" aria-hidden="true" />}{busy ? 'Đang gửi…' : 'Gửi khiếu nại'}
          </button>
          <button type="button" className="po-btn po-btn-secondary" onClick={() => setOpen(false)}>Huỷ</button>
          <span className="text-[13.5px] text-muted-foreground">{text.trim().length < 10 ? `Cần ít nhất 10 ký tự (${text.trim().length}/10)` : 'HR sẽ xem và chuyển Kế toán nếu cần điều chỉnh.'}</span>
        </div>
      </form>
    )
  }

  return (
    <section id="po-complaint" className="po-complaint" aria-label="Khiếu nại phiếu lương">
      <h3>Thấy khoản nào chưa đúng?</h3>
      <p>Gửi khiếu nại ngay tại đây, không cần chụp màn hình gửi riêng. HR xem xét, Kế toán điều chỉnh nếu đúng là có sai sót.</p>
      {open ? ComplaintForm() : (
        <button type="button" className="po-btn po-btn-secondary mt-3" onClick={() => setOpen(true)}>
          <MessageSquareWarning aria-hidden="true" /> Báo sai khoản trên phiếu này
        </button>
      )}
    </section>
  )
}

export default function Payslips() {
  const { user } = useAuth()
  const { push } = useToast()
  const { data, loading, error, reload } = useQuery<{ payrolls: any[]; employees: any[]; payslip_complaints: any[] }>(Q, { uid: user.sub })
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [complaintOpen, setComplaintOpen] = useState(false)
  const report = () => {
    setComplaintOpen(true)
    requestAnimationFrame(() => document.getElementById('po-complaint')?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }

  useEffect(() => { setComplaintOpen(false) }, [selected])
  useEffect(() => {
    if (data && !selected && data.payrolls[0]) setSelected(data.payrolls[0].id)
  }, [data, selected])

  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} onRetry={reload} />
  const list = data!.payrolls
  const me = data!.employees?.[0]
  const p = list.find((x) => x.id === selected)
  const latest = list[0]
  const complaint = p ? (data!.payslip_complaints ?? []).find((c) => c.payroll_id === p.id) : undefined
  const deductions = p ? n0(p.bhxh_employee) + n0(p.bhyt_employee) + n0(p.bhtn_employee) + n0(p.personal_income_tax) : 0

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
            ? `Lương ${monthLabel(latest.period_year, latest.period_month).toLowerCase()} đã chi ngày ${fmtDate(latest.paid_at)}.`
            : `Lương ${monthLabel(latest.period_year, latest.period_month).toLowerCase()} đang chờ chi.`
          : undefined} />

      {list.length === 0 ? (
        <Empty text="Bạn chưa có phiếu lương nào. Phiếu lương xuất hiện ở đây sau khi kế toán tính lương và giám đốc duyệt." />
      ) : (
        <>
          <div className="po-month-tabs" role="tablist" aria-label="Chọn tháng">
            {list.map((x) => (
              <button key={x.id} type="button" role="tab" aria-selected={x.id === selected}
                className={cn('po-chip po-month-chip', x.id === selected && 'selected')} onClick={() => setSelected(x.id)}>
                <span>{monthLabel(x.period_year, x.period_month)}</span>
                <small>{vnd(x.net_salary)}</small>
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
                  <Term k="Công chuẩn" /> {num(p.standard_days)} ngày, hưởng lương {num(p.paid_days)} ngày
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
                  <Line label={<><Term k="BHXH" /> 8%{p.insured_salary != null ? ` trên ${plainNum(p.insured_salary)}` : ''}</>} value={p.bhxh_employee} minus strong />
                  <Line label={<><Term k="BHYT" /> 1,5%</>} value={p.bhyt_employee} minus strong />
                  <Line label={<><Term k="BHTN" /> 1%</>} value={p.bhtn_employee} minus strong />
                  <Line label={<Term k="Thuế TNCN" />} value={p.personal_income_tax} minus strong />
                  <Line label="Tổng khấu trừ" value={deductions} minus strong className="po-slip-total-ded" />
                </section>
              </div>
              {p.taxable_income != null && (
                <p className="po-slip-note">Thu nhập tính thuế sau <Term k="giảm trừ" />: {vnd(p.taxable_income)}.</p>
              )}

              <div className="po-slip-net">
                <span>Thực nhận <small className="font-normal text-muted-foreground">= tổng thu nhập − tổng khấu trừ</small></span>
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

              {p.paid_at && <Complaint key={p.id} payroll={p} existing={complaint} onFiled={reload} open={complaintOpen} setOpen={setComplaintOpen} />}

              {/* Điện thoại: số thực nhận và hai việc chính luôn trong tầm tay */}
              <div className="po-slip-mobilebar" aria-label="Thao tác nhanh với phiếu lương">
                <div><span>Thực nhận</span><strong>{vnd(p.net_salary)}</strong></div>
                <button type="button" className="po-btn po-btn-primary" onClick={dl} disabled={busy} aria-label="Tải phiếu lương PDF">
                  {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />} PDF
                </button>
                {p.paid_at && !complaint && <button type="button" className="po-btn po-btn-secondary" onClick={report}>Báo sai</button>}
              </div>
            </article>
          )}
        </>
      )}
    </div>
  )
}
