import { useCallback, useState } from 'react'
import { actions } from '../store'
import { count } from '../tree'
import type { Mutate, Project } from '../types'
import BlockEditor from './BlockEditor'
import MindMap from './MindMap'
import TaskDetail from './TaskDetail'
import TaskList from './TaskList'

const ICONS = ['📄', '🚀', '🎯', '💡', '📚', '🛠️', '🎨', '📈', '🏠', '✈️', '🧪', '💼', '🎓', '🌱', '🎬', '❤️']

interface Props {
  project: Project
  sidebarOpen: boolean
  onOpenSidebar: () => void
}

export default function ProjectPage({ project, sidebarOpen, onOpenSidebar }: Props) {
  const [view, setView] = useState<'list' | 'map'>('list')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const mutate: Mutate = useCallback((fn) => actions.mutateTasks(project.id, fn), [project.id])
  const c = count(project.tasks)
  const pct = c.total ? Math.round((c.done / c.total) * 100) : 0

  return (
    <div className="page">
      <header className="topbar">
        {!sidebarOpen && (
          <button className="icon-btn" title="Hiện thanh bên" onClick={onOpenSidebar}>
            ☰
          </button>
        )}
        <span className="crumb">
          {project.icon} {project.title || 'Chưa đặt tên'}
        </span>
        <span className="spacer" />
        <span className="topbar-progress">
          {c.done}/{c.total} · {pct}%
        </span>
        <div className="segmented">
          <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>
            ☰ Trang
          </button>
          <button className={view === 'map' ? 'on' : ''} onClick={() => setView('map')}>
            ⑂ Mindmap
          </button>
        </div>
      </header>

      <div className="page-body">
        {view === 'list' ? (
          <div className="doc-scroll">
            <div className="doc">
              <div className="icon-wrap">
                <button className="doc-icon" onClick={() => setPickerOpen((o) => !o)}>
                  {project.icon}
                </button>
                {pickerOpen && (
                  <div className="icon-picker">
                    {ICONS.map((i) => (
                      <button
                        key={i}
                        onClick={() => {
                          actions.updateProject(project.id, { icon: i })
                          setPickerOpen(false)
                        }}
                      >
                        {i}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input
                className="doc-title"
                value={project.title}
                placeholder="Chưa đặt tên"
                autoFocus={!project.title}
                onChange={(e) => actions.updateProject(project.id, { title: e.target.value })}
              />
              <div className="progress">
                <div className="progress-bar" style={{ width: pct + '%' }} />
              </div>
              <BlockEditor
                blocks={project.blocks}
                onChange={(blocks) => actions.updateProject(project.id, { blocks })}
              />
              <h2 className="section-title">Công việc</h2>
              <TaskList
                fields={project.fields}
                tasks={project.tasks}
                mutate={mutate}
                detailId={detailId}
                onOpenDetail={setDetailId}
              />
            </div>
          </div>
        ) : (
          <MindMap project={project} mutate={mutate} onOpenDetail={setDetailId} />
        )}

        {detailId && (
          <TaskDetail
            project={project}
            taskId={detailId}
            mutate={mutate}
            onNavigate={setDetailId}
            onClose={() => setDetailId(null)}
          />
        )}
      </div>
    </div>
  )
}
