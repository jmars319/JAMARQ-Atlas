import { useMemo, useState } from 'react'
import type { CalibrationFieldStatus } from '../../domain/calibration'
import type { AtlasSyncSnapshot } from '../../domain/sync'
import {
  deleteHostedSyncSnapshot,
  fetchHostedSyncSnapshot,
  fetchHostedSyncSnapshots,
  pushHostedSyncSnapshot,
} from '../../services/hostedSync'
import {
  CALIBRATION_CATEGORIES,
  canStoreCalibrationValue,
  calibrationValueToTargetUpdate,
  createCalibrationCsvTemplate,
  createCalibrationJsonTemplate,
  createCalibrationReadinessReport,
  groupCalibrationIssues,
  parseCalibrationImportPreview,
  scanAtlasCalibration,
  summarizeCalibrationState,
  type CalibrationImportPreview,
  type CalibrationCategory,
  type CalibrationEditableTargetField,
  type CalibrationIssue,
} from '../../services/calibration'
import {
  canApplySyncRestore,
  compareSyncSnapshot,
  createSyncSnapshot,
  createRemoteSnapshotRetentionNotice,
  createSyncRestorePreview,
  REMOTE_SYNC_SNAPSHOT_LIMIT,
} from '../../services/syncSnapshots'
import { createCalibrationWorkflow } from '../../services/calibrationWorkflow'
import type { SettingsCenterProps } from './types'
import { useSettingsConnections } from './useSettingsConnections'

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

