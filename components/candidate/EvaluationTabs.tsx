'use client';
import { useState } from 'react';
import { ROLE_LABEL, type Role } from '@/lib/domain';
import type { ScoreRow } from '@/lib/db/repo';
import { formatDateTime } from '@/lib/format';
import { Badge } from '../badges';

interface RoleData {
  role: Role;
  total: number | null;
  rubricVersion: number | null;
  model: string | null;
  evaluatedAt: string | null;
  rows: ScoreRow[];
}

const fmt = (n: number) => (Math.round(n * 100) / 100).toString();

function Dots({ score }: { score: number }) {
  return (
    <span className="inline-flex gap-1" aria-hidden>
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={`h-2 w-5 rounded-sm ${i <= score ? (score >= 3 ? 'bg-emerald-500' : 'bg-amber-500') : 'bg-slate-200'}`} />
      ))}
    </span>
  );
}

function Cards({ data }: { data: RoleData }) {
  if (!data.rows.length) return <p className="p-5 text-sm text-slate-500">Not evaluated yet.</p>;
  return (
    <div className="space-y-3 p-4">
      {data.rows.map((r) => (
        <article key={r.id} className="rounded-lg border border-line p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h3 className="font-semibold text-navy-900">{r.criterion_name}</h3>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="flex items-center gap-2">
                <Dots score={r.raw_score} />
                <span className="font-semibold tabular-nums text-navy-900">{r.raw_score} / 4</span>
              </span>
              <span className="text-slate-500">Weight {fmt(r.criterion_weight)}%</span>
              <span className="text-slate-500">
                Contribution <span className="font-semibold tabular-nums text-slate-800">{fmt(r.weighted_score)}</span>
              </span>
            </div>
          </div>
          <div className="mt-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="section-title">Evidence from the CV</span>
              {r.evidence_status === 'NEGATIVE' && <Badge color="red">Contrary evidence</Badge>}
              {r.evidence_status === 'PRESENT' && !r.evidence_verified && (
                <Badge color="amber" title="These words could not be matched exactly in the CV text. Check the CV before relying on it.">
                  Check wording against CV
                </Badge>
              )}
            </div>
            {r.evidence_status === 'ABSENT' ? (
              <p className="mt-1 text-[15px] italic text-slate-500">No clear evidence found in CV.</p>
            ) : (
              <blockquote className="mt-1 border-l-2 border-slate-300 pl-3 text-[15px] leading-relaxed text-slate-800">{r.evidence}</blockquote>
            )}
          </div>
          <div className="mt-3">
            <span className="section-title">Why this score</span>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{r.reasoning}</p>
          </div>
        </article>
      ))}
      <p className="px-1 text-xs text-slate-400">
        Contribution = (score ÷ 4) × weight, calculated by the application, not the AI. Scored against rubric v{data.rubricVersion}
        {data.model && <> with {data.model}</>}
        {data.evaluatedAt && <> on {formatDateTime(data.evaluatedAt)}</>}.
      </p>
    </div>
  );
}

export function EvaluationTabs({ applied, other }: { applied: RoleData; other: RoleData }) {
  const [showOther, setShowOther] = useState(false);
  const data = showOther ? other : applied;
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
        <div>
          <h2 className="text-base font-semibold text-navy-900">Why this candidate ranked here</h2>
          <p className="text-xs text-slate-500">{showOther ? `Cross-role view: evaluated against the ${ROLE_LABEL[other.role]} rubric (information only).` : `Evaluated against the ${ROLE_LABEL[applied.role]} rubric, the role they applied for.`}</p>
        </div>
        <div className="flex rounded-md border border-line p-0.5 text-xs">
          {[applied, other].map((d, i) => (
            <button
              key={d.role}
              onClick={() => setShowOther(i === 1)}
              className={`rounded px-2.5 py-1 font-medium ${showOther === (i === 1) ? 'bg-navy-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              {d.role} {d.total !== null ? (Math.round(d.total * 10) / 10).toFixed(1) : '—'}
              {i === 0 ? ' (applied)' : ''}
            </button>
          ))}
        </div>
      </div>
      <Cards data={data} />
    </section>
  );
}
