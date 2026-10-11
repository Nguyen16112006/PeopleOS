import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface Me { employee: { id: string; full_name: string; manager: { full_name: string } | null } | null }

/** Thông tin bổ sung từ BFF (/api/me): tên quản lý trực tiếp mà quyền hàng của Hasura không cho nhân viên đọc. */
export function useMe() {
  const [me, setMe] = useState<Me | null>(null)
  useEffect(() => { api<Me>('/api/me').then(setMe).catch(() => setMe(null)) }, [])
  return me
}
