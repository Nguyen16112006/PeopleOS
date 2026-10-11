import { useMemo, useState } from 'react'
import { ErrorBox, Loading, PageHeader } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useQuery } from '@/hooks/useQuery'

interface Asset { id: string; name: string; asset_type: string; system: string; layer: number; classification: string; owner: string; description: string }
interface Edge { id: number; source_id: string; target_id: string; transform: string }

const Q = `query Lineage {
  data_assets(order_by: {id: asc}) { id name asset_type system layer classification owner description }
  data_lineage(order_by: {id: asc}) { id source_id target_id transform }
}`

const TYPE_STYLE: Record<string, { label: string; fill: string; stroke: string }> = {
  source: { label: 'Nguồn', fill: '#dbeafe', stroke: '#3b82f6' },
  table: { label: 'Bảng', fill: '#e0e7ff', stroke: '#6366f1' },
  view: { label: 'View', fill: '#ede9fe', stroke: '#8b5cf6' },
  object_store: { label: 'Kho tệp', fill: '#cffafe', stroke: '#06b6d4' },
  vector_store: { label: 'Kho vector', fill: '#ccfbf1', stroke: '#14b8a6' },
  process: { label: 'Xử lý', fill: '#fef3c7', stroke: '#f59e0b' },
  output: { label: 'Đầu ra', fill: '#dcfce7', stroke: '#22c55e' },
}
const CLASS_LABEL: Record<string, { label: string; variant: 'secondary' | 'default' | 'warning' | 'destructive' }> = {
  public: { label: 'Công khai', variant: 'secondary' }, internal: { label: 'Nội bộ', variant: 'default' },
  confidential: { label: 'Mật', variant: 'warning' }, pii: { label: 'Dữ liệu cá nhân (PII)', variant: 'destructive' },
}

const W = 196, H = 56, GAP_X = 90, GAP_Y = 16, PAD = 20

/** Xếp cột theo đường đi dài nhất từ nguồn (đồ thị có hướng không chu trình) rồi sắp hàng theo trọng tâm các nút trước đó. */
function layout(assets: Asset[], edges: Edge[]) {
  const preds: Record<string, string[]> = {}
  assets.forEach((a) => (preds[a.id] = []))
  edges.forEach((e) => preds[e.target_id]?.push(e.source_id))
  const col: Record<string, number> = {}
  const colOf = (id: string, seen: Set<string> = new Set()): number => {
    if (col[id] !== undefined) return col[id]
    if (seen.has(id)) return 0
    seen.add(id)
    col[id] = preds[id].length ? Math.max(...preds[id].map((p) => colOf(p, seen))) + 1 : 0
    return col[id]
  }
  assets.forEach((a) => colOf(a.id))
  const maxCol = Math.max(0, ...Object.values(col))
  const rowOf: Record<string, number> = {}
  const pos: Record<string, { x: number; y: number }> = {}
  for (let c = 0; c <= maxCol; c++) {
    const nodes = assets.filter((a) => col[a.id] === c)
    const bary = (id: string) => (preds[id].length ? preds[id].reduce((s, p) => s + (rowOf[p] ?? 0), 0) / preds[id].length : 0)
    nodes.sort((a, b) => bary(a.id) - bary(b.id) || a.id.localeCompare(b.id))
    nodes.forEach((n, i) => { rowOf[n.id] = i; pos[n.id] = { x: PAD + c * (W + GAP_X), y: PAD + i * (H + GAP_Y) } })
  }
  const rows = Math.max(1, ...Object.values(col).map((c) => assets.filter((a) => col[a.id] === c).length))
  return { pos, width: PAD * 2 + (maxCol + 1) * W + maxCol * GAP_X, height: PAD * 2 + rows * (H + GAP_Y) }
}

function walk(start: string, edges: Edge[], dir: 'up' | 'down'): Set<string> {
  const seen = new Set<string>([start])
  const stack = [start]
  while (stack.length) {
    const cur = stack.pop()!
    edges.forEach((e) => {
      const [from, to] = dir === 'down' ? [e.source_id, e.target_id] : [e.target_id, e.source_id]
      if (from === cur && !seen.has(to)) { seen.add(to); stack.push(to) }
    })
  }
  return seen
}

