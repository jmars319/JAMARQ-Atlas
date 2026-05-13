import { useEffect, useState } from 'react'
import type { ReportPacket, ReportsState } from '../domain/reports'
import { ATLAS_STORE_DEFINITIONS_BY_ID } from '../domain/storeRegistry'
import {
  addReportPacket,
  archiveReportPacket,
  emptyReportsStore,
  markReportExported,
  normalizeReportsState,
  recordReportCopied,
  updateReportPacketMarkdown,
} from '../services/reports'

const STORAGE_KEY = ATLAS_STORE_DEFINITIONS_BY_ID.reports.localStorageKey

function readReports(): ReportsState {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)

    if (!stored) {
      return emptyReportsStore()
    }

    return normalizeReportsState(JSON.parse(stored))
  } catch {
    return emptyReportsStore()
  }
}

export function useLocalReports() {
  const [reports, setReports] = useState<ReportsState>(() => readReports())

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reports))
  }, [reports])

  function addPacket(packet: ReportPacket) {
    setReports((current) => addReportPacket(current, packet))
  }

  function updatePacketMarkdown(packetId: string, markdown: string) {
    setReports((current) => updateReportPacketMarkdown(current, packetId, markdown))
  }

  function recordCopied(packetId: string) {
    setReports((current) => recordReportCopied(current, packetId))
  }

  function markExported(packetId: string) {
    setReports((current) => markReportExported(current, packetId))
  }

  function archivePacket(packetId: string) {
    setReports((current) => archiveReportPacket(current, packetId))
  }

  function resetReports() {
    const freshReports = emptyReportsStore()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(freshReports))
    setReports(freshReports)
  }

  return {
    reports,
    setReports,
    addPacket,
    updatePacketMarkdown,
    recordCopied,
    markExported,
    archivePacket,
    resetReports,
  }
}
