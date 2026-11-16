// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

import { Bell, LogOut, Menu, Moon, Search, SlidersHorizontal, Sun, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { useRealtime } from '@/hooks/realtime'
import { fmtDateTime, ROLE_LABEL } from '@/lib/format'
import { ALL_NAV, NAV_GROUPS, type NavItem } from '@/lib/nav'
import { usePrefs } from '@/lib/prefs'
import { cn } from '@/lib/utils'

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(-2).map((w) => w[0]?.toUpperCase() ?? '').join('') || 'P'

function NoticeDropdown({ onClose }: { onClose: () => void }) {
  const { notices, unread, markAllRead, markRead } = useRealtime()
  return (
    <div className="po-dropdown" role="dialog" aria-label="Thông báo">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-[15px] font-semibold">Thông báo</span>
        {unread > 0 && <button className="text-sm font-medium text-blue-600 hover:underline" onClick={markAllRead}>Đánh dấu tất cả đã đọc</button>}
      </div>
      <div className="max-h-96 overflow-auto">
        {notices.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">Bạn chưa có thông báo nào.</p>}
        {notices.map((n) => (
          <button key={n.id} onClick={() => { markRead(n.id); onClose() }}
            className={cn('flex w-full gap-3 border-b px-4 py-3 text-left last:border-0 hover:bg-slate-50')}>
            <span className={cn('mt-2 h-2 w-2 shrink-0 rounded-full', n.is_read ? 'bg-transparent' : 'bg-blue-600')} aria-hidden="true" />
            <span className="min-w-0">
              <span className={cn('block text-sm', !n.is_read && 'font-semibold')}>{n.title}</span>
              <span className="mt-0.5 block text-sm text-muted-foreground">{n.message}</span>
              <span className="mt-1 block text-xs text-slate-500">{fmtDateTime(n.created_at)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function CommandPalette({ items, onClose }: { items: NavItem[]; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const navigate = useNavigate()
  const list = useMemo(() => {
    // Tìm không dấu: "nghi phep" vẫn ra "Nghỉ phép"
    const plain = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase()
    const k = plain(q.trim())
    return k ? items.filter((i) => plain(i.label).includes(k)) : items
  }, [q, items])
  const go = (i?: NavItem) => { if (i) { navigate(i.to); onClose() } }
  return (
    <div className="po-modal-backdrop" onMouseDown={onClose}>
      <div className="po-modal" role="dialog" aria-modal="true" aria-label="Tìm chức năng" onMouseDown={(e) => e.stopPropagation()}>
        <input autoFocus value={q} placeholder="Bạn muốn mở trang nào?" aria-label="Tên chức năng"
          onChange={(e) => { setQ(e.target.value); setIdx(0) }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, list.length - 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)) }
            if (e.key === 'Enter') go(list[idx])
            if (e.key === 'Escape') onClose()
          }} />
        <div className="po-modal-list">
          {list.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Không có trang nào tên “{q}”.</p>}
          {list.map((i, n) => (
            <button key={i.to} className={cn('po-modal-item', n === idx && 'active')} onMouseEnter={() => setIdx(n)} onClick={() => go(i)}>
              <i.icon /> {i.label}
            </button>
          ))}
        </div>
        <p className="po-modal-hint">Dùng phím mũi tên để chọn, Enter để mở, Esc để đóng.</p>
      </div>
    </div>
  )
}

export default function Layout() {
  const { user, logout, hasRole } = useAuth()
  const { connected, unread } = useRealtime()
  const { prefs, setPrefs, recordVisit } = usePrefs()
  const dark = prefs.theme === 'dark' || (prefs.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const toggleTheme = () => setPrefs({ theme: dark ? 'light' : 'dark' })
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [noticeOpen, setNoticeOpen] = useState(false)
  const noticeRef = useRef<HTMLDivElement>(null)

  const groups = useMemo(
    () => NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((n) => !n.roles || hasRole(...n.roles)) })).filter((g) => g.items.length),
    [hasRole],
  )
  const allItems = useMemo(() => groups.flatMap((g) => g.items), [groups])
  const pinned = useMemo(
    () => prefs.pins.map((p) => ALL_NAV.find((i) => i.to === p)).filter((i): i is NavItem => !!i && allItems.includes(i)),
    [prefs.pins, allItems],
  )
  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)

  useEffect(() => { setSidebarOpen(false); setNoticeOpen(false); recordVisit(location.pathname) }, [location.pathname, recordVisit])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen((o) => !o) }
      if (e.key === 'Escape') { setSidebarOpen(false); setNoticeOpen(false) }
    }
    const onClick = (e: MouseEvent) => {
      if (noticeRef.current && !noticeRef.current.contains(e.target as Node)) setNoticeOpen(false)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick) }
  }, [])

  return (
    <div className="po-shell">
      <div className={cn('po-backdrop', sidebarOpen && 'show')} onClick={() => setSidebarOpen(false)} />
      <aside className={cn('po-sidebar', sidebarOpen && 'open')} aria-label="Menu chính">
        <div className="po-brand">
          <div className="po-brand-mark" aria-hidden="true">P</div>
          <strong>PeopleOS</strong>
          <button className="po-icon-btn po-sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Đóng menu"><X /></button>
        </div>

        <div className="po-nav">
          {pinned.length > 0 && (
            <div className="po-nav-group">
              <p className="po-nav-label">Đã ghim</p>
              <nav aria-label="Trang đã ghim">
                {pinned.map(({ to, label, icon: Icon, end }) => (
                  <NavLink key={to} to={to} end={end} className={({ isActive }) => cn('po-nav-link', isActive && 'active')}>
                    <Icon aria-hidden="true" /> {label}
                  </NavLink>
                ))}
              </nav>
            </div>
          )}
          {groups.map((g) => (
            <div className="po-nav-group" key={g.label}>
              <p className="po-nav-label">{g.label}</p>
              <nav aria-label={g.label}>
                {g.items.map(({ to, label, icon: Icon, end }) => (
                  <NavLink key={to} to={to} end={end} className={({ isActive }) => cn('po-nav-link', isActive && 'active')}>
                    <Icon aria-hidden="true" /> {label}
                  </NavLink>
                ))}
              </nav>
            </div>
          ))}
        </div>

        <NavLink to="/settings" className={({ isActive }) => cn('po-nav-link po-settings-link', isActive && 'active')}>
          <SlidersHorizontal aria-hidden="true" /> Tùy chỉnh giao diện
        </NavLink>
        <p className={cn('po-live', connected && 'on')}>
          <i aria-hidden="true" />{connected ? 'Đang cập nhật trực tiếp' : 'Đang kết nối lại…'}
        </p>
        <div className="po-account">
          <div className="po-avatar" aria-hidden="true">{initials(user.name)}</div>
          <div className="po-account-copy">
            <strong>{user.name}</strong>
            <span>{ROLE_LABEL[user.role] ?? user.role}</span>
          </div>
          <button className="po-logout" onClick={logout} aria-label="Đăng xuất" title="Đăng xuất"><LogOut /></button>
        </div>
      </aside>

      <div className="po-main">
        <header className="po-topbar">
          <button className="po-icon-btn po-menu-toggle" onClick={() => setSidebarOpen(true)} aria-label="Mở menu"><Menu /></button>
          <strong className="po-mobile-brand">PeopleOS</strong>
          <button className="po-search" onClick={() => setPaletteOpen(true)}>
            <Search aria-hidden="true" /><span>Tìm trang hoặc chức năng</span><kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
          </button>
          <div className="po-actions">
            <button className="po-icon-btn po-search-icon" onClick={() => setPaletteOpen(true)} aria-label="Tìm trang"><Search /></button>
            <div className="relative" ref={noticeRef}>
              <button className="po-icon-btn" onClick={() => setNoticeOpen((o) => !o)}
                aria-label={unread ? `Thông báo, ${unread} chưa đọc` : 'Thông báo'} aria-expanded={noticeOpen}>
                <Bell />{unread > 0 && <span className="po-badge">{unread > 9 ? '9+' : unread}</span>}
              </button>
              {noticeOpen && <NoticeDropdown onClose={() => setNoticeOpen(false)} />}
            </div>
            <button className="po-icon-btn" onClick={toggleTheme} aria-label={dark ? 'Chuyển sang nền sáng' : 'Chuyển sang nền tối'}
              title={dark ? 'Nền sáng' : 'Nền tối'}>{dark ? <Sun /> : <Moon />}</button>
          </div>
        </header>

        <main className="po-content"><Outlet /></main>
      </div>

      {paletteOpen && <CommandPalette items={[...allItems, { to: '/settings', label: 'Tùy chỉnh giao diện', icon: SlidersHorizontal }]} onClose={() => setPaletteOpen(false)} />}
    </div>
  )
}
