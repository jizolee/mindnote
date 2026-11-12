import { useSyncExternalStore } from 'react'
import type { AppState, Field, Project, PropValue, TableConfig, Task } from './types'
import { newBlock, textToBlocks, type Block } from './blocks'
import { defaultFields } from './fields'
import { newTask, uid } from './tree'

const KEY = 'mindnote:v1'

const emptyTable = (): TableConfig => ({ filters: [], sort: null, groupBy: null, boardBy: null })

function seed(): AppState {
  const fields = defaultFields()
  const [status, prio, due, owner, tags] = fields
  tags.options = ['Web', 'Nội dung', 'Hạ tầng'].map((label, i) => ({ id: uid(), label, color: [1, 4, 6][i] }))
  const opt = (f: (typeof fields)[number], label: string) => f.options.find((o) => o.label === label)!.id
  const day = (offset: number) => {
    const d = new Date(Date.now() + offset * 86400000)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const t = (title: string, children: Task[] = [], done = false, props: Record<string, PropValue> = {}): Task => ({
    ...newTask(title),
    done,
    children,
    props,
  })
  const p: Project = {
    id: uid(),
    title: 'Ra mắt website mới',
    icon: '🚀',
    blocks: [
      newBlock('p', 'Đây là trang dự án mẫu. Phần mô tả này là trình soạn thảo dạng khối.'),
      newBlock('h2', 'Mục tiêu'),
      newBlock('bullet', 'Ra mắt trước cuối quý'),
      newBlock('bullet', 'Tốc độ tải trang dưới 2 giây'),
      newBlock('h2', 'Cần chốt'),
      newBlock('todo', 'Chọn tên miền', true),
      newBlock('todo', 'Duyệt ngân sách'),
      newBlock('quote', "Gõ '/' ở đầu dòng trống để chèn khối. Chuyển sang tab Mindmap để xem công việc dạng sơ đồ."),
    ],
    createdAt: Date.now(),
    fields,
    table: emptyTable(),
    tasks: [
      t('Thiết kế', [
        t('Wireframe trang chủ', [], true),
        t('Bộ nhận diện', [t('Logo', [], true), t('Bảng màu')]),
      ]),
      t('Phát triển', [
        t('Frontend', [t('Trang chủ'), t('Trang liên hệ')], false, {
          [status.id]: opt(status, 'Đang làm'),
          [prio.id]: opt(prio, 'Cao'),
          [due.id]: day(7),
          [owner.id]: 'Minh',
          [tags.id]: [opt(tags, 'Web')],
        }),
        t('Backend', [t('API đăng ký')], false, {
          [status.id]: opt(status, 'Chưa bắt đầu'),
          [due.id]: day(-2),
          [tags.id]: [opt(tags, 'Web'), opt(tags, 'Hạ tầng')],
        }),
      ]),
      t('Ra mắt', [t('Kiểm thử'), t('Viết bài thông báo')]),
    ],
  }
  return { projects: [p], activeId: p.id }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function normTask(r: any): Task {
  return {
    id: typeof r?.id === 'string' && r.id ? r.id : uid(),
    title: String(r?.title ?? ''),
    done: !!r?.done,
    notes: String(r?.notes ?? ''),
    collapsed: !!r?.collapsed,
    props: r?.props && typeof r.props === 'object' && !Array.isArray(r.props) ? r.props : {},
    children: Array.isArray(r?.children) ? r.children.map(normTask) : [],
  }
}

/** Đưa một dự án đọc từ storage / file về đúng cấu trúc hiện tại (kể cả dữ liệu của các bản cũ). */
function normProject(r: any): Project | null {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null
  const blocks: Block[] = Array.isArray(r.blocks)
    ? r.blocks
        .filter((b: any) => b && typeof b.type === 'string' && typeof b.text === 'string')
        .map((b: any) => ({ ...b, id: typeof b.id === 'string' && b.id ? b.id : uid() }))
    : []
  const fields: Field[] | null = Array.isArray(r.fields)
    ? r.fields
        .filter((f: any) => f && typeof f.id === 'string' && typeof f.type === 'string')
        .map((f: any) => ({ ...f, name: String(f.name ?? ''), options: Array.isArray(f.options) ? f.options : [] }))
    : null
  return {
    id: typeof r.id === 'string' && r.id ? r.id : uid(),
    title: String(r.title ?? ''),
    icon: typeof r.icon === 'string' && r.icon ? r.icon : '📄',
    // Bản đầu tiên lưu mô tả dạng chuỗi `notes`.
    blocks: blocks.length ? blocks : textToBlocks(typeof r.notes === 'string' ? r.notes : ''),
    fields: fields ?? defaultFields(),
    table: {
      filters: Array.isArray(r.table?.filters)
        ? r.table.filters
            .filter((f: any) => f && typeof f.fieldId === 'string' && typeof f.op === 'string')
            .map((f: any) => ({ id: typeof f.id === 'string' ? f.id : uid(), fieldId: f.fieldId, op: f.op, value: String(f.value ?? '') }))
        : [],
      sort:
        r.table?.sort && typeof r.table.sort.fieldId === 'string'
          ? { fieldId: r.table.sort.fieldId, dir: r.table.sort.dir === 'desc' ? 'desc' : 'asc' }
          : null,
      groupBy: typeof r.table?.groupBy === 'string' ? r.table.groupBy : null,
      boardBy: typeof r.table?.boardBy === 'string' ? r.table.boardBy : null,
    },
    tasks: Array.isArray(r.tasks) ? r.tasks.map(normTask) : [],
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
  }
}

function normProjects(list: unknown): Project[] {
  if (!Array.isArray(list)) return []
  return list.map(normProject).filter((p): p is Project => p !== null)
}

/** Đọc nội dung file sao lưu. Ném lỗi (thông báo tiếng Việt) nếu file không hợp lệ. */
export function parseBackup(text: string): Project[] {
  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('File không phải JSON hợp lệ.')
  }
  if (!data || !Array.isArray(data.projects)) throw new Error('File không phải bản sao lưu của MindNote.')
  const projects = normProjects(data.projects)
  if (projects.length === 0) throw new Error('File không chứa dự án nào.')
  return projects
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw)
      if (s && Array.isArray(s.projects)) {
        const projects = normProjects(s.projects)
        const activeId = projects.some((p) => p.id === s.activeId) ? s.activeId : (projects[0]?.id ?? null)
        return { projects, activeId }
      }
    }
  } catch {
    /* dữ liệu hỏng hoặc không truy cập được storage → dùng dữ liệu mẫu */
  }
  return seed()
}

