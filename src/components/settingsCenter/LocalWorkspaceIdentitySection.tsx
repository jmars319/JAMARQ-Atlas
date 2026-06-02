import { useSettingsCenterContext } from './useSettingsCenterContext'
import { Settings2 } from 'lucide-react'

export function LocalWorkspaceIdentitySection() {
  const {
    desktopRuntime,
    onSettingsChange,
    settings,
  } = useSettingsCenterContext()

  return (
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
        {desktopRuntime ? (
          <div className="settings-meta">
            <span>Storage: SQLite</span>
            <span>Database: {desktopRuntime.sqlitePath}</span>
            <span>Config: {desktopRuntime.configPath}</span>
            <span>Keychain encryption: {desktopRuntime.secureStorageAvailable ? 'available' : 'unavailable'}</span>
          </div>
        ) : null}
      </section>
  )
}
