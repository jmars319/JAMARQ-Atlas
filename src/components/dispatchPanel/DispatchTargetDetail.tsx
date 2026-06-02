import { useDispatchTargetContext } from './useDispatchTargetContext'
import { DispatchAutomationSection } from './DispatchAutomationSection'
import { DispatchCloseoutSection } from './DispatchCloseoutSection'
import { DispatchHistorySafetySection } from './DispatchHistorySafetySection'
import { DispatchHostBoundarySection } from './DispatchHostBoundarySection'
import { DispatchPreflightSection } from './DispatchPreflightSection'
import { DispatchReadinessSection } from './DispatchReadinessSection'
import { DispatchRecoverySection } from './DispatchRecoverySection'
import { DispatchRunbookSection } from './DispatchRunbookSection'
import { DispatchSessionSection } from './DispatchSessionSection'
import { DispatchSummarySection } from './DispatchSummarySection'

export function DispatchTargetDetail() {
  const { target } = useDispatchTargetContext()

  return (
    <section className="dispatch-target-detail" aria-label={`${target.name} dispatch detail`}>
      <DispatchSummarySection />
      <DispatchRecoverySection />
      <DispatchRunbookSection />
      <DispatchSessionSection />
      <DispatchCloseoutSection />
      <DispatchHostBoundarySection />
      <DispatchPreflightSection />
      <DispatchReadinessSection />
      <DispatchAutomationSection />
      <DispatchHistorySafetySection />
    </section>
  )
}
