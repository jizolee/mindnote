import { addChild, ancestors, count, locate, newTask, setDone } from '../tree'
import type { Mutate, Project, Task } from '../types'
import AutoTextarea from './AutoTextarea'
import { PropertyPanel } from './Fields'

interface Props {
  project: Project
  taskId: string
  mutate: Mutate
  onNavigate: (id: string) => void
  onClose: () => void
}

export default function TaskDetail({ project, taskId, mutate, onNavigate, onClose }: Props) {
  const loc = locate(project.tasks, taskId)
  if (!loc) return null
  const task = loc.task
  const path = ancestors(project.tasks, taskId)
  const c = count(task.children)

  const update = (id: string, fn: (t: Task) => void) =>
    mutate((ts) => {
      const l = locate(ts, id)
      if (l) fn(l.task)
    })

  return (
    <aside className="detail">
      <div className="detail-head">
        <div className="detail-path">
          <span>{project.icon}</span>
          {path.map((p) => (
            <span key={p.id}>
              {' / '}
              <a onClick={() => onNavigate(p.id)}>{p.title || 'Chưa đặt tên'}</a>
            </span>
          ))}
        </div>
        <button className="icon-btn" title="Đóng" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="detail-title-row">
        <input
          type="checkbox"
          className="check"
          checked={task.done}
          onChange={(e) => update(task.id, (t) => setDone(t, e.target.checked))}
        />
        <input
          className={'detail-title' + (task.done ? ' done' : '')}
          value={task.title}
          placeholder="Chưa đặt tên"
          onChange={(e) => update(task.id, (t) => (t.title = e.target.value))}
        />
      </div>

      <PropertyPanel project={project} task={task} mutate={mutate} />

      <div className="detail-label">Ghi chú</div>
      <AutoTextarea
        className="detail-notes"
        value={task.notes}
        placeholder="Thêm ghi chú cho công việc này…"
        onChange={(v) => update(task.id, (t) => (t.notes = v))}
      />

      <div className="detail-label">
        Subtask{' '}
        {c.total > 0 && (
          <span className="muted">
            · {c.done}/{c.total}
          </span>
        )}
      </div>
      <div className="detail-subs">
        {task.children.map((s) => (
          <div key={s.id} className="detail-sub">
            <input
              type="checkbox"
              className="check"
              checked={s.done}
              onChange={(e) => update(s.id, (t) => setDone(t, e.target.checked))}
            />
            <a className={s.done ? 'done' : ''} onClick={() => onNavigate(s.id)}>
              {s.title || 'Chưa đặt tên'}
            </a>
          </div>
        ))}
        <button
          className="add-task"
          onClick={() => {
            const t = newTask()
            mutate((ts) => addChild(ts, task.id, t))
            onNavigate(t.id)
          }}
        >
          + Thêm subtask
        </button>
      </div>
    </aside>
  )
}
