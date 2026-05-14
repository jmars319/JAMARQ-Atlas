import { getReportPacketType, type ReportPacketType } from '../domain/reports'
import {
  markdownGuardrails,
  markdownList,
  markdownSection,
  type MarkdownSection,
} from './markdownTemplates'

export const reportGuardrails = [
  'Report packets are local review artifacts only.',
  'Export does not mean anything was sent, published, deployed, shipped, or verified.',
  'Reports must not change Atlas project status, risk, roadmap, verification, Dispatch readiness, GitHub bindings, Planning records, or Writing drafts.',
  'GitHub, Dispatch, Verification, Planning, and Writing context remains advisory.',
  'Closeout analytics are derived evidence only and do not prove Atlas deployed, verified, published, or completed anything.',
  'Review Center notes are human-authored context only and do not decide follow-up, completion, readiness, or priority.',
]

export const reportTemplateFocusLines: Partial<Record<ReportPacketType, string[]>> = {
  'client-update-packet': [
    'Keep language client-safe, concrete, and free of internal-only uncertainty.',
    'Use Dispatch, GitHub, and Review context as background only; do not imply anything shipped unless a human says so.',
  ],
  'internal-weekly-packet': [
    'Emphasize operator review, blocked work, verification due state, Dispatch follow-up, and pending report/draft work.',
    'This is an internal planning artifact, not an automated prioritization decision.',
  ],
  'internal-deploy-handoff-packet': [
    'Emphasize runbook order, preserve paths, evidence captured, closeout posture, and remaining manual checks.',
    'Do not imply Atlas uploaded artifacts or changed production state.',
  ],
  'dispatch-closeout-summary-packet': [
    'Emphasize closeout state, evidence IDs, manual deployment records, report packet context, and follow-up gaps.',
    'Closeout state is advisory and does not prove deployment or verification.',
  ],
}

export function buildReportTemplateFocus(type: ReportPacketType) {
  return markdownList(
    reportTemplateFocusLines[type] ?? [getReportPacketType(type).intent],
    'No template focus recorded.',
  )
}

export function assembleReportMarkdown({
  title,
  reportTypeLabel,
  generatedAt,
  templateFocus,
  sections,
}: {
  title: string
  reportTypeLabel: string
  generatedAt: string
  templateFocus: string
  sections: MarkdownSection[]
}) {
  return [
    `# ${title}`,
    '',
    `Report type: ${reportTypeLabel}`,
    `Generated locally: ${generatedAt}`,
    '',
    ...markdownSection({ heading: 'Template Focus', body: templateFocus }),
    ...markdownSection({ heading: 'Guardrails', body: markdownGuardrails(reportGuardrails) }),
    ...sections.flatMap((section) => markdownSection(section)),
  ].join('\n')
}
