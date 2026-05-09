import { getStatusDefinition, statusToneClass, type WorkStatus } from '../domain/atlas'

interface StatusBadgeProps {
  status: WorkStatus
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const definition = getStatusDefinition(status)

  return (
    <span className={`status-badge ${statusToneClass(status)}`} title={definition.description}>
      {definition.label}
    </span>
  )
}
