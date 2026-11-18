// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

/** Danh sách trang của People Workspace, dùng chung cho menu, tìm nhanh, mục ghim và "Bạn hay mở". */
import {
  BarChart3, Bot, CalendarCheck, CalendarDays, CheckSquare, FileText, HeartPulse, Key, Landmark, LayoutDashboard,
  Network, Receipt, ShieldCheck, Target, TrendingUp, UserCircle, UserMinus, UserPlus, Wallet, type LucideIcon,
} from 'lucide-react'

export type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean; roles?: string[] }

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Của tôi',
    items: [
      { to: '/', label: 'Tổng quan', icon: LayoutDashboard, end: true },
      { to: '/payslips', label: 'Phiếu lương', icon: Wallet },
      { to: '/leave', label: 'Nghỉ phép', icon: CalendarDays },
      { to: '/timesheet', label: 'Bảng công', icon: CalendarCheck },
      { to: '/advances', label: 'Tạm ứng và chi phí', icon: Receipt },
      { to: '/profile', label: 'Hồ sơ cá nhân', icon: UserCircle },
      { to: '/contracts', label: 'Hợp đồng lao động', icon: FileText },
      { to: '/insurance', label: 'BHXH, BHYT', icon: HeartPulse },
      { to: '/tax-year', label: 'Thuế và báo cáo năm', icon: Landmark },
      { to: '/kpi', label: 'Đánh giá KPI', icon: Target },
      { to: '/offboarding', label: 'Nghỉ việc', icon: UserMinus },
      { to: '/assistant', label: 'Trợ lý AI', icon: Bot },
    ],
  },
  {
    label: 'Công việc quản lý',
    items: [
      { to: '/approvals', label: 'Phê duyệt', icon: CheckSquare, roles: ['manager', 'hr', 'accountant', 'director'] },
      { to: '/payroll', label: 'Kỳ lương', icon: Wallet, roles: ['hr', 'accountant', 'director'] },
      { to: '/proposals', label: 'Đề xuất tăng lương', icon: TrendingUp, roles: ['manager', 'hr', 'accountant', 'director'] },
      { to: '/onboarding', label: 'Tiếp nhận nhân viên mới', icon: UserPlus, roles: ['hr'] },
      { to: '/executive', label: 'Báo cáo điều hành', icon: BarChart3, roles: ['hr', 'director'] },
    ],
  },
  {
    label: 'Hệ thống',
    items: [
      { to: '/lineage', label: 'Nguồn gốc dữ liệu', icon: Network, roles: ['hr', 'director', 'sysadmin'] },
      { to: '/temp-access', label: 'Quyền tạm thời', icon: Key, roles: ['sysadmin', 'hr', 'accountant', 'director'] },
      { to: '/audit', label: 'Nhật ký kiểm toán', icon: ShieldCheck, roles: ['sysadmin', 'director', 'hr'] },
    ],
  },
]

export const ALL_NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items)
export const navLabel = (path: string) => ALL_NAV.find((i) => i.to === path)?.label
