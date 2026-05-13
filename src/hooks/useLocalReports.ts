import type { ReportPacket, ReportsState } from '../domain/reports'
import {
  addReportPacket,
  archiveReportPacket,
  emptyReportsStore,
  markReportExported,
  normalizeReportsState,
  recordReportCopied,
  updateReportPacketMarkdown,
} from '../services/reports'
import { useLocalStoreState } from './useLocalStore'

export function useLocalReports() {
  const {
    state: reports,
    setState: setReports,
    resetState: resetReports,
  } = useLocalStoreState<ReportsState>({
    storeId: 'reports',
    fallback: emptyReportsStore,
    normalize: normalizeReportsState,
  })

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
