import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { COLORS, typeIcon } from '../fields'
import { actions } from '../store'
import {
  DONE,
  OPS,
  TITLE,
  allTasks,
  columns,
  comparator,
  filterActive,
  fold,
  matches,
  sortTree,
} from '../tableQuery'
import { addChild, insertAfter, locate, newTask, remove, setDone, uid } from '../tree'
import type { Field, FieldOption, Mutate, Project, PropValue, TableConfig, TableFilter, Task } from '../types'
import { AddFieldMenu, FieldNameMenu, FieldValue, setTaskProp, usePopover } from './Fields'

interface Props {
  project: Project
  mutate: Mutate
  detailId: string | null
  onOpenDetail: (id: string) => void
}

interface Row {
  task: Task
  depth: number
  parent: Task | null
}

interface Section {
  /** Id lựa chọn của nhóm; '' = nhóm "chưa có"; null = bảng không nhóm. */
  key: string | null
  opt: FieldOption | null
  rows: Row[]
}

function flattenTree(tasks: Task[], depth = 0, parent: Task | null = null, out: Row[] = []): Row[] {
  for (const t of tasks) {
    out.push({ task: t, depth, parent })
    if (!t.collapsed) flattenTree(t.children, depth + 1, t, out)
  }
  return out
}

/** Bảng kiểu database của Notion: mỗi task một dòng, mỗi trường một cột; có tìm, lọc, sắp xếp, nhóm. */
export default function TableView({ project, mutate, detailId, onOpenDetail }: Props) {
  const { open, setOpen, toggle } = usePopover()
  const [focusId, setFocusId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  // Task vừa tạo luôn được hiện dù chưa khớp điều kiện lọc, để không "biến mất" khi đang gõ.
  const [pinned, setPinned] = useState<Set<string>>(new Set())
  const [closed, setClosed] = useState<Set<string>>(new Set())

  const fields = project.fields
  const cfg = project.table
  const setCfg = (patch: Partial<TableConfig>) => {
    setPinned(new Set())
    actions.updateProject(project.id, { table: { ...cfg, ...patch } })
  }
  const setField = (f: Field) => actions.updateProject(project.id, { fields: fields.map((x) => (x.id === f.id ? f : x)) })

  const cols = columns(fields)
  const colOf = (id: string) => cols.find((c) => c.id === id)
  const filters = cfg.filters.filter((f) => colOf(f.fieldId))
  const activeFilters = filters.filter((f) => filterActive(f, colOf(f.fieldId)!))
  const groupField = fields.find((f) => f.id === cfg.groupBy && f.type === 'select') ?? null
  const sortCol = cfg.sort ? colOf(cfg.sort.fieldId) : undefined
  const cmp = sortCol && cfg.sort ? comparator(sortCol, cfg.sort.dir) : null
  const q = fold(search.trim())
  const flat = activeFilters.length > 0 || q !== '' || !!groupField

  let sections: Section[]
  if (!flat) {
    sections = [{ key: null, opt: null, rows: flattenTree(cmp ? sortTree(project.tasks, cmp) : project.tasks) }]
  } else {
    let list = allTasks(project.tasks).filter(
      ({ task }) =>
        pinned.has(task.id) ||
        (activeFilters.every((f) => matches(task, f, colOf(f.fieldId)!)) &&
          (q === '' || fold(task.title + ' ' + task.notes).includes(q))),
    )
    if (cmp) list = [...list].sort((a, b) => cmp(a.task, b.task))
    const rows: Row[] = list.map(({ task, parent }) => ({ task, parent, depth: 0 }))
    if (groupField) {
      const known = new Set(groupField.options.map((o) => o.id))
      const g = (r: Row) => {
        const v = r.task.props[groupField.id]
        return typeof v === 'string' && known.has(v) ? v : ''
      }
      sections = [
        ...groupField.options.map((o) => ({ key: o.id, opt: o, rows: rows.filter((r) => g(r) === o.id) })),
        { key: '', opt: null, rows: rows.filter((r) => g(r) === '') },
      ]
    } else {
      sections = [{ key: null, opt: null, rows }]
    }
  }
  const order = sections.filter((s) => !closed.has(s.key ?? '*')).flatMap((s) => s.rows.map((r) => r.task.id))
  const total = sections.reduce((n, s) => n + s.rows.length, 0)

  /** Giá trị gán sẵn cho task mới để nó khớp nhóm và các điều kiện "là" đang lọc. */
  const presets = (groupKey: string | null): Record<string, PropValue> => {
    const props: Record<string, PropValue> = {}
    for (const f of activeFilters) {
      const col = colOf(f.fieldId)!
      if (f.op !== 'is' || col.id === TITLE || col.id === DONE) continue
      if (col.type === 'select') props[col.id] = f.value
      if (col.type === 'multi') props[col.id] = [f.value]
    }
    if (groupField && groupKey !== null) {
      if (groupKey) props[groupField.id] = groupKey
      else delete props[groupField.id]
    }
    return props
  }

  const create = (groupKey: string | null, place: { after?: string; parent?: string } = {}) => {
    const t = newTask()
    if (flat) {
      t.props = presets(groupKey)
      setPinned((s) => new Set(s).add(t.id))
    }
    mutate((ts) => {
      if (place.after) insertAfter(ts, place.after, t)
      else addChild(ts, place.parent ?? null, t)
    })
    setFocusId(t.id)
  }

  const gridCols = `minmax(300px, 2fr) repeat(${fields.length}, minmax(160px, 1fr)) 44px`
  const minWidth = 300 + fields.length * 160 + 44
  const selectFields = fields.filter((f) => f.type === 'select')
  const customized = filters.length > 0 || !!cfg.sort || !!groupField || search !== ''

  const patchFilter = (id: string, p: Partial<TableFilter>) =>
    setCfg({ filters: cfg.filters.map((f) => (f.id === id ? { ...f, ...p } : f)) })

  return (
    <div className="table-view">
      <div className="tbl-toolbar">
        <input
          className="tb-search"
          placeholder="🔍 Tìm công việc…"
          value={search}
          onChange={(e) => {
            setPinned(new Set())
            setSearch(e.target.value)
          }}
        />

        <div className="tb-item">
          <button className={'tb-btn pop-anchor' + (filters.length ? ' on' : '')} onClick={() => toggle('filter')}>
            ⏷ Lọc{activeFilters.length ? ` (${activeFilters.length})` : ''}
          </button>
          {open === 'filter' && (
            <div className="pop filter-pop">
              {filters.length === 0 && <div className="pop-label">Chưa có điều kiện lọc nào.</div>}
              {filters.map((f) => {
                const col = colOf(f.fieldId)!
                const def = OPS[col.type].find((o) => o.op === f.op)
                return (
                  <div key={f.id} className="filter-row">
                    <select
                      value={f.fieldId}
                      onChange={(e) => {
                        const c = colOf(e.target.value)!
                        patchFilter(f.id, { fieldId: c.id, op: OPS[c.type][0].op, value: '' })
                      }}
                    >
                      {cols.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <select value={f.op} onChange={(e) => patchFilter(f.id, { op: e.target.value })}>
                      {OPS[col.type].map((o) => (
                        <option key={o.op} value={o.op}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    {def?.needs &&
                      (col.type === 'select' || col.type === 'multi' ? (
                        <select value={f.value} onChange={(e) => patchFilter(f.id, { value: e.target.value })}>
                          <option value="">Chọn…</option>
                          {col.options.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
                          value={f.value}
                          placeholder="Giá trị…"
                          onChange={(e) => patchFilter(f.id, { value: e.target.value })}
                        />
                      ))}
                    <span className="spacer" />
                    <button
                      className="icon-btn danger"
                      title="Bỏ điều kiện"
                      onClick={() => setCfg({ filters: cfg.filters.filter((x) => x.id !== f.id) })}
                    >
                      ✕
                    </button>
                  </div>
                )
              })}
              <button
                className="pop-item"
                onClick={() => {
                  const c = cols.find((x) => x.type === 'select') ?? cols[0]
                  setCfg({ filters: [...cfg.filters, { id: uid(), fieldId: c.id, op: OPS[c.type][0].op, value: '' }] })
                }}
              >
                + Thêm điều kiện
              </button>
            </div>
          )}
        </div>

        <label className="tb-item tb-select">
          ⇅ Sắp xếp
          <select
            aria-label="Sắp xếp theo"
            value={sortCol ? sortCol.id : ''}
            onChange={(e) => setCfg({ sort: e.target.value ? { fieldId: e.target.value, dir: cfg.sort?.dir ?? 'asc' } : null })}
          >
            <option value="">Không</option>
            {cols.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {sortCol && cfg.sort && (
          <button
            className="tb-btn on"
            title="Đổi chiều sắp xếp"
            onClick={() => setCfg({ sort: { fieldId: sortCol.id, dir: cfg.sort!.dir === 'asc' ? 'desc' : 'asc' } })}
          >
            {cfg.sort.dir === 'asc' ? '↑ Tăng dần' : '↓ Giảm dần'}
          </button>
        )}

        <label className="tb-item tb-select">
          ▤ Nhóm theo
          <select
            aria-label="Nhóm theo"
            value={groupField ? groupField.id : ''}
            onChange={(e) => {
              setClosed(new Set())
              setCfg({ groupBy: e.target.value || null })
            }}
          >
            <option value="">Không</option>
            {selectFields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name || 'Chưa đặt tên'}
              </option>
            ))}
          </select>
        </label>

        <span className="spacer" />
        <span className="tb-count">{total} công việc</span>
        {customized && (
          <button
            className="tb-btn"
            onClick={() => {
              setSearch('')
              setCfg({ filters: [], sort: null, groupBy: null })
            }}
          >
            Đặt lại
          </button>
        )}
      </div>

      <div className="table-scroll">
        <div className="tbl" style={{ minWidth }}>
          <div className="trow thead" style={{ gridTemplateColumns: gridCols }}>
            <div className="tcell th">
              <span className="prop-icon">Aa</span> Công việc
            </div>
            {fields.map((f) => (
              <div key={f.id} className="tcell th">
                <button className="th-btn pop-anchor" title="Sửa trường và các lựa chọn" onClick={() => toggle('name:' + f.id)}>
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

          {sections.map((s) => {
            const skey = s.key ?? '*'
            const isClosed = closed.has(skey)
            return (
              <div key={skey} className={s.key !== null ? 'tgroup' : undefined}>
                {s.key !== null && (
                  <div className="tgroup-head">
                    <button
                      className="caret"
                      onClick={() =>
                        setClosed((c) => {
                          const n = new Set(c)
                          if (!n.delete(skey)) n.add(skey)
                          return n
                        })
                      }
                    >
                      {isClosed ? '▸' : '▾'}
                    </button>
                    {s.opt ? (
                      <span className={`chip c${s.opt.color % COLORS}`}>{s.opt.label}</span>
                    ) : (
                      <span className="muted">Chưa có {groupField?.name.toLowerCase()}</span>
                    )}
                    <span className="tb-count">{s.rows.length}</span>
                  </div>
                )}
                {!isClosed &&
                  s.rows.map(({ task, depth, parent }) => {
                    const i = order.indexOf(task.id)
                    return (
                      <div
                        key={task.id}
                        className={'trow' + (detailId === task.id ? ' selected' : '')}
                        style={{ gridTemplateColumns: gridCols }}
                      >
                        <TitleCell
                          task={task}
                          depth={depth}
                          parent={flat ? parent : null}
                          tree={!flat}
                          mutate={mutate}
                          focus={focusId === task.id}
                          onFocused={() => setFocusId(null)}
                          onFocusId={setFocusId}
                          prevId={order[i - 1]}
                          nextId={order[i + 1]}
                          onEnter={() => create(s.key, { after: task.id })}
                          onAddSub={() => create(s.key, { parent: task.id })}
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
                    )
                  })}
                {!isClosed && (
                  <button className="add-task tbl-add" onClick={() => create(s.key)}>
                    + Công việc mới
                  </button>
                )}
              </div>
            )
          })}
          {flat && total === 0 && !groupField && <div className="tbl-empty">Không có công việc nào khớp.</div>}
        </div>
      </div>
    </div>
  )
}

interface TitleProps {
  task: Task
  depth: number
  /** Task cha, chỉ hiện khi bảng đang ở dạng phẳng (lọc / nhóm / tìm). */
  parent: Task | null
  tree: boolean
  mutate: Mutate
  focus: boolean
  onFocused: () => void
  onFocusId: (id: string) => void
  prevId: string | undefined
  nextId: string | undefined
  onEnter: () => void
  onAddSub: () => void
  onOpenDetail: (id: string) => void
}

function TitleCell(p: TitleProps) {
  const { task, depth, parent, tree, mutate, focus, onFocused, onFocusId, prevId, nextId } = p
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
      p.onEnter()
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
      {tree && (
        <button
          className={'caret' + (hasChildren ? '' : ' invisible')}
          tabIndex={-1}
          onClick={() => update((t) => (t.collapsed = !t.collapsed))}
        >
          {task.collapsed ? '▸' : '▾'}
        </button>
      )}
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
      {parent && (
        <span className="parent-crumb" title={'Thuộc: ' + parent.title}>
          ↳ {parent.title || 'Chưa đặt tên'}
        </span>
      )}
      {task.notes && <span className="has-notes" title="Có ghi chú">📝</span>}
      <div className="tcell-actions">
        <button className="icon-btn" title="Thêm subtask" tabIndex={-1} onClick={p.onAddSub}>
          ＋
        </button>
        <button className="icon-btn" title="Mở chi tiết / ghi chú" tabIndex={-1} onClick={() => p.onOpenDetail(task.id)}>
          ⤢
        </button>
        <button className="icon-btn danger" title="Xoá" tabIndex={-1} onClick={() => mutate((ts) => remove(ts, task.id))}>
          ✕
        </button>
      </div>
    </div>
  )
}
