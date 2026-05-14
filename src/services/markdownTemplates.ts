export interface MarkdownSection {
  heading: string
  body: string | string[]
  include?: boolean
}

export function markdownList(items: string[], fallback: string) {
  return items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : `- ${fallback}`
}

export function markdownGuardrails(guardrails: string[]) {
  return guardrails.map((guardrail) => `- ${guardrail}`)
}

export function markdownSection({ heading, body, include = true }: MarkdownSection) {
  if (!include) {
    return []
  }

  const lines = Array.isArray(body) ? body : [body]

  return [`## ${heading}`, '', ...lines, '']
}

export function slugifyFilename(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)
}