let state: AppState = load()
const listeners = new Set<() => void>()

function set(next: AppState) {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* bỏ qua lỗi storage đầy / bị chặn */
  }
  listeners.forEach((l) => l())
}

export function useApp(): AppState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

export const actions = {
  /** Nội dung file sao lưu của toàn bộ dự án. */
  exportData(): string {
    return JSON.stringify(
      { app: 'mindnote', version: 1, exportedAt: new Date().toISOString(), projects: state.projects },
      null,
      2,
    )
  },
  /** 'merge': thêm vào, dự án trùng id được thay bằng bản trong file. 'replace': thay toàn bộ. */
  importData(incoming: Project[], mode: 'merge' | 'replace') {
    let projects: Project[]
    if (mode === 'replace') {
      projects = incoming
    } else {
      const byId = new Map(incoming.map((p) => [p.id, p]))
      projects = state.projects.map((p) => byId.get(p.id) ?? p)
      const have = new Set(state.projects.map((p) => p.id))
      projects.push(...incoming.filter((p) => !have.has(p.id)))
    }
    const activeId = projects.some((p) => p.id === state.activeId) ? state.activeId : (projects[0]?.id ?? null)
    set({ projects, activeId })
  },
  setActive(id: string) {
    set({ ...state, activeId: id })
  },
  addProject() {
    const p: Project = {
      id: uid(),
      title: '',
      icon: '📄',
      blocks: [newBlock()],
      fields: defaultFields(),
      table: emptyTable(),
      tasks: [],
      createdAt: Date.now(),
    }
    set({ projects: [...state.projects, p], activeId: p.id })
  },
  deleteProject(id: string) {
    const projects = state.projects.filter((p) => p.id !== id)
    const activeId = state.activeId === id ? (projects[0]?.id ?? null) : state.activeId
    set({ projects, activeId })
  },
  updateProject(id: string, patch: Partial<Pick<Project, 'title' | 'icon' | 'blocks' | 'fields' | 'table'>>) {
    set({
      ...state,
      projects: state.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    })
  },
  mutateTasks(id: string, fn: (tasks: Task[]) => void) {
    set({
      ...state,
      projects: state.projects.map((p) => {
        if (p.id !== id) return p
        const tasks = structuredClone(p.tasks)
        fn(tasks)
        return { ...p, tasks }
      }),
    })
  },
}
