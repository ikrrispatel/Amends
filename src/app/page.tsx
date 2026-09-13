'use client';

import { useEffect, useState } from 'react';
import { ApplicationStateCard } from '../components/application-state-card';
import { AuditTimeline } from '../components/audit-timeline';
import { MismatchTable } from '../components/mismatch-table';
import { RecoveryPlan } from '../components/recovery-plan';
import { VerificationChecks } from '../components/verification-checks';
import type {
  ApplicationCardData,
  AuditEventData,
  MismatchData,
  RecoveryActionData,
  VerificationCheckData,
} from '../components/demo-types';

type DemoStage = 'fault' | 'baseline' | 'inspected' | 'approved' | 'verified';

const applications: ApplicationCardData[] = [
  {
    name: 'Stripe',
    status: 'mismatch',
    description: 'Northstar subscription and grandfathered price',
    lastReadAt: 'just now',
    fields: [
      { label: 'Northstar price', expected: '$99 / seat', actual: '$129 / seat', matches: false },
      { label: 'Subscription', expected: 'Active · 87 seats', actual: 'Active · 87 seats', matches: true },
    ],
  },
  {
    name: 'Notion',
    status: 'mismatch',
    description: 'Pro 2027 pricing policy',
    lastReadAt: 'just now',
    fields: [
      { label: 'Customer scope', expected: 'New customers only', actual: 'All customers', matches: false },
      { label: 'New-customer price', expected: '$129 / seat', actual: '$129 / seat', matches: true },
    ],
  },
  {
    name: 'Slack',
    status: 'healthy',
    description: 'Instruction and approval evidence',
    lastReadAt: 'just now',
    fields: [
      { label: 'Instruction', expected: 'Available', actual: 'Available', matches: true },
      { label: 'Fault message', expected: 'Recorded as evidence', actual: 'Recorded as evidence', matches: true },
    ],
  },
];

const mismatches: MismatchData[] = [
  { application: 'Stripe', field: 'Northstar price', expected: '$99 / seat', actual: '$129 / seat', impact: '+$2,610 / month' },
  { application: 'Notion', field: 'Customer scope', expected: 'New customers only', actual: 'All customers', impact: 'Policy violation' },
];

const actions: RecoveryActionData[] = [
  { order: 1, title: 'Restore Stripe grandfathered price', description: 'Set Northstar to $99 per seat and preserve the active quantity of 87.', risk: 'medium', reversibility: 'Compensating update; no new invoice or proration', status: 'pending' },
  { order: 2, title: 'Restore Notion pricing policy', description: 'Set scope to new customers only while retaining $99 existing and $129 new pricing.', risk: 'low', reversibility: 'Compensating update to the named synthetic page', status: 'pending' },
  { order: 3, title: 'Post Slack recovery receipt', description: 'Record the approved run code and verified result in the synthetic channel.', risk: 'low', reversibility: 'Communication is not presented as undoable', status: 'pending' },
];

const checks: VerificationCheckData[] = [
  { label: 'Northstar is active at 9,900 cents', detail: 'Waiting for recovery execution', status: 'pending' },
  { label: 'Quantity remains exactly 87', detail: 'Waiting for fresh Stripe reread', status: 'pending' },
  { label: 'Notion scope is new_customers_only', detail: 'Waiting for fresh Notion reread', status: 'pending' },
  { label: 'Notion prices are 9,900 and 12,900 cents', detail: 'Waiting for fresh Notion reread', status: 'pending' },
  { label: 'Exactly one current-run Slack receipt exists', detail: 'Waiting for approved receipt', status: 'pending' },
];

const events: AuditEventData[] = [
  { timestamp: '10:42:01', title: 'Fault injected', detail: 'Synthetic Stripe and Notion state diverged while provider calls reported success.', tone: 'danger' },
  { timestamp: '10:42:06', title: 'Inspection complete', detail: 'Two business mismatches found; exposure calculated as $2,610 per month at risk.', tone: 'warning' },
  { timestamp: '10:42:10', title: 'Approval requested', detail: 'Waiting for the configured approver to reply with the exact run command.', tone: 'warning' },
];

