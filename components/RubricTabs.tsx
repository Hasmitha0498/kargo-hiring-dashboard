'use client';
import { useState } from 'react';
import { ROLE_LABEL, type Criterion, type Role } from '@/lib/domain';

/** Read-only, plain-language view of the active rubric. */
export function RubricTabs({ criteria }: { criteria: Criterion[] }) {
  const [role, setRole] = useState<Role>('PM');
  const shown = criteria.filter((c) => c.role === role).sort((a, b) => b.weight - a.weight || a.sort_order - b.sort_order);
  return (
    <section className="card overflow-hidden">
      <div className="flex gap-1 border-b border-line px-4 pt-3">
        {(['PM', 'SPM'] as Role[]).map((r) => (
          <button key={r} onClick={() => setRole(r)} className={`-mb-px border-b-2 px-3 pb-2.5 text-sm font-medium ${r === role ? 'border-navy-900 text-navy-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {ROLE_LABEL[r]}
          </button>
        ))}
      </div>
      <div className="divide-y divide-line">
        {shown.map((c) => (
          <article key={c.id} className="grid gap-4 p-5 sm:grid-cols-[140px_1fr]">
            <div>
              <div className="text-3xl font-semibold tabular-nums text-navy-900">{Number(c.weight)}%</div>
              <div className="text-xs text-slate-500">of the {role} score</div>
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-semibold text-navy-900">{c.criterion_name}</h3>
              <div>
                <div className="section-title">What it measures</div>
                <p className="mt-0.5 text-[15px] text-slate-700">{c.description}</p>
              </div>
              <div>
                <div className="section-title">What strong evidence looks like</div>
                <p className="mt-0.5 text-[15px] text-slate-700">{c.strong_evidence_description}</p>
              </div>
              <details className="text-sm text-slate-600">
                <summary className="cursor-pointer text-xs text-slate-500">More detail</summary>
                <p className="mt-1">
                  <span className="font-medium">Counts as evidence:</span> {c.observable_evidence}
                </p>
                <p className="mt-1">
                  <span className="font-medium">Weak evidence looks like:</span> {c.weak_evidence_description}
                </p>
                <p className="mt-1">
                  <span className="font-medium">How the 0–4 score is given:</span> {c.scoring_guidance}
                </p>
              </details>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
