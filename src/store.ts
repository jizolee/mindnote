import { useSyncExternalStore } from 'react'
import type { AppState, Project, PropValue, Task } from './types'
import { newBlock, textToBlocks } from './blocks'
import { defaultFields } from './fields'
import { newTask, uid } from './tree'

const KEY = 'mindnote:v1'

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

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw) as AppState
      if (Array.isArray(s.projects)) {
        // Dữ liệu cũ lưu mô tả dạng chuỗi `notes` → chuyển sang khối.
        for (const p of s.projects as (Project & { notes?: string })[]) {
          if (!Array.isArray(p.blocks) || p.blocks.length === 0) p.blocks = textToBlocks(p.notes ?? '')
          delete p.notes
          // Dữ liệu trước khi có trường: thêm bộ trường mặc định và `props` rỗng cho mọi task.
          if (!Array.isArray(p.fields)) p.fields = defaultFields()
          const fix = (ts: Task[]) =>
            ts.forEach((t) => {
              t.props ??= {}
              fix(t.children)
            })
          fix(p.tasks)
        }
        return s
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
  updateProject(id: string, patch: Partial<Pick<Project, 'title' | 'icon' | 'blocks' | 'fields'>>) {
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
