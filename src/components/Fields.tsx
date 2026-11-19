import { useEffect, useState } from 'react'
import { COLORS, FIELD_TYPES, fieldChips, isOverdue, newField, typeIcon } from '../fields'
import { actions } from '../store'
import { locate, uid } from '../tree'
import type { Field, FieldOption, Mutate, Project, PropValue, Task } from '../types'

const asList = (v: PropValue | undefined): string[] =>
  Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : []

function Chip({ opt }: { opt: FieldOption }) {
  return <span className={`chip c${opt.color % COLORS}`}>{opt.label}</span>
}

/** Các giá trị trường hiển thị gọn trên một dòng task. */
export function RowChips({ fields, task }: { fields: Field[]; task: Task }) {
  const chips = fieldChips(fields, task)
  if (chips.length === 0) return null
  return (
    <div className="row-chips">
      {chips.map((c) =>
        c.color === null ? (
          <span key={c.key} className={'meta' + (c.late ? ' late' : '')} title={c.title}>
            {c.label}
          </span>
        ) : (
          <span key={c.key} className={`chip c${c.color % COLORS}`} title={c.title}>
            {c.label}
          </span>
        ),
      )}
    </div>
  )
}

/** Trạng thái popover dùng chung: một khoá đang mở, tự đóng khi bấm ra ngoài hoặc nhấn Esc. */
export function usePopover() {
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.pop, .pop-anchor')) setOpen(null)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  const toggle = (key: string) => setOpen((o) => (o === key ? null : key))
  return { open, setOpen, toggle }
}

export function setTaskProp(mutate: Mutate, taskId: string, fid: string, v: PropValue | undefined) {
  mutate((ts) => {
    const l = locate(ts, taskId)
    if (!l) return
    const empty = v === undefined || v === '' || v === false || (Array.isArray(v) && v.length === 0)
    if (empty) delete l.task.props[fid]
    else l.task.props[fid] = v
  })
}

interface ValueProps {
  field: Field
  value: PropValue | undefined
  /** Task đã xong thì không tô đỏ hạn chót quá hạn. */
  done: boolean
  open: boolean
  onToggle: () => void
  onClose: () => void
  onChange: (v: PropValue | undefined) => void
  onFieldChange: (f: Field) => void
}

