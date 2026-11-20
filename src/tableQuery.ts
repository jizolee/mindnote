import { today } from './fields'
import type { Field, FieldOption, FieldType, PropValue, TableFilter, Task } from './types'

/** Id cột đặc biệt, không phải trường do người dùng tạo. */
export const TITLE = '__title__'
export const DONE = '__done__'

export interface Column {
  id: string
  name: string
  type: FieldType
  options: FieldOption[]
}

/** Mọi cột có thể lọc / sắp xếp: tên task, các trường, và trạng thái hoàn thành. */
export function columns(fields: Field[]): Column[] {
  return [
    { id: TITLE, name: 'Công việc', type: 'text', options: [] },
    ...fields.map((f) => ({ id: f.id, name: f.name || 'Chưa đặt tên', type: f.type, options: f.options })),
    { id: DONE, name: 'Hoàn thành', type: 'checkbox', options: [] },
  ]
}

export function valueOf(task: Task, colId: string): PropValue | undefined {
  if (colId === TITLE) return task.title
  if (colId === DONE) return task.done
  return task.props[colId]
}

export interface OpDef {
  op: string
  label: string
  /** Điều kiện có cần nhập giá trị không. */
  needs: boolean
}

const EMPTY: OpDef[] = [
  { op: 'empty', label: 'trống', needs: false },
  { op: 'notempty', label: 'không trống', needs: false },
]

export const OPS: Record<FieldType, OpDef[]> = {
  text: [
    { op: 'contains', label: 'chứa', needs: true },
    { op: 'notcontains', label: 'không chứa', needs: true },
    ...EMPTY,
  ],
  number: [
    { op: 'eq', label: '=', needs: true },
    { op: 'gte', label: '≥', needs: true },
    { op: 'lte', label: '≤', needs: true },
    ...EMPTY,
  ],
  date: [
    { op: 'eq', label: 'đúng ngày', needs: true },
    { op: 'lte', label: 'đến hết ngày', needs: true },
    { op: 'gte', label: 'từ ngày', needs: true },
    { op: 'overdue', label: 'quá hạn (chưa xong)', needs: false },
    ...EMPTY,
  ],
  select: [{ op: 'is', label: 'là', needs: true }, { op: 'isnot', label: 'không là', needs: true }, ...EMPTY],
  multi: [{ op: 'is', label: 'có', needs: true }, { op: 'isnot', label: 'không có', needs: true }, ...EMPTY],
  checkbox: [
    { op: 'checked', label: 'đã tick', needs: false },
    { op: 'unchecked', label: 'chưa tick', needs: false },
  ],
}

export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()

const isEmpty = (v: PropValue | undefined) =>
  v === undefined || v === '' || v === false || (Array.isArray(v) && v.length === 0)

const ids = (v: PropValue | undefined): string[] => (Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : [])

/** Điều kiện đã đủ thông tin để áp dụng chưa. */
export function filterActive(f: TableFilter, col: Column): boolean {
  const def = OPS[col.type].find((o) => o.op === f.op)
  return !!def && (!def.needs || f.value !== '')
}

export function matches(task: Task, f: TableFilter, col: Column): boolean {
  const v = valueOf(task, col.id)
  switch (f.op) {
    case 'empty':
      return isEmpty(v)
    case 'notempty':
      return !isEmpty(v)
    case 'checked':
      return v === true
    case 'unchecked':
      return v !== true
    case 'contains':
      return fold(String(v ?? '')).includes(fold(f.value))
    case 'notcontains':
      return !fold(String(v ?? '')).includes(fold(f.value))
    case 'is':
      return ids(v).includes(f.value)
    case 'isnot':
      return !ids(v).includes(f.value)
    case 'overdue':
      return typeof v === 'string' && v !== '' && v < today() && !task.done
  }
  if (isEmpty(v)) return false
  if (col.type === 'number') {
    const a = Number(v)
    const b = Number(f.value)
    return f.op === 'eq' ? a === b : f.op === 'gte' ? a >= b : a <= b
  }
  const a = String(v)
  return f.op === 'eq' ? a === f.value : f.op === 'gte' ? a >= f.value : a <= f.value
}

/** Khoá sắp xếp; `null` = trống (luôn xếp cuối). */
function sortKey(task: Task, col: Column): string | number | null {
  const v = valueOf(task, col.id)
  if (col.type === 'checkbox') return v === true ? 1 : 0
  if (isEmpty(v)) return null
  if (col.type === 'select' || col.type === 'multi') {
    const idx = ids(v)
      .map((id) => col.options.findIndex((o) => o.id === id))
      .filter((i) => i >= 0)
    return idx.length ? Math.min(...idx) : null
  }
  if (col.type === 'number') return Number(v)
  return String(v)
}

export function comparator(col: Column, dir: 'asc' | 'desc') {
  const sign = dir === 'asc' ? 1 : -1
  return (a: Task, b: Task): number => {
    const ka = sortKey(a, col)
    const kb = sortKey(b, col)
    if (ka === null || kb === null) return ka === kb ? 0 : ka === null ? 1 : -1
    if (typeof ka === 'number' && typeof kb === 'number') return (ka - kb) * sign
    return String(ka).localeCompare(String(kb), 'vi', { numeric: true }) * sign
  }
}

/** Sắp xếp anh em ở từng cấp, giữ nguyên cấu trúc cha–con. Không sửa dữ liệu gốc. */
export function sortTree(tasks: Task[], cmp: (a: Task, b: Task) => number): Task[] {
  return [...tasks].sort(cmp).map((t) => (t.children.length ? { ...t, children: sortTree(t.children, cmp) } : t))
}

export interface FlatTask {
  task: Task
  parent: Task | null
}

export function allTasks(tasks: Task[], parent: Task | null = null, out: FlatTask[] = []): FlatTask[] {
  for (const t of tasks) {
    out.push({ task: t, parent })
    allTasks(t.children, t, out)
  }
  return out
}
