import { useEffect, useState } from 'react'
import { COLORS, FIELD_TYPES, fmtDate, isOverdue, newField, typeIcon } from '../fields'
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
  const out: JSX.Element[] = []
  for (const f of fields) {
    const v = task.props[f.id]
    if (v === undefined || v === '' || v === false) continue
    if (f.type === 'select' || f.type === 'multi') {
      for (const id of asList(v)) {
        const o = f.options.find((x) => x.id === id)
        if (o) out.push(<Chip key={f.id + id} opt={o} />)
      }
    } else if (f.type === 'date') {
      const late = !task.done && isOverdue(String(v))
      out.push(
        <span key={f.id} className={'meta' + (late ? ' late' : '')} title={f.name + (late ? ' · quá hạn' : '')}>
          📅 {fmtDate(String(v))}
        </span>,
      )
    } else if (f.type === 'checkbox') {
      out.push(
        <span key={f.id} className="meta" title={f.name}>
          ☑ {f.name}
        </span>,
      )
    } else {
      out.push(
        <span key={f.id} className="meta" title={f.name}>
          {String(v)}
        </span>,
      )
    }
  }
  return out.length ? <div className="row-chips">{out}</div> : null
}

interface PanelProps {
  project: Project
  task: Task
  mutate: Mutate
}

/** Bảng trường kiểu Notion trong panel chi tiết task. */
export function PropertyPanel({ project, task, mutate }: PanelProps) {
  const [open, setOpen] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const fields = project.fields

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

  const setFields = (next: Field[]) => actions.updateProject(project.id, { fields: next })
  const setField = (f: Field) => setFields(fields.map((x) => (x.id === f.id ? f : x)))
  const setValue = (fid: string, v: PropValue | undefined) =>
    mutate((ts) => {
      const l = locate(ts, task.id)
      if (!l) return
      const empty = v === undefined || v === '' || v === false || (Array.isArray(v) && v.length === 0)
      if (empty) delete l.task.props[fid]
      else l.task.props[fid] = v
    })
  const toggle = (key: string) => setOpen((o) => (o === key ? null : key))

  return (
    <div className="props">
      {fields.map((f) => {
        const v = task.props[f.id]
        return (
          <div key={f.id} className="prop">
            <button className="prop-name pop-anchor" title="Đổi tên / xoá trường" onClick={() => toggle('name:' + f.id)}>
              <span className="prop-icon">{typeIcon(f.type)}</span>
              <span className="prop-label">{f.name || 'Chưa đặt tên'}</span>
            </button>

            <div className="prop-value">
              {f.type === 'text' && (
                <input value={typeof v === 'string' ? v : ''} placeholder="Trống" onChange={(e) => setValue(f.id, e.target.value)} />
              )}
              {f.type === 'number' && (
                <input
                  type="number"
                  value={typeof v === 'number' ? v : ''}
                  placeholder="Trống"
                  onChange={(e) => setValue(f.id, e.target.value === '' ? undefined : Number(e.target.value))}
                />
              )}
              {f.type === 'date' && (
                <input
                  type="date"
                  className={typeof v === 'string' && v && !task.done && isOverdue(v) ? 'late' : ''}
                  value={typeof v === 'string' ? v : ''}
                  onChange={(e) => setValue(f.id, e.target.value)}
                />
              )}
              {f.type === 'checkbox' && (
                <input type="checkbox" className="check" checked={v === true} onChange={(e) => setValue(f.id, e.target.checked)} />
              )}
              {(f.type === 'select' || f.type === 'multi') && (
                <SelectEditor
                  field={f}
                  value={asList(v)}
                  open={open === 'val:' + f.id}
                  onToggle={() => toggle('val:' + f.id)}
                  onClose={() => setOpen(null)}
                  onChange={(ids) => setValue(f.id, f.type === 'multi' ? ids : ids[0])}
                  onFieldChange={setField}
                />
              )}
            </div>

            {open === 'name:' + f.id && (
              <div className="pop">
                <input
                  className="pop-input"
                  autoFocus
                  value={f.name}
                  placeholder="Tên trường"
                  onChange={(e) => setField({ ...f, name: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && setOpen(null)}
                />
                <div className="pop-label">Kiểu: {FIELD_TYPES.find((t) => t.type === f.type)?.label}</div>
                <button
                  className="pop-item danger"
                  onClick={() => {
                    if (confirm(`Xoá trường "${f.name}" khỏi mọi công việc trong dự án này?`)) {
                      setFields(fields.filter((x) => x.id !== f.id))
                      setOpen(null)
                    }
                  }}
                >
                  ✕ Xoá trường
                </button>
              </div>
            )}
          </div>
        )
      })}

      <div className="prop">
        <button className="prop-add pop-anchor" onClick={() => toggle('add')}>
          + Thêm trường
        </button>
        {open === 'add' && (
          <div className="pop">
            <input
              className="pop-input"
              autoFocus
              value={newName}
              placeholder="Tên trường"
              onChange={(e) => setNewName(e.target.value)}
            />
            <div className="pop-label">Chọn kiểu</div>
            {FIELD_TYPES.map((t) => (
              <button
                key={t.type}
                className="pop-item"
                onClick={() => {
                  setFields([...fields, newField(newName.trim() || t.label, t.type)])
                  setNewName('')
                  setOpen(null)
                }}
              >
                <span className="prop-icon">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
        )}
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
