import { appViewLabel, PRIMARY_VIEWS, SUPPORT_VIEWS, type AppView } from './atlasViews'

interface AtlasViewTabsProps {
  appView: AppView
  onViewChange: (view: AppView) => void
}

export function AtlasViewTabs({ appView, onViewChange }: AtlasViewTabsProps) {
  return (
    <nav className="app-tabs" aria-label="Atlas views">
      <div className="app-tab-group">
        <span>Daily work</span>
        <div>
          {PRIMARY_VIEWS.map((view) => (
            <button
              key={view}
              type="button"
              className={appView === view ? 'is-selected' : ''}
              onClick={() => onViewChange(view)}
            >
              {appViewLabel(view)}
            </button>
          ))}
        </div>
      </div>
      <div className="app-tab-group app-tab-group-secondary">
        <span>Support tools</span>
        <div>
          {SUPPORT_VIEWS.map((view) => (
            <button
              key={view}
              type="button"
              className={appView === view ? 'is-selected' : ''}
              onClick={() => onViewChange(view)}
            >
              {appViewLabel(view)}
            </button>
          ))}
        </div>
      </div>
    </nav>
  )
}
