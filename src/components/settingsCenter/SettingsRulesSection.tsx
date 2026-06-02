import { ShieldCheck } from 'lucide-react'

export function SettingsRulesSection() {
  return (
      <section className="settings-panel settings-guardrails">
        <div className="panel-heading">
          <ShieldCheck size={17} />
          <h2>Settings Rules</h2>
        </div>
        <ul className="dispatch-list">
          <li>Settings store only local labels, notes, and connection-readiness metadata.</li>
          <li>GitHub tokens, AI keys, deployment credentials, and env vars stay out of browser state.</li>
          <li>Connection cards are status surfaces, not automation triggers.</li>
          <li>Hosted sync uses manual snapshot push/pull only; no background sync or merge runs.</li>
          <li>OpenAI Writing suggestions remain draft-only until explicitly applied by a human.</li>
        </ul>
      </section>
  )
}
