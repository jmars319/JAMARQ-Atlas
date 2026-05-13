import { AlertTriangle, CheckCircle2, Info, LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'

export type SurfaceStateTone = 'loading' | 'empty' | 'warning' | 'error' | 'success'

interface SurfaceStateProps {
  tone?: SurfaceStateTone
  title: string
  detail?: string
  children?: ReactNode
}

const toneIcons = {
  loading: LoaderCircle,
  empty: Info,
  warning: AlertTriangle,
  error: AlertTriangle,
  success: CheckCircle2,
}

export function SurfaceState({ tone = 'empty', title, detail, children }: SurfaceStateProps) {
  const Icon = toneIcons[tone]

  return (
    <div className={`surface-state surface-state-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon size={18} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        {detail ? <span>{detail}</span> : null}
        {children}
      </div>
    </div>
  )
}
