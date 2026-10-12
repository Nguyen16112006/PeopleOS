export const vnd = (n: number | string | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('vi-VN').format(Number(n)) + ' đ'

export const fmtDate = (d?: string | null) => {
  if (!d) return '—'
  const x = new Date(d)
  return isNaN(x.getTime()) ? d : x.toLocaleDateString('vi-VN')
}
export const fmtDateTime = (d?: string | null) => {
  if (!d) return '—'
  const x = new Date(d)
  return isNaN(x.getTime()) ? d : x.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
}
export const monthLabel = (y: number, m: number) => `Tháng ${String(m).padStart(2, '0')}/${y}`

export const LEAVE_TYPES: Record<string, string> = {
  annual: 'Nghỉ phép năm', sick: 'Nghỉ ốm', unpaid: 'Nghỉ không lương', personal: 'Nghỉ việc riêng',
}
export const LEAVE_STATUS: Record<string, string> = {
  pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Từ chối', cancelled: 'Đã huỷ',
}
export const PROPOSAL_STATUS: Record<string, string> = {
  pending_hr: 'Chờ HR duyệt', pending_admin: 'Chờ Giám đốc duyệt', approved: 'Đã duyệt', rejected: 'Từ chối',
}
export const STEP_STATUS: Record<string, string> = {
  waiting: 'Chưa tới lượt', pending: 'Đang chờ', approved: 'Đã duyệt', rejected: 'Từ chối',
}
export const CONTRACT_TYPES: Record<string, string> = {
  probation: 'Thử việc', fixed_term: 'Xác định thời hạn', indefinite: 'Không xác định thời hạn',
}
export const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin / Giám đốc', hr: 'Nhân sự (HR)', manager: 'Quản lý', employee: 'Nhân viên',
}
export const EMP_STATUS: Record<string, string> = {
  onboarding: 'Đang onboarding', active: 'Đang làm việc', on_leave: 'Nghỉ dài hạn', terminated: 'Đã nghỉ việc',
}
export const ASSIGNEE_LABEL: Record<string, string> = {
  hr: 'HR', manager: 'Quản lý', employee: 'Nhân viên', admin: 'Admin',
}
