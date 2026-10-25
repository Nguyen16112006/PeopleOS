// SPDX-License-Identifier: Apache-2.0
import { BarChart3, Bell, Bot, Briefcase, CalendarDays, CheckSquare, FileText, HeartPulse, Key, Landmark, LayoutDashboard, LogOut, Network, Receipt, ShieldCheck, Target, TrendingUp, UserCircle, UserMinus, UserPlus, Wallet, Wifi, WifiOff } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { useRealtime } from '@/hooks/realtime'
import { fmtDateTime, ROLE_LABEL } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge } from './ui/badge'
import { Button } from './ui/button'

const NAV = [
  { to: '/', label: 'Tổng quan', icon: LayoutDashboard, end: true },
  { to: '/profile', label: 'Hồ sơ cá nhân', icon: UserCircle },
  { to: '/contracts', label: 'Hợp đồng lao động', icon: FileText },
  { to: '/payslips', label: 'Bảng lương', icon: Wallet },
  { to: '/insurance', label: 'BHXH / BHYT', icon: HeartPulse },
  { to: '/leave', label: 'Nghỉ phép', icon: CalendarDays },
  { to: '/tax-year', label: 'Thuế và báo cáo năm', icon: Landmark },
  { to: '/kpi', label: 'Đánh giá KPI', icon: Target },
  { to: '/offboarding', label: 'Nghỉ việc', icon: UserMinus },
  { to: '/payroll', label: 'Kỳ lương', icon: Wallet, roles: ['hr', 'accountant', 'director'] },
  { to: '/advances', label: 'Tạm ứng và chi phí', icon: Receipt },
  { to: '/approvals', label: 'Phê duyệt', icon: CheckSquare, roles: ['manager', 'hr', 'accountant', 'director'] },
  { to: '/proposals', label: 'Đề xuất tăng lương', icon: TrendingUp, roles: ['manager', 'hr', 'accountant', 'director'] },
  { to: '/onboarding', label: 'Onboarding', icon: UserPlus, roles: ['hr'] },
  { to: '/assistant', label: 'Trợ lý AI', icon: Bot },
  { to: '/executive', label: 'Dashboard điều hành', icon: BarChart3, roles: ['hr', 'director'] },
  { to: '/lineage', label: 'Phả hệ dữ liệu', icon: Network, roles: ['hr', 'director', 'sysadmin'] },
  { to: '/temp-access', label: 'Quyền tạm thời', icon: Key, roles: ['sysadmin', 'hr', 'accountant', 'director'] },
  { to: '/audit', label: 'Kiểm toán', icon: ShieldCheck, roles: ['sysadmin', 'director', 'hr'] },
]

function Bell_() {
  const { notices, unread, markAllRead, markRead } = useRealtime()
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <Button variant="ghost" size="icon" onClick={() => setOpen((o) => !o)} aria-label="Thông báo">
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">{unread}</span>
        )}
      </Button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-96 rounded-lg border bg-white shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <span className="text-sm font-semibold">Thông báo</span>
            <button className="text-xs text-primary hover:underline" onClick={markAllRead}>Đánh dấu đã đọc</button>
          </div>
          <div className="max-h-96 overflow-auto">
            {notices.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Chưa có thông báo</p>}
            {notices.map((n) => (
              <button key={n.id} onClick={() => markRead(n.id)} className={cn('block w-full border-b px-4 py-3 text-left last:border-0 hover:bg-slate-50', !n.is_read && 'bg-blue-50/60')}>
                <p className="text-sm font-medium">{n.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{n.message}</p>
                <p className="mt-1 text-[11px] text-slate-400">{fmtDateTime(n.created_at)}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Layout() {
  const { user, logout, hasRole } = useAuth()
  const { connected } = useRealtime()
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-white md:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <Briefcase className="h-6 w-6 text-primary" />
          <div>
            <p className="font-semibold leading-none">PeopleOS</p>
            <p className="text-[11px] text-muted-foreground">People Workspace</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.filter((n) => !n.roles || hasRole(...n.roles)).map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => cn('flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100',
                isActive && 'bg-primary/10 text-primary')}>
              <Icon className="h-4 w-4" /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t p-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            {connected ? <Wifi className="h-3.5 w-3.5 text-emerald-500" /> : <WifiOff className="h-3.5 w-3.5 text-amber-500" />}
            Realtime: {connected ? 'đã kết nối' : 'đang kết nối…'}
          </span>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-3 border-b bg-white px-6 py-3">
          <Bell_ />
          <div className="text-right leading-tight">
            <p className="text-sm font-medium">{user.name}</p>
            <Badge variant="secondary" className="mt-0.5">{ROLE_LABEL[user.role]}</Badge>
          </div>
          <Button variant="outline" size="sm" onClick={logout}><LogOut className="h-4 w-4" /> Đăng xuất</Button>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-6"><Outlet /></main>
      </div>
    </div>
  )
}
