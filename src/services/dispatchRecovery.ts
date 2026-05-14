import type {
  DeploymentTarget,
  DispatchRecoveryPlan,
  DispatchRecoveryPlanEvaluation,
  DispatchState,
} from '../domain/dispatch'
import { isSecretLikeValue } from './calibration'

export const DEFAULT_RECOVERY_REVIEW_STALE_DAYS = 30

export interface DispatchRecoveryPlanInput {
  id?: string
  projectId: string
  targetId: string
  backupCadence?: string
  backupLocationRef?: string
  rollbackReference?: string
  rollbackSteps?: string[]
  maintenanceWindow?: string
  escalationContactRef?: string
  lastReviewedAt?: string
  notes?: string[]
}

export interface DispatchRecoveryPlanResult {
  ok: boolean
  state: DispatchState
  plan?: DispatchRecoveryPlan
  errors: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
  }

  if (typeof value === 'string') {
    return value
      .split('|')
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return []
}

function safeDate(value: unknown, fallback: Date) {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return value
  }

  return fallback.toISOString()
}

function planId(targetId: string) {
  return `recovery-${targetId}`
}

function secretLikeValues(input: Partial<DispatchRecoveryPlanInput | DispatchRecoveryPlan>) {
  const values = [
    input.backupCadence,
    input.backupLocationRef,
    input.rollbackReference,
    input.maintenanceWindow,
    input.escalationContactRef,
    ...(input.rollbackSteps ?? []),
    ...(input.notes ?? []),
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)

  return values.filter((value) => isSecretLikeValue(value))
}

export function validateRecoveryPlanInput(input: Partial<DispatchRecoveryPlanInput>) {
  const blockedValues = secretLikeValues(input)

  if (blockedValues.length > 0) {
    return {
      ok: false,
      errors: [
        'Recovery plans store labels and references only. Remove secret-shaped values before saving.',
      ],
    }
  }

  return { ok: true, errors: [] }
}

export function createEmptyRecoveryPlan(
  target: DeploymentTarget,
  now = new Date(),
): DispatchRecoveryPlan {
  return {
    id: planId(target.id),
    projectId: target.projectId,
    targetId: target.id,
    backupCadence: target.backupRequired ? 'Before each manual production upload' : '',
    backupLocationRef: '',
    rollbackReference: '',
    rollbackSteps: [],
    maintenanceWindow: '',
    escalationContactRef: '',
    lastReviewedAt: now.toISOString(),
    notes: [],
  }
}

export function normalizeRecoveryPlan(
  value: unknown,
  targets: DeploymentTarget[] = [],
  now = new Date(),
): DispatchRecoveryPlan | null {
  if (!isRecord(value)) {
    return null
  }

  const targetId = readString(value.targetId)
  const target = targets.find((candidate) => candidate.id === targetId)
  const projectId = readString(value.projectId) || target?.projectId || ''

  if (!projectId || !targetId) {
    return null
  }

  const candidate: DispatchRecoveryPlan = {
    id: readString(value.id) || planId(targetId),
    projectId,
    targetId,
    backupCadence: readString(value.backupCadence),
    backupLocationRef: readString(value.backupLocationRef),
    rollbackReference: readString(value.rollbackReference),
    rollbackSteps: readStringArray(value.rollbackSteps),
    maintenanceWindow: readString(value.maintenanceWindow),
    escalationContactRef: readString(value.escalationContactRef),
    lastReviewedAt: safeDate(value.lastReviewedAt, now),
    notes: readStringArray(value.notes),
  }

  if (!validateRecoveryPlanInput(candidate).ok) {
    return null
  }

  return candidate
}

export function normalizeRecoveryPlans(
  value: unknown,
  targets: DeploymentTarget[] = [],
  now = new Date(),
): DispatchRecoveryPlan[] {
  if (!Array.isArray(value)) {
    return []
  }

  const seen = new Set<string>()
  const plans: DispatchRecoveryPlan[] = []

  for (const item of value) {
    const plan = normalizeRecoveryPlan(item, targets, now)

    if (!plan || seen.has(plan.targetId)) {
      continue
    }

    seen.add(plan.targetId)
    plans.push(plan)
  }

  return plans
}

