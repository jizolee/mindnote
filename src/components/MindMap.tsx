import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
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
const FONT = '14px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
const ROOT_FONT = '600 15px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

interface LNode {
  id: string
  title: string
  task: Task | null
  x: number
  y: number
  w: number
  sh: number
  kids: LNode[]
}

let ctx2d: CanvasRenderingContext2D | null = null
function textWidth(text: string, font: string): number {
  ctx2d ??= document.createElement('canvas').getContext('2d')
  if (!ctx2d) return text.length * 8
  ctx2d.font = font
  return ctx2d.measureText(text).width
}

function layout(project: Project): { nodes: LNode[]; root: LNode } {
  const make = (t: Task): LNode => {
    const text = t.title || 'Công việc…'
    const w = Math.min(320, Math.max(96, textWidth(text, FONT) + 58 + (t.notes ? 20 : 0)))
    return { id: t.id, title: t.title, task: t, x: 0, y: 0, w, sh: H, kids: t.collapsed ? [] : t.children.map(make) }
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
    kids: project.tasks.map(make),
  }
  const kidsHeight = (n: LNode) => n.kids.reduce((s, k) => s + k.sh, 0) + VGAP * Math.max(0, n.kids.length - 1)
  const measure = (n: LNode) => {
    n.kids.forEach(measure)
    n.sh = Math.max(H, kidsHeight(n))
  }
  const nodes: LNode[] = []
  const place = (n: LNode, x: number, top: number) => {
    n.x = x
    n.y = top + n.sh / 2 - H / 2
    nodes.push(n)
    let cy = top + (n.sh - kidsHeight(n)) / 2
    for (const k of n.kids) {
      place(k, x + n.w + HGAP, cy)
      cy += k.sh + VGAP
    }
  }
  measure(root)
  place(root, 0, 0)
  return { nodes, root }
}

interface Dnd {
  id: string
  title: string
  /** Vị trí con trỏ theo toạ độ canvas. */
  x: number
  y: number
  target: string | null
  pos: DropPos
}

function subtreeIds(n: LNode, out = new Set<string>()): Set<string> {
  out.add(n.id)
  n.kids.forEach((k) => subtreeIds(k, out))
  return out
}

/** Tìm nút đích và kiểu thả tại toạ độ canvas (x, y), bỏ qua các nút trong `skip`. */
function hitTest(nodes: LNode[], skip: Set<string>, x: number, y: number): { target: string; pos: DropPos } | null {
  for (const n of nodes) {
    if (skip.has(n.id)) continue
    if (x < n.x - 8 || x > n.x + n.w + HGAP / 2) continue
    if (y < n.y - VGAP / 2 || y > n.y + H + VGAP / 2) continue
    if (n.id === ROOT) return { target: ROOT, pos: 'child' }
    if (y < n.y + 9) return { target: n.id, pos: 'before' }
    if (y > n.y + H - 9) return { target: n.id, pos: 'after' }
    return { target: n.id, pos: 'child' }
  }
  return null
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
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null)

  const { nodes } = useMemo(() => layout(project), [project])

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
      const hit = hitTest(ns, skip, x, y)
      const ok = hit && canMove(p.tasks, id, hit.target === ROOT ? null : hit.target)
      cur = { id, title, x, y, target: ok ? hit.target : null, pos: ok ? hit.pos : 'child' }
      setDnd(cur)
    }
    const finish = (commit: boolean) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey, true)
      cleanupDrag.current = null
      if (commit && cur?.target) {
        const { target, pos } = cur
        mutate((ts) => move(ts, id, target === ROOT ? null : target, pos))
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
    const maxX = Math.max(...nodes.map((n) => n.x + n.w))
    const minY = Math.min(...nodes.map((n) => n.y))
    const maxY = Math.max(...nodes.map((n) => n.y + H))
    const bw = maxX
    const bh = maxY - minY
    const k = Math.max(0.3, Math.min(1, (width - 96) / bw, (height - 120) / bh))
    setView({ k, x: (width - bw * k) / 2, y: (height - bh * k) / 2 - minY * k })
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
  const update = (id: string, fn: (t: Task) => void) =>
    mutate((ts) => {
      const l = locate(ts, id)
      if (l) fn(l.task)
    })

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
        e.preventDefault()
        if (loc) setSelected(loc.parent?.id ?? ROOT)
        break
      case 'ArrowRight':
        e.preventDefault()
        if (!loc) go(project.tasks[0]?.id)
        else if (loc.task.collapsed) update(selected, (t) => (t.collapsed = false))
        else go(loc.task.children[0]?.id)
        break
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
        if ((e.target as HTMLElement).closest('.mm-node, .mm-toolbar, .mm-zoom')) return
        drag.current = { px: e.clientX, py: e.clientY, x: view.x, y: view.y }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (d) setView((v) => ({ ...v, x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py }))
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
    >
      <div
        className="mm-canvas"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}
      >
        <svg className="mm-edges">
          {nodes.flatMap((n) =>
            n.kids.map((k) => {
              const x1 = n.x + n.w
              const y1 = n.y + H / 2
              const x2 = k.x
              const y2 = k.y + H / 2
              const mx = (x1 + x2) / 2
              return (
                <path
                  key={k.id}
                  className={k.task?.done ? 'done' : ''}
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
            (selected === n.id ? ' selected' : '') +
            (t?.done ? ' done' : '') +
            (dragSkip?.has(n.id) ? ' dragging' : '') +
            (dnd?.target === n.id && dnd.pos === 'child' ? ' drop-child' : '')
          return (
            <div
              key={n.id}
              className={cls}
              style={{ left: n.x, top: n.y, width: n.w, height: H }}
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
        <button onClick={() => onOpenDetail(selected)} disabled={!selectedIsTask}>
          ⤢ Chi tiết
        </button>
        <button className="danger" onClick={() => removeNode(selected)} disabled={!selectedIsTask} title="Delete">
          ✕ Xoá
        </button>
      </div>

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
