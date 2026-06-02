import type { SettingsCenterProps } from './settingsCenter/types'
import { useSettingsCenterModel } from './settingsCenter/useSettingsCenterModel'
import { SettingsCenterProvider } from './settingsCenter/SettingsCenterContext'
import { SettingsCenterHeader } from './settingsCenter/SettingsCenterHeader'
import { LocalWorkspaceIdentitySection } from './settingsCenter/LocalWorkspaceIdentitySection'
import { ConnectionReadinessSection } from './settingsCenter/ConnectionReadinessSection'
import { CalibrationOperationsSection } from './settingsCenter/CalibrationOperationsSection'
import { SyncSnapshotsSection } from './settingsCenter/SyncSnapshotsSection'
import { HostedSyncBridgeSection } from './settingsCenter/HostedSyncBridgeSection'
import { SettingsRulesSection } from './settingsCenter/SettingsRulesSection'

export function SettingsCenter(props: SettingsCenterProps) {
  const model = useSettingsCenterModel(props)

  return (
    <SettingsCenterProvider value={model}>
      <section className="settings-center" aria-labelledby="settings-title">
        <SettingsCenterHeader />

        <div className="settings-layout">
          <LocalWorkspaceIdentitySection />
          <ConnectionReadinessSection />
          <CalibrationOperationsSection />
          <SyncSnapshotsSection />
          <HostedSyncBridgeSection />
          <SettingsRulesSection />
        </div>
      </section>
    </SettingsCenterProvider>
  )
}