/** Ô sửa giá trị của một trường, theo kiểu trường. */
export function FieldValue({ field: f, value: v, done, open, onToggle, onClose, onChange, onFieldChange }: ValueProps) {
  if (f.type === 'text') {
    return <input value={typeof v === 'string' ? v : ''} placeholder="Trống" onChange={(e) => onChange(e.target.value)} />
  }
  if (f.type === 'number') {
    return (
      <input
        type="number"
        value={typeof v === 'number' ? v : ''}
        placeholder="Trống"
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      />
    )
  }
  if (f.type === 'date') {
    const s = typeof v === 'string' ? v : ''
    return (
      <input
        type="date"
        className={(s ? '' : 'empty') + (s && !done && isOverdue(s) ? ' late' : '')}
        value={s}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }
  if (f.type === 'checkbox') {
    return <input type="checkbox" className="check" checked={v === true} onChange={(e) => onChange(e.target.checked)} />
  }
  return (
    <SelectEditor
      field={f}
      value={asList(v)}
      open={open}
      onToggle={onToggle}
      onClose={onClose}
      onChange={(ids) => onChange(f.type === 'multi' ? ids : ids[0])}
      onFieldChange={onFieldChange}
    />
  )
}

interface FieldMenuProps {
  project: Project
  onClose: () => void
}

/** Popover sửa một trường: đổi tên, quản lý các lựa chọn (thêm / đổi tên / đổi màu / xoá), xoá trường. */
export function FieldNameMenu({ project, field: f, onClose }: FieldMenuProps & { field: Field }) {
  const [newOpt, setNewOpt] = useState('')
  const setFields = (next: Field[]) => actions.updateProject(project.id, { fields: next })
  const setField = (next: Field) => setFields(project.fields.map((x) => (x.id === f.id ? next : x)))
  const patchOpt = (id: string, p: Partial<FieldOption>) =>
    setField({ ...f, options: f.options.map((o) => (o.id === id ? { ...o, ...p } : o)) })
  const hasOptions = f.type === 'select' || f.type === 'multi'

  const addOpt = () => {
    const label = newOpt.trim()
    if (!label || f.options.some((o) => o.label.toLowerCase() === label.toLowerCase())) return
    const used = new Set(f.options.map((o) => o.color))
    let color = f.options.length % COLORS
    for (let c = 0; c < COLORS; c++) {
      if (!used.has(c)) {
        color = c
        break
      }
    }
    setField({ ...f, options: [...f.options, { id: uid(), label, color }] })
    setNewOpt('')
  }

  return (
    <div className="pop field-menu">
      <input
        className="pop-input"
        autoFocus
        value={f.name}
        placeholder="Tên trường"
        onChange={(e) => setField({ ...f, name: e.target.value })}
        onKeyDown={(e) => e.key === 'Enter' && onClose()}
      />
      <div className="pop-label">Kiểu: {FIELD_TYPES.find((t) => t.type === f.type)?.label}</div>

      {hasOptions && (
        <>
          <div className="pop-label">Các lựa chọn</div>
          {f.options.map((o) => (
            <div key={o.id} className="opt-row">
              <button
                className={`opt-color chip c${o.color % COLORS}`}
                title="Đổi màu"
                onClick={() => patchOpt(o.id, { color: (o.color + 1) % COLORS })}
              />
              <input value={o.label} placeholder="Tên lựa chọn" onChange={(e) => patchOpt(o.id, { label: e.target.value })} />
              <button
                className="icon-btn danger"
                title="Xoá lựa chọn"
                onClick={() => setField({ ...f, options: f.options.filter((x) => x.id !== o.id) })}
              >
                ✕
              </button>
            </div>
          ))}
          <div className="opt-row">
            <input
              className="opt-new"
              value={newOpt}
              placeholder="Thêm lựa chọn…"
              onChange={(e) => setNewOpt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) addOpt()
              }}
            />
            <button className="btn-mini" onClick={addOpt} disabled={!newOpt.trim()}>
              Thêm
            </button>
          </div>
        </>
      )}

      <button
        className="pop-item danger"
        onClick={() => {
          if (confirm(`Xoá trường "${f.name}" khỏi mọi công việc trong dự án này?`)) {
            setFields(project.fields.filter((x) => x.id !== f.id))
            onClose()
          }
        }}
      >
        ✕ Xoá trường
      </button>
    </div>
  )
}

/** Popover thêm trường mới. */
export function AddFieldMenu({ project, onClose }: FieldMenuProps) {
  const [name, setName] = useState('')
  return (
    <div className="pop">
      <input className="pop-input" autoFocus value={name} placeholder="Tên trường" onChange={(e) => setName(e.target.value)} />
      <div className="pop-label">Chọn kiểu</div>
      {FIELD_TYPES.map((t) => (
        <button
          key={t.type}
          className="pop-item"
          onClick={() => {
            actions.updateProject(project.id, { fields: [...project.fields, newField(name.trim() || t.label, t.type)] })
            onClose()
          }}
        >
          <span className="prop-icon">{t.icon}</span>
          {t.label}
        </button>
      ))}
    </div>
  )
}

interface PanelProps {
  project: Project
  task: Task
  mutate: Mutate
}

