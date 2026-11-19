import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { actions } from '../store'
import { addChild, canMove, insertAfter, locate, move, newTask, remove, setDone, type DropPos } from '../tree'
import type { Mutate, Project, Task } from '../types'

const ROOT = '__root__'
const H = 38
const VGAP = 14
const HGAP = 64
/** Góc màu HSL cho từng nhánh cấp 1; nhánh con dùng lại màu của nhánh cha. */
const HUES = [215, 265, 150, 42, 325, 4, 185, 95]
/** Bán kính tìm vị trí thả gần nhất khi con trỏ không nằm trên nút nào (toạ độ canvas). */
const SNAP = 260
const FONT = '14px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
const ROOT_FONT = '600 15px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

/** Hướng nhánh mọc ra từ nút gốc: 1 = sang phải, -1 = sang trái. */
type Dir = 1 | -1

interface LNode {
  id: string
  title: string
  task: Task | null
  x: number
  y: number
  w: number
  /** Chiều cao cả nhánh (gồm các nút con). */
  sh: number
  dir: Dir
  /** Góc màu của nhánh; null ở nút gốc. */
  hue: number | null
  depth: number
  kids: LNode[]
}

let ctx2d: CanvasRenderingContext2D | null = null
function textWidth(text: string, font: string): number {
  ctx2d ??= document.createElement('canvas').getContext('2d')
  if (!ctx2d) return text.length * 8
  ctx2d.font = font
  return ctx2d.measureText(text).width
}

const stackHeight = (list: LNode[]) => list.reduce((s, k) => s + k.sh, 0) + VGAP * Math.max(0, list.length - 1)

/**
 * Chia các nhánh cấp 1 sang hai bên nút gốc: nhánh đã được ghim (`task.side`) giữ nguyên bên,
 * các nhánh còn lại cắt thành hai đoạn liền nhau sao cho hai bên cân chiều cao nhất.
 */
function splitSides(kids: LNode[]): Map<string, Dir> {
  const sides = new Map<string, Dir>()
  const free: LNode[] = []
  const pinned = { 1: [] as LNode[], [-1]: [] as LNode[] }
  for (const k of kids) {
    const s = k.task?.side
    if (s === 'R') {
      sides.set(k.id, 1)
      pinned[1].push(k)
    } else if (s === 'L') {
      sides.set(k.id, -1)
      pinned[-1].push(k)
    } else {
      free.push(k)
    }
  }
  let cut = 0
  let bestDiff = Infinity
  for (let i = 0; i <= free.length; i++) {
    const diff = Math.abs(
      stackHeight([...pinned[1], ...free.slice(0, i)]) - stackHeight([...pinned[-1], ...free.slice(i)]),
    )
    if (diff < bestDiff) {
      bestDiff = diff
      cut = i
    }
  }
  free.forEach((k, i) => sides.set(k.id, i < cut ? 1 : -1))
  return sides
}

/**
 * Màu của từng nhánh cấp 1: nhánh đã chọn màu (`task.color`) giữ nguyên, các nhánh còn lại
 * lấy lần lượt những màu chưa dùng.
 */
function branchHues(tasks: Task[]): number[] {
  const out = tasks.map((t) => (typeof t.color === 'number' ? ((t.color % HUES.length) + HUES.length) % HUES.length : -1))
  const used = new Set(out.filter((c) => c >= 0))
  let next = 0
  for (let i = 0; i < out.length; i++) {
    if (out[i] >= 0) continue
    while (used.has(next) && used.size < HUES.length) next = (next + 1) % HUES.length
    out[i] = next
    used.add(next)
    next = (next + 1) % HUES.length
  }
  return out.map((c) => HUES[c])
}

