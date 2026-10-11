import { useCallback, useEffect, useState } from 'react'
import { gql } from '@/lib/api'
import { useRealtime } from './realtime'

/** Tải dữ liệu GraphQL; tự tải lại khi có thông báo realtime hoặc khi gọi reload(). */
export function useQuery<T>(query: string, variables: Record<string, unknown> = {}, enabled = true) {
  const { tick } = useRealtime()
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const key = JSON.stringify(variables)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    gql<T>(query, JSON.parse(key))
      .then((d) => { if (!cancelled) { setData(d); setError(null) } })
      .catch((e) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [query, key, tick, version, enabled])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { data, loading, error, reload }
}
