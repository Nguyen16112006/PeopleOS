// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

import { useId } from 'react'
import { cn } from '@/lib/utils'

/**
 * Con dấu đỏ kiểu con dấu công ty, chỉ dùng cho việc đã hoàn tất (đã duyệt, đã chi).
 * Không dùng làm trang trí ở chỗ khác để con dấu giữ được ý nghĩa.
 */
export function Stamp({ label, date, ring = 'PHÒNG NHÂN SỰ ★ PEOPLEOS ★ PHIẾU LƯƠNG ★', size = 132, className }: {
  label: string
  date?: string
  ring?: string
  size?: number
  className?: string
}) {
  const id = useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 160 160" width={size} height={size} role="img" aria-label={`Con dấu: ${label}${date ? ` ngày ${date}` : ''}`}
      className={cn('po-stamp', className)} style={{ width: size, height: size, flex: '0 0 auto' }}>
      <defs><path id={`ring-${id}`} d="M80,80 m-60,0 a60,60 0 1,1 120,0 a60,60 0 1,1 -120,0" /></defs>
      <circle cx="80" cy="80" r="75" fill="none" stroke="currentColor" strokeWidth="4" />
      <circle cx="80" cy="80" r="48" fill="none" stroke="currentColor" strokeWidth="2" />
      <text fontSize="12" fontWeight="700" fill="currentColor" letterSpacing="1.5">
        <textPath href={`#ring-${id}`} textLength="370">{ring}</textPath>
      </text>
      <text x="80" y={date ? 78 : 86} textAnchor="middle" fontSize="16" fontWeight="800" fill="currentColor">{label.toUpperCase()}</text>
      {date && <text x="80" y="97" textAnchor="middle" fontSize="11" fontWeight="600" fill="currentColor">{date}</text>}
    </svg>
  )
}