function layout(project: Project): { nodes: LNode[]; root: LNode } {
  const make = (t: Task): LNode => {
    const text = t.title || 'Công việc…'
    const w = Math.min(320, Math.max(96, textWidth(text, FONT) + 58 + (t.notes ? 20 : 0)))
    return {
      id: t.id,
      title: t.title,
      task: t,
      x: 0,
      y: 0,
      w,
      sh: H,
      dir: 1,
      hue: null,
      depth: 0,
      kids: t.collapsed ? [] : t.children.map(make),
    }
  }
  const rootText = `${project.icon} ${project.title || 'Chưa đặt tên'}`
  const root: LNode = {
    id: ROOT,
    title: rootText,
    task: null,
    x: 0,
    y: 0,
    w: Math.min(360, textWidth(rootText, ROOT_FONT) + 36),
    sh: H,
    dir: 1,
    hue: null,
    depth: 0,
    kids: project.tasks.map(make),
  }

  const kidsHeight = (n: LNode) => stackHeight(n.kids)
  const measure = (n: LNode) => {
    n.kids.forEach(measure)
    n.sh = Math.max(H, kidsHeight(n))
  }
  root.kids.forEach(measure)

  const sides = splitSides(root.kids)
  const right = root.kids.filter((k) => sides.get(k.id) === 1)
  const left = root.kids.filter((k) => sides.get(k.id) === -1)

  const hues = new Map<string, number>()
  branchHues(project.tasks).forEach((h, i) => hues.set(project.tasks[i].id, h))

  const nodes: LNode[] = []
  const place = (n: LNode, x: number, top: number, dir: Dir, hue: number, depth: number) => {
    n.dir = dir
    n.x = x
    n.y = top + n.sh / 2 - H / 2
    n.hue = hue
    n.depth = depth
    nodes.push(n)
    let cy = top + (n.sh - kidsHeight(n)) / 2
    for (const k of n.kids) {
      place(k, dir > 0 ? x + n.w + HGAP : x - HGAP - k.w, cy, dir, hue, depth + 1)
      cy += k.sh + VGAP
    }
  }

  const hr = stackHeight(right)
  const hl = stackHeight(left)
  root.sh = Math.max(H, hr, hl)
  root.x = 0
  root.y = -H / 2
  nodes.push(root)
  let cy = -hr / 2
  for (const k of right) {
    place(k, root.w + HGAP, cy, 1, hues.get(k.id) ?? HUES[0], 1)
    cy += k.sh + VGAP
  }
  cy = -hl / 2
  for (const k of left) {
    place(k, -HGAP - k.w, cy, -1, hues.get(k.id) ?? HUES[0], 1)
    cy += k.sh + VGAP
  }
  return { nodes, root }
}

interface Drop {
  target: string
  pos: DropPos
  dir: Dir
}

interface Dnd {
  id: string
  title: string
  /** Vị trí con trỏ theo toạ độ canvas. */
  x: number
  y: number
  target: string | null
  pos: DropPos
  dir: Dir
}

function subtreeIds(n: LNode, out = new Set<string>()): Set<string> {
  out.add(n.id)
  n.kids.forEach((k) => subtreeIds(k, out))
  return out
}

/** Điểm neo của chỗ thả "làm nhánh con của n", nằm giữa n và hàng con của nó. */
const childAnchor = (n: LNode, dir: Dir) => ({
  x: dir > 0 ? n.x + n.w + HGAP / 2 : n.x - HGAP / 2,
  y: n.y + H / 2,
})

/**
 * Tìm chỗ thả tại toạ độ canvas (x, y): ưu tiên nút đang trỏ vào, nếu con trỏ ở khoảng trống
 * thì lấy chỗ thả gần nhất trong bán kính SNAP. Bỏ qua các nút trong `skip`.
 */
