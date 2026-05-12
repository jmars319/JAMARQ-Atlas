import type { ActivityEvent, AtlasProject, ManualOperationalState, Workspace } from '../domain/atlas'

type ProjectSeed = Omit<AtlasProject, 'activity' | 'links' | 'repositories' | 'manual'> & {
  activity?: ActivityEvent[]
  links?: AtlasProject['links']
  manual: Omit<ManualOperationalState, 'verificationCadence'> &
    Partial<Pick<ManualOperationalState, 'verificationCadence'>>
  repositories?: AtlasProject['repositories']
}

function activity(
  id: string,
  type: ActivityEvent['type'],
  title: string,
  detail: string,
  occurredAt: string,
  source: ActivityEvent['source'] = 'mock',
): ActivityEvent {
  return {
    id,
    type,
    title,
    detail,
    occurredAt,
    source,
  }
}

function project(seed: ProjectSeed): AtlasProject {
  return {
    links: [],
    repositories: [],
    activity: [],
    ...seed,
    manual: {
      ...seed.manual,
      verificationCadence: seed.manual.verificationCadence ?? 'monthly',
    },
  }
}

export const seedWorkspace: Workspace = {
  id: 'jamarq-atlas',
  name: 'JAMARQ Atlas',
  purpose:
    'Operator dashboard for interpreting open work across client systems, software suites, experiments, and outlier repositories.',
  sections: [
    {
      id: 'client-systems',
      name: 'Client Systems',
      summary: 'Client-facing sites and operational systems that need clean handoffs.',
      groups: [
        {
          id: 'midway-music-hall',
          name: 'Midway Music Hall',
          summary: 'Public web presence and venue operations surface.',
          projects: [
            project({
              id: 'midway-music-hall-site',
              name: 'Midway Music Hall website',
              kind: 'website',
              summary: 'Venue website, event updates, and public content flow.',
              manual: {
                status: 'Active',
                nextAction: 'Confirm the event update workflow and deployment baseline.',
                lastMeaningfulChange: '2026-05-07: homepage review notes added to the work queue.',
                lastVerified: '2026-05-08',
                currentRisk: 'Content changes can drift if event source data is not reconciled.',
                blockers: ['Need final event source of truth confirmed.'],
                deferredItems: ['Automated event import until source format is stable.'],
                notDoingItems: ['No redesign until current operational path is verified.'],
                notes: ['Treat uptime and content accuracy as separate checks.'],
                decisions: ['Manual status remains independent from deployment activity.'],
              },
              activity: [
                activity(
                  'midway-site-a1',
                  'note',
                  'Content pass queued',
                  'Mock operator note for event and homepage review.',
                  '2026-05-07',
                ),
                activity(
                  'midway-site-a2',
                  'deployment',
                  'Deployment placeholder',
                  'Deployment feed is mocked until GitHub or host ingestion is wired.',
                  '2026-05-05',
                ),
              ],
            }),
          ],
        },
        {
          id: 'midway-mobile-storage',
          name: 'Midway Mobile Storage',
          summary: 'Storage lead and public site operations.',
          projects: [
            project({
              id: 'midway-mobile-storage-site',
              name: 'Midway Mobile Storage website',
              kind: 'website',
              summary: 'Container storage site and lead conversion surface.',
              manual: {
                status: 'Verification',
                nextAction: 'Verify quote request path and mobile layout after the latest content pass.',
                lastMeaningfulChange: '2026-05-03: lead form copy was reviewed.',
                lastVerified: '2026-05-04',
                currentRisk: 'Form confidence depends on an end-to-end submission check.',
                blockers: [],
                deferredItems: ['CRM automation beyond the initial lead capture path.'],
                notDoingItems: ['No paid campaign changes from Atlas.'],
                notes: ['Keep client-facing language plain and service-specific.'],
                decisions: ['Verification status must be manually cleared after a live-path check.'],
              },
              activity: [
                activity(
                  'midway-storage-a1',
                  'issue',
                  'Lead form QA item',
                  'Mock issue mirrors the need for a final form check.',
                  '2026-05-04',
                ),
              ],
            }),
          ],
        },
        {
          id: 'thunder-road',
          name: 'Thunder Road',
          summary: 'Music venue website and update cadence.',
          projects: [
            project({
              id: 'thunder-road-site',
              name: 'Thunder Road website',
              kind: 'website',
              summary: 'Venue website with recurring schedule and content updates.',
              manual: {
                status: 'Waiting',
                nextAction: 'Wait for approved copy before touching public pages.',
                lastMeaningfulChange: '2026-04-28: pending copy list captured.',
                lastVerified: '2026-05-01',
                currentRisk: 'Publishing stale event details would create client confusion.',
                blockers: ['Approved public copy is not ready.'],
                deferredItems: ['Broader design cleanup after copy is approved.'],
                notDoingItems: ['Do not infer event details from unofficial sources.'],
                notes: ['This is a waiting item even if repo activity appears quiet.'],
                decisions: ['Client approval gates public-facing updates.'],
              },
              activity: [
                activity(
                  'thunder-road-a1',
                  'decision',
                  'Copy approval required',
                  'Manual decision recorded before making public page changes.',
                  '2026-04-28',
                  'manual',
                ),
              ],
            }),
          ],
        },
        {
          id: 'surplus-containers',
          name: 'Surplus Containers',
          summary: 'Sales site, inventory messaging, and operational notes.',
          projects: [
            project({
              id: 'surplus-containers-site',
              name: 'Surplus Containers website',
              kind: 'website',
              summary: 'Public sales website for container inventory and inbound leads.',
              manual: {
                status: 'Planned',
                nextAction: 'Audit landing page copy against current container availability language.',
                lastMeaningfulChange: '2026-04-25: inventory messaging questions captured.',
                lastVerified: '2026-04-30',
                currentRisk: 'Marketing language may not match current operational availability.',
                blockers: [],
                deferredItems: ['Dynamic inventory until the feed ownership is clear.'],
                notDoingItems: ['Do not promise live inventory in the first Atlas pass.'],
                notes: ['Useful candidate for future client update note drafting.'],
                decisions: ['Atlas tracks the operational concern, not campaign priority.'],
              },
              activity: [
                activity(
                  'surplus-a1',
                  'note',
                  'Inventory language review planned',
                  'Mock operator note for the next copy audit.',
                  '2026-04-25',
                ),
              ],
            }),
          ],
        },
        {
          id: 'bow-wow',
          name: 'Bow Wow',
          summary: 'Placeholder/live-site deployment tracking for the Bow Wow public site.',
          projects: [
            project({
              id: 'bow-wow-site',
              name: 'Bow Wow website',
              kind: 'website',
              summary: 'Public site currently tracked as placeholder-first until full launch is approved.',
              manual: {
                status: 'Verification',
                nextAction: 'Confirm whether placeholder should remain live before uploading full app artifacts.',
                lastMeaningfulChange: '2026-05-10: placeholder deploy option captured.',
                lastVerified: '2026-05-10',
                currentRisk: 'Uploading the full frontend/backend before launch approval would publish too much.',
                blockers: ['Full app launch intent needs explicit confirmation.'],
                deferredItems: ['Full backend launch until product readiness is confirmed.'],
                notDoingItems: ['Do not upload full app artifacts while placeholder is intended.'],
                notes: ['Use deploy-placeholder.zip only unless the full app is approved.'],
                decisions: ['Placeholder deploy path is separate from full app launch path.'],
              },
              activity: [
                activity(
                  'bow-wow-a1',
                  'note',
                  'Placeholder deploy captured',
                  'Bow Wow deploy runbook tracks placeholder-only path until full app launch is approved.',
                  '2026-05-10',
                  'manual',
                ),
              ],
            }),
          ],
        },
      ],
    },
    {
      id: 'vaexcore',
      name: 'VaexCore',
      summary: 'Internal software suite surfaces without assuming VaexCore is the only portfolio.',
      groups: [
        {
          id: 'vaexcore-suite',
          name: 'Suite',
          summary: 'Cross-suite direction, shared primitives, and release readiness.',
          projects: [
            project({
              id: 'vaexcore-suite',
              name: 'VaexCore Suite',
              kind: 'suite',
              summary: 'Top-level operating layer for the VaexCore product family.',
              manual: {
                status: 'Planned',
                nextAction: 'Define the smallest shared release checklist across suite components.',
                lastMeaningfulChange: '2026-05-02: suite-level checkpoint was separated from individual apps.',
                lastVerified: '2026-05-02',
                currentRisk: 'Shared release language can hide product-specific readiness.',
                blockers: [],
                deferredItems: ['Automated cross-repo scorecards.'],
                notDoingItems: ['No AI-generated priority ranking.'],
                notes: ['Suite status should summarize manual intent, not raw commit volume.'],
                decisions: ['Interpretation stays separate from ingestion.'],
              },
              activity: [
                activity(
                  'suite-a1',
                  'decision',
                  'Suite status separated',
                  'Manual status is tracked at the suite and component levels.',
                  '2026-05-02',
                  'manual',
                ),
              ],
            }),
          ],
        },
        {
          id: 'vaexcore-studio',
          name: 'Studio',
          summary: 'Creation and operator-facing studio surface.',
          projects: [
            project({
              id: 'vaexcore-studio',
              name: 'VaexCore Studio',
              kind: 'app',
              summary: 'Builder interface and studio workspace.',
              manual: {
                status: 'Active',
                nextAction: 'Collect recent repo activity into a human-reviewed release note draft.',
                lastMeaningfulChange: '2026-05-06: workspace IA changes were noted.',
                lastVerified: '2026-05-07',
                currentRisk: 'Recent work may need a concise handoff before the next build session.',
                blockers: [],
                deferredItems: ['Full automation of release notes until review flow is proven.'],
                notDoingItems: ['Do not auto-promote a release from commit summaries.'],
                notes: ['A good first candidate for AI writing assistance once activity ingestion exists.'],
                decisions: ['AI output is draft text only.'],
              },
              repositories: [
                {
                  owner: 'jmars319',
                  name: 'vaexcore-studio',
                },
              ],
              activity: [
                activity(
                  'studio-a1',
                  'commit',
                  'Workspace IA mock commit',
                  'Recent source activity placeholder for dashboard layout testing.',
                  '2026-05-06',
                ),
                activity(
                  'studio-a2',
                  'workflow',
                  'Build status placeholder',
                  'Workflow area reserved for future GitHub Actions ingestion.',
                  '2026-05-06',
                ),
              ],
            }),
          ],
        },
        {
          id: 'vaexcore-console',
          name: 'Console',
          summary: 'Administration and control surface.',
          projects: [
            project({
              id: 'vaexcore-console',
              name: 'VaexCore Console',
              kind: 'app',
              summary: 'Admin console, settings, and operational controls.',
              manual: {
                status: 'Inbox',
                nextAction: 'Clarify whether Console is still a separate surface or folded into Suite.',
                lastMeaningfulChange: '2026-04-18: open question captured.',
                lastVerified: '2026-04-18',
                currentRisk: 'Scope ambiguity may create duplicated control surfaces.',
                blockers: ['Needs product boundary decision.'],
                deferredItems: [],
                notDoingItems: ['No UI work until scope is clarified.'],
                notes: ['Keep in Inbox until the ownership question is answered.'],
                decisions: [],
              },
              activity: [
                activity(
                  'console-a1',
                  'note',
                  'Boundary question captured',
                  'Mock note keeps this visible without implying active work.',
                  '2026-04-18',
                ),
              ],
            }),
          ],
        },
        {
          id: 'vaexcore-pulse',
          name: 'Pulse',
          summary: 'Signal, activity, and monitoring direction.',
          projects: [
            project({
              id: 'vaexcore-pulse',
              name: 'VaexCore Pulse',
              kind: 'app',
              summary: 'Operational signals and status visibility concept.',
              manual: {
                status: 'Deferred',
                nextAction: 'Return after Atlas proves the activity/status model.',
                lastMeaningfulChange: '2026-04-10: dependency on Atlas model noted.',
                lastVerified: '2026-04-10',
                currentRisk: 'Could overlap with Atlas if resumed too early.',
                blockers: [],
                deferredItems: ['Signal taxonomy', 'Cross-repo activity normalization'],
                notDoingItems: ['Do not build Pulse before Atlas validates its core model.'],
                notes: ['Atlas may absorb some Pulse concepts.'],
                decisions: ['Deferred intentionally, not abandoned.'],
              },
              activity: [
                activity(
                  'pulse-a1',
                  'decision',
                  'Deferred behind Atlas',
                  'Manual decision prevents duplicate dashboard work.',
                  '2026-04-10',
                  'manual',
                ),
              ],
            }),
          ],
        },
        {
          id: 'vaexcore-relay',
          name: 'Relay',
          summary: 'Integration and handoff direction.',
          projects: [
            project({
              id: 'vaexcore-relay',
              name: 'VaexCore Relay',
              kind: 'app',
              summary: 'Message passing and integration concept for suite components.',
              manual: {
                status: 'Planned',
                nextAction: 'Write a one-page scope note before implementation resumes.',
                lastMeaningfulChange: '2026-04-22: integration boundary noted.',
                lastVerified: '2026-04-23',
                currentRisk: 'Integration work can expand before contracts are named.',
                blockers: [],
                deferredItems: ['Runtime implementation details.'],
                notDoingItems: ['No broad automation until the first contract is explicit.'],
                notes: ['Useful future companion to GitHub/deployment ingestion.'],
                decisions: ['Scope note comes before code.'],
              },
              activity: [
                activity(
                  'relay-a1',
                  'note',
                  'Scope note planned',
                  'Mock activity for next action tracking.',
                  '2026-04-22',
                ),
              ],
            }),
          ],
        },
      ],
    },
    {
      id: 'tenra',
      name: 'Tenra',
      summary: 'Software suite, public site, and experiment track.',
      groups: [
        {
          id: 'tenra-software-suite',
          name: 'Software suite',
          summary: 'Core Tenra product surface and related repos.',
          projects: [
            project({
              id: 'tenra-suite',
              name: 'Tenra software suite',
              kind: 'suite',
              summary: 'Tenra application suite and operating model.',
              manual: {
                status: 'Planned',
                nextAction: 'Separate suite goals from public-site messaging.',
                lastMeaningfulChange: '2026-05-01: split between product and site noted.',
                lastVerified: '2026-05-01',
                currentRisk: 'Brand/site work may be mistaken for product readiness.',
                blockers: [],
                deferredItems: ['Detailed suite roadmap.'],
                notDoingItems: ['No automated priority scoring.'],
                notes: ['Keep product and marketing statuses distinct.'],
                decisions: ['Tenra remains its own section, not an Outlier.'],
              },
              activity: [
                activity(
                  'tenra-suite-a1',
                  'decision',
                  'Product and site split',
                  'Manual decision captured for Atlas information architecture.',
                  '2026-05-01',
                  'manual',
                ),
              ],
            }),
          ],
        },
        {
          id: 'tenra-public-site',
          name: 'Public site',
          summary: 'Public positioning and website execution.',
          projects: [
            project({
              id: 'tenra-public-site',
              name: 'Tenra public site',
              kind: 'website',
              summary: 'Public website and positioning layer.',
              manual: {
                status: 'Inbox',
                nextAction: 'Capture the current desired site promise in one paragraph.',
                lastMeaningfulChange: '2026-04-26: site direction added to Atlas seed.',
                lastVerified: '2026-04-26',
                currentRisk: 'Positioning can get ahead of product clarity.',
                blockers: ['Needs a crisp site promise.'],
                deferredItems: ['Visual polish pass.'],
                notDoingItems: ['Do not publish claims that depend on unfinished suite work.'],
                notes: ['This should stay lightweight until product language is clearer.'],
                decisions: [],
              },
              activity: [
                activity(
                  'tenra-site-a1',
                  'note',
                  'Site promise needed',
                  'Mock note for first writing pass.',
                  '2026-04-26',
                ),
              ],
            }),
          ],
        },
        {
          id: 'tenra-experiments',
          name: 'Experiments',
          summary: 'Exploration track that should not pollute active roadmap status.',
          projects: [
            project({
              id: 'tenra-experiments',
              name: 'Tenra experiments',
              kind: 'experiment',
              summary: 'Loose experiments, prototypes, and research spikes.',
              manual: {
                status: 'Deferred',
                nextAction: 'Review only after active suite direction is refreshed.',
                lastMeaningfulChange: '2026-04-12: experiments bucket created.',
                lastVerified: '2026-04-12',
                currentRisk: 'Experiments can look like active work if not clearly parked.',
                blockers: [],
                deferredItems: ['Prototype catalog', 'Learning summary'],
                notDoingItems: ['No production commitment from experiment activity.'],
                notes: ['Good use case for weekly activity summaries later.'],
                decisions: ['Experiment activity does not change manual status.'],
              },
              activity: [
                activity(
                  'tenra-exp-a1',
                  'decision',
                  'Experiments parked',
                  'Manual decision keeps experiments separate from the product roadmap.',
                  '2026-04-12',
                  'manual',
                ),
              ],
            }),
          ],
        },
      ],
    },
    {
      id: 'jamarq',
      name: 'JAMARQ',
      summary: 'Company website, internal tools, and business infrastructure.',
      groups: [
        {
          id: 'jamarq-website',
          name: 'Website',
          summary: 'Public JAMARQ presence.',
          projects: [
            project({
              id: 'jamarq-website',
              name: 'JAMARQ website',
              kind: 'website',
              summary: 'Public company website and brand surface.',
              manual: {
                status: 'Verification',
                nextAction: 'Verify live content and capture any missing business infrastructure links.',
                lastMeaningfulChange: '2026-05-05: website status added to Atlas.',
                lastVerified: '2026-05-06',
                currentRisk: 'Public site may lag behind the actual business operating model.',
                blockers: [],
                deferredItems: ['Full brand system cleanup.'],
                notDoingItems: ['Do not turn Atlas into the public website CMS.'],
                notes: ['Public site is a project in Atlas, not Atlas itself.'],
                decisions: ['Atlas is internal operator infrastructure.'],
              },
              activity: [
                activity(
                  'jamarq-site-a1',
                  'note',
                  'Live content verification queued',
                  'Mock note for the public site verification pass.',
                  '2026-05-05',
                ),
              ],
            }),
          ],
        },
        {
          id: 'jamarq-internal-tools',
          name: 'Internal tools',
          summary: 'Tools that support daily operator work.',
          projects: [
            project({
              id: 'jamarq-atlas',
              name: 'JAMARQ Atlas',
              kind: 'app',
              summary: 'Local-first operator dashboard for the whole work portfolio.',
              manual: {
                status: 'Active',
                nextAction: 'Build durable MVP with seed model, dashboard, details, and boundaries.',
                lastMeaningfulChange: '2026-05-09: project repository initialized.',
                lastVerified: '2026-05-09',
                currentRisk: 'Overbuilding would blur the core manual status model.',
                blockers: [],
                deferredItems: ['Team accounts', 'Hosted database', 'Autonomous analysis'],
                notDoingItems: ['No AI-driven priority, roadmap, risk, or status decisions.'],
                notes: ['Manual operational state is the source of truth.'],
                decisions: ['Start as a local-first React/Vite app.'],
              },
              repositories: [
                {
                  owner: 'jmars319',
                  name: 'JAMARQ-Atlas',
                  url: 'https://github.com/jmars319/JAMARQ-Atlas',
                  defaultBranch: 'main',
                },
              ],
              activity: [
                activity(
                  'atlas-a1',
                  'commit',
                  'Repository scaffolded',
                  'Initial app skeleton created on main.',
                  '2026-05-09',
                  'manual',
                ),
              ],
            }),
          ],
        },
        {
          id: 'jamarq-business-infrastructure',
          name: 'Business infrastructure',
          summary: 'Non-product operating infrastructure and business systems.',
          projects: [
            project({
              id: 'jamarq-business-infrastructure',
              name: 'Business infrastructure',
              kind: 'infrastructure',
              summary: 'Operational systems that support JAMARQ work outside the codebase.',
              manual: {
                status: 'Inbox',
                nextAction: 'List the first three infrastructure systems that Atlas should track.',
                lastMeaningfulChange: '2026-05-03: infrastructure bucket created.',
                lastVerified: '2026-05-03',
                currentRisk: 'Important non-code systems may remain invisible.',
                blockers: ['Need the initial infrastructure inventory.'],
                deferredItems: ['Automated billing or finance integrations.'],
                notDoingItems: ['No sensitive credential storage in Atlas.'],
                notes: ['Keep this broad but explicit.'],
                decisions: ['Infrastructure can be tracked even without a repository.'],
              },
              activity: [
                activity(
                  'business-infra-a1',
                  'note',
                  'Initial inventory needed',
                  'Mock note for non-code system tracking.',
                  '2026-05-03',
                ),
              ],
            }),
          ],
        },
      ],
    },
    {
      id: 'outliers',
      name: 'Outliers',
      summary: 'One-off work, paused ideas, and archived material kept out of core sections.',
      groups: [
        {
          id: 'one-off-tools',
          name: 'One-off tools',
          summary: 'Useful standalone tools with unclear long-term ownership.',
          projects: [
            project({
              id: 'outlier-one-off-tools',
              name: 'One-off tools',
              kind: 'repo',
              summary: 'Small utilities that may remain standalone.',
              manual: {
                status: 'Inbox',
                nextAction: 'Triage which tools deserve a project record and which should be archived.',
                lastMeaningfulChange: '2026-04-20: outlier bucket identified.',
                lastVerified: '2026-04-20',
                currentRisk: 'Small tools can accumulate hidden maintenance burden.',
                blockers: [],
                deferredItems: ['Repo-by-repo import.'],
                notDoingItems: ['Do not promote a tool into a portfolio without a reason.'],
                notes: ['Atlas should make outliers visible without rewarding activity for its own sake.'],
                decisions: [],
              },
              activity: [
                activity(
                  'outlier-tools-a1',
                  'note',
                  'Triage bucket created',
                  'Mock note for standalone utility review.',
                  '2026-04-20',
                ),
              ],
            }),
          ],
        },
        {
          id: 'paused-ideas',
          name: 'Paused ideas',
          summary: 'Ideas intentionally kept out of active execution.',
          projects: [
            project({
              id: 'outlier-paused-ideas',
              name: 'Paused ideas',
              kind: 'experiment',
              summary: 'Ideas worth retaining without creating false urgency.',
              manual: {
                status: 'Deferred',
                nextAction: 'Review only during a deliberate planning pass.',
                lastMeaningfulChange: '2026-04-15: paused ideas separated from active work.',
                lastVerified: '2026-04-15',
                currentRisk: 'Paused ideas can distract from verified active systems.',
                blockers: [],
                deferredItems: ['Idea review cadence.'],
                notDoingItems: ['No ad hoc work without moving an item out of Deferred.'],
                notes: ['Deferred is a choice, not a failure state.'],
                decisions: ['Paused ideas are allowed to stay quiet.'],
              },
              activity: [
                activity(
                  'paused-ideas-a1',
                  'decision',
                  'Paused ideas deferred',
                  'Manual decision captured for planning clarity.',
                  '2026-04-15',
                  'manual',
                ),
              ],
            }),
          ],
        },
        {
          id: 'archived-work',
          name: 'Archived work',
          summary: 'Preserved work that should not be treated as open.',
          projects: [
            project({
              id: 'outlier-archived-work',
              name: 'Archived work',
              kind: 'archive',
              summary: 'Completed or obsolete work retained for reference.',
              manual: {
                status: 'Archived',
                nextAction: 'None. Keep available for reference.',
                lastMeaningfulChange: '2026-03-30: archive status confirmed.',
                lastVerified: '2026-04-01',
                currentRisk: 'Low. Accidental revival is the main risk.',
                blockers: [],
                deferredItems: [],
                notDoingItems: ['Do not mix archived work into active planning.'],
                notes: ['Archived projects may still have old repo activity.'],
                decisions: ['Archive status can only be changed manually.'],
              },
              activity: [
                activity(
                  'archived-a1',
                  'decision',
                  'Archive confirmed',
                  'Manual status set to Archived for inactive work.',
                  '2026-03-30',
                  'manual',
                ),
              ],
            }),
          ],
        },
      ],
    },
  ],
}
