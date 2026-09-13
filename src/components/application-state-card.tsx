import type { ApplicationCardData, ApplicationStatus } from './demo-types';

const statusStyles: Record<ApplicationStatus, string> = {
  healthy: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  mismatch: 'border-red-200 bg-red-50 text-red-800',
  waiting: 'border-amber-200 bg-amber-50 text-amber-800',
  unavailable: 'border-slate-200 bg-slate-50 text-slate-700',
};

const statusLabels: Record<ApplicationStatus, string> = {
  healthy: 'Verified',
  mismatch: 'Mismatch found',
  waiting: 'Waiting',
  unavailable: 'Unavailable',
};

interface ApplicationStateCardProps {
  application: ApplicationCardData;
}

export function ApplicationStateCard({ application }: ApplicationStateCardProps) {
  return (
    <article className="template-card reveal-on-scroll rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Application
          </p>
          <h3 className="mt-1 text-lg font-semibold text-slate-950">{application.name}</h3>
          <p className="mt-1 text-sm text-slate-600">{application.description}</p>
        </div>
        <span
          className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles[application.status]}`}
        >
          {statusLabels[application.status]}
        </span>
      </div>

      <dl className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-100">
        {application.fields.map((field) => (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 p-3" key={field.label}>
            <div>
              <dt className="text-xs font-medium text-slate-500">{field.label}</dt>
              <dd className="mt-1 text-sm text-slate-900">Actual: {field.actual}</dd>
            </div>
            <span className={field.matches ? 'text-emerald-600' : 'text-red-600'} aria-label={field.matches ? 'Matches expected value' : 'Does not match expected value'}>
              {field.matches ? '✓' : '!'}</span>
          </div>
        ))}
      </dl>

      <p className="mt-4 text-xs text-slate-500">Last read: {application.lastReadAt}</p>
    </article>
  );
}
