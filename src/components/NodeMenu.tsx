import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { BRANCH_HUES, COLORS } from '../fields'
import type { Project, PropValue, Task } from '../types'

const asList = (v: PropValue | undefined): string[] => (Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : [])

/** Các giá trị chữ đã dùng ở nơi khác trong dự án, để chọn lại cho nhanh. */
function usedValues(tasks: Task[], fieldId: string): string[] {
  const out = new Set<string>()
  const walk = (list: Task[]) =>
    list.forEach((t) => {
      const v = t.props[fieldId]
      if (typeof v === 'string' && v.trim()) out.add(v)
      walk(t.children)
    })
  walk(tasks)
  return [...out].slice(0, 10)
}

export interface MenuActions {
  addChild: () => void
  addSibling: () => void
  rename: () => void
  detail: () => void
  remove: () => void
  flip: () => void
}

interface Props {
  project: Project
  task: Task
  /** Vị trí trong khung mindmap. */
  x: number
  y: number
  /** Nhánh cấp 1 mới đổi được bên và màu. */
  rootLevel: boolean
  update: (id: string, fn: (t: Task) => void) => void
  on: MenuActions
  onClose: () => void
}

/** Menu chuột phải của một nút: đổi nhanh trạng thái, ưu tiên, người phụ trách… và các thao tác với nút. */
export default function NodeMenu({ project, task, x, y, rootLevel, update, on, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  // Menu khá dài nên phải đo rồi kéo vào trong khung mindmap.
  useLayoutEffect(() => {
    const el = ref.current
    const box = el?.offsetParent as HTMLElement | null
    if (!el || !box) return
    setPos({
      x: Math.max(8, Math.min(x, box.clientWidth - el.offsetWidth - 8)),
      y: Math.max(8, Math.min(y, box.clientHeight - el.offsetHeight - 8)),
    })
  }, [x, y])

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.mm-menu')) onClose()
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [onClose])

  const setValue = (fid: string, v: PropValue | undefined) =>
    update(task.id, (t) => {
      const empty = v === undefined || v === '' || v === false || (Array.isArray(v) && v.length === 0)
      if (empty) delete t.props[fid]
      else t.props[fid] = v
    })

  const act = (fn: () => void) => () => {
    onClose()
    fn()
  }

  return (
    <div ref={ref} className="mm-pop mm-menu" style={{ left: pos.x, top: pos.y }}>
      {project.fields.map((f) => {
        const v = task.props[f.id]
        const chosen = asList(v)
        return (
          <div key={f.id}>
            <div className="menu-label">{f.name || 'Trường'}</div>
            {(f.type === 'select' || f.type === 'multi') && (
              <div className="menu-chips">
                {f.options.map((o) => {
                  const on = chosen.includes(o.id)
                  return (
                    <button
                      key={o.id}
                      className={`chip c${o.color % COLORS}` + (on ? ' on' : '')}
                      onClick={() =>
                        setValue(
                          f.id,
                          f.type === 'multi'
                            ? on
                              ? chosen.filter((c) => c !== o.id)
                              : [...chosen, o.id]
                            : on
                              ? undefined
                              : o.id,
                        )
                      }
                    >
                      {o.label}
                    </button>
                  )
                })}
                {f.options.length === 0 && <span className="muted">Chưa có lựa chọn nào</span>}
              </div>
            )}
            {f.type === 'text' && (
              <>
                <input
                  className="menu-input"
                  value={typeof v === 'string' ? v : ''}
                  placeholder="Nhập tên…"
                  onChange={(e) => setValue(f.id, e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onClose()}
                />
                {usedValues(project.tasks, f.id).length > 0 && (
                  <div className="menu-chips">
                    {usedValues(project.tasks, f.id).map((s) => (
                      <button key={s} className={'chip c7' + (v === s ? ' on' : '')} onClick={() => setValue(f.id, s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            {(f.type === 'date' || f.type === 'number') && (
              <input
                className="menu-input"
                type={f.type}
                value={f.type === 'number' ? (typeof v === 'number' ? v : '') : typeof v === 'string' ? v : ''}
                onChange={(e) =>
                  setValue(
                    f.id,
                    f.type === 'number' ? (e.target.value === '' ? undefined : Number(e.target.value)) : e.target.value,
                  )
                }
              />
            )}
            {f.type === 'checkbox' && (
              <label className="menu-check">
                <input
                  type="checkbox"
                  className="check"
                  checked={v === true}
                  onChange={(e) => setValue(f.id, e.target.checked)}
                />
                {f.name}
              </label>
            )}
          </div>
        )
      })}

      {rootLevel && (
        <>
          <div className="menu-label">Màu nhánh</div>
          <div className="menu-swatches">
            {BRANCH_HUES.map((h, i) => (
              <button
                key={h}
                className={'mm-swatch mm-branch' + (task.color === i ? ' on' : '')}
                style={{ '--bh': h } as CSSProperties}
                title={'Màu ' + (i + 1)}
                onClick={() => update(task.id, (t) => (t.color = i))}
              />
            ))}
            <button className="mm-swatch-auto" onClick={() => update(task.id, (t) => delete t.color)}>
              Tự động
            </button>
          </div>
        </>
      )}

      <div className="menu-sep" />
      <button className="menu-item" onClick={act(on.addChild)}>
        ＋ Nhánh con <kbd>Tab</kbd>
      </button>
      <button className="menu-item" onClick={act(on.addSibling)}>
        ＋ Cùng cấp <kbd>Enter</kbd>
      </button>
      <button className="menu-item" onClick={act(on.rename)}>
        ✎ Sửa tên <kbd>F2</kbd>
      </button>
      <button className="menu-item" onClick={() => update(task.id, (t) => (t.done = !t.done))}>
        {task.done ? '☐ Bỏ đánh dấu xong' : '☑ Đánh dấu xong'} <kbd>Space</kbd>
      </button>
      <button className="menu-item" onClick={act(on.detail)}>
        ⤢ Mở chi tiết
      </button>
      {rootLevel && (
        <button className="menu-item" onClick={act(on.flip)}>
          ⇄ Đổi bên
        </button>
      )}
      <button className="menu-item danger" onClick={act(on.remove)}>
        ✕ Xoá <kbd>Delete</kbd>
      </button>
    </div>
  )
}
