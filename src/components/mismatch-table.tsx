import type { MismatchData } from './demo-types';

interface MismatchTableProps {
  mismatches: MismatchData[];
  exposureCents: number;
}

function formatDollars(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

export function MismatchTable({ mismatches, exposureCents }: MismatchTableProps) {
  return (
    <section className="template-card reveal-on-scroll rounded-2xl border border-red-200 bg-white shadow-sm" aria-labelledby="mismatch-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-red-100 bg-red-50 px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-700">Business impact</p>
          <h2 id="mismatch-heading" className="mt-1 text-lg font-semibold text-slate-950">
            {mismatches.length} mismatches detected
          </h2>
        </div>
        <p className="text-xl font-bold text-red-700">{formatDollars(exposureCents)}/month at risk</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Application</th>
              <th className="px-5 py-3 font-semibold">Field</th>
              <th className="px-5 py-3 font-semibold">Expected</th>
              <th className="px-5 py-3 font-semibold">Actual</th>
              <th className="px-5 py-3 font-semibold">Impact</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {mismatches.map((mismatch) => (
              <tr key={`${mismatch.application}-${mismatch.field}`}>
                <td className="px-5 py-4 font-medium text-slate-900">{mismatch.application}</td>
                <td className="px-5 py-4 text-slate-700">{mismatch.field}</td>
                <td className="px-5 py-4 text-emerald-700">{mismatch.expected}</td>
                <td className="px-5 py-4 font-medium text-red-700">{mismatch.actual}</td>
                <td className="px-5 py-4 text-slate-700">{mismatch.impact}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