function dropAt(nodes: LNode[], skip: Set<string>, x: number, y: number): Drop | null {
  for (const n of nodes) {
    if (skip.has(n.id)) continue
    const isRoot = n.id === ROOT
    const padIn = 12
    const padOut = HGAP / 2
    if (x < n.x - (isRoot || n.dir < 0 ? padOut : padIn)) continue
    if (x > n.x + n.w + (isRoot || n.dir > 0 ? padOut : padIn)) continue
    if (y < n.y - VGAP / 2 || y > n.y + H + VGAP / 2) continue
    if (isRoot) return { target: ROOT, pos: 'child', dir: x < n.x + n.w / 2 ? -1 : 1 }
    const edge = H * 0.3
    if (y < n.y + edge) return { target: n.id, pos: 'before', dir: n.dir }
    if (y > n.y + H - edge) return { target: n.id, pos: 'after', dir: n.dir }
    return { target: n.id, pos: 'child', dir: n.dir }
  }

  let best: Drop | null = null
  let bestD = SNAP * SNAP
  const consider = (d: Drop, ax: number, ay: number) => {
    const dist = (ax - x) ** 2 + (ay - y) ** 2
    if (dist < bestD) {
      bestD = dist
      best = d
    }
  }
  for (const n of nodes) {
    if (skip.has(n.id)) continue
    if (n.id === ROOT) {
      for (const dir of [1, -1] as Dir[]) {
        const a = childAnchor(n, dir)
        consider({ target: ROOT, pos: 'child', dir }, a.x, a.y)
      }
      continue
    }
    const a = childAnchor(n, n.dir)
    consider({ target: n.id, pos: 'child', dir: n.dir }, a.x, a.y)
    consider({ target: n.id, pos: 'before', dir: n.dir }, n.x + n.w / 2, n.y - VGAP / 2)
    consider({ target: n.id, pos: 'after', dir: n.dir }, n.x + n.w / 2, n.y + H + VGAP / 2)
  }
  return best
}

interface Props {
  project: Project
  mutate: Mutate
  onOpenDetail: (id: string) => void
}

