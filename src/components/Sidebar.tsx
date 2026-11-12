import { useRef, useState } from 'react'
import { actions, parseBackup } from '../store'
import { count } from '../tree'
import type { Project } from '../types'

interface Props {
  projects: Project[]
  activeId: string | null
  onClose: () => void
}

export default function Sidebar({ projects, activeId, onClose }: Props) {
  const file = useRef<HTMLInputElement>(null)
  const [incoming, setIncoming] = useState<Project[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const exportJson = () => {
    const d = new Date()
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const url = URL.createObjectURL(new Blob([actions.exportData()], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `mindnote-${stamp}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const onFile = async (f: File | undefined) => {
    if (!f) return
    try {
      setIncoming(parseBackup(await f.text()))
      setError(null)
    } catch (e) {
      setIncoming(null)
      setError(e instanceof Error ? e.message : 'Không đọc được file.')
    }
  }

  const finish = (mode: 'merge' | 'replace') => {
    if (incoming) actions.importData(incoming, mode)
    setIncoming(null)
  }

  const dup = incoming ? incoming.filter((p) => projects.some((x) => x.id === p.id)).length : 0

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

      <div className="sidebar-foot">
        <button className="btn ghost" onClick={exportJson} disabled={projects.length === 0} title="Tải toàn bộ dự án về một file JSON">
          ⭳ Xuất dữ liệu
        </button>
        <button className="btn ghost" onClick={() => file.current?.click()} title="Nạp dự án từ file JSON đã xuất">
          ⭱ Nhập dữ liệu
        </button>
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            void onFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>

      {(incoming || error) && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setIncoming(null)
            setError(null)
          }}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            {error ? (
              <>
                <h3>Không nhập được</h3>
                <p>{error}</p>
                <div className="modal-actions">
                  <button className="btn primary" onClick={() => setError(null)}>
                    Đóng
                  </button>
                </div>
              </>
            ) : (
              incoming && (
                <>
                  <h3>Nhập dữ liệu</h3>
                  <p>
                    File có <b>{incoming.length}</b> dự án
                    {dup > 0 && (
                      <>
                        , trong đó <b>{dup}</b> dự án trùng với dự án đang có
                      </>
                    )}
                    .
                  </p>
                  <ul className="modal-list">
                    {incoming.slice(0, 8).map((p) => (
                      <li key={p.id}>
                        {p.icon} {p.title || 'Chưa đặt tên'}
                      </li>
                    ))}
                    {incoming.length > 8 && <li className="muted">… và {incoming.length - 8} dự án khác</li>}
                  </ul>
                  <div className="modal-actions">
                    <button className="btn ghost" onClick={() => setIncoming(null)}>
                      Huỷ
                    </button>
                    <button className="btn danger-outline" onClick={() => finish('replace')} title="Xoá mọi dự án đang có, chỉ giữ dự án trong file">
                      Thay thế toàn bộ
                    </button>
                    <button className="btn primary" onClick={() => finish('merge')}>
                      Gộp vào dữ liệu hiện có
                    </button>
                  </div>
                  <p className="modal-note">
                    Gộp: giữ các dự án đang có{dup > 0 ? ', riêng dự án trùng sẽ bị ghi đè bằng bản trong file' : ''}. Thay
                    thế: xoá toàn bộ {projects.length} dự án đang có.
                  </p>
                </>
              )
            )}
          </div>
        </div>
      )}
    </aside>
  )
}
