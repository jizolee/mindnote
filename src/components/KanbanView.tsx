import { useState } from 'react'
import { COLORS } from '../fields'
import { actions } from '../store'
import { allTasks, fold } from '../tableQuery'
import { addChild, count, locate, newTask, remove, setDone, uid } from '../tree'
import type { FieldOption, Mutate, Project, Task } from '../types'
import { FieldNameMenu, FlagDot, RowChips, setTaskProp, usePopover } from './Fields'

interface Props {
  project: Project
  mutate: Mutate
  detailId: string | null
  onOpenDetail: (id: string) => void
}

/** Bảng Kanban: mỗi lựa chọn của một trường (mặc định là Trạng thái) là một cột, mỗi task là một thẻ. */
export default function KanbanView({ project, mutate, detailId, onOpenDetail }: Props) {
  const { open, setOpen, toggle } = usePopover()
  const [search, setSearch] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [newCol, setNewCol] = useState<string | null>(null)

  const selectFields = project.fields.filter((f) => f.type === 'select')
  const field = selectFields.find((f) => f.id === project.table.boardBy) ?? selectFields[0] ?? null

  if (!field) {
    return (
      <div className="kanban-view">
        <div className="tbl-empty" style={{ padding: 32 }}>
          Kanban cần một trường kiểu “Lựa chọn” (ví dụ Trạng thái). Hãy thêm trường đó trong tab Bảng hoặc trong panel
          chi tiết của một công việc.
        </div>
      </div>
    )
  }

  const q = fold(search.trim())
  const known = new Set(field.options.map((o) => o.id))
  const keyOf = (t: Task) => {
    const v = t.props[field.id]
    return typeof v === 'string' && known.has(v) ? v : ''
  }
  const cards = allTasks(project.tasks).filter(
    ({ task }) => task.id === editing || q === '' || fold(task.title + ' ' + task.notes).includes(q),
  )
  const cols: { key: string; opt: FieldOption | null }[] = [
    ...field.options.map((o) => ({ key: o.id, opt: o })),
    { key: '', opt: null },
  ]
  const otherFields = project.fields.filter((f) => f.id !== field.id)

  const update = (id: string, fn: (t: Task) => void) =>
    mutate((ts) => {
      const l = locate(ts, id)
      if (l) fn(l.task)
    })

  const addCard = (key: string) => {
    const t = newTask()
    if (key) t.props[field.id] = key
    mutate((ts) => addChild(ts, null, t))
    setEditing(t.id)
  }

  const finishEdit = (id: string, title: string) => {
    setEditing((cur) => (cur === id ? null : cur))
    if (title.trim() === '') mutate((ts) => remove(ts, id))
  }

  const addColumn = () => {
    const label = (newCol ?? '').trim()
    setNewCol(null)
    if (!label || field.options.some((o) => o.label.toLowerCase() === label.toLowerCase())) return
    const used = new Set(field.options.map((o) => o.color))
    let color = field.options.length % COLORS
    for (let c = 0; c < COLORS; c++) {
      if (!used.has(c)) {
        color = c
        break
      }
    }
    const next = { ...field, options: [...field.options, { id: uid(), label, color }] }
    actions.updateProject(project.id, { fields: project.fields.map((f) => (f.id === field.id ? next : f)) })
  }

  return (
    <div className="kanban-view">
      <div className="tbl-toolbar">
        <input
          className="tb-search"
          placeholder="🔍 Tìm công việc…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="tb-item tb-select">
          ▥ Cột theo
          <select
            aria-label="Cột theo"
            value={field.id}
            onChange={(e) =>
              actions.updateProject(project.id, { table: { ...project.table, boardBy: e.target.value } })
            }
          >
            {selectFields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name || 'Chưa đặt tên'}
              </option>
            ))}
          </select>
        </label>
        <div className="tb-item">
          <button className="tb-btn pop-anchor" onClick={() => toggle('field')}>
            ✎ Sửa các cột
          </button>
          {open === 'field' && <FieldNameMenu project={project} field={field} onClose={() => setOpen(null)} />}
        </div>
        <span className="spacer" />
        <span className="tb-count">{cards.length} công việc</span>
      </div>

      <div className="kanban">
        {cols.map(({ key, opt }) => {
          const list = cards.filter(({ task }) => keyOf(task) === key)
          return (
            <div
              key={key || '__none__'}
              className={'kcol' + (dragId && over === key ? ' over' : '')}
              onDragOver={(e) => {
                if (!dragId) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (over !== key) setOver(key)
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (dragId) setTaskProp(mutate, dragId, field.id, key || undefined)
                setDragId(null)
                setOver(null)
              }}
            >
              <div className="kcol-head">
                {opt ? (
                  <span className={`chip c${opt.color % COLORS}`}>{opt.label}</span>
                ) : (
                  <span className="muted">Chưa có {field.name.toLowerCase()}</span>
                )}
                <span className="tb-count">{list.length}</span>
              </div>

              <div className="kcol-body">
                {list.map(({ task, parent }) => {
                  const sub = count(task.children)
                  return (
                    <div
                      key={task.id}
                      className={
                        'kcard' + (detailId === task.id ? ' selected' : '') + (dragId === task.id ? ' dragging' : '')
                      }
                      draggable={editing !== task.id}
                      onDragStart={(e) => {
                        setDragId(task.id)
                        e.dataTransfer.effectAllowed = 'move'
                        e.dataTransfer.setData('text/plain', task.title)
                      }}
                      onDragEnd={() => {
                        setDragId(null)
                        setOver(null)
                      }}
                      onClick={() => editing !== task.id && onOpenDetail(task.id)}
                    >
                      <div className="kcard-top">
                        <input
                          type="checkbox"
                          className="check"
                          checked={task.done}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => update(task.id, (t) => setDone(t, e.target.checked))}
                        />
                        <FlagDot fields={project.fields} task={task} />
                        {editing === task.id ? (
                          <input
                            className="kcard-input"
                            autoFocus
                            value={task.title}
                            placeholder="Tên công việc…"
                            onChange={(e) => update(task.id, (t) => (t.title = e.target.value))}
                            onBlur={(e) => finishEdit(task.id, e.currentTarget.value)}
                            onKeyDown={(e) => {
                              if (e.nativeEvent.isComposing) return
                              if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur()
                            }}
                          />
                        ) : (
                          <span className={'kcard-title' + (task.done ? ' done' : '')}>
                            {task.title || 'Chưa đặt tên'}
                          </span>
                        )}
                      </div>
                      {parent && <div className="parent-crumb">↳ {parent.title || 'Chưa đặt tên'}</div>}
                      <RowChips fields={otherFields} task={task} />
                      {(sub.total > 0 || task.notes) && (
                        <div className="kcard-meta">
                          {sub.total > 0 && (
                            <span title="Subtask đã xong / tổng">
                              ☑ {sub.done}/{sub.total}
                            </span>
                          )}
                          {task.notes && <span title="Có ghi chú">📝</span>}
                        </div>
                      )}
                    </div>
                  )
                })}
                <button className="add-task kcol-add" onClick={() => addCard(key)}>
                  + Thêm thẻ
                </button>
              </div>
            </div>
          )
        })}

        <div className="kcol kcol-new">
          {newCol === null ? (
            <button className="add-task" onClick={() => setNewCol('')}>
              + Thêm cột
            </button>
          ) : (
            <input
              className="pop-input"
              autoFocus
              value={newCol}
              placeholder={`Tên ${field.name.toLowerCase()} mới…`}
              onChange={(e) => setNewCol(e.target.value)}
              onBlur={addColumn}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') setNewCol(null)
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