export default function MindMap({ project, mutate, onOpenDetail }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ x: 60, y: 60, k: 1 })
  const [selected, setSelected] = useState<string>(ROOT)
  const [editing, setEditing] = useState<string | null>(null)
  const pan = useRef<{ px: number; py: number; x: number; y: number } | null>(null)

  const { nodes, root } = useMemo(() => layout(project), [project])
  const dirOf = (id: string): Dir => nodes.find((n) => n.id === id)?.dir ?? 1

  // --- Kéo-thả nút ---
  const [dnd, setDnd] = useState<Dnd | null>(null)
  const live = useRef({ view, nodes, project })
  live.current = { view, nodes, project }
  const cleanupDrag = useRef<(() => void) | null>(null)
  useEffect(() => () => cleanupDrag.current?.(), [])

  const startNodeDrag = (e: ReactPointerEvent, n: LNode) => {
    if (e.button !== 0 || !n.task || editing === n.id) return
    if ((e.target as HTMLElement).closest('input, button')) return
    const id = n.id
    const title = n.task.title || 'Công việc…'
    const sx = e.clientX
    const sy = e.clientY
    let active = false
    let cur: Dnd | null = null
    let skip = new Set<string>()

    const onMove = (ev: PointerEvent) => {
      const el = wrap.current
      if (!el) return
      if (!active) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return
        active = true
        const self = live.current.nodes.find((x) => x.id === id)
        skip = self ? subtreeIds(self) : new Set([id])
        setSelected(id)
      }
      const { view: v, nodes: ns, project: p } = live.current
      const r = el.getBoundingClientRect()
      const x = (ev.clientX - r.left - v.x) / v.k
      const y = (ev.clientY - r.top - v.y) / v.k
      const hit = dropAt(ns, skip, x, y)
      const ok = hit && canMove(p.tasks, id, hit.target === ROOT ? null : hit.target)
      cur = {
        id,
        title,
        x,
        y,
        target: ok ? hit.target : null,
        pos: ok ? hit.pos : 'child',
        dir: ok ? hit.dir : 1,
      }
      setDnd(cur)
    }
    const finish = (commit: boolean) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey, true)
      cleanupDrag.current = null
      if (commit && cur?.target) {
        const { target, pos, dir } = cur
        mutate((ts) => {
          move(ts, id, target === ROOT ? null : target, pos)
          const l = locate(ts, id)
          if (!l) return
          // Ở cấp gốc thì ghim bên vừa thả; thành nhánh con thì bên do nhánh cha quyết định.
          if (l.parent) delete l.task.side
          else l.task.side = dir > 0 ? 'R' : 'L'
        })
      }
      setDnd(null)
    }
    const onUp = () => finish(true)
    const onCancel = () => finish(false)
    const onKey = (ev: globalThis.KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.stopPropagation()
        finish(false)
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey, true)
    cleanupDrag.current = () => finish(false)
  }

  const dragSkip = useMemo(() => {
    if (!dnd) return null
    const self = nodes.find((n) => n.id === dnd.id)
    return self ? subtreeIds(self) : null
  }, [dnd, nodes])
  const dropNode = dnd?.target ? nodes.find((n) => n.id === dnd.target) : undefined

  const fit = useCallback(() => {
    const el = wrap.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const minX = Math.min(...nodes.map((n) => n.x))
    const maxX = Math.max(...nodes.map((n) => n.x + n.w))
    const minY = Math.min(...nodes.map((n) => n.y))
    const maxY = Math.max(...nodes.map((n) => n.y + H))
    const bw = maxX - minX
    const bh = maxY - minY
    const k = Math.max(0.3, Math.min(1, (width - 96) / bw, (height - 120) / bh))
    setView({ k, x: (width - bw * k) / 2 - minX * k, y: (height - bh * k) / 2 - minY * k })
  }, [nodes])

  // Căn vừa khung một lần khi mở mindmap.
  const fitted = useRef(false)
  useLayoutEffect(() => {
    if (!fitted.current) {
      fitted.current = true
      fit()
    }
  }, [fit])

  // Zoom bằng con lăn quanh vị trí con trỏ (cần listener non-passive để preventDefault).
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const mx = e.clientX - r.left
      const my = e.clientY - r.top
      setView((v) => {
        const k = Math.max(0.25, Math.min(2, v.k * Math.exp(-e.deltaY * 0.0015)))
        return { k, x: mx - ((mx - v.x) * k) / v.k, y: my - ((my - v.y) * k) / v.k }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const zoom = (f: number) =>
    setView((v) => {
      const el = wrap.current
      if (!el) return v
      const r = el.getBoundingClientRect()
      const k = Math.max(0.25, Math.min(2, v.k * f))
      const mx = r.width / 2
      const my = r.height / 2
      return { k, x: mx - ((mx - v.x) * k) / v.k, y: my - ((my - v.y) * k) / v.k }
    })

  const startEdit = (id: string) => {
    if (id !== ROOT) setEditing(id)
  }
  const stopEdit = () => {
    setEditing(null)
    wrap.current?.focus()
  }

  const update = (id: string, fn: (t: Task) => void) =>
    mutate((ts) => {
      const l = locate(ts, id)
      if (l) fn(l.task)
    })

  const addChildOf = (parentId: string) => {
    const t = newTask()
    mutate((ts) => addChild(ts, parentId === ROOT ? null : parentId, t))
    setSelected(t.id)
    setEditing(t.id)
  }
  const addSiblingOf = (id: string) => {
    if (id === ROOT) return addChildOf(ROOT)
    const t = newTask()
    mutate((ts) => insertAfter(ts, id, t))
    setSelected(t.id)
    setEditing(t.id)
  }
  const removeNode = (id: string) => {
    if (id === ROOT) return
    const loc = locate(project.tasks, id)
    if (!loc) return
    const next = loc.list[loc.index + 1] ?? loc.list[loc.index - 1] ?? loc.parent
    mutate((ts) => remove(ts, id))
    setSelected(next?.id ?? ROOT)
    setEditing(null)
  }
  /** Chuyển một nhánh cấp 1 sang bên kia nút gốc. */
  const flipSide = (id: string) => {
    const d = dirOf(id)
    update(id, (t) => (t.side = d > 0 ? 'L' : 'R'))
  }

  const rootLevel = selected !== ROOT && project.tasks.some((t) => t.id === selected)
  const [palette, setPalette] = useState(false)
  const pickedColor = project.tasks.find((t) => t.id === selected)?.color

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return
    const loc = selected === ROOT ? null : locate(project.tasks, selected)
    const go = (id: string | undefined) => id && setSelected(id)
    switch (e.key) {
      case 'Tab':
        e.preventDefault()
        addChildOf(selected)
        break
      case 'Enter':
        e.preventDefault()
        addSiblingOf(selected)
        break
      case 'Delete':
      case 'Backspace':
        e.preventDefault()
        removeNode(selected)
        break
      case 'F2':
        e.preventDefault()
        startEdit(selected)
        break
      case ' ':
        e.preventDefault()
        if (loc) update(selected, (t) => setDone(t, !t.done))
        break
      case 'ArrowLeft':
      case 'ArrowRight': {
        e.preventDefault()
        const toRight = e.key === 'ArrowRight'
        if (!loc) {
          // Từ nút gốc: sang bên nào thì chọn nhánh đầu tiên của bên đó.
          go(root.kids.find((k) => k.dir === (toRight ? 1 : -1))?.id)
        } else if (toRight === dirOf(selected) > 0) {
          if (loc.task.collapsed) update(selected, (t) => (t.collapsed = false))
          else go(loc.task.children[0]?.id)
        } else {
          setSelected(loc.parent?.id ?? ROOT)
        }
        break
      }
      case 'ArrowUp':
        e.preventDefault()
        if (loc) go(loc.list[loc.index - 1]?.id)
        break
      case 'ArrowDown':
        e.preventDefault()
        if (loc) go(loc.list[loc.index + 1]?.id)
        break
    }
  }

  const selectedIsTask = selected !== ROOT && !!locate(project.tasks, selected)

  return (
    <div
      ref={wrap}
      className={'mindmap' + (dnd ? ' is-dragging' : '')}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('.mm-node, .mm-toolbar, .mm-zoom, .mm-palette')) return
        pan.current = { px: e.clientX, py: e.clientY, x: view.x, y: view.y }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        const d = pan.current
        if (d) setView((v) => ({ ...v, x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py }))
      }}
      onPointerUp={() => (pan.current = null)}
      onPointerCancel={() => (pan.current = null)}
    >
      <div className="mm-canvas" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
        <svg className="mm-edges">
          {nodes.flatMap((n) =>
            n.kids.map((k) => {
              const x1 = k.dir > 0 ? n.x + n.w : n.x
              const y1 = n.y + H / 2
              const x2 = k.dir > 0 ? k.x : k.x + k.w
              const y2 = k.y + H / 2
              const mx = (x1 + x2) / 2
              return (
                <path
                  key={k.id}
                  className={'mm-branch' + (k.task?.done ? ' done' : '')}
                  style={{ '--bh': k.hue } as CSSProperties}
                  strokeWidth={Math.max(1.4, 3.2 - k.depth * 0.6)}
                  d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                />
              )
            }),
          )}
        </svg>

        {nodes.map((n) => {
          const t = n.task
          const cls =
            'mm-node' +
            (t ? '' : ' root') +
            (n.dir < 0 && t ? ' left' : '') +
            (selected === n.id ? ' selected' : '') +
            (t?.done ? ' done' : '') +
            (dragSkip?.has(n.id) ? ' dragging' : '') +
            (dnd?.target === n.id && dnd.pos === 'child' ? ' drop-child' : '') +
            (n.hue === null ? '' : ' mm-branch' + (n.depth === 1 ? ' lvl1' : ''))
          return (
            <div
              key={n.id}
              className={cls}
              style={{ left: n.x, top: n.y, width: n.w, height: H, '--bh': n.hue ?? undefined } as CSSProperties}
              onPointerDown={(e) => startNodeDrag(e, n)}
              onClick={() => setSelected(n.id)}
              onDoubleClick={() => startEdit(n.id)}
            >
              {t && (
                <input
                  type="checkbox"
                  className="check"
                  checked={t.done}
                  tabIndex={-1}
                  onChange={(e) => update(t.id, (x) => setDone(x, e.target.checked))}
                />
              )}
              {t && editing === t.id ? (
                <input
                  className="mm-input"
                  autoFocus
                  value={t.title}
                  placeholder="Công việc…"
                  onChange={(e) => update(t.id, (x) => (x.title = e.target.value))}
                  onBlur={() => setEditing((cur) => (cur === t.id ? null : cur))}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing) return
                    if (e.key === 'Enter' || e.key === 'Escape') {
                      e.preventDefault()
                      stopEdit()
                    } else if (e.key === 'Tab') {
                      e.preventDefault()
                      addChildOf(t.id)
                    }
                  }}
                />
              ) : (
                <span className={'mm-title' + (t && !t.title ? ' placeholder' : '')}>
                  {t ? t.title || 'Công việc…' : n.title}
                </span>
              )}
              {t?.notes && <span className="has-notes">📝</span>}
              {t && t.children.length > 0 && (
                <button
                  className="mm-toggle"
                  tabIndex={-1}
                  title={t.collapsed ? 'Mở rộng' : 'Thu gọn'}
                  onClick={(e) => {
                    e.stopPropagation()
                    update(t.id, (x) => (x.collapsed = !x.collapsed))
                  }}
                >
                  {t.collapsed ? t.children.length : '–'}
                </button>
              )}
            </div>
          )
        })}

        {dnd && dropNode && dnd.pos !== 'child' && (
          <div
            className="mm-dropline"
            style={{
              left: dropNode.x,
              width: dropNode.w,
              top: (dnd.pos === 'before' ? dropNode.y - VGAP / 2 : dropNode.y + H + VGAP / 2) - 1.5,
            }}
          />
        )}
        {dnd && dropNode && dnd.pos === 'child' && (
          <div
            className="mm-dropslot"
            style={{ left: childAnchor(dropNode, dnd.dir).x - 1.5, top: dropNode.y + H / 2 - 13 }}
          />
        )}
        {dnd && (
          <div className="mm-ghost" style={{ left: dnd.x + 10, top: dnd.y + 10 }}>
            {dnd.title}
          </div>
        )}
      </div>

      <div className="mm-toolbar">
        <button onClick={() => addChildOf(selected)} title="Tab">
          ＋ Nhánh con
        </button>
        <button onClick={() => addSiblingOf(selected)} disabled={!selectedIsTask} title="Enter">
          ＋ Cùng cấp
        </button>
        <button onClick={() => startEdit(selected)} disabled={!selectedIsTask} title="F2 hoặc nhấp đúp">
          ✎ Sửa
        </button>
        <button onClick={() => flipSide(selected)} disabled={!rootLevel} title="Chuyển nhánh sang bên kia nút gốc">
          ⇄ Đổi bên
        </button>
        <button
          className={palette ? 'on' : ''}
          onClick={() => setPalette((o) => !o)}
          disabled={!rootLevel}
          title="Đổi màu nhánh"
        >
          ◍ Màu
        </button>
        <button onClick={() => onOpenDetail(selected)} disabled={!selectedIsTask}>
          ⤢ Chi tiết
        </button>
        <button className="danger" onClick={() => removeNode(selected)} disabled={!selectedIsTask} title="Delete">
          ✕ Xoá
        </button>
      </div>

      {palette && rootLevel && (
        <div className="mm-palette">
          {HUES.map((h, i) => (
            <button
              key={h}
              className={'mm-swatch mm-branch' + (pickedColor === i ? ' on' : '')}
              style={{ '--bh': h } as CSSProperties}
              title={'Màu ' + (i + 1)}
              onClick={() => {
                update(selected, (t) => (t.color = i))
                setPalette(false)
              }}
            />
          ))}
          <button
            className="mm-swatch-auto"
            title="Để app tự chọn màu cho nhánh này"
            onClick={() => {
              update(selected, (t) => delete t.color)
              setPalette(false)
            }}
          >
            Tự động
          </button>
        </div>
      )}

      <div className="mm-zoom">
        <button onClick={() => zoom(1 / 1.2)}>−</button>
        <span>{Math.round(view.k * 100)}%</span>
        <button onClick={() => zoom(1.2)}>+</button>
        <button onClick={fit} title="Căn vừa màn hình">
          ⛶
        </button>
      </div>

      {project.tasks.length === 0 && (
        <div className="mm-empty">
          Chọn nút dự án rồi nhấn <kbd>Tab</kbd> để thêm công việc đầu tiên
        </div>
      )}
      {project.title === '' && project.tasks.length === 0 && (
        <button className="mm-name btn ghost" onClick={() => actions.updateProject(project.id, { title: 'Dự án mới' })}>
          Đặt tên dự án
        </button>
      )}
    </div>
  )
}