export function upsertRecoveryPlan(
  state: DispatchState,
  input: DispatchRecoveryPlanInput,
  now = new Date(),
): DispatchRecoveryPlanResult {
  const validation = validateRecoveryPlanInput(input)

  if (!validation.ok) {
    return {
      ok: false,
      state,
      errors: validation.errors,
    }
  }

  const target = state.targets.find((candidate) => candidate.id === input.targetId)

  if (!target || target.projectId !== input.projectId) {
    return {
      ok: false,
      state,
      errors: ['Recovery plan target must point at an existing Dispatch target.'],
    }
  }

  const existing =
    state.recoveryPlans.find((candidate) => candidate.targetId === input.targetId) ??
    createEmptyRecoveryPlan(target, now)
  const plan: DispatchRecoveryPlan = {
    ...existing,
    ...input,
    id: input.id || existing.id || planId(input.targetId),
    projectId: input.projectId,
    targetId: input.targetId,
    backupCadence: input.backupCadence ?? existing.backupCadence,
    backupLocationRef: input.backupLocationRef ?? existing.backupLocationRef,
    rollbackReference: input.rollbackReference ?? existing.rollbackReference,
    rollbackSteps: input.rollbackSteps ?? existing.rollbackSteps,
    maintenanceWindow: input.maintenanceWindow ?? existing.maintenanceWindow,
    escalationContactRef: input.escalationContactRef ?? existing.escalationContactRef,
    lastReviewedAt: input.lastReviewedAt || now.toISOString(),
    notes: input.notes ?? existing.notes,
  }

  return {
    ok: true,
    state: {
      ...state,
      recoveryPlans: state.recoveryPlans.some(
        (candidate) => candidate.targetId === input.targetId,
      )
        ? state.recoveryPlans.map((candidate) =>
            candidate.targetId === input.targetId ? plan : candidate,
          )
        : [...state.recoveryPlans, plan],
    },
    plan,
    errors: [],
  }
}

function daysSince(value: string, now: Date) {
  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return Math.floor((now.getTime() - parsed.getTime()) / 86_400_000)
}

export function evaluateRecoveryPlanReadiness({
  target,
  plan,
  now = new Date(),
  staleDays = DEFAULT_RECOVERY_REVIEW_STALE_DAYS,
}: {
  target: DeploymentTarget
  plan: DispatchRecoveryPlan | undefined
  now?: Date
  staleDays?: number
}): DispatchRecoveryPlanEvaluation {
  if (!plan) {
    return {
      status: 'missing',
      label: 'Recovery plan missing',
      detail: 'Backup, rollback, maintenance, and escalation references are not recorded.',
      missingFields: ['backupLocationRef', 'rollbackReference', 'rollbackSteps', 'lastReviewedAt'],
      stale: false,
      reviewedAt: '',
    }
  }

  const missingFields = [
    ...(target.backupRequired && !plan.backupCadence ? ['backupCadence'] : []),
    ...(target.backupRequired && !plan.backupLocationRef ? ['backupLocationRef'] : []),
    ...(!plan.rollbackReference ? ['rollbackReference'] : []),
    ...(plan.rollbackSteps.length === 0 ? ['rollbackSteps'] : []),
    ...(!plan.escalationContactRef ? ['escalationContactRef'] : []),
    ...(!plan.lastReviewedAt ? ['lastReviewedAt'] : []),
  ]
  const age = daysSince(plan.lastReviewedAt, now)
  const stale = age !== null && age > staleDays

  if (missingFields.length > 0) {
    return {
      status: 'incomplete',
      label: 'Recovery plan incomplete',
      detail: `${missingFields.length} recovery field(s) need a non-secret label or reference.`,
      missingFields,
      stale,
      reviewedAt: plan.lastReviewedAt,
    }
  }

  if (stale) {
    return {
      status: 'stale',
      label: 'Recovery plan stale',
      detail: `Recovery plan was reviewed ${age} day(s) ago.`,
      missingFields: [],
      stale,
      reviewedAt: plan.lastReviewedAt,
    }
  }

  return {
    status: 'current',
    label: 'Recovery plan current',
    detail: 'Backup, rollback, maintenance, and escalation references are current.',
    missingFields: [],
    stale,
    reviewedAt: plan.lastReviewedAt,
  }
}
