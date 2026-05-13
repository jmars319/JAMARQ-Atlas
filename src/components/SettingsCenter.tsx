import { useEffect, useMemo, useState } from 'react'
import {
  ArchiveRestore,
  ClipboardList,
  Download,
  HardDrive,
  PlusCircle,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import type { Workspace } from '../domain/atlas'
import type {
  AtlasCalibrationState,
  CalibrationAuditEventType,
  CalibrationCredentialReference,
  CalibrationFieldStatus,
} from '../domain/calibration'
import type { DeploymentTarget, DispatchState } from '../domain/dispatch'
import type { AtlasPlanningState } from '../domain/planning'
import type { ReportsState } from '../domain/reports'
import type { ReviewState } from '../domain/review'
import type { AtlasSettingsState } from '../domain/settings'
import type {
  AtlasRemoteSyncSnapshot,
  AtlasSyncCoreStores,
  AtlasSyncProviderState,
  AtlasSyncSnapshot,
  AtlasSyncState,
} from '../domain/sync'
import type { WritingWorkbenchState } from '../domain/writing'
import {
  deleteHostedSyncSnapshot,
  fetchHostedSyncSnapshot,
  fetchHostedSyncSnapshots,
  fetchHostedSyncStatus,
  pushHostedSyncSnapshot,
  type HostedSyncStatus,
} from '../services/hostedSync'
import {
  fetchHostConnectionStatus,
  type HostConnectionStatusResponse,
} from '../services/hostConnection'
import {
  CALIBRATION_BULK_FIELDS,
  CALIBRATION_CATEGORIES,
  canStoreCalibrationValue,
  calibrationValueToTargetUpdate,
  createCalibrationCsvTemplate,
  createCalibrationJsonTemplate,
  createCalibrationReadinessReport,
  parseCalibrationImportPreview,
  scanAtlasCalibration,
  summarizeCalibrationState,
  type CalibrationImportPreview,
  type CalibrationCategory,
  type CalibrationEditableTargetField,
  type CalibrationIssue,
} from '../services/calibration'
import { buildStaticConnectionCards } from '../services/settings'
import {
  canApplySyncRestore,
  compareSyncSnapshot,
  createSyncSnapshot,
  createRemoteSnapshotRetentionNotice,
  createSyncRestorePreview,
  REMOTE_SYNC_SNAPSHOT_LIMIT,
  SYNC_RESTORE_CONFIRMATION_PHRASE,
} from '../services/syncSnapshots'
import {
  fetchWritingProviderStatus,
  type WritingProviderStatusResponse,
} from '../services/writingProvider'
import { createCalibrationWorkflow } from '../services/calibrationWorkflow'
import {
  buildGithubCard,
  buildHostConnectionCard,
  buildHostedSyncCard,
  buildWritingProviderCard,
  CalibrationField,
  CalibrationImportPreviewPanel,
  ConnectionCard,
  issueCountLabel,
  SnapshotSummary,
  statusLabel,
  type GithubStatusResponse,
} from './SettingsCenterParts'

interface SettingsCenterProps {
  settings: AtlasSettingsState
  workspace: Workspace
  dispatch: DispatchState
  writing: WritingWorkbenchState
  planning: AtlasPlanningState
  reports: ReportsState
  review: ReviewState
  calibration: AtlasCalibrationState
  sync: AtlasSyncState
  onSettingsChange: (
    update: Partial<Pick<AtlasSettingsState, 'deviceLabel' | 'operatorLabel' | 'notes'>>,
  ) => void
  onDispatchTargetChange: (targetId: string, update: Partial<DeploymentTarget>) => void
  onCalibrationProgressChange: (
    issue: CalibrationIssue,
    status: CalibrationFieldStatus,
    note: string,
  ) => void
  onCalibrationAudit: (input: {
    type: CalibrationAuditEventType
    summary: string
    issue?: CalibrationIssue
    projectId?: string | null
    targetId?: string | null
    field?: string
  }) => void
  onCredentialReferenceSave: (
    input: Pick<
      CalibrationCredentialReference,
      'label' | 'provider' | 'purpose' | 'projectIds' | 'targetIds' | 'notes'
    >,
  ) => { ok: boolean; message: string }
  onCredentialReferenceDelete: (referenceId: string) => void
  onApplyCalibrationImport: (preview: CalibrationImportPreview) => void
  onCreateSnapshot: (label: string, note: string) => void
  onDeleteSnapshot: (snapshotId: string) => void
  onRestoreSnapshot: (stores: AtlasSyncCoreStores) => void
  onSyncProviderChange: (update: Partial<AtlasSyncProviderState>) => void
  onRecordRemoteSnapshots: (snapshots: AtlasRemoteSyncSnapshot[]) => void
  onRecordRemotePush: (snapshot: AtlasRemoteSyncSnapshot) => void
  onRemoveRemoteSnapshot: (snapshotId: string) => void
}

function downloadTextFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function splitInputList(value: string) {
  return value
    .split(/\n|\|/)
    .map((item) => item.trim())
    .filter(Boolean)
}

async function requestGithubStatus(signal?: AbortSignal) {
  const response = await fetch('/api/github/status', { signal })

  if (!response.ok) {
    throw new Error(`GitHub status returned ${response.status}.`)
  }

  return (await response.json()) as GithubStatusResponse
}

export function SettingsCenter({
  settings,
  workspace,
  dispatch,
  writing,
  planning,
  reports,
  review,
  calibration,
  sync,
  onSettingsChange,
  onDispatchTargetChange,
  onCalibrationProgressChange,
  onCalibrationAudit,
  onCredentialReferenceSave,
  onCredentialReferenceDelete,
  onApplyCalibrationImport,
  onCreateSnapshot,
  onDeleteSnapshot,
  onRestoreSnapshot,
  onSyncProviderChange,
  onRecordRemoteSnapshots,
  onRecordRemotePush,
  onRemoveRemoteSnapshot,
}: SettingsCenterProps) {
  const [githubStatus, setGithubStatus] = useState<GithubStatusResponse | null>(null)
  const [githubError, setGithubError] = useState<string | null>(null)
  const [loadingGithub, setLoadingGithub] = useState(false)
  const [hostedSyncStatus, setHostedSyncStatus] = useState<HostedSyncStatus | null>(null)
  const [hostedSyncError, setHostedSyncError] = useState<string | null>(null)
  const [loadingHostedSync, setLoadingHostedSync] = useState(false)
  const [writingProviderStatus, setWritingProviderStatus] =
    useState<WritingProviderStatusResponse | null>(null)
  const [writingProviderError, setWritingProviderError] = useState<string | null>(null)
  const [loadingWritingProvider, setLoadingWritingProvider] = useState(false)
  const [hostConnectionStatus, setHostConnectionStatus] =
    useState<HostConnectionStatusResponse | null>(null)
  const [hostConnectionError, setHostConnectionError] = useState<string | null>(null)
  const [loadingHostConnection, setLoadingHostConnection] = useState(false)
  const [snapshotLabel, setSnapshotLabel] = useState('')
  const [snapshotNote, setSnapshotNote] = useState('')
  const [selectedSnapshotId, setSelectedSnapshotId] = useState('')
  const [snapshotConfirmation, setSnapshotConfirmation] = useState('')
  const [remoteSnapshotLabel, setRemoteSnapshotLabel] = useState('')
  const [remoteSnapshotNote, setRemoteSnapshotNote] = useState('')
  const [selectedRemoteSnapshotId, setSelectedRemoteSnapshotId] = useState('')
  const [remoteSnapshotConfirmation, setRemoteSnapshotConfirmation] = useState('')
  const [remoteSnapshot, setRemoteSnapshot] = useState<AtlasSyncSnapshot | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState('')
  const [pendingRemoteDeleteId, setPendingRemoteDeleteId] = useState('')
  const [remoteSnapshotLimit, setRemoteSnapshotLimit] = useState(REMOTE_SYNC_SNAPSHOT_LIMIT)
  const [syncMessage, setSyncMessage] = useState('')
  const [calibrationFilter, setCalibrationFilter] = useState<CalibrationCategory | 'all'>('all')
  const [bulkCalibrationField, setBulkCalibrationField] =
    useState<CalibrationEditableTargetField>('credentialRef')
  const [bulkCalibrationValue, setBulkCalibrationValue] = useState('')
  const [calibrationMessage, setCalibrationMessage] = useState('')
  const [calibrationNoteDrafts, setCalibrationNoteDrafts] = useState<Record<string, string>>({})
  const [credentialLabel, setCredentialLabel] = useState('')
  const [credentialProvider, setCredentialProvider] = useState('')
  const [credentialPurpose, setCredentialPurpose] = useState('')
  const [credentialNotes, setCredentialNotes] = useState('')
  const [credentialTargetIds, setCredentialTargetIds] = useState('')
  const [credentialProjectIds, setCredentialProjectIds] = useState('')
  const [calibrationImportPreview, setCalibrationImportPreview] =
    useState<CalibrationImportPreview | null>(null)
  const [calibrationImportError, setCalibrationImportError] = useState('')

  async function loadGithubStatus() {
    setLoadingGithub(true)
    setGithubError(null)

    try {
      setGithubStatus(await requestGithubStatus())
    } catch (error) {
      setGithubError(error instanceof Error ? error.message : 'GitHub status request failed.')
      setGithubStatus(null)
    } finally {
      setLoadingGithub(false)
    }
  }

  async function loadHostedSyncStatus() {
    setLoadingHostedSync(true)
    setHostedSyncError(null)

    try {
      const result = await fetchHostedSyncStatus()

      if (result.ok && result.data) {
        setHostedSyncStatus(result.data)
        onSyncProviderChange({
          id: 'supabase',
          status: result.data.configured ? 'configured' : 'not-configured',
          workspaceId: result.data.workspaceId,
          message: result.data.message,
        })
      } else {
        const message = result.error?.message || 'Hosted sync status request failed.'
        setHostedSyncStatus(null)
        setHostedSyncError(message)
        onSyncProviderChange({
          id: 'supabase',
          status: result.error?.type === 'not-configured' ? 'not-configured' : 'error',
          message,
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Hosted sync status request failed.'
      setHostedSyncError(message)
      setHostedSyncStatus(null)
      onSyncProviderChange({ id: 'supabase', status: 'error', message })
    } finally {
      setLoadingHostedSync(false)
    }
  }

  async function loadWritingProviderStatus() {
    setLoadingWritingProvider(true)
    setWritingProviderError(null)

    try {
      const result = await fetchWritingProviderStatus()

      if (result.ok && result.data) {
        setWritingProviderStatus(result.data)
      } else {
        setWritingProviderStatus(null)
        setWritingProviderError(
          result.error?.message || 'Writing provider status request failed.',
        )
      }
    } catch (error) {
      setWritingProviderError(
        error instanceof Error ? error.message : 'Writing provider status request failed.',
      )
      setWritingProviderStatus(null)
    } finally {
      setLoadingWritingProvider(false)
    }
  }

  async function loadHostConnectionStatus() {
    setLoadingHostConnection(true)
    setHostConnectionError(null)

    try {
      const status = await fetchHostConnectionStatus()

      setHostConnectionStatus(status)
      setHostConnectionError(status.error?.message ?? null)
    } catch (error) {
      setHostConnectionError(
        error instanceof Error ? error.message : 'Host boundary status request failed.',
      )
      setHostConnectionStatus(null)
    } finally {
      setLoadingHostConnection(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()

    void requestGithubStatus(controller.signal)
      .then((status) => {
        setGithubStatus(status)
        setGithubError(null)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return
        }

        setGithubError(error instanceof Error ? error.message : 'GitHub status request failed.')
        setGithubStatus(null)
      })

    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    void fetchHostedSyncStatus(controller.signal)
      .then((result) => {
        if (result.ok && result.data) {
          setHostedSyncStatus(result.data)
          setHostedSyncError(null)
          return
        }

        setHostedSyncStatus(null)
        setHostedSyncError(result.error?.message || 'Hosted sync status request failed.')
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return
        }

        setHostedSyncError(
          error instanceof Error ? error.message : 'Hosted sync status request failed.',
        )
        setHostedSyncStatus(null)
      })

    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    void fetchWritingProviderStatus(controller.signal)
      .then((result) => {
        if (result.ok && result.data) {
          setWritingProviderStatus(result.data)
          setWritingProviderError(null)
          return
        }

        setWritingProviderStatus(null)
        setWritingProviderError(result.error?.message || 'Writing provider status request failed.')
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return
        }

        setWritingProviderError(
          error instanceof Error ? error.message : 'Writing provider status request failed.',
        )
        setWritingProviderStatus(null)
      })

    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    void fetchHostConnectionStatus(controller.signal)
      .then((status) => {
        setHostConnectionStatus(status)
        setHostConnectionError(status.error?.message ?? null)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return
        }

        setHostConnectionError(
          error instanceof Error ? error.message : 'Host boundary status request failed.',
        )
        setHostConnectionStatus(null)
      })

    return () => controller.abort()
  }, [])

  const connectionCards = useMemo(
    () => [
      buildGithubCard(githubStatus, githubError),
      ...buildStaticConnectionCards(),
      buildHostConnectionCard(hostConnectionStatus, hostConnectionError),
      buildWritingProviderCard(writingProviderStatus, writingProviderError),
      buildHostedSyncCard(hostedSyncStatus, hostedSyncError, sync.provider),
    ],
    [
      githubError,
      githubStatus,
      hostConnectionError,
      hostConnectionStatus,
      hostedSyncError,
      hostedSyncStatus,
      sync.provider,
      writingProviderError,
      writingProviderStatus,
    ],
  )
  const configuredHostTargetIds = useMemo(
    () =>
      hostConnectionStatus?.data?.configuredTargets.map((target) => target.targetId) ?? [],
    [hostConnectionStatus],
  )
  const calibrationIssues = useMemo(
    () =>
      scanAtlasCalibration(
        workspace,
        dispatch,
        configuredHostTargetIds,
        calibration.credentialReferences.map((reference) => reference.label),
      ),
    [calibration.credentialReferences, configuredHostTargetIds, dispatch, workspace],
  )
  const calibrationSummary = useMemo(
    () => summarizeCalibrationState(calibration),
    [calibration],
  )
  const calibrationReadinessReport = useMemo(
    () =>
      createCalibrationReadinessReport({
        issues: calibrationIssues,
        calibration,
        importPreview: calibrationImportPreview,
      }),
    [calibration, calibrationImportPreview, calibrationIssues],
  )
  const calibrationWorkflow = useMemo(
    () =>
      createCalibrationWorkflow({
        workspace,
        dispatch,
        calibration,
        sync,
        issues: calibrationIssues,
      }),
    [calibration, calibrationIssues, dispatch, sync, workspace],
  )
  const calibrationProgressByIssue = useMemo(
    () =>
      new Map(
        calibration.fieldProgress.map((progress) => [progress.issueId, progress]),
      ),
    [calibration.fieldProgress],
  )
  const filteredCalibrationIssues = useMemo(
    () =>
      calibrationFilter === 'all'
        ? calibrationIssues
        : calibrationIssues.filter((issue) => issue.category === calibrationFilter),
    [calibrationFilter, calibrationIssues],
  )
  const calibrationCategoryCounts = useMemo(
    () =>
      CALIBRATION_CATEGORIES.filter((category) => category.id !== 'all').map((category) => ({
        id: category.id,
        label: category.label,
        count: calibrationIssues.filter((issue) => issue.category === category.id).length,
      })),
    [calibrationIssues],
  )
  const matchingBulkIssues = filteredCalibrationIssues.filter(
    (issue) => issue.editable && issue.targetId && issue.field === bulkCalibrationField,
  )
  const currentStores = useMemo(
    () => ({ workspace, dispatch, writing, planning, reports, review, calibration }),
    [calibration, dispatch, planning, reports, review, workspace, writing],
  )
  const selectedSnapshot =
    sync.snapshots.find((snapshot) => snapshot.id === selectedSnapshotId) ?? sync.snapshots[0]
  const restorePreview = selectedSnapshot
    ? createSyncRestorePreview(currentStores, selectedSnapshot)
    : null
  const restoreReady = restorePreview !== null && canApplySyncRestore(snapshotConfirmation)
  const remoteRestorePreview = remoteSnapshot
    ? createSyncRestorePreview(currentStores, remoteSnapshot)
    : null
  const remoteRestoreReady =
    remoteRestorePreview !== null && canApplySyncRestore(remoteSnapshotConfirmation)
  const selectedRemoteMetadata =
    sync.provider.remoteSnapshots.find((snapshot) => snapshot.id === selectedRemoteSnapshotId) ??
    (remoteSnapshot
      ? {
          id: remoteSnapshot.id,
          label: remoteSnapshot.label,
          note: remoteSnapshot.note,
          createdAt: remoteSnapshot.createdAt,
          deviceId: remoteSnapshot.deviceId,
          deviceLabel: remoteSnapshot.deviceLabel,
          fingerprint: remoteSnapshot.fingerprint,
          summary: remoteSnapshot.summary,
        }
      : null)
  const remoteSnapshotComparison = selectedRemoteMetadata
    ? compareSyncSnapshot(currentStores, selectedRemoteMetadata)
    : null
  const remoteRetentionNotice = createRemoteSnapshotRetentionNotice(
    sync.provider.remoteSnapshots,
    remoteSnapshotLimit,
  )

  function handleApplyBulkCalibration() {
    const storageCheck = canStoreCalibrationValue(bulkCalibrationValue)

    if (!storageCheck.ok) {
      setCalibrationMessage(storageCheck.message)
      return
    }

    if (matchingBulkIssues.length === 0) {
      setCalibrationMessage('No visible editable calibration items match that field.')
      return
    }

    for (const issue of matchingBulkIssues) {
      if (!issue.targetId) {
        continue
      }

      onDispatchTargetChange(
        issue.targetId,
        calibrationValueToTargetUpdate(bulkCalibrationField, bulkCalibrationValue),
      )
      onCalibrationProgressChange(
        issue,
        'entered',
        `Bulk edit applied to ${bulkCalibrationField}.`,
      )
    }

    onCalibrationAudit({
      type: 'bulk-edit',
      summary: `Bulk calibration updated ${matchingBulkIssues.length} visible ${bulkCalibrationField} item(s).`,
      field: bulkCalibrationField,
    })
    setCalibrationMessage(
      `Bulk calibration updated ${matchingBulkIssues.length} visible ${bulkCalibrationField} item(s).`,
    )
    setBulkCalibrationValue('')
  }

  function handleProgressChange(issue: CalibrationIssue, status: CalibrationFieldStatus) {
    const note = calibrationNoteDrafts[issue.id] ?? calibrationProgressByIssue.get(issue.id)?.note ?? ''
    onCalibrationProgressChange(issue, status, note)
    setCalibrationMessage(`${issue.label} marked ${status}.`)
  }

  function handleSaveCredentialReference() {
    const result = onCredentialReferenceSave({
      label: credentialLabel,
      provider: credentialProvider,
      purpose: credentialPurpose,
      notes: credentialNotes,
      targetIds: splitInputList(credentialTargetIds),
      projectIds: splitInputList(credentialProjectIds),
    })

    if (!result.ok) {
      setCalibrationMessage(result.message)
      return
    }

    setCredentialLabel('')
    setCredentialProvider('')
    setCredentialPurpose('')
    setCredentialNotes('')
    setCredentialTargetIds('')
    setCredentialProjectIds('')
    setCalibrationMessage('Credential reference saved without secret values.')
  }

  function handleDownloadCalibrationCsv() {
    downloadTextFile(
      'atlas-calibration-template.csv',
      createCalibrationCsvTemplate(dispatch),
      'text/csv',
    )
  }

  function handleDownloadCalibrationJson() {
    downloadTextFile(
      'atlas-calibration-template.json',
      createCalibrationJsonTemplate(workspace, dispatch, calibration),
      'application/json',
    )
  }

  async function handleCalibrationImportFile(file: File | null) {
    setCalibrationImportError('')
    setCalibrationImportPreview(null)

    if (!file) {
      return
    }

    try {
      const text = await file.text()
      setCalibrationImportPreview(parseCalibrationImportPreview(text, workspace, dispatch, calibration))
    } catch (error) {
      setCalibrationImportError(
        error instanceof Error ? error.message : 'Calibration import file could not be read.',
      )
    }
  }

  function handleApplyCalibrationImport() {
    if (!calibrationImportPreview || calibrationImportPreview.acceptedRows.length === 0) {
      setCalibrationMessage('No accepted calibration import rows are ready to apply.')
      return
    }

    onApplyCalibrationImport(calibrationImportPreview)
    setCalibrationImportPreview(null)
    setCalibrationImportError('')
    setCalibrationMessage('Calibration import applied after preview.')
  }

  function handleCreateSnapshot() {
    onCreateSnapshot(snapshotLabel, snapshotNote)
    setSnapshotLabel('')
    setSnapshotNote('')
    setSyncMessage('Local snapshot created.')
  }

  function handleRestoreSnapshot() {
    if (!restoreReady || !restorePreview) {
      return
    }

    onRestoreSnapshot(restorePreview.normalizedStores)
    setSnapshotConfirmation('')
    setSyncMessage(
      'Snapshot restored locally. Workspace, Dispatch, Writing, Planning, Reports, Review, and Calibration stores were replaced.',
    )
  }

  function handleDeleteSnapshot(snapshotId: string) {
    onDeleteSnapshot(snapshotId)
    setPendingDeleteId('')
    setSelectedSnapshotId((current) => (current === snapshotId ? '' : current))
    setSyncMessage('Local snapshot deleted.')
  }

  async function handlePushHostedSnapshot() {
    setLoadingHostedSync(true)
    setHostedSyncError(null)

    try {
      const snapshot = createSyncSnapshot({
        stores: currentStores,
        settings,
        sync,
        label: remoteSnapshotLabel || 'Hosted sync snapshot',
        note: remoteSnapshotNote,
      })
      const result = await pushHostedSyncSnapshot(snapshot)

      if (result.ok && result.data) {
        onRecordRemotePush(result.data.snapshot)
        setRemoteSnapshot(snapshot)
        setSelectedRemoteSnapshotId(snapshot.id)
        setRemoteSnapshotLabel('')
        setRemoteSnapshotNote('')
        setRemoteSnapshotConfirmation('')
        setSyncMessage('Remote snapshot pushed to Supabase.')
        onSyncProviderChange({
          id: 'supabase',
          status: 'configured',
          message: 'Remote snapshot pushed to Supabase.',
        })
        return
      }

      const message = result.error?.message || 'Remote snapshot push failed.'
      setHostedSyncError(message)
      setSyncMessage(message)
      onSyncProviderChange({
        id: 'supabase',
        status: result.error?.type === 'not-configured' ? 'not-configured' : 'error',
        message,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Remote snapshot push failed.'
      setHostedSyncError(message)
      setSyncMessage(message)
      onSyncProviderChange({ id: 'supabase', status: 'error', message })
    } finally {
      setLoadingHostedSync(false)
    }
  }

  async function handleLoadRemoteSnapshots() {
    setLoadingHostedSync(true)
    setHostedSyncError(null)

    try {
      const result = await fetchHostedSyncSnapshots()

      if (result.ok && result.data) {
        onRecordRemoteSnapshots(result.data.snapshots)
        setSyncMessage(`${result.data.snapshots.length} remote snapshots loaded.`)
        onSyncProviderChange({
          id: 'supabase',
          status: 'configured',
          message: `${result.data.snapshots.length} remote snapshots loaded.`,
        })
        return
      }

      const message = result.error?.message || 'Remote snapshot list failed.'
      setHostedSyncError(message)
      setSyncMessage(message)
      onSyncProviderChange({
        id: 'supabase',
        status: result.error?.type === 'not-configured' ? 'not-configured' : 'error',
        message,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Remote snapshot list failed.'
      setHostedSyncError(message)
      setSyncMessage(message)
      onSyncProviderChange({ id: 'supabase', status: 'error', message })
    } finally {
      setLoadingHostedSync(false)
    }
  }

  async function handleSelectRemoteSnapshot(snapshotId: string) {
    setSelectedRemoteSnapshotId(snapshotId)
    setRemoteSnapshot(null)
    setRemoteSnapshotConfirmation('')
    setLoadingHostedSync(true)
    setHostedSyncError(null)

    try {
      const result = await fetchHostedSyncSnapshot(snapshotId)

      if (result.ok && result.data) {
        setRemoteSnapshot(result.data.snapshot)
        setSyncMessage('Remote snapshot preview loaded.')
        onSyncProviderChange({
          id: 'supabase',
          status: 'configured',
          message: 'Remote snapshot preview loaded.',
        })
        return
      }

      const message = result.error?.message || 'Remote snapshot preview failed.'
      setHostedSyncError(message)
      setSyncMessage(message)
      onSyncProviderChange({
        id: 'supabase',
        status: result.error?.type === 'not-configured' ? 'not-configured' : 'error',
        message,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Remote snapshot preview failed.'
      setHostedSyncError(message)
      setSyncMessage(message)
      onSyncProviderChange({ id: 'supabase', status: 'error', message })
    } finally {
      setLoadingHostedSync(false)
    }
  }

  async function handleDeleteRemoteSnapshot(snapshotId: string) {
    setLoadingHostedSync(true)
    setHostedSyncError(null)

    try {
      const result = await deleteHostedSyncSnapshot(snapshotId)

      if (result.ok && result.data) {
        onRemoveRemoteSnapshot(snapshotId)
        setPendingRemoteDeleteId('')
        setSelectedRemoteSnapshotId((current) => (current === snapshotId ? '' : current))
        setRemoteSnapshot((current) => (current?.id === snapshotId ? null : current))
        setRemoteSnapshotConfirmation('')
        setSyncMessage('Remote snapshot deleted from Supabase.')
        onSyncProviderChange({
          id: 'supabase',
          status: 'configured',
          message: 'Remote snapshot deleted from Supabase.',
        })
        return
      }

      const message = result.error?.message || 'Remote snapshot delete failed.'
      setHostedSyncError(message)
      setSyncMessage(message)
      onSyncProviderChange({
        id: 'supabase',
        status: result.error?.type === 'not-configured' ? 'not-configured' : 'error',
        message,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Remote snapshot delete failed.'
      setHostedSyncError(message)
      setSyncMessage(message)
      onSyncProviderChange({ id: 'supabase', status: 'error', message })
    } finally {
      setLoadingHostedSync(false)
    }
  }

  function handleRestoreRemoteSnapshot() {
    if (!remoteRestoreReady || !remoteRestorePreview) {
      return
    }

    onRestoreSnapshot(remoteRestorePreview.normalizedStores)
    setRemoteSnapshotConfirmation('')
    setSyncMessage('Remote snapshot restored locally after preview confirmation.')
  }

  async function handleRefreshConnectionStatuses() {
    await Promise.all([
      loadGithubStatus(),
      loadHostedSyncStatus(),
      loadWritingProviderStatus(),
      loadHostConnectionStatus(),
    ])
  }

  return (
    <section className="settings-center" aria-labelledby="settings-title">
      <div className="dashboard-header">
        <div>
          <p className="section-label">Atlas Settings</p>
          <h1 id="settings-title">Settings & Connections</h1>
          <p>
            Configure local Atlas labels and review integration readiness without storing secrets
            in browser state.
          </p>
        </div>
        <div className="dashboard-stats" aria-label="Settings status counts">
          <div>
            <Settings2 size={16} />
            <strong>{settings.schemaVersion}</strong>
            <span>Schema</span>
          </div>
          <div>
            <ShieldCheck size={16} />
            <strong>{connectionCards.filter((card) => card.status === 'available').length}</strong>
            <span>Available</span>
          </div>
          <div>
            <HardDrive size={16} />
            <strong>Local</strong>
            <span>Mode</span>
          </div>
        </div>
      </div>

      <div className="settings-layout">
        <section className="settings-panel">
          <div className="panel-heading">
            <Settings2 size={17} />
            <h2>Local Workspace Identity</h2>
          </div>
          <div className="settings-form-grid">
            <label className="field">
              <span>Device label</span>
              <input
                value={settings.deviceLabel}
                onChange={(event) => onSettingsChange({ deviceLabel: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Operator label</span>
              <input
                value={settings.operatorLabel}
                placeholder="Optional"
                onChange={(event) => onSettingsChange({ operatorLabel: event.target.value })}
              />
            </label>
            <label className="field field-full">
              <span>Local-only configuration notes</span>
              <textarea
                value={settings.notes}
                placeholder="Notes about this local Atlas install. Do not place secrets here."
                rows={4}
                onChange={(event) => onSettingsChange({ notes: event.target.value })}
              />
            </label>
          </div>
          <div className="settings-meta">
            <span>Device ID: {settings.deviceId}</span>
            <span>Updated: {new Date(settings.updatedAt).toLocaleString()}</span>
          </div>
        </section>

        <section className="settings-panel">
          <div className="panel-heading settings-panel-heading-row">
            <div>
              <ShieldCheck size={17} />
              <h2>Connection Readiness</h2>
            </div>
            <button
              type="button"
              onClick={() => void handleRefreshConnectionStatuses()}
              disabled={
                loadingGithub ||
                loadingHostedSync ||
                loadingWritingProvider ||
                loadingHostConnection
              }
            >
              <RefreshCw size={15} />
              Refresh
            </button>
          </div>
          <div className="settings-connection-grid">
            {connectionCards.map((card) => (
              <ConnectionCard key={card.id} card={card} />
            ))}
          </div>
        </section>

        <section className="settings-panel" aria-label="Atlas calibration operations">
          <div className="panel-heading settings-panel-heading-row">
            <div>
              <ShieldCheck size={17} />
              <h2>Calibration Operations</h2>
            </div>
            <span className="resource-pill state-warning">
              {issueCountLabel(filteredCalibrationIssues.length)}
            </span>
          </div>
          <p className="empty-state">
            Replace placeholders with real non-secret operational values. Credentials stay outside
            Atlas; store only labels such as godaddy-mmh-production in notes when needed.
          </p>
          <div className="settings-calibration-summary" aria-label="Calibration progress summary">
            <div>
              <strong>{calibrationSummary.progressRecords}</strong>
              <span>Progress records</span>
            </div>
            <div>
              <strong>{calibrationSummary.entered}</strong>
              <span>Entered</span>
            </div>
            <div>
              <strong>{calibrationSummary.verified}</strong>
              <span>Verified</span>
            </div>
            <div>
              <strong>{calibrationSummary.deferred}</strong>
              <span>Deferred</span>
            </div>
            <div>
              <strong>{calibrationSummary.credentialReferences}</strong>
              <span>Credential refs</span>
            </div>
            <div>
              <strong>{calibrationSummary.auditEvents}</strong>
              <span>Audit events</span>
            </div>
          </div>
          <div className="settings-calibration-readiness" aria-label="Calibration readiness report">
            <div className="settings-subpanel-heading">
              <ClipboardList size={16} />
              <strong>Readiness report</strong>
              <span>Human-entered progress and import warnings only. This is not production verification.</span>
            </div>
            <div className="settings-preview-grid">
              <div className="settings-snapshot-summary">
                <strong>{calibrationReadinessReport.unresolved}</strong>
                <span>Unresolved calibration rows</span>
                <span>{calibrationReadinessReport.unregisteredCredentialRefs} unregistered credential refs</span>
              </div>
              <div className="settings-snapshot-summary">
                <strong>{calibrationReadinessReport.verified}</strong>
                <span>Verified progress records</span>
                <span>
                  {calibrationReadinessReport.entered} entered / {calibrationReadinessReport.deferred} deferred
                </span>
              </div>
              <div className="settings-snapshot-summary">
                <strong>{calibrationReadinessReport.importWarnings}</strong>
                <span>Current import warnings</span>
                <span>{calibrationReadinessReport.credentialReferences} credential references registered</span>
              </div>
            </div>
            {calibrationReadinessReport.topAffectedItems.length > 0 ? (
              <div className="settings-readiness-list">
                <strong>Top affected targets/projects</strong>
                {calibrationReadinessReport.topAffectedItems.map((item) => (
                  <span key={`${item.targetId ?? item.projectId ?? item.label}`}>
                    {item.label}: {item.count} item(s)
                  </span>
                ))}
              </div>
            ) : (
              <p className="empty-state">No unresolved calibration items are currently visible.</p>
            )}
          </div>
          <div className="settings-calibration-readiness" aria-label="Guided calibration workflow">
            <div className="settings-subpanel-heading">
              <ClipboardList size={16} />
              <strong>Guided workflow</strong>
              <span>Step groups for real setup using existing local calibration state.</span>
            </div>
            <div className="settings-preview-grid">
              {calibrationWorkflow.map((group) => (
                <div key={group.id} className="settings-snapshot-summary">
                  <strong>{group.label}</strong>
                  <span className={`resource-pill state-${group.status}`}>
                    {group.status}
                  </span>
                  {group.steps.map((workflowStep) => (
                    <span key={workflowStep.id}>
                      {workflowStep.label}: {workflowStep.detail}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="settings-form-grid">
            <label className="field">
              <span>Calibration filter</span>
              <select
                aria-label="Calibration filter"
                value={calibrationFilter}
                onChange={(event) =>
                  setCalibrationFilter(event.target.value as CalibrationCategory | 'all')
                }
              >
                {CALIBRATION_CATEGORIES.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="settings-snapshot-summary">
              <strong>Placeholder scan</strong>
              <span>{issueCountLabel(calibrationIssues.length)} across Workspace and Dispatch</span>
              <span>Secret-shaped values are rejected from calibration edits</span>
            </div>
          </div>

          <div className="settings-credential-registry" aria-label="Credential reference registry">
            <div className="settings-subpanel-heading">
              <ClipboardList size={16} />
              <strong>Non-secret credential registry</strong>
              <span>Reference labels only. No tokens, passwords, keys, passphrases, or env vars.</span>
            </div>
            <div className="settings-form-grid">
              <label className="field">
                <span>Reference label</span>
                <input
                  aria-label="Credential reference label"
                  value={credentialLabel}
                  placeholder="godaddy-mmh-production"
                  onChange={(event) => setCredentialLabel(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Provider</span>
                <input
                  aria-label="Credential reference provider"
                  value={credentialProvider}
                  placeholder="GoDaddy cPanel"
                  onChange={(event) => setCredentialProvider(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Purpose</span>
                <input
                  aria-label="Credential reference purpose"
                  value={credentialPurpose}
                  placeholder="Production host access label"
                  onChange={(event) => setCredentialPurpose(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Related target IDs</span>
                <input
                  aria-label="Credential reference target IDs"
                  value={credentialTargetIds}
                  placeholder="target-a|target-b"
                  onChange={(event) => setCredentialTargetIds(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Related project IDs</span>
                <input
                  aria-label="Credential reference project IDs"
                  value={credentialProjectIds}
                  placeholder="project-a|project-b"
                  onChange={(event) => setCredentialProjectIds(event.target.value)}
                />
              </label>
              <label className="field field-full">
                <span>Reference notes</span>
                <textarea
                  aria-label="Credential reference notes"
                  rows={3}
                  value={credentialNotes}
                  placeholder="Non-secret location/context only."
                  onChange={(event) => setCredentialNotes(event.target.value)}
                />
              </label>
            </div>
            <div className="data-actions">
              <button
                type="button"
                onClick={handleSaveCredentialReference}
                disabled={!credentialLabel.trim()}
              >
                <PlusCircle size={15} />
                Save credential reference
              </button>
            </div>
            {calibration.credentialReferences.length > 0 ? (
              <div className="settings-credential-list">
                {calibration.credentialReferences.map((reference) => (
                  <article key={reference.id} className="settings-credential-card">
                    <div>
                      <strong>{reference.label}</strong>
                      <span>{reference.provider || 'Provider not set'}</span>
                      <span>{reference.purpose || 'Purpose not set'}</span>
                      <span>
                        {reference.targetIds.length} targets / {reference.projectIds.length}{' '}
                        projects
                      </span>
                    </div>
                    <button
                      type="button"
                      className="danger-action"
                      onClick={() => onCredentialReferenceDelete(reference.id)}
                    >
                      <Trash2 size={15} />
                      Remove
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <p className="empty-state">
                No credential references registered yet. Dispatch targets can still use manual
                non-secret labels, but unregistered labels will be flagged.
              </p>
            )}
          </div>

          <div className="settings-import-export" aria-label="Calibration import export">
            <div className="settings-subpanel-heading">
              <Download size={16} />
              <strong>Calibration import / export</strong>
              <span>Preview-first local files for target fields, repo bindings, and references.</span>
            </div>
            <div className="data-actions">
              <button type="button" onClick={handleDownloadCalibrationCsv}>
                <Download size={15} />
                Export CSV template
              </button>
              <button type="button" onClick={handleDownloadCalibrationJson}>
                <Download size={15} />
                Export JSON template
              </button>
              <label className="file-action">
                <UploadCloud size={15} />
                Import calibration file
                <input
                  aria-label="Import calibration file"
                  type="file"
                  accept=".json,.csv,application/json,text/csv"
                  onChange={(event) => {
                    void handleCalibrationImportFile(event.target.files?.[0] ?? null)
                    event.currentTarget.value = ''
                  }}
                />
              </label>
            </div>
            {calibrationImportError ? (
              <div className="data-warning">
                <strong>Import error</strong>
                <ul>
                  <li>{calibrationImportError}</li>
                </ul>
              </div>
            ) : null}
            {calibrationImportPreview ? (
              <CalibrationImportPreviewPanel
                preview={calibrationImportPreview}
                onApply={handleApplyCalibrationImport}
              />
            ) : null}
          </div>

          <div className="settings-calibration-groups" aria-label="Calibration group counts">
            {calibrationCategoryCounts.map((category) => (
              <button
                type="button"
                key={category.id}
                className={calibrationFilter === category.id ? 'is-selected' : ''}
                onClick={() => setCalibrationFilter(category.id as CalibrationCategory)}
              >
                <strong>{category.count}</strong>
                <span>{category.label}</span>
              </button>
            ))}
          </div>

          <div className="settings-bulk-calibration" aria-label="Bulk calibration editor">
            <div>
              <strong>Bulk-safe Dispatch edit</strong>
              <span>
                Applies one non-secret value to visible editable items matching the selected field.
              </span>
            </div>
            <label className="field">
              <span>Bulk field</span>
              <select
                aria-label="Bulk calibration field"
                value={bulkCalibrationField}
                onChange={(event) =>
                  setBulkCalibrationField(event.target.value as CalibrationEditableTargetField)
                }
              >
                {CALIBRATION_BULK_FIELDS.map((field) => (
                  <option key={field.id} value={field.id}>
                    {field.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Bulk value</span>
              <textarea
                aria-label="Bulk calibration value"
                rows={bulkCalibrationField === 'healthCheckUrls' ? 3 : 1}
                value={bulkCalibrationValue}
                onChange={(event) => setBulkCalibrationValue(event.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={!bulkCalibrationValue.trim()}
              onClick={handleApplyBulkCalibration}
            >
              Apply to {matchingBulkIssues.length} visible item(s)
            </button>
          </div>

          {filteredCalibrationIssues.length > 0 ? (
            <div className="settings-calibration-list">
              {filteredCalibrationIssues.slice(0, 40).map((issue) => (
                <article key={issue.id} className="settings-calibration-card">
                  <div>
                    <div className="settings-card-heading">
                      <h3>{issue.label}</h3>
                      <span className="resource-pill state-warning">
                        {issue.severity === 'needs-real-value' ? 'Needs real value' : 'Warning'}
                      </span>
                    </div>
                    <p>{issue.message}</p>
                    <div className="resource-meta">
                      <span>{issue.projectName}</span>
                      {issue.targetName ? <span>{issue.targetName}</span> : null}
                      <span>{issue.category}</span>
                      <span>{issue.field}</span>
                    </div>
                  </div>
                  <CalibrationField
                    key={`${issue.id}-${issue.value}`}
                    issue={issue}
                    credentialReferences={calibration.credentialReferences}
                    onTargetChange={(targetId, update) => {
                      onDispatchTargetChange(targetId, update)
                      onCalibrationProgressChange(
                        issue,
                        'entered',
                        calibrationNoteDrafts[issue.id] ??
                          calibrationProgressByIssue.get(issue.id)?.note ??
                          '',
                      )
                      onCalibrationAudit({
                        type: 'field-edit',
                        summary: `Updated ${issue.label} for ${issue.projectName}.`,
                        issue,
                      })
                      setCalibrationMessage('Calibration field updated locally.')
                    }}
                    onRejectValue={setCalibrationMessage}
                  />
                  <div className="settings-calibration-progress">
                    <label className="field field-full">
                      <span>Calibration note</span>
                      <textarea
                        aria-label={`Calibration note for ${issue.label}`}
                        rows={2}
                        value={
                          calibrationNoteDrafts[issue.id] ??
                          calibrationProgressByIssue.get(issue.id)?.note ??
                          ''
                        }
                        onChange={(event) =>
                          setCalibrationNoteDrafts((current) => ({
                            ...current,
                            [issue.id]: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <div className="settings-calibration-actions">
                      <span className="resource-pill">
                        {calibrationProgressByIssue.get(issue.id)?.status ?? 'needs-value'}
                      </span>
                      <button type="button" onClick={() => handleProgressChange(issue, 'entered')}>
                        Mark entered
                      </button>
                      <button type="button" onClick={() => handleProgressChange(issue, 'verified')}>
                        Mark verified
                      </button>
                      <button type="button" onClick={() => handleProgressChange(issue, 'deferred')}>
                        Defer
                      </button>
                    </div>
                  </div>
                </article>
              ))}
              {filteredCalibrationIssues.length > 40 ? (
                <p className="empty-state">
                  Showing the first 40 unresolved items. Narrow the filter for the rest.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="empty-state">
              No calibration gaps match this filter. This does not verify credentials or server
              access.
            </p>
          )}
          {calibrationMessage ? (
            <p className="data-action-message">{calibrationMessage}</p>
          ) : null}
          {calibration.auditEvents.length > 0 ? (
            <div className="settings-audit-list" aria-label="Calibration audit events">
              <strong>Latest calibration audit</strong>
              {calibration.auditEvents.slice(0, 8).map((event) => (
                <article key={event.id}>
                  <span>{new Date(event.occurredAt).toLocaleString()}</span>
                  <span>{event.type}</span>
                  <p>{event.summary}</p>
                </article>
              ))}
            </div>
          ) : null}
        </section>

        <section className="settings-panel">
          <div className="panel-heading">
            <HardDrive size={17} />
            <h2>Sync Snapshots</h2>
          </div>
          <div className="settings-form-grid">
            <label className="field">
              <span>Snapshot label</span>
              <input
                value={snapshotLabel}
                placeholder="Manual snapshot"
                onChange={(event) => setSnapshotLabel(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Snapshot note</span>
              <input
                value={snapshotNote}
                placeholder="Optional reason or context"
                onChange={(event) => setSnapshotNote(event.target.value)}
              />
            </label>
          </div>
          <div className="data-actions">
            <button type="button" onClick={handleCreateSnapshot}>
              <PlusCircle size={15} />
              Create local snapshot
            </button>
          </div>

          {sync.snapshots.length > 0 ? (
            <div className="settings-sync-grid">
              <div className="settings-snapshot-list" aria-label="Sync snapshot inventory">
                {sync.snapshots.map((snapshot) => (
                  <article
                    key={snapshot.id}
                    className={
                      selectedSnapshot?.id === snapshot.id
                        ? 'settings-snapshot-card is-selected'
                        : 'settings-snapshot-card'
                    }
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSnapshotId(snapshot.id)
                        setSnapshotConfirmation('')
                      }}
                    >
                      <strong>{snapshot.label}</strong>
                      <span>{new Date(snapshot.createdAt).toLocaleString()}</span>
                      <span>{snapshot.fingerprint}</span>
                    </button>
                    {pendingDeleteId === snapshot.id ? (
                      <button
                        type="button"
                        className="danger-action"
                        onClick={() => handleDeleteSnapshot(snapshot.id)}
                      >
                        <Trash2 size={15} />
                        Confirm delete
                      </button>
                    ) : (
                      <button type="button" onClick={() => setPendingDeleteId(snapshot.id)}>
                        <Trash2 size={15} />
                        Delete
                      </button>
                    )}
                  </article>
                ))}
              </div>

              {restorePreview ? (
                <div className="settings-restore-preview" aria-label="Sync restore preview">
                  <div className="settings-preview-grid">
                    <SnapshotSummary
                      title="Current local data"
                      projects={restorePreview.currentSummary.workspace.projects}
                      targets={restorePreview.currentSummary.dispatch.targets}
                      drafts={restorePreview.currentSummary.writing.drafts}
                      planningRecords={
                        restorePreview.currentSummary.planning.objectives +
                        restorePreview.currentSummary.planning.milestones +
                        restorePreview.currentSummary.planning.workSessions +
                        restorePreview.currentSummary.planning.notes
                      }
                      reportPackets={restorePreview.currentSummary.reports.packets}
                      reviewSessions={restorePreview.currentSummary.review.sessions}
                      calibrationProgress={restorePreview.currentSummary.calibration.progressRecords}
                    />
                    <SnapshotSummary
                      title="Selected snapshot"
                      projects={restorePreview.incomingSummary.workspace.projects}
                      targets={restorePreview.incomingSummary.dispatch.targets}
                      drafts={restorePreview.incomingSummary.writing.drafts}
                      planningRecords={
                        restorePreview.incomingSummary.planning.objectives +
                        restorePreview.incomingSummary.planning.milestones +
                        restorePreview.incomingSummary.planning.workSessions +
                        restorePreview.incomingSummary.planning.notes
                      }
                      reportPackets={restorePreview.incomingSummary.reports.packets}
                      reviewSessions={restorePreview.incomingSummary.review.sessions}
                      calibrationProgress={
                        restorePreview.incomingSummary.calibration.progressRecords
                      }
                    />
                  </div>
                  {restorePreview.warnings.length > 0 ? (
                    <div className="data-warning">
                      <strong>Snapshot warnings</strong>
                      <ul>
                        {restorePreview.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <label className="field field-full">
                    <span>Type {SYNC_RESTORE_CONFIRMATION_PHRASE} to restore snapshot</span>
                    <input
                      value={snapshotConfirmation}
                      onChange={(event) => setSnapshotConfirmation(event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="danger-action"
                    disabled={!restoreReady}
                    onClick={handleRestoreSnapshot}
                  >
                    <ArchiveRestore size={15} />
                    Restore snapshot
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="empty-state">
              No local sync snapshots yet. Create a manual snapshot before testing future hosted
              persistence.
            </p>
          )}
          {syncMessage ? <p className="data-action-message">{syncMessage}</p> : null}
        </section>

        <section className="settings-panel">
          <div className="panel-heading settings-panel-heading-row">
            <div>
              <UploadCloud size={17} />
              <h2>Hosted Sync Bridge</h2>
            </div>
            <button
              type="button"
              onClick={() => void loadHostedSyncStatus()}
              disabled={loadingHostedSync}
            >
              <RefreshCw size={15} />
              Refresh hosted status
            </button>
          </div>
          <p className="empty-state">
            Supabase sync is a manual snapshot log. It does not run in the background, merge
            changes, or store credentials in browser state.
          </p>
          <div className="settings-meta">
            <span>Status: {statusLabel(buildHostedSyncCard(hostedSyncStatus, hostedSyncError, sync.provider).status)}</span>
            <span>Workspace: {hostedSyncStatus?.workspaceId || sync.provider.workspaceId || 'Not configured'}</span>
            <span>Last push: {sync.provider.lastPushAt ? new Date(sync.provider.lastPushAt).toLocaleString() : 'Never'}</span>
            <span>Last pull: {sync.provider.lastPullAt ? new Date(sync.provider.lastPullAt).toLocaleString() : 'Never'}</span>
          </div>
          <div className="settings-form-grid">
            <label className="field">
              <span>Remote retention view</span>
              <select
                aria-label="Remote retention view"
                value={remoteSnapshotLimit}
                onChange={(event) => setRemoteSnapshotLimit(Number(event.target.value))}
              >
                <option value={50}>Show latest 50</option>
              </select>
            </label>
            <div className="settings-snapshot-summary">
              <strong>Remote inventory</strong>
              <span>{remoteRetentionNotice.message}</span>
              <span>{remoteRetentionNotice.shown} snapshots loaded locally</span>
            </div>
          </div>
          {remoteRetentionNotice.warning ? (
            <div className="data-warning">
              <strong>Remote retention warning</strong>
              <ul>
                <li>{remoteRetentionNotice.warning}</li>
              </ul>
            </div>
          ) : null}
          <div className="settings-form-grid">
            <label className="field">
              <span>Remote snapshot label</span>
              <input
                value={remoteSnapshotLabel}
                placeholder="Hosted checkpoint"
                onChange={(event) => setRemoteSnapshotLabel(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Remote snapshot note</span>
              <input
                value={remoteSnapshotNote}
                placeholder="Optional reason or context"
                onChange={(event) => setRemoteSnapshotNote(event.target.value)}
              />
            </label>
          </div>
          <div className="data-actions">
            <button
              type="button"
              onClick={() => void handlePushHostedSnapshot()}
              disabled={loadingHostedSync}
            >
              <UploadCloud size={15} />
              Push current state
            </button>
            <button
              type="button"
              onClick={() => void handleLoadRemoteSnapshots()}
              disabled={loadingHostedSync}
            >
              <RefreshCw size={15} />
              Load remote snapshots
            </button>
          </div>

          {sync.provider.remoteSnapshots.length > 0 ? (
            <div className="settings-sync-grid">
              <div className="settings-snapshot-list" aria-label="Remote sync snapshot inventory">
                {sync.provider.remoteSnapshots.map((snapshot) => (
                  <article
                    key={snapshot.id}
                    className={
                      selectedRemoteSnapshotId === snapshot.id
                        ? 'settings-snapshot-card is-selected'
                        : 'settings-snapshot-card'
                    }
                  >
                    <button
                      type="button"
                      onClick={() => void handleSelectRemoteSnapshot(snapshot.id)}
                    >
                      <strong>{snapshot.label}</strong>
                      <span>{new Date(snapshot.createdAt).toLocaleString()}</span>
                      <span>{snapshot.deviceLabel}</span>
                      <span>{snapshot.fingerprint}</span>
                    </button>
                    {pendingRemoteDeleteId === snapshot.id ? (
                      <button
                        type="button"
                        className="danger-action"
                        onClick={() => void handleDeleteRemoteSnapshot(snapshot.id)}
                      >
                        <Trash2 size={15} />
                        Confirm remote delete
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPendingRemoteDeleteId(snapshot.id)}
                      >
                        <Trash2 size={15} />
                        Delete remote snapshot
                      </button>
                    )}
                  </article>
                ))}
              </div>

              {remoteRestorePreview ? (
                <div className="settings-restore-preview" aria-label="Remote sync restore preview">
                  {remoteSnapshotComparison ? (
                    <div
                      className="settings-compare-grid"
                      aria-label="Remote/local snapshot comparison"
                    >
                      <div className="settings-snapshot-summary">
                        <strong>Fingerprint</strong>
                        <span>
                          {remoteSnapshotComparison.fingerprintMatches
                            ? 'Fingerprints match'
                            : 'Fingerprints differ'}
                        </span>
                        <span>Local: {remoteSnapshotComparison.localFingerprint}</span>
                        <span>Remote: {remoteSnapshotComparison.remoteFingerprint}</span>
                      </div>
                      <div className="settings-snapshot-summary">
                        <strong>Remote source</strong>
                        <span>{remoteSnapshotComparison.deviceLabel}</span>
                        <span>{new Date(remoteSnapshotComparison.createdAt).toLocaleString()}</span>
                      </div>
                      <div className="settings-snapshot-summary">
                        <strong>Count comparison</strong>
                        {remoteSnapshotComparison.summaryLines.map((line) => (
                          <span key={line}>{line}</span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {remoteSnapshotComparison?.countDrops.length ? (
                    <div className="data-warning">
                      <strong>Remote/local count drops</strong>
                      <ul>
                        {remoteSnapshotComparison.countDrops.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <div className="settings-preview-grid">
                    <SnapshotSummary
                      title="Current local data"
                      projects={remoteRestorePreview.currentSummary.workspace.projects}
                      targets={remoteRestorePreview.currentSummary.dispatch.targets}
                      drafts={remoteRestorePreview.currentSummary.writing.drafts}
                      planningRecords={
                        remoteRestorePreview.currentSummary.planning.objectives +
                        remoteRestorePreview.currentSummary.planning.milestones +
                        remoteRestorePreview.currentSummary.planning.workSessions +
                        remoteRestorePreview.currentSummary.planning.notes
                      }
                      reportPackets={remoteRestorePreview.currentSummary.reports.packets}
                      reviewSessions={remoteRestorePreview.currentSummary.review.sessions}
                      calibrationProgress={
                        remoteRestorePreview.currentSummary.calibration.progressRecords
                      }
                    />
                    <SnapshotSummary
                      title="Remote snapshot"
                      projects={remoteRestorePreview.incomingSummary.workspace.projects}
                      targets={remoteRestorePreview.incomingSummary.dispatch.targets}
                      drafts={remoteRestorePreview.incomingSummary.writing.drafts}
                      planningRecords={
                        remoteRestorePreview.incomingSummary.planning.objectives +
                        remoteRestorePreview.incomingSummary.planning.milestones +
                        remoteRestorePreview.incomingSummary.planning.workSessions +
                        remoteRestorePreview.incomingSummary.planning.notes
                      }
                      reportPackets={remoteRestorePreview.incomingSummary.reports.packets}
                      reviewSessions={remoteRestorePreview.incomingSummary.review.sessions}
                      calibrationProgress={
                        remoteRestorePreview.incomingSummary.calibration.progressRecords
                      }
                    />
                  </div>
                  {remoteRestorePreview.warnings.length > 0 ? (
                    <div className="data-warning">
                      <strong>Remote restore warnings</strong>
                      <ul>
                        {remoteRestorePreview.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <label className="field field-full">
                    <span>Type {SYNC_RESTORE_CONFIRMATION_PHRASE} to restore remote snapshot</span>
                    <input
                      value={remoteSnapshotConfirmation}
                      onChange={(event) => setRemoteSnapshotConfirmation(event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="danger-action"
                    disabled={!remoteRestoreReady}
                    onClick={handleRestoreRemoteSnapshot}
                  >
                    <ArchiveRestore size={15} />
                    Restore remote snapshot
                  </button>
                </div>
              ) : (
                <p className="empty-state">
                  Select a remote snapshot to load a restore preview before replacing local stores.
                </p>
              )}
            </div>
          ) : (
            <p className="empty-state">
              No remote snapshots loaded. Load snapshots after Supabase sync is configured, or push
              the current local state as the first remote checkpoint.
            </p>
          )}
        </section>

        <section className="settings-panel settings-guardrails">
          <div className="panel-heading">
            <ShieldCheck size={17} />
            <h2>Settings Rules</h2>
          </div>
          <ul className="dispatch-list">
            <li>Settings store only local labels, notes, and connection-readiness metadata.</li>
            <li>GitHub tokens, AI keys, deployment credentials, and env vars stay out of browser state.</li>
            <li>Connection cards are status surfaces, not automation triggers.</li>
            <li>Hosted sync uses manual snapshot push/pull only; no background sync or merge runs.</li>
            <li>OpenAI Writing suggestions remain draft-only until explicitly applied by a human.</li>
          </ul>
        </section>
      </div>
    </section>
  )
}
