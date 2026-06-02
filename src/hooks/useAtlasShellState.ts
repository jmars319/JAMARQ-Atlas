import { useState } from 'react'
import type { ProjectRecord, WorkStatus } from '../domain/atlas'
import type { WritingTemplateId } from '../domain/writing'
import type { AppView } from '../routes/atlasViews'

type StatusFilter = WorkStatus | 'All'
type SectionFilter = string | 'All'

const PROJECT_INSPECTOR_STORAGE_KEY = 'atlas-project-inspector-open'

export function useAtlasShellState(projectRecords: ProjectRecord[]) {
  const [selectedProjectId, setSelectedProjectId] = useState(
    () => projectRecords[0]?.project.id ?? '',
  )
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All')
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>('All')
  const [appView, setAppView] = useState<AppView>('board')
  const [projectInspectorOpen, setProjectInspectorOpen] = useState(() => {
    try {
      return window.localStorage.getItem(PROJECT_INSPECTOR_STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })
  const [selectedWritingTemplate, setSelectedWritingTemplate] =
    useState<WritingTemplateId>('client-update')
  const [selectedWritingDraftId, setSelectedWritingDraftId] = useState('')
  const [preflightRunningTargetId, setPreflightRunningTargetId] = useState('')
  const [hostInspectionRunningTargetIds, setHostInspectionRunningTargetIds] = useState<string[]>(
    [],
  )
  const [verificationRunningTargetIds, setVerificationRunningTargetIds] = useState<string[]>([])
  const [queueEvidenceSweepRunning, setQueueEvidenceSweepRunning] = useState(false)

  function updateProjectInspectorOpen(open: boolean) {
    setProjectInspectorOpen(open)
    try {
      window.localStorage.setItem(PROJECT_INSPECTOR_STORAGE_KEY, String(open))
    } catch {
      // Ignore storage failures; the toggle should still work for the current session.
    }
  }

  return {
    selectedProjectId,
    setSelectedProjectId,
    query,
    setQuery,
    statusFilter,
    setStatusFilter,
    sectionFilter,
    setSectionFilter,
    appView,
    setAppView,
    projectInspectorOpen,
    updateProjectInspectorOpen,
    selectedWritingTemplate,
    setSelectedWritingTemplate,
    selectedWritingDraftId,
    setSelectedWritingDraftId,
    preflightRunningTargetId,
    setPreflightRunningTargetId,
    hostInspectionRunningTargetIds,
    setHostInspectionRunningTargetIds,
    verificationRunningTargetIds,
    setVerificationRunningTargetIds,
    queueEvidenceSweepRunning,
    setQueueEvidenceSweepRunning,
  }
}
