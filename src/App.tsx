import { useState } from 'react'
import { actions, useApp } from './store'
import Sidebar from './components/Sidebar'
import ProjectPage from './components/ProjectPage'

export default function App() {
  const state = useApp()
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 760)
  const project = state.projects.find((p) => p.id === state.activeId) ?? null

  return (
    <div className="app">
      {sidebarOpen && (
        <Sidebar
          projects={state.projects}
          activeId={state.activeId}
          onClose={() => setSidebarOpen(false)}
        />
      )}
      <main className="main">
        {project ? (
          <ProjectPage
            key={project.id}
            project={project}
            sidebarOpen={sidebarOpen}
            onOpenSidebar={() => setSidebarOpen(true)}
          />
        ) : (
          <div className="empty">
            {!sidebarOpen && (
              <button className="icon-btn" onClick={() => setSidebarOpen(true)}>
                ☰
              </button>
            )}
            <p>Chưa có dự án nào.</p>
            <button className="btn primary" onClick={actions.addProject}>
              + Tạo dự án đầu tiên
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
