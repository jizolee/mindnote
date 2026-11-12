import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { typeIcon } from '../fields'
import { actions } from '../store'
import { addChild, insertAfter, locate, newTask, remove, setDone } from '../tree'
import type { Field, Mutate, Project, Task } from '../types'
import { AddFieldMenu, FieldNameMenu, FieldValue, setTaskProp, usePopover } from './Fields'

interface Props {
  project: Project
  mutate: Mutate
  detailId: string | null
  onOpenDetail: (id: string) => void
}

interface FlatRow {
  task: Task
  depth: number
}

function flatten(tasks: Task[], depth = 0, out: FlatRow[] = []): FlatRow[] {
  for (const t of tasks) {
    out.push({ task: t, depth })
    if (!t.collapsed) flatten(t.children, depth + 1, out)
  }
  return out
}

/** Bảng kiểu database của Notion: mỗi task một dòng, mỗi trường một cột. */
export default function TableView({ project, mutate, detailId, onOpenDetail }: Props) {
  const { open, setOpen, toggle } = usePopover()
  const [focusId, setFocusId] = useState<string | null>(null)
  const fields = project.fields
  const rows = flatten(project.tasks)
  const setField = (f: Field) => actions.updateProject(project.id, { fields: fields.map((x) => (x.id === f.id ? f : x)) })
  const cols = `minmax(300px, 2fr) repeat(${fields.length}, minmax(160px, 1fr)) 44px`
  const minWidth = 300 + fields.length * 160 + 44

  const addRoot = () => {
    const t = newTask()
    mutate((ts) => addChild(ts, null, t))
    setFocusId(t.id)
  }

  return (
    <div className="table-scroll">
      <div className="tbl" style={{ minWidth }}>
        <div className="trow thead" style={{ gridTemplateColumns: cols }}>
          <div className="tcell th">
            <span className="prop-icon">Aa</span> Công việc
          </div>
          {fields.map((f) => (
            <div key={f.id} className="tcell th">
              <button className="th-btn pop-anchor" title="Đổi tên / xoá trường" onClick={() => toggle('name:' + f.id)}>
                <span className="prop-icon">{typeIcon(f.type)}</span>
                <span className="prop-label">{f.name || 'Chưa đặt tên'}</span>
              </button>
              {open === 'name:' + f.id && <FieldNameMenu project={project} field={f} onClose={() => setOpen(null)} />}
            </div>
          ))}
          <div className="tcell th add">
            <button className="th-btn pop-anchor" title="Thêm trường" onClick={() => toggle('add')}>
              +
            </button>
            {open === 'add' && <AddFieldMenu project={project} onClose={() => setOpen(null)} />}
          </div>
        </div>

        {rows.map(({ task, depth }, i) => (
          <div key={task.id} className={'trow' + (detailId === task.id ? ' selected' : '')} style={{ gridTemplateColumns: cols }}>
            <TitleCell
              task={task}
              depth={depth}
              mutate={mutate}
              focus={focusId === task.id}
              onFocused={() => setFocusId(null)}
              onFocusId={setFocusId}
              prevId={rows[i - 1]?.task.id}
              nextId={rows[i + 1]?.task.id}
              onOpenDetail={onOpenDetail}
            />
            {fields.map((f) => {
              const key = `val:${task.id}:${f.id}`
              return (
                <div key={f.id} className={'tcell prop-value' + (f.type === 'checkbox' ? ' center' : '')}>
                  <FieldValue
                    field={f}
                    value={task.props[f.id]}
                    done={task.done}
                    open={open === key}
                    onToggle={() => toggle(key)}
                    onClose={() => setOpen(null)}
                    onChange={(v) => setTaskProp(mutate, task.id, f.id, v)}
                    onFieldChange={setField}
                  />
                </div>
              )
            })}
            <div className="tcell" />
          </div>
        ))}

        <button className="add-task tbl-add" onClick={addRoot}>
          + Công việc mới
        </button>
      </div>
    </div>
  )
}

interface TitleProps {
  task: Task
  depth: number
  mutate: Mutate
  focus: boolean
  onFocused: () => void
  onFocusId: (id: string) => void
  prevId: string | undefined
  nextId: string | undefined
  onOpenDetail: (id: string) => void
}

function TitleCell({ task, depth, mutate, focus, onFocused, onFocusId, prevId, nextId, onOpenDetail }: TitleProps) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (focus) {
      ref.current?.focus()
      onFocused()
    }
  }, [focus, onFocused])

  const update = (fn: (t: Task) => void) =>
    mutate((ts) => {
      const l = locate(ts, task.id)
      if (l) fn(l.task)
    })

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter') {
      e.preventDefault()
      const t = newTask()
      mutate((ts) => insertAfter(ts, task.id, t))
      onFocusId(t.id)
    } else if (e.key === 'Backspace' && task.title === '') {
      e.preventDefault()
      mutate((ts) => remove(ts, task.id))
      if (prevId) onFocusId(prevId)
    } else if (e.key === 'ArrowUp' && prevId) {
      e.preventDefault()
      onFocusId(prevId)
    } else if (e.key === 'ArrowDown' && nextId) {
      e.preventDefault()
      onFocusId(nextId)
    }
  }

  const hasChildren = task.children.length > 0
  return (
    <div className="tcell title" style={{ paddingLeft: 6 + depth * 20 }}>
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
      <input
        ref={ref}
        className={'task-title' + (task.done ? ' done' : '')}
        value={task.title}
        placeholder="Công việc…"
        onChange={(e) => update((t) => (t.title = e.target.value))}
        onKeyDown={onKeyDown}
      />
      {task.notes && <span className="has-notes" title="Có ghi chú">📝</span>}
      <div className="tcell-actions">
        <button
          className="icon-btn"
          title="Thêm subtask"
          tabIndex={-1}
          onClick={() => {
            const t = newTask()
            mutate((ts) => addChild(ts, task.id, t))
            onFocusId(t.id)
          }}
        >
          ＋
        </button>
        <button className="icon-btn" title="Mở chi tiết / ghi chú" tabIndex={-1} onClick={() => onOpenDetail(task.id)}>
          ⤢
        </button>
        <button className="icon-btn danger" title="Xoá" tabIndex={-1} onClick={() => mutate((ts) => remove(ts, task.id))}>
          ✕
        </button>
      </div>
    </div>
  )
}