/** Bảng trường kiểu Notion trong panel chi tiết task. */
export function PropertyPanel({ project, task, mutate }: PanelProps) {
  const { open, setOpen, toggle } = usePopover()
  const fields = project.fields
  const setField = (f: Field) => actions.updateProject(project.id, { fields: fields.map((x) => (x.id === f.id ? f : x)) })

  return (
    <div className="props">
      {fields.map((f) => (
        <div key={f.id} className="prop">
          <button className="prop-name pop-anchor" title="Đổi tên / xoá trường" onClick={() => toggle('name:' + f.id)}>
            <span className="prop-icon">{typeIcon(f.type)}</span>
            <span className="prop-label">{f.name || 'Chưa đặt tên'}</span>
          </button>
          <div className="prop-value">
            <FieldValue
              field={f}
              value={task.props[f.id]}
              done={task.done}
              open={open === 'val:' + f.id}
              onToggle={() => toggle('val:' + f.id)}
              onClose={() => setOpen(null)}
              onChange={(v) => setTaskProp(mutate, task.id, f.id, v)}
              onFieldChange={setField}
            />
          </div>
          {open === 'name:' + f.id && <FieldNameMenu project={project} field={f} onClose={() => setOpen(null)} />}
        </div>
      ))}
      <div className="prop">
        <button className="prop-add pop-anchor" onClick={() => toggle('add')}>
          + Thêm trường
        </button>
        {open === 'add' && <AddFieldMenu project={project} onClose={() => setOpen(null)} />}
      </div>
    </div>
  )
}

interface SelectProps {
  field: Field
  value: string[]
  open: boolean
  onToggle: () => void
  onClose: () => void
  onChange: (ids: string[]) => void
  onFieldChange: (f: Field) => void
}

function SelectEditor({ field, value, open, onToggle, onClose, onChange, onFieldChange }: SelectProps) {
  const [q, setQ] = useState('')
  const multi = field.type === 'multi'
  const chosen = field.options.filter((o) => value.includes(o.id))
  const query = q.trim()
  const shown = field.options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
  const exact = field.options.find((o) => o.label.toLowerCase() === query.toLowerCase())

  const pick = (id: string) => {
    if (multi) {
      onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])
    } else {
      onChange(value[0] === id ? [] : [id])
      onClose()
    }
    setQ('')
  }
  const create = () => {
    if (!query) return
    const used = new Set(field.options.map((o) => o.color))
    let color = field.options.length % COLORS
    for (let c = 0; c < COLORS; c++) {
      if (!used.has(c)) {
        color = c
        break
      }
    }
    const opt: FieldOption = { id: uid(), label: query, color }
    onFieldChange({ ...field, options: [...field.options, opt] })
    pick(opt.id)
  }

  return (
    <>
      <button className="select-value pop-anchor" onClick={onToggle}>
        {chosen.length ? chosen.map((o) => <Chip key={o.id} opt={o} />) : <span className="muted">Trống</span>}
      </button>
      {open && (
        <div className="pop">
          <input
            className="pop-input"
            autoFocus
            value={q}
            placeholder="Tìm hoặc tạo lựa chọn…"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
              if (exact) pick(exact.id)
              else if (query) create()
            }}
          />
          {shown.map((o) => (
            <div key={o.id} className={'pop-item' + (value.includes(o.id) ? ' on' : '')} onClick={() => pick(o.id)}>
              <Chip opt={o} />
              <span className="spacer" />
              {value.includes(o.id) && <span className="muted">✓</span>}
              <button
                className="icon-btn danger opt-del"
                title="Xoá lựa chọn"
                onClick={(e) => {
                  e.stopPropagation()
                  onFieldChange({ ...field, options: field.options.filter((x) => x.id !== o.id) })
                }}
              >
                ✕
              </button>
            </div>
          ))}
          {query && !exact && (
            <button className="pop-item" onClick={create}>
              Tạo <span className="chip c7">{query}</span>
            </button>
          )}
          {!query && field.options.length === 0 && <div className="pop-label">Gõ tên rồi nhấn Enter để tạo lựa chọn</div>}
        </div>
      )}
    </>
  )
}
