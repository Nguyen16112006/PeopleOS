// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

import { useAuth } from '@/auth/AuthProvider'
import { PageHeader } from '@/components/common'
import { ALL_NAV } from '@/lib/nav'
import { callName, DEFAULT_PINS, usePrefs, type Density, type Prefs, type Salutation, type TextSize, type Theme } from '@/lib/prefs'
import { cn } from '@/lib/utils'

function Choice<T extends string>({ label, value, options, onChange }: {
  label: string
  value: T
  options: { key: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="po-choices">
      {options.map((o) => (
        <button key={o.key} type="button" role="radio" aria-checked={value === o.key}
          className={cn('po-chip', value === o.key && 'selected')} onClick={() => onChange(o.key)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export default function Settings() {
  const { user, hasRole } = useAuth()
  const { prefs, setPrefs, reset, togglePin } = usePrefs()
  const set = <K extends keyof Prefs>(k: K) => (v: Prefs[K]) => setPrefs({ [k]: v } as Partial<Prefs>)
  const suggested = DEFAULT_PINS[user.role] ?? DEFAULT_PINS.employee
  const pages = ALL_NAV.filter((i) => i.to !== '/' && (!i.roles || hasRole(...i.roles)))

  return (
    <div className="po-settings">
      <PageHeader title="Tùy chỉnh giao diện"
        description="Thay đổi được áp dụng ngay và chỉ cho tài khoản của bạn trên trình duyệt này. Người khác trong công ty không bị ảnh hưởng." />

      <section className="po-panel po-settings-block">
        <h2>Cách gọi bạn trên màn hình</h2>
        <p>Dùng trong lời chào ở trang Tổng quan.</p>
        <Choice<Salutation> label="Cách gọi" value={prefs.salutation} onChange={set('salutation')} options={[
          { key: 'ten', label: callName(user.name, 'ten') },
          { key: 'anh', label: callName(user.name, 'anh') },
          { key: 'chi', label: callName(user.name, 'chi') },
          { key: 'full', label: callName(user.name, 'full') },
        ]} />
      </section>

      <section className="po-panel po-settings-block po-settings-row">
        <div>
          <h2>Cỡ chữ</h2>
          <Choice<TextSize> label="Cỡ chữ" value={prefs.size} onChange={set('size')}
            options={[{ key: 'md', label: 'Vừa' }, { key: 'lg', label: 'Lớn' }, { key: 'xl', label: 'Rất lớn' }]} />
        </div>
        <div>
          <h2>Khoảng cách</h2>
          <Choice<Density> label="Khoảng cách" value={prefs.density} onChange={set('density')}
            options={[{ key: 'comfy', label: 'Thoáng' }, { key: 'compact', label: 'Gọn' }]} />
        </div>
        <div>
          <h2>Nền</h2>
          <Choice<Theme> label="Nền" value={prefs.theme} onChange={set('theme')}
            options={[{ key: 'light', label: 'Sáng' }, { key: 'dark', label: 'Tối' }, { key: 'system', label: 'Theo máy' }]} />
        </div>
      </section>

      <section className="po-panel po-settings-block">
        <h2>Trang ghim lên đầu menu</h2>
        <p>Chọn những trang bạn mở nhiều nhất. Các trang có ghi "Gợi ý" là gợi ý cho vai trò của bạn.</p>
        <ul className="po-pin-list">
          {pages.map((i) => (
            <li key={i.to}>
              <label>
                <input type="checkbox" checked={prefs.pins.includes(i.to)} onChange={() => togglePin(i.to)} />
                <i.icon aria-hidden="true" />
                <span>{i.label}</span>
                {suggested.includes(i.to) && <small>Gợi ý</small>}
              </label>
            </li>
          ))}
        </ul>
      </section>

      <div className="po-settings-actions">
        <button type="button" className="po-btn po-btn-secondary" onClick={reset}>Đặt lại như ban đầu</button>
      </div>
    </div>
  )
}
