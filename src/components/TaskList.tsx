import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { addChild, indent, insertAfter, locate, newTask, outdent, remove, setDone, visible } from '../tree'
import type { Field, Mutate, Task } from '../types'
import { FlagDot, RowChips } from './Fields'

interface Ctx {
  fields: Field[]
  root: Task[]
  mutate: Mutate
  focusId: string | null
  setFocusId: (id: string | null) => void
  detailId: string | null
  onOpenDetail: (id: string) => void
}

interface Props {
  fields: Field[]
  tasks: Task[]
  mutate: Mutate
  detailId: string | null
  onOpenDetail: (id: string) => void
}

export default function TaskList({ fields, tasks, mutate, detailId, onOpenDetail }: Props) {
  const [focusId, setFocusId] = useState<string | null>(null)
  const ctx: Ctx = { fields, root: tasks, mutate, focusId, setFocusId, detailId, onOpenDetail }

  const addRoot = () => {
    const t = newTask()
    mutate((ts) => addChild(ts, null, t))
    setFocusId(t.id)
  }

  return (
    <div className="task-list">
      {tasks.map((t) => (
        <Row key={t.id} task={t} depth={0} ctx={ctx} />
      ))}
      <button className="add-task" onClick={addRoot}>
        + Thêm công việc
      </button>
      {tasks.length > 0 && (
        <p className="hint">
          <kbd>Enter</kbd> thêm task · <kbd>Tab</kbd> / <kbd>Shift+Tab</kbd> thụt vào / ra · <kbd>↑</kbd> <kbd>↓</kbd>{' '}
          di chuyển · <kbd>Backspace</kbd> trên dòng trống để xoá
        </p>
      )}
    </div>
  )
}

function Row({ task, depth, ctx }: { task: Task; depth: number; ctx: Ctx }) {
  const ref = useRef<HTMLInputElement>(null)
  const { mutate, focusId, setFocusId } = ctx

  useEffect(() => {
    if (focusId === task.id) {
      ref.current?.focus()
      setFocusId(null)
    }
  }, [focusId, task.id, setFocusId])

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter') {
      e.preventDefault()
      const t = newTask()
      mutate((ts) => insertAfter(ts, task.id, t))
      setFocusId(t.id)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      mutate((ts) => (e.shiftKey ? outdent(ts, task.id) : indent(ts, task.id)))
      setFocusId(task.id)
    } else if (e.key === 'Backspace' && task.title === '') {
      e.preventDefault()
      const flat = visible(ctx.root)
      const i = flat.findIndex((t) => t.id === task.id)
      mutate((ts) => remove(ts, task.id))
      if (i > 0) setFocusId(flat[i - 1].id)
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const flat = visible(ctx.root)
      const i = flat.findIndex((t) => t.id === task.id)
      const next = flat[i + (e.key === 'ArrowUp' ? -1 : 1)]
      if (next) {
        e.preventDefault()
        setFocusId(next.id)
      }
    }
  }

  const update = (fn: (t: Task) => void) =>
    mutate((ts) => {
      const loc = locate(ts, task.id)
      if (loc) fn(loc.task)
    })

  const addSub = () => {
    const t = newTask()
    mutate((ts) => addChild(ts, task.id, t))
    setFocusId(t.id)
  }

  const hasChildren = task.children.length > 0

  return (
    <>
      <div className={'task-row' + (ctx.detailId === task.id ? ' selected' : '')} style={{ paddingLeft: depth * 24 }}>
        <button
          className={'caret' + (hasChildren ? '' : ' invisible')}
          tabIndex={-1}
          onClick={() => update((t) => (t.collapsed = !t.collapsed))}
        >
          {task.collapsed ? '▸' : '▾'}
        </button>
        <input
          type="checkbox"
          className="check"
          checked={task.done}
          tabIndex={-1}
          onChange={(e) => update((t) => setDone(t, e.target.checked))}
        />
        <FlagDot fields={ctx.fields} task={task} />
        <input
          ref={ref}
          className={'task-title' + (task.done ? ' done' : '')}
          value={task.title}
          placeholder="Công việc…"
          onChange={(e) => update((t) => (t.title = e.target.value))}
          onKeyDown={onKeyDown}
        />
        <RowChips fields={ctx.fields} task={task} />
        {task.notes && (
          <span className="has-notes" title="Có ghi chú">
            📝
          </span>
        )}
        {task.collapsed && hasChildren && <span className="badge">{task.children.length}</span>}
        <div className="row-actions">
          <button className="icon-btn" title="Thêm subtask" tabIndex={-1} onClick={addSub}>
            ＋
          </button>
          <button
            className="icon-btn"
            title="Mở chi tiết / ghi chú"
            tabIndex={-1}
            onClick={() => ctx.onOpenDetail(task.id)}
          >
            ⤢
          </button>
          <button
            className="icon-btn danger"
            title="Xoá"
            tabIndex={-1}
            onClick={() => mutate((ts) => remove(ts, task.id))}
          >
            ✕
          </button>
        </div>
      </div>
      {!task.collapsed && task.children.map((c) => <Row key={c.id} task={c} depth={depth + 1} ctx={ctx} />)}
    </>
  )
}
