import type { RecoveryActionData, RecoveryRisk } from './demo-types';

const riskStyles: Record<RecoveryRisk, string> = {
  low: 'bg-emerald-50 text-emerald-700',
  medium: 'bg-amber-50 text-amber-700',
  high: 'bg-red-50 text-red-700',
};

interface RecoveryPlanProps {
  actions: RecoveryActionData[];
  expiresAt: string;
  runCode: string;
}

export function RecoveryPlan({ actions, expiresAt, runCode }: RecoveryPlanProps) {
  return (
    <section className="template-card reveal-on-scroll rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="recovery-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Allowlisted plan</p>
          <h2 id="recovery-heading" className="mt-1 text-lg font-semibold text-slate-950">Bounded recovery actions</h2>
        </div>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">Approval required</span>
      </div>

      <ol className="mt-5 space-y-3">
        {actions.map((action) => (
          <li className="flex gap-3 rounded-xl border border-slate-100 p-4" key={action.order}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
              {action.order}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-slate-900">{action.title}</h3>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${riskStyles[action.risk]}`}>
                  {action.risk} risk
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">{action.description}</p>
              <p className="mt-2 text-xs font-medium text-slate-500">Reversibility: {action.reversibility}</p>
            </div>
            <span className="text-xs font-semibold capitalize text-slate-500">{action.status}</span>
          </li>
        ))}
      </ol>

      <div className="mt-5 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
        <p><span className="font-semibold text-slate-900">Approval command:</span> <code className="font-mono text-slate-700">APPROVE {runCode}</code></p>
        <p><span className="font-semibold text-slate-900">Expires:</span> <span className="text-slate-700">{expiresAt}</span></p>
      </div>
    </section>
  );
}
