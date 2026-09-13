import type { VerificationCheckData, VerificationStatus } from './demo-types';

const statusStyles: Record<VerificationStatus, string> = {
  pass: 'text-emerald-700',
  fail: 'text-red-700',
  pending: 'text-amber-700',
};

const statusIcons: Record<VerificationStatus, string> = {
  pass: '✓',
  fail: '!',
  pending: '…',
};

interface VerificationChecksProps {
  checks: VerificationCheckData[];
}

export function VerificationChecks({ checks }: VerificationChecksProps) {
  const passed = checks.filter((check) => check.status === 'pass').length;
  const complete = checks.length > 0 && passed === checks.length;

  return (
    <section className="template-card reveal-on-scroll rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="verification-heading">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Fresh reread</p>
          <h2 id="verification-heading" className="mt-1 text-lg font-semibold text-slate-950">Final verification</h2>
        </div>
        <span className={`text-sm font-bold ${complete ? 'text-emerald-700' : 'text-slate-600'}`}>
          {passed}/{checks.length}
        </span>
      </div>
      <ul className="mt-5 space-y-3">
        {checks.map((check) => (
          <li className="flex items-start gap-3" key={check.label}>
            <span className={`mt-0.5 font-bold ${statusStyles[check.status]}`} aria-label={check.status}>
              {statusIcons[check.status]}
            </span>
            <div>
              <p className="text-sm font-medium text-slate-900">{check.label}</p>
              <p className="text-xs text-slate-500">{check.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className={`mt-5 rounded-xl px-4 py-3 text-sm font-semibold ${complete ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-50 text-slate-700'}`}>
        {complete ? 'VERIFIED — all deterministic checks pass' : 'Verification incomplete — recovery is not yet verified'}
      </p>
    </section>
  );
}
