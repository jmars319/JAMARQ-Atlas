import { useSettingsCenterContext } from './useSettingsCenterContext'
import { Settings2, ShieldCheck, HardDrive } from 'lucide-react'

export function SettingsCenterHeader() {
  const {
    connectionCards,
    settings,
  } = useSettingsCenterContext()

  return (
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

  )
}
