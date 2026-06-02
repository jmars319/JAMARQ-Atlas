import type { AtlasActionView } from '../services/atlasActions'

export type AppView = AtlasActionView

export const PRIMARY_VIEWS: AppView[] = [
  'board',
  'repos',
  'optimize',
  'github',
  'planning',
  'review',
  'dispatch',
]

export const SUPPORT_VIEWS: AppView[] = [
  'timeline',
  'ops',
  'verification',
  'writing',
  'reports',
  'data',
  'settings',
]

export function appViewLabel(view: AppView) {
  const labels: Record<AppView, string> = {
    board: 'Board',
    optimize: 'Optimize',
    timeline: 'Timeline',
    repos: 'Repos',
    github: 'GitHub',
    planning: 'Planning',
    reports: 'Reports',
    review: 'Review',
    ops: 'Ops',
    verification: 'Verification',
    dispatch: 'Dispatch',
    writing: 'Writing',
    data: 'Data',
    settings: 'Settings',
  }

  return labels[view]
}
