// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

/** Số tiền kiểu Việt Nam. Giá trị trống hoặc không phải số hiện "—", không bao giờ ra "NaN đ". */
export const vnd = (n: number | string | null | undefined) => {
  if (n == null || n === '') return '—'
  const v = Number(n)
  return Number.isFinite(v) ? new Intl.NumberFormat('vi-VN').format(v) + ' đ' : '—'
}
/** Như vnd nhưng không có đơn vị, dùng trong cột số của chứng từ. */
export const plainNum = (n: number | string | null | undefined) => {
  if (n == null || n === '') return '—'
  const v = Number(n)
  return Number.isFinite(v) ? new Intl.NumberFormat('vi-VN').format(v) : '—'
}

export const fmtDate = (d?: string | null) => {
  if (!d) return '—'
  const x = new Date(d)
  return isNaN(x.getTime()) ? d : x.toLocaleDateString('vi-VN')
}
export const fmtDateTime = (d?: string | null) => {
  if (!d) return '—'
  const x = new Date(d)
  if (isNaN(x.getTime())) return d
  // 14:05, 18/11/2026: có năm để nhật ký, thông báo không bị đọc nhầm
  const t = x.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  return `${t}, ${x.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
}
export const monthLabel = (y: number, m: number) => `Tháng ${String(m).padStart(2, '0')}/${y}`

export const LEAVE_TYPES: Record<string, string> = {
  annual: 'Nghỉ phép năm', sick: 'Nghỉ ốm', unpaid: 'Nghỉ không lương', personal: 'Nghỉ việc riêng',
}
export const LEAVE_STATUS: Record<string, string> = {
  pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Bị từ chối', cancelled: 'Đã huỷ',
}
export const PROPOSAL_STATUS: Record<string, string> = {
  pending_hr: 'Chờ HR thẩm định', pending_accountant: 'Chờ Kế toán kiểm ngân sách', pending_director: 'Chờ Giám đốc duyệt', approved: 'Đã duyệt', rejected: 'Bị từ chối',
}
export const STEP_STATUS: Record<string, string> = {
  waiting: 'Chưa tới lượt', pending: 'Đang chờ', approved: 'Đã duyệt', rejected: 'Bị từ chối',
}
export const CONTRACT_TYPES: Record<string, string> = {
  probation: 'Thử việc', fixed_term: 'Xác định thời hạn', indefinite: 'Không xác định thời hạn',
}
export const ROLE_LABEL: Record<string, string> = {
  sysadmin: 'Quản trị hệ thống', director: 'Giám đốc', accountant: 'Kế toán', hr: 'Nhân sự (HR)', manager: 'Quản lý', employee: 'Nhân viên',
}
export const EMP_STATUS: Record<string, string> = {
  onboarding: 'Đang onboarding', active: 'Đang làm việc', on_leave: 'Nghỉ dài hạn', terminated: 'Đã nghỉ việc',
}
export const ASSIGNEE_LABEL: Record<string, string> = {
  hr: 'HR', manager: 'Quản lý', employee: 'Nhân viên', sysadmin: 'Admin', director: 'Giám đốc', accountant: 'Kế toán',
}

/** Nhãn chung cho các khoá trạng thái hay gặp; trang có bảng riêng thì bảng riêng được ưu tiên. */
export const STATUS_LABEL: Record<string, string> = {
  pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Bị từ chối', cancelled: 'Đã huỷ', returned: 'Bị trả lại',
  pending_hr: 'Chờ HR', pending_accountant: 'Chờ Kế toán', pending_director: 'Chờ Giám đốc', pending_manager: 'Chờ Quản lý',
  open: 'Đang mở', submitted: 'Đã gửi', confirmed: 'Đã xác nhận', closed: 'Đã chốt', draft: 'Bản nháp',
  paid: 'Đã chi', settled: 'Đã quyết toán', resolved: 'Đã xử lý', adjusting: 'Đang điều chỉnh', done: 'Hoàn tất',
  expired: 'Đã hết hạn', revoked: 'Đã thu hồi', active: 'Đang hiệu lực', terminated: 'Đã chấm dứt',
  manager: 'Chờ Quản lý', hr: 'Chờ HR', director: 'Chờ Giám đốc', accountant: 'Chờ Kế toán',
}
const DONE = /^(approved|paid|settled|resolved|done|confirmed|active|closed)$/
const BAD = /^(rejected|cancelled|returned|revoked|terminated|expired)$/
export const statusTone = (s: string): 'success' | 'warning' | 'destructive' | 'secondary' =>
  DONE.test(s) ? 'success' : BAD.test(s) ? 'destructive' : s === 'draft' ? 'secondary' : 'warning'

/** Số ngày kiểu Việt Nam: 4,5 ngày */
export const fmtDays = (n: number | string | null | undefined) => (n == null || !Number.isFinite(Number(n)) ? '—' : String(Number(n)).replace('.', ','))