export default function Lineage() {
  const { data, loading, error } = useQuery<{ data_assets: Asset[]; data_lineage: Edge[] }>(Q)
  const [selected, setSelected] = useState<string | null>(null)
  const assets = data?.data_assets ?? []
  const edges = data?.data_lineage ?? []
  const lay = useMemo(() => layout(assets, edges), [assets, edges])
  const byId = useMemo(() => Object.fromEntries(assets.map((a) => [a.id, a])), [assets])

  const up = useMemo(() => (selected ? walk(selected, edges, 'up') : null), [selected, edges])
  const down = useMemo(() => (selected ? walk(selected, edges, 'down') : null), [selected, edges])
  const active = (id: string) => !selected || up!.has(id) || down!.has(id)
  const edgeActive = (e: Edge) => !selected || ((up!.has(e.source_id) && up!.has(e.target_id)) || (down!.has(e.source_id) && down!.has(e.target_id)))

  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} />
  const sel = selected ? byId[selected] : null
  const piiTouched = selected ? [...up!, ...down!].filter((id) => byId[id]?.classification === 'pii' && id !== selected) : []

  return (
    <div>
      <PageHeader title="Phả hệ dữ liệu (Data lineage)" description="Dữ liệu đi từ đâu, qua xử lý nào, đến đâu. Bấm vào một nút để truy vết ngược (upstream) và xuôi (downstream)." />
      <div className="mb-3 flex flex-wrap gap-3 text-xs">
        {Object.entries(TYPE_STYLE).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border" style={{ background: v.fill, borderColor: v.stroke }} />{v.label}</span>
        ))}
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border-2 border-red-500" />Dữ liệu cá nhân (PII)</span>
        {selected && <button className="text-primary underline" onClick={() => setSelected(null)}>Bỏ chọn</button>}
      </div>
      <div className="grid gap-4 xl:grid-cols-4">
        <Card className="overflow-auto xl:col-span-3">
          <svg width={lay.width} height={lay.height} className="block">
            <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" /></marker></defs>
            {edges.map((e) => {
              const a = lay.pos[e.source_id], b = lay.pos[e.target_id]
              if (!a || !b) return null
              const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x, y2 = b.y + H / 2, mx = (x1 + x2) / 2
              return (
                <path key={e.id} d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`} fill="none"
                  stroke={selected && edgeActive(e) ? '#2563eb' : '#cbd5e1'} strokeWidth={selected && edgeActive(e) ? 2 : 1.2}
                  opacity={edgeActive(e) ? 1 : 0.12} markerEnd="url(#arrow)"><title>{e.transform}</title></path>
              )
            })}
            {assets.map((a) => {
              const p = lay.pos[a.id]; const st = TYPE_STYLE[a.asset_type]
              return (
                <g key={a.id} transform={`translate(${p.x},${p.y})`} opacity={active(a.id) ? 1 : 0.2} className="cursor-pointer" onClick={() => setSelected(a.id === selected ? null : a.id)}>
                  <rect width={W} height={H} rx={8} fill={st.fill} stroke={a.classification === 'pii' ? '#ef4444' : st.stroke} strokeWidth={a.id === selected ? 3 : a.classification === 'pii' ? 2 : 1.2} />
                  <text x={10} y={22} fontSize={12} fontWeight={600} fill="#0f172a">{a.name.length > 27 ? a.name.slice(0, 26) + '…' : a.name}</text>
                  <text x={10} y={41} fontSize={10.5} fill="#475569">{a.system}</text>
                </g>
              )
            })}
          </svg>
        </Card>
        <Card>
          <CardHeader><CardTitle>{sel ? sel.name : 'Chi tiết'}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!sel && <p className="text-muted-foreground">Chọn một nút trên sơ đồ để xem mô tả, phân loại dữ liệu và các nguồn/đích liên quan.</p>}
            {sel && <>
              <div className="flex flex-wrap gap-2">
                <Badge variant={CLASS_LABEL[sel.classification].variant}>{CLASS_LABEL[sel.classification].label}</Badge>
                <Badge variant="outline">{TYPE_STYLE[sel.asset_type].label}</Badge>
              </div>
              <p>{sel.description}</p>
              <p className="text-muted-foreground">Hệ thống: <b className="text-foreground">{sel.system}</b> · Chủ sở hữu: <b className="text-foreground">{sel.owner}</b></p>
              <div>
                <p className="mb-1 font-medium">Nguồn trực tiếp ({edges.filter((e) => e.target_id === sel.id).length})</p>
                {edges.filter((e) => e.target_id === sel.id).map((e) => <p key={e.id} className="text-xs"><button className="text-primary hover:underline" onClick={() => setSelected(e.source_id)}>{byId[e.source_id]?.name}</button> <span className="text-muted-foreground">- {e.transform}</span></p>)}
                {edges.every((e) => e.target_id !== sel.id) && <p className="text-xs text-muted-foreground">Không có (điểm khởi đầu)</p>}
              </div>
              <div>
                <p className="mb-1 font-medium">Đích trực tiếp ({edges.filter((e) => e.source_id === sel.id).length})</p>
                {edges.filter((e) => e.source_id === sel.id).map((e) => <p key={e.id} className="text-xs"><button className="text-primary hover:underline" onClick={() => setSelected(e.target_id)}>{byId[e.target_id]?.name}</button> <span className="text-muted-foreground">- {e.transform}</span></p>)}
                {edges.every((e) => e.source_id !== sel.id) && <p className="text-xs text-muted-foreground">Không có (điểm cuối)</p>}
              </div>
              <div className="rounded-md bg-slate-50 p-3 text-xs">
                <p>Ảnh hưởng ngược: <b>{up!.size - 1}</b> tài sản · Ảnh hưởng xuôi: <b>{down!.size - 1}</b> tài sản</p>
                {piiTouched.length > 0 && <p className="mt-1 text-red-700">Liên quan dữ liệu cá nhân: {piiTouched.map((id) => byId[id].name).join(', ')}</p>}
              </div>
            </>}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
