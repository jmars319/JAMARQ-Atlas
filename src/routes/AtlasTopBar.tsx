import { DatabaseZap, GitBranch, ListTree, PanelRightClose, PanelRightOpen } from 'lucide-react'
import type { ProjectRecord } from '../domain/atlas'

interface AtlasTopBarProps {
  projectCount: number
  selectedRecord: ProjectRecord | undefined
  inspectorOpen: boolean
  onInspectorToggle: () => void
}

export function AtlasTopBar({
  projectCount,
  selectedRecord,
  inspectorOpen,
  onInspectorToggle,
}: AtlasTopBarProps) {
  return (
    <header className="topbar">
      <div className="brand-lockup">
        <img src="/jamarq-logo.png" alt="" className="brand-mark" />
        <div>
          <strong>Atlas</strong>
          <span>JAMARQ operator dashboard</span>
        </div>
      </div>
      <div className="topbar-meta">
        <span>
          <DatabaseZap size={15} />
          Local-first
        </span>
        <span>
          <ListTree size={15} />
          {projectCount} projects
        </span>
        <span>
          <GitBranch size={15} />
          Writes gated
        </span>
      </div>
      <div className="topbar-actions">
        <div className="current-project-chip" aria-label="Current project">
          <span>Current project</span>
          <strong>{selectedRecord?.project.name ?? 'No project selected'}</strong>
        </div>
        {selectedRecord ? (
          <button
            type="button"
            className="inspector-toggle"
            aria-pressed={inspectorOpen}
            onClick={onInspectorToggle}
          >
            {inspectorOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
            {inspectorOpen ? 'Hide project inspector' : 'Show project inspector'}
          </button>
        ) : null}
      </div>
    </header>
  )
}
