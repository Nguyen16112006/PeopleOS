// SPDX-License-Identifier: Apache-2.0
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { gql, WS_URL } from '@/lib/api'
import { getToken } from '@/lib/keycloak'
import { useToast } from './toast'

export interface Notice { id: string; title: string; message: string; ref_type: string | null; ref_id: string | null; is_read: boolean; created_at: string }
interface RT { notices: Notice[]; unread: number; tick: number; connected: boolean; markAllRead: () => Promise<void>; markRead: (id: string) => Promise<void> }
const Ctx = createContext<RT>({ notices: [], unread: 0, tick: 0, connected: false, markAllRead: async () => {}, markRead: async () => {} })
export const useRealtime = () => useContext(Ctx)

const Q = `query Notices { notifications(order_by: {created_at: desc}, limit: 30) { id title message ref_type ref_id is_read created_at } }`

/** Kết nối WebSocket (BFF <- NATS) để nhận thông báo realtime; mỗi sự kiện làm các trang tự tải lại dữ liệu (tick). */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([])
  const [tick, setTick] = useState(0)
  const [connected, setConnected] = useState(false)
  const { push } = useToast()
  const alive = useRef(true)

  useEffect(() => {
    gql<{ notifications: Notice[] }>(Q).then((d) => setNotices(d.notifications)).catch(() => {})
  }, [])

  useEffect(() => {
    alive.current = true
    let ws: WebSocket | null = null
    let timer: ReturnType<typeof setTimeout>
    let attempt = 0
    const connect = async () => {
      if (!alive.current) return
      ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(await getToken())}`)
      ws.onopen = () => { attempt = 0; setConnected(true) }
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data)
          if (msg.type === 'notification') {
            const n = msg.data as Notice
            setNotices((x) => [n, ...x.filter((i) => i.id !== n.id)].slice(0, 30))
            push({ title: n.title, message: n.message })
            setTick((t) => t + 1)
          }
        } catch { /* bỏ qua gói tin lạ */ }
      }
      ws.onclose = () => {
        setConnected(false)
        if (alive.current) timer = setTimeout(connect, Math.min(15000, 1000 * 2 ** attempt++))
      }
    }
    connect()
    return () => { alive.current = false; clearTimeout(timer); ws?.close() }
  }, [push])

  const markRead = useCallback(async (id: string) => {
    setNotices((x) => x.map((n) => (n.id === id ? { ...n, is_read: true } : n)))
    await gql(`mutation R($id: uuid!) { update_notifications_by_pk(pk_columns: {id: $id}, _set: {is_read: true}) { id } }`, { id }).catch(() => {})
  }, [])
  const markAllRead = useCallback(async () => {
    setNotices((x) => x.map((n) => ({ ...n, is_read: true })))
    await gql(`mutation RA { update_notifications(where: {is_read: {_eq: false}}, _set: {is_read: true}) { affected_rows } }`).catch(() => {})
  }, [])

  return <Ctx.Provider value={{ notices, unread: notices.filter((n) => !n.is_read).length, tick, connected, markAllRead, markRead }}>{children}</Ctx.Provider>
}
