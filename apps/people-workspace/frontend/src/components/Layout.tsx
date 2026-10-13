import {
  BarChart3,
  Bell,
  Briefcase,
  Building2,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  FileText,
  Home,
  LogOut,
  Network,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  User,
  UserPlus,
  Wallet,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { useRealtime } from '@/hooks/realtime'
import { fmtDateTime, ROLE_LABEL } from '@/lib/format'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/', label: 'Tổng quan', icon: Home, end: true },
  { to: '/profile', label: 'Hồ sơ cá nhân', icon: User },
  { to: '/contracts', label: 'Hợp đồng lao động', icon: FileText },
  { to: '/payslips', label: 'Bảng lương', icon: Wallet },
  { to: '/insurance', label: 'BHXH / BHYT', icon: ShieldCheck },
  { to: '/leave', label: 'Nghỉ phép', icon: CalendarDays },
  { to: '/approvals', label: 'Phê duyệt', icon: CheckSquare, roles: ['manager', 'hr', 'admin'] },
  { to: '/proposals', label: 'Đề xuất tăng lương', icon: TrendingUp, roles: ['manager', 'hr', 'admin'] },
  { to: '/onboarding', label: 'Onboarding', icon: UserPlus, roles: ['hr', 'admin'] },
  { to: '/assistant', label: 'Trợ lý AI', icon: Sparkles },
  { to: '/executive', label: 'Dashboard điều hành', icon: BarChart3, roles: ['hr', 'admin'] },
  { to: '/lineage', label: 'Phả hệ dữ liệu', icon: Network, roles: ['hr', 'admin'] },
  { to: '/audit', label: 'Kiểm toán', icon: ShieldCheck, roles: ['admin'] },
]

function Bell_() {
  const { notices, unread, markAllRead, markRead } = useRealtime()
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Thông báo"
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-700 hover:bg-slate-200/60 transition-colors"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-96 rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="text-sm font-semibold text-slate-800">Thông báo</span>
            <button className="text-xs font-medium text-blue-600 hover:underline" onClick={markAllRead}>
              Đánh dấu đã đọc
            </button>
          </div>
          <div className="max-h-96 overflow-auto">
            {notices.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Chưa có thông báo</p>}
            {notices.map((n) => (
              <button
                key={n.id}
                onClick={() => markRead(n.id)}
                className={cn(
                  'block w-full border-b px-4 py-3 text-left last:border-0 hover:bg-slate-50 transition-colors',
                  !n.is_read && 'bg-blue-50/70'
                )}
              >
                <p className="text-sm font-medium text-slate-800">{n.title}</p>
                <p className="mt-0.5 text-xs text-slate-500">{n.message}</p>
                <p className="mt-1 text-[11px] text-slate-400">{fmtDateTime(n.created_at)}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function UserAvatar({ name }: { name?: string }) {
  const initial = (name?.trim() ? name.trim().charAt(0) : 'U').toUpperCase()
  return (
    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-bold border border-blue-200 shadow-sm">
      <span className="text-sm font-semibold">{initial}</span>
    </div>
  )
}

export default function Layout() {
  const { user, logout, hasRole } = useAuth()
  const { connected } = useRealtime()

  return (
    <div className="flex min-h-screen bg-[#F4F7FC]">
      {/* Sidebar */}
      <aside className="relative hidden w-64 shrink-0 flex-col bg-[#071739] text-white md:flex overflow-hidden">
        {/* Logo / Brand */}
        <div className="flex items-center gap-3 px-6 py-6 z-10">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#2563EB] shadow-md text-white">
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
              {/* Stylized PeopleOS 3-person silhouette */}
              <circle cx="12" cy="7" r="3" />
              <path d="M7 19v-2a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v2" />
              <circle cx="5" cy="9" r="2.2" opacity="0.8" />
              <path d="M1.5 19v-1.5a3 3 0 0 1 3-3H6" opacity="0.8" />
              <circle cx="19" cy="9" r="2.2" opacity="0.8" />
              <path d="M18 14.5h1.5a3 3 0 0 1 3 3V19" opacity="0.8" />
            </svg>
          </div>
          <div>
            <p className="text-base font-bold leading-tight tracking-tight text-white">PeopleOS</p>
            <p className="text-[11px] font-medium text-slate-400">People Workspace</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1.5 px-3 py-2 z-10 overflow-y-auto">
          {NAV.filter((n) => !n.roles || hasRole(...n.roles)).map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3.5 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-150',
                  isActive
                    ? 'bg-[#1D68F2] text-white shadow-sm font-semibold'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                )
              }
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Abstract decorative wave circles at bottom */}
        <div className="pointer-events-none absolute -bottom-12 -left-12 h-64 w-64 overflow-hidden opacity-25">
          <div className="absolute h-64 w-64 rounded-full border-[28px] border-blue-500/20" />
          <div className="absolute -bottom-8 -left-8 h-48 w-48 rounded-full border-[18px] border-blue-400/30" />
        </div>

        {/* Realtime Status Footer */}
        <div className="relative z-10 border-t border-slate-800/80 px-6 py-4 text-xs">
          <span className="flex items-center gap-2">
            {connected ? (
              <Wifi className="h-4 w-4 text-emerald-400" />
            ) : (
              <WifiOff className="h-4 w-4 text-amber-400" />
            )}
            <span className="text-slate-400">
              Realtime:{' '}
              <span className={connected ? 'font-medium text-emerald-400' : 'font-medium text-amber-400'}>
                {connected ? 'Đã kết nối' : 'Đang kết nối…'}
              </span>
            </span>
          </span>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex items-center justify-end gap-5 px-8 pt-2.5 pb-1">
          <Bell_ />

          {/* User profile widget */}
          <div className="flex items-center gap-2.5 cursor-pointer select-none">
            <UserAvatar name={user.name} />
            <div className="text-left leading-tight">
              <div className="flex items-center gap-1">
                <span className="text-sm font-semibold text-slate-800">{user.name}</span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
              </div>
              <span className="text-xs font-medium text-slate-500">
                {ROLE_LABEL[user.role] ?? user.role}
              </span>
            </div>
          </div>

          {/* Logout button */}
          <button
            onClick={logout}
            className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900 transition-colors"
          >
            <LogOut className="h-4 w-4 text-slate-600" />
            <span>Đăng xuất</span>
          </button>
        </header>

        {/* Page Content */}
        <main className="mx-auto w-full max-w-7xl flex-1 px-8 pt-0 pb-12">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
