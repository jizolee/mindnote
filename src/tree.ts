import type { Task } from './types'

export const uid = () => crypto.randomUUID()

export function newTask(title = ''): Task {
  return { id: uid(), title, done: false, notes: '', collapsed: false, props: {}, children: [] }
}

export interface Loc {
  list: Task[]
  index: number
  parent: Task | null
  task: Task
}

export function locate(tasks: Task[], id: string, parent: Task | null = null): Loc | null {
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i]
    if (t.id === id) return { list: tasks, index: i, parent, task: t }
    const r = locate(t.children, id, t)
    if (r) return r
  }
  return null
}

/** Đường dẫn từ gốc tới task (không gồm chính nó). */
export function ancestors(tasks: Task[], id: string): Task[] {
  const path: Task[] = []
  let loc = locate(tasks, id)
  while (loc?.parent) {
    path.unshift(loc.parent)
    loc = locate(tasks, loc.parent.id)
  }
  return path
}

export function addChild(tasks: Task[], parentId: string | null, task: Task) {
  if (parentId === null) {
    tasks.push(task)
    return
  }
  const loc = locate(tasks, parentId)
  if (!loc) return
  loc.task.children.push(task)
  loc.task.collapsed = false
}

export function insertAfter(tasks: Task[], siblingId: string, task: Task) {
  const loc = locate(tasks, siblingId)
  if (loc) loc.list.splice(loc.index + 1, 0, task)
}

export function remove(tasks: Task[], id: string) {
  const loc = locate(tasks, id)
  if (loc) loc.list.splice(loc.index, 1)
}

export function indent(tasks: Task[], id: string) {
  const loc = locate(tasks, id)
  if (!loc || loc.index === 0) return
  const prev = loc.list[loc.index - 1]
  loc.list.splice(loc.index, 1)
  prev.children.push(loc.task)
  prev.collapsed = false
}

export function outdent(tasks: Task[], id: string) {
  const loc = locate(tasks, id)
  if (!loc || !loc.parent) return
  const ploc = locate(tasks, loc.parent.id)
  if (!ploc) return
  loc.list.splice(loc.index, 1)
  ploc.list.splice(ploc.index + 1, 0, loc.task)
}

export type DropPos = 'child' | 'before' | 'after'

/** Có thể thả task `id` vào `targetId` không (không thả vào chính nó hay con cháu của nó). */
export function canMove(tasks: Task[], id: string, targetId: string | null): boolean {
  const loc = locate(tasks, id)
  if (!loc) return false
  if (targetId === null) return true
  return targetId !== id && !locate(loc.task.children, targetId) && !!locate(tasks, targetId)
}

/** Chuyển task `id` thành con của / đứng trước / đứng sau `targetId` (null = gốc dự án, chỉ nhận 'child'). */
export function move(tasks: Task[], id: string, targetId: string | null, pos: DropPos) {
  if (!canMove(tasks, id, targetId)) return
  if (targetId === null && pos !== 'child') return
  const loc = locate(tasks, id)!
  loc.list.splice(loc.index, 1)
  if (pos === 'child') {
    addChild(tasks, targetId, loc.task)
    return
  }
  const t = locate(tasks, targetId!)!
  t.list.splice(t.index + (pos === 'after' ? 1 : 0), 0, loc.task)
}

/** Đánh dấu xong sẽ kéo theo toàn bộ subtask; bỏ đánh dấu chỉ áp dụng cho chính nó. */
export function setDone(task: Task, done: boolean) {
  task.done = done
  if (done) task.children.forEach((c) => setDone(c, true))
}

export function count(tasks: Task[]): { total: number; done: number } {
  let total = 0
  let done = 0
  for (const t of tasks) {
    total++
    if (t.done) done++
    const c = count(t.children)
    total += c.total
    done += c.done
  }
  return { total, done }
}

/** Danh sách phẳng các task đang hiển thị (bỏ qua nhánh đã thu gọn). */
export function visible(tasks: Task[], out: Task[] = []): Task[] {
  for (const t of tasks) {
    out.push(t)
    if (!t.collapsed) visible(t.children, out)
  }
  return out
}