export default function HomePage() {
  const [stage, setStage] = useState<DemoStage>('fault');
  const [liveStatus, setLiveStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [liveMessage, setLiveMessage] = useState('Reading Slack and Notion…');
  const [approvalMessage, setApprovalMessage] = useState('');
  const [isRequestingApproval, setIsRequestingApproval] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [isCheckingApproval, setIsCheckingApproval] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const isBaseline = stage === 'baseline';
  const isVerified = stage === 'verified';

  useEffect(() => {
    let cancelled = false;
    async function loadLiveEvidence() {
      try {
        const [slackResponse, notionResponse] = await Promise.all([
          fetch('/api/slack/instruction', { cache: 'no-store' }),
          fetch('/api/notion/policy', { cache: 'no-store' }),
        ]);
        const slack = await slackResponse.json() as { instruction?: { text?: string }; error?: string };
        const notion = await notionResponse.json() as { policy?: { scope?: string }; error?: string };
        if (!slackResponse.ok || !notionResponse.ok) {
          throw new Error(slack.error || notion.error || 'Provider evidence could not be loaded.');
        }
        if (!cancelled) {
          setLiveStatus('ready');
          setLiveMessage(`Live evidence loaded · Slack instruction and Notion policy available${slack.instruction?.text ? '' : ' (instruction text unavailable)'}`);
        }
      } catch (error) {
        if (!cancelled) {
          setLiveStatus('error');
          setLiveMessage(error instanceof Error ? error.message : 'Provider evidence could not be loaded.');
        }
      }
    }
    loadLiveEvidence();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const elements = document.querySelectorAll<HTMLElement>('.reveal-on-scroll');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => entry.target.classList.toggle('is-visible', entry.isIntersecting));
    }, { threshold: 0.12, rootMargin: '0px 0px -7% 0px' });
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  async function requestApproval() {
    setIsRequestingApproval(true);
    setApprovalMessage('Posting approval request to Slack…');
    try {
      const response = await fetch('/api/slack/approval-request?runCode=AMN-2027-0042', { method: 'POST' });
      const result = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(result.error || 'Slack approval request failed.');
      setApprovalMessage(result.message || 'Approval request posted. Reply in Slack with the exact command.');
      setStage('inspected');
    } catch (error) {
      setApprovalMessage(error instanceof Error ? error.message : 'Slack approval request failed.');
    } finally {
      setIsRequestingApproval(false);
    }
  }

  async function inspectLiveState() {
    setIsInspecting(true);
    setLiveMessage('Creating a guarded run and inspecting the canonical application state…');
    try {
      const nextRunId = runId ?? `team-c-${Date.now()}`;
      let currentState: string | undefined;
      if (!runId) {
        const created = await fetch('/api/runs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ runId: nextRunId, runCode: 'AMN-2027-0042' }),
        });
        if (!created.ok) throw new Error('The guarded run could not be created.');
        const createdResult = await created.json() as { run?: { currentState?: string } };
        currentState = createdResult.run?.currentState;
        setRunId(nextRunId);
      } else {
        const inspected = await fetch(`/api/runs/${nextRunId}/inspect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        if (!inspected.ok) throw new Error('The canonical inspection failed.');
        const inspectedResult = await inspected.json() as { run?: { currentState?: string } };
        currentState = inspectedResult.run?.currentState;
      }
      if (currentState !== 'MISMATCH_FOUND') {
        throw new Error(`Canonical inspection completed with state ${currentState || 'UNKNOWN'}, not MISMATCH_FOUND.`);
      }
      setStage('inspected');
      setLiveStatus('ready');
      setLiveMessage(`Canonical run ${nextRunId} inspected successfully: mismatch found and approval can proceed.`);
    } catch (error) {
      setLiveStatus('error');
      setLiveMessage(error instanceof Error ? error.message : 'Inspection failed.');
    } finally {
      setIsInspecting(false);
    }
  }

  async function checkSlackApproval() {
    if (!runId) {
      setApprovalMessage('Inspect the live state first to create a guarded run.');
      return;
    }
    setIsCheckingApproval(true);
    setApprovalMessage('Checking Slack for the exact approver command…');
    try {
      const approvalResponse = await fetch('/api/slack/approval?runCode=AMN-2027-0042', { cache: 'no-store' });
      const approval = await approvalResponse.json() as { approved?: boolean; error?: string };
      if (!approvalResponse.ok) throw new Error(approval.error || 'Slack approval status unavailable.');
      if (!approval.approved) {
        setApprovalMessage('No valid approval found yet. The configured approver must send APPROVE AMN-2027-0042 in Slack.');
        return;
      }
      const response = await fetch(`/api/runs/${runId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runCode: 'AMN-2027-0042', approvedBy: 'U_APPROVER', approvalMessage: 'APPROVE AMN-2027-0042' }),
      });
      const result = await response.json() as { error?: { message?: string }; run?: { currentState?: string } };
      if (!response.ok) throw new Error(result.error?.message || 'Canonical approval failed.');
      setStage('approved');
      setApprovalMessage(`Approval verified. Run state: ${result.run?.currentState || 'APPROVAL_GRANTED'}.`);
    } catch (error) {
      setApprovalMessage(error instanceof Error ? error.message : 'Approval check failed.');
    } finally {
      setIsCheckingApproval(false);
    }
  }

  async function executeAndVerify() {
    if (!runId || stage !== 'approved') return;
    setIsRecovering(true);
    setApprovalMessage('Executing the allowlisted recovery and running fresh verification…');
    try {
      const response = await fetch(`/api/runs/${runId}/recover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const result = await response.json() as { error?: { message?: string }; run?: { currentState?: string } };
      if (!response.ok) throw new Error(result.error?.message || 'Recovery verification failed.');
      setStage('verified');
      setApprovalMessage(`Recovery complete. Run state: ${result.run?.currentState || 'VERIFIED'}.`);
    } catch (error) {
      setApprovalMessage(error instanceof Error ? error.message : 'Recovery verification failed.');
    } finally {
      setIsRecovering(false);
    }
  }

  const displayedApplications = applications.map((application) => {
    if (application.name === 'Stripe') {
      return {
        ...application,
        status: isBaseline || isVerified ? 'healthy' as const : 'mismatch' as const,
        fields: application.fields.map((field) => field.label === 'Northstar price'
          ? { ...field, actual: isBaseline || isVerified ? field.expected : '$129 / seat', matches: isBaseline || isVerified }
          : field),
      };
    }
    if (application.name === 'Notion') {
      return {
        ...application,
        status: isBaseline || isVerified ? 'healthy' as const : 'mismatch' as const,
        fields: application.fields.map((field) => field.label === 'Customer scope'
          ? { ...field, actual: isBaseline || isVerified ? field.expected : 'All customers', matches: isBaseline || isVerified }
          : field),
      };
    }
    return application;
  });

  const displayedActions = actions.map((action) => ({
    ...action,
    status: isVerified ? 'complete' as const : stage === 'approved' ? 'pending' as const : 'pending' as const,
  }));
  const displayedChecks = checks.map((check) => ({
    ...check,
    status: isVerified ? 'pass' as const : 'pending' as const,
    detail: isVerified ? 'Fresh reread confirmed' : check.detail,
  }));
  const displayedEvents = isVerified
    ? [...events, { timestamp: '10:42:18', title: 'Recovery verified', detail: 'All five deterministic checks pass after a fresh reread.', tone: 'success' as const }]
    : events;

  return (
    <main className="amends-shell min-h-screen px-5 py-5 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <nav className="template-panel reveal-on-scroll mb-12 flex items-center justify-between px-5 py-3 sm:px-7" aria-label="Primary navigation">
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-bold tracking-[0.16em] text-white">AMENDS</span>
            <span className="hidden text-xs font-medium text-slate-500 sm:inline">Outcome assurance platform</span>
          </div>
          <div className="hidden items-center gap-8 text-sm text-slate-600 md:flex">
            <a className="transition-colors hover:text-slate-950" href="#evidence">Evidence</a>
            <a className="transition-colors hover:text-slate-950" href="#recovery">Recovery</a>
            <a className="transition-colors hover:text-slate-950" href="#audit">Audit trail</a>
          </div>
          <span className="template-pill bg-lime-100 px-3 py-1.5 text-xs font-semibold text-lime-900">Live demo · TEST</span>
        </nav>

        <header className="reveal-on-scroll flex flex-wrap items-end justify-between gap-8 border-b border-black/15 pb-10">
          <div>
            <p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">IntentLock / Recovery workspace</p>
            <h1 className="amends-display max-w-4xl text-5xl leading-[0.92] text-slate-950 sm:text-7xl lg:text-8xl">Make every change <span className="relative inline-block"><span className="relative z-10">provable.</span><span className="absolute inset-x-0 bottom-1 -z-0 h-3 bg-lime-300 sm:h-5" /></span></h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">Pricing rollout incident. Every provider call succeeded; the combined business outcome still violated the original instruction.</p>
          </div>
          <div className="template-pill border-red-300 bg-red-50 px-5 py-4 text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-700">Run status</p>
            <p className={`mt-1 text-lg font-bold ${isBaseline ? 'text-emerald-800' : isVerified ? 'text-emerald-800' : 'text-red-800'}`}>
              {isBaseline ? 'BASELINE READY' : isVerified ? 'VERIFIED 5/5' : 'MISMATCH FOUND'}
            </p>
            <p className="mt-1 text-xs text-red-700">Run AMN-2027-0042</p>
          </div>
        </header>

        <section className="template-panel reveal-on-scroll mt-7 p-4 sm:p-5" aria-label="Recovery controls">
          <div className="flex flex-wrap items-center gap-3">
            <span className="mr-2 text-sm font-semibold text-slate-700">Recovery workflow</span>
            <button className="premium-action template-pill bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={liveStatus === 'loading' || isInspecting} onClick={inspectLiveState}>{isInspecting ? 'Inspecting…' : 'Inspect live state'}</button>
            <button className="premium-action template-pill bg-amber-400 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50" disabled={liveStatus !== 'ready' || isRequestingApproval} onClick={requestApproval}>{isRequestingApproval ? 'Requesting…' : 'Request approval in Slack'}</button>
            <button className="premium-action template-pill bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 disabled:cursor-not-allowed disabled:opacity-50" disabled={!runId || isCheckingApproval} onClick={checkSlackApproval}>{isCheckingApproval ? 'Checking…' : 'Check Slack approval'}</button>
            <button className="premium-action template-pill bg-lime-300 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50" disabled={!runId || stage !== 'approved' || isRecovering} onClick={executeAndVerify}>{isRecovering ? 'Verifying…' : 'Execute & verify'}</button>
            <button className="premium-action template-pill bg-transparent px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-white" onClick={() => window.location.reload()}>Reload evidence</button>
            <span className="ml-auto text-xs font-medium text-slate-500">Stage: {stage}</span>
          </div>
          <p className={`mt-3 text-sm ${liveStatus === 'error' ? 'text-red-700' : liveStatus === 'ready' ? 'text-emerald-700' : 'text-slate-500'}`} role="status">{liveMessage}</p>
          {approvalMessage && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">{approvalMessage}</p>}
          <p className="mt-2 text-xs text-slate-500">Stripe mutation and final verification are disabled until the approved Stripe recovery endpoint is connected.</p>
        </section>

        <section id="evidence" className="template-panel reveal-on-scroll mt-10 p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Original Slack instruction</p>
          <blockquote className="amends-display mt-5 max-w-5xl border-l-4 border-slate-950 pl-5 text-2xl leading-tight text-slate-800 sm:text-3xl">“Launch the Pro 2027 plan at $129 per seat for new customers only. Northstar and every existing enterprise customer stay grandfathered at $99 per seat. Update our pricing policy and confirm when complete.”</blockquote>
        </section>

        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {displayedApplications.map((application) => <ApplicationStateCard application={application} key={application.name} />)}
        </div>

        <div id="recovery" className="mt-10 grid gap-8 xl:grid-cols-[minmax(0,1.4fr)_minmax(340px,0.6fr)]">
          <div id="audit" className="space-y-8">
            <MismatchTable mismatches={isBaseline || isVerified ? [] : mismatches} exposureCents={isBaseline || isVerified ? 0 : 261000} />
            <RecoveryPlan actions={displayedActions} expiresAt="Today at 10:47:10" runCode="AMN-2027-0042" />
          </div>
          <div className="space-y-8">
            <VerificationChecks checks={displayedChecks} />
            <AuditTimeline events={displayedEvents} />
          </div>
        </div>
      </div>
    </main>
  );
}
