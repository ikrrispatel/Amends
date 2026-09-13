import type { AuditEventData } from './demo-types';

const toneStyles: Record<AuditEventData['tone'], string> = {
  neutral: 'bg-slate-400',
  warning: 'bg-amber-500',
  success: 'bg-emerald-500',
  danger: 'bg-red-500',
};

interface AuditTimelineProps {
  events: AuditEventData[];
}

export function AuditTimeline({ events }: AuditTimelineProps) {
  return (
    <section className="template-card reveal-on-scroll rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="timeline-heading">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Append-only record</p>
      <h2 id="timeline-heading" className="mt-1 text-lg font-semibold text-slate-950">Run timeline</h2>
      <ol className="mt-5 space-y-5">
        {events.map((event, index) => (
          <li className="relative flex gap-3" key={`${event.timestamp}-${event.title}`}>
            {index < events.length - 1 ? <span className="absolute left-[5px] top-3 h-full w-px bg-slate-200" aria-hidden="true" /> : null}
            <span className={`relative mt-1 h-3 w-3 shrink-0 rounded-full ${toneStyles[event.tone]}`} aria-hidden="true" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <p className="text-sm font-semibold text-slate-900">{event.title}</p>
                <time className="text-xs text-slate-500">{event.timestamp}</time>
              </div>
              <p className="mt-1 text-sm text-slate-600">{event.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
