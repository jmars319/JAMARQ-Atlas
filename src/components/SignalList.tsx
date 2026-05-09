import { AlertTriangle, Info, ShieldCheck } from 'lucide-react'
import type { AutomationSignal } from '../services/githubIntegration'

const iconByTone = {
  info: Info,
  warning: AlertTriangle,
  danger: AlertTriangle,
  muted: ShieldCheck,
} satisfies Record<AutomationSignal['tone'], typeof Info>

interface SignalListProps {
  signals: AutomationSignal[]
}

export function SignalList({ signals }: SignalListProps) {
  if (signals.length === 0) {
    return <p className="empty-state">No advisory signals for the loaded data.</p>
  }

  return (
    <ul className="signal-list">
      {signals.map((signal) => {
        const Icon = iconByTone[signal.tone]

        return (
          <li className={`signal signal-${signal.tone}`} key={signal.id}>
            <Icon size={15} />
            <div>
              <strong>{signal.title}</strong>
              <span>{signal.detail}</span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
