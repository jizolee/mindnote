import type { Block } from './blocks'

export type FieldType = 'text' | 'number' | 'select' | 'multi' | 'date' | 'checkbox'

export interface FieldOption {
  id: string
  label: string
  color: number
}

/** Định nghĩa một trường (property) dùng chung cho mọi task trong dự án. */
export interface Field {
  id: string
  name: string
  type: FieldType
  options: FieldOption[]
}

export interface TableFilter {
  id: string
  /** Id trường, hoặc cột đặc biệt (tên task / hoàn thành) — xem tableQuery.ts. */
  fieldId: string
  op: string
  value: string
}

/** Cấu hình chế độ Bảng của một dự án. */
export interface TableConfig {
  filters: TableFilter[]
  sort: { fieldId: string; dir: 'asc' | 'desc' } | null
  /** Id của trường kiểu lựa chọn dùng để nhóm. */
  groupBy: string | null
  /** Id của trường kiểu lựa chọn làm cột trong Kanban; null = trường lựa chọn đầu tiên. */
  boardBy: string | null
}

export type PropValue = string | number | boolean | string[]

export interface Task {
  id: string
  title: string
  done: boolean
  notes: string
  collapsed: boolean
  /** Giá trị các trường, theo id của Field. */
  props: Record<string, PropValue>
  children: Task[]
}

export interface Project {
  id: string
  title: string
  icon: string
  /** Nội dung mô tả dạng khối. */
  blocks: Block[]
  fields: Field[]
  table: TableConfig
  tasks: Task[]
  createdAt: number
}

export interface AppState {
  projects: Project[]
  activeId: string | null
}

export type Mutate = (fn: (tasks: Task[]) => void) => void