export function useSettingsCenterModel( {
  settings,
  workspace,
  dispatch,
  writing,
  planning,
  reports,
  review,
  calibration,
  optimization,
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
  const [expandedCalibrationGroupIds, setExpandedCalibrationGroupIds] = useState<string[]>([])
  const [credentialLabel, setCredentialLabel] = useState('')
  const [credentialProvider, setCredentialProvider] = useState('')
  const [credentialPurpose, setCredentialPurpose] = useState('')
  const [credentialNotes, setCredentialNotes] = useState('')
  const [credentialTargetIds, setCredentialTargetIds] = useState('')
  const [credentialProjectIds, setCredentialProjectIds] = useState('')
  const [calibrationImportPreview, setCalibrationImportPreview] =
    useState<CalibrationImportPreview | null>(null)
  const [calibrationImportError, setCalibrationImportError] = useState('')
  const desktopRuntime = typeof window === 'undefined' ? null : window.atlasDesktop ?? null
  const connections = useSettingsConnections({
    onSyncProviderChange,
    syncProvider: sync.provider,
  })
  const { setHostedSyncError, setLoadingHostedSync } = connections
  const calibrationIssues = useMemo(
    () =>
      scanAtlasCalibration(
        workspace,
        dispatch,
        connections.configuredHostTargetIds,
        calibration.credentialReferences.map((reference) => reference.label),
      ),
    [calibration.credentialReferences, connections.configuredHostTargetIds, dispatch, workspace],
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
  const groupedCalibrationIssues = useMemo(
    () => groupCalibrationIssues(filteredCalibrationIssues),
    [filteredCalibrationIssues],
  )
  const expandedCalibrationGroupIdSet = useMemo(
    () => new Set(expandedCalibrationGroupIds),
    [expandedCalibrationGroupIds],
  )
  const calibrationStatusCountsByGroup = useMemo(
    () =>
      new Map(
        groupedCalibrationIssues.map((group) => {
          const counts = {
            needsValue: 0,
            entered: 0,
            verified: 0,
            deferred: 0,
          }

          for (const issue of group.issues) {
            const status = calibrationProgressByIssue.get(issue.id)?.status ?? 'needs-value'
            if (status === 'needs-value') {
              counts.needsValue += 1
            } else {
              counts[status] += 1
            }
          }

          return [group.id, counts] as const
        }),
      ),
    [calibrationProgressByIssue, groupedCalibrationIssues],
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
    () => ({ workspace, dispatch, writing, planning, reports, review, calibration, optimization }),
    [calibration, dispatch, optimization, planning, reports, review, workspace, writing],
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

  function toggleCalibrationGroup(groupId: string) {
    setExpandedCalibrationGroupIds((current) =>
      current.includes(groupId)
        ? current.filter((candidate) => candidate !== groupId)
        : [...current, groupId],
    )
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
      'Snapshot restored locally. Workspace, Dispatch, Writing, Planning, Reports, Review, Calibration, and Optimization stores were replaced.',
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

  return {
    ...connections,
    bulkCalibrationField,
    bulkCalibrationValue,
    calibration,
    calibrationCategoryCounts,
    calibrationFilter,
    calibrationImportError,
    calibrationImportPreview,
    calibrationIssues,
    calibrationMessage,
    calibrationNoteDrafts,
    calibrationProgressByIssue,
    calibrationReadinessReport,
    calibrationStatusCountsByGroup,
    calibrationSummary,
    calibrationWorkflow,
    credentialLabel,
    credentialNotes,
    credentialProjectIds,
    credentialProvider,
    credentialPurpose,
    credentialTargetIds,
    currentStores,
    desktopRuntime,
    dispatch,
    expandedCalibrationGroupIdSet,
    expandedCalibrationGroupIds,
    filteredCalibrationIssues,
    groupedCalibrationIssues,
    handleApplyBulkCalibration,
    handleApplyCalibrationImport,
    handleCalibrationImportFile,
    handleCreateSnapshot,
    handleDeleteRemoteSnapshot,
    handleDeleteSnapshot,
    handleDownloadCalibrationCsv,
    handleDownloadCalibrationJson,
    handleLoadRemoteSnapshots,
    handleProgressChange,
    handlePushHostedSnapshot,
    handleRestoreRemoteSnapshot,
    handleRestoreSnapshot,
    handleSaveCredentialReference,
    handleSelectRemoteSnapshot,
    matchingBulkIssues,
    onApplyCalibrationImport,
    onCalibrationAudit,
    onCalibrationProgressChange,
    onCreateSnapshot,
    onCredentialReferenceDelete,
    onCredentialReferenceSave,
    onDeleteSnapshot,
    onDispatchTargetChange,
    onRecordRemotePush,
    onRecordRemoteSnapshots,
    onRemoveRemoteSnapshot,
    onRestoreSnapshot,
    onSettingsChange,
    onSyncProviderChange,
    optimization,
    pendingDeleteId,
    pendingRemoteDeleteId,
    planning,
    remoteRestorePreview,
    remoteRestoreReady,
    remoteRetentionNotice,
    remoteSnapshot,
    remoteSnapshotComparison,
    remoteSnapshotConfirmation,
    remoteSnapshotLabel,
    remoteSnapshotLimit,
    remoteSnapshotNote,
    reports,
    restorePreview,
    restoreReady,
    review,
    selectedRemoteMetadata,
    selectedRemoteSnapshotId,
    selectedSnapshot,
    selectedSnapshotId,
    setBulkCalibrationField,
    setBulkCalibrationValue,
    setCalibrationFilter,
    setCalibrationImportError,
    setCalibrationImportPreview,
    setCalibrationMessage,
    setCalibrationNoteDrafts,
    setCredentialLabel,
    setCredentialNotes,
    setCredentialProjectIds,
    setCredentialProvider,
    setCredentialPurpose,
    setCredentialTargetIds,
    setExpandedCalibrationGroupIds,
    setPendingDeleteId,
    setPendingRemoteDeleteId,
    setRemoteSnapshot,
    setRemoteSnapshotConfirmation,
    setRemoteSnapshotLabel,
    setRemoteSnapshotLimit,
    setRemoteSnapshotNote,
    setSelectedRemoteSnapshotId,
    setSelectedSnapshotId,
    setSnapshotConfirmation,
    setSnapshotLabel,
    setSnapshotNote,
    setSyncMessage,
    settings,
    snapshotConfirmation,
    snapshotLabel,
    snapshotNote,
    sync,
    syncMessage,
    toggleCalibrationGroup,
    workspace,
    writing,
  }
}
