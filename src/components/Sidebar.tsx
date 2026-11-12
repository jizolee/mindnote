import { actions } from '../store'
import { count } from '../tree'
import type { Project } from '../types'

interface Props {
  projects: Project[]
  activeId: string | null
  onClose: () => void
}

export default function Sidebar({ projects, activeId, onClose }: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span className="brand">🧠 MindNote</span>
        <button className="icon-btn" title="Ẩn thanh bên" onClick={onClose}>
          «
        </button>
      </div>
      <div className="sidebar-label">Dự án</div>
      <nav className="project-list">
        {projects.map((p) => {
          const c = count(p.tasks)
          return (
            <div
              key={p.id}
              className={'project-item' + (p.id === activeId ? ' active' : '')}
              onClick={() => actions.setActive(p.id)}
            >
              <span className="project-icon">{p.icon}</span>
              <span className="project-name">{p.title || 'Chưa đặt tên'}</span>
              {c.total > 0 && (
                <span className="project-count">
                  {c.done}/{c.total}
                </span>
              )}
              <button
                className="icon-btn danger project-del"
                title="Xoá dự án"
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm(`Xoá dự án "${p.title || 'Chưa đặt tên'}"?`)) {
                    actions.deleteProject(p.id)
                  }
                }}
              >
                ✕
              </button>
            </div>
          )
        })}
      </nav>
      <button className="btn ghost add-project" onClick={actions.addProject}>
        + Dự án mới
      </button>
    </aside>
  )
}
