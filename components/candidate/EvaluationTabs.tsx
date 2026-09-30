'use client';
import { formatDateTime } from '@/lib/format';
import { useState } from 'react';
import { ROLE_LABEL, type Role } from '@/lib/domain';
import type { ScoreRow } from '@/lib/db/repo';
import { Badge } from '../badges';

interface RoleData {
  role: Role;
  total: number | null;
  rubricVersion: number | null;
  model: string | null;
  evaluatedAt: string | null;
  rows: ScoreRow[];
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

function Dots({ score }: { score: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${score} of 4`}>
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={`h-2.5 w-2.5 rounded-sm ${i <= score ? (score >= 3 ? 'bg-emerald-500' : 'bg-amber-500') : 'bg-slate-200'}`} />
      ))}
    </span>
  );
}

function Table({ data }: { data: RoleData }) {
  if (!data.rows.length) return <p className="p-4 text-sm text-slate-500">Not evaluated yet.</p>;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-2 text-xs text-slate-500">
        <span>
          Total <span className="font-semibold text-navy-900">{data.total !== null ? fmt(data.total) : '—'}</span> / 100 = sum of (raw ÷ 4 × weight)
        </span>
        <span>Rubric v{data.rubricVersion}</span>
        {data.model && <span>Model {data.model}</span>}
        {data.evaluatedAt && <span>{formatDateTime(data.evaluatedAt)}</span>}
      </div>
      <div className="divide-y divide-line">
        {data.rows.map((r) => (
          <div key={r.id} className="grid gap-3 px-4 py-3 md:grid-cols-[220px_1fr]">
            <div>
              <div className="text-sm font-semibold text-navy-900">{r.criterion_name}</div>
              <div className="mt-1 flex items-center gap-2">
                <Dots score={r.raw_score} />
                <span className="text-xs tabular-nums text-slate-600">{r.raw_score}/4</span>
              </div>
              <div className="mt-1 text-xs tabular-nums text-slate-500">
                weight {fmt(r.criterion_weight)}% → <span className="font-semibold text-slate-800">{fmt(r.weighted_score)}</span> pts
              </div>
            </div>
            <div className="space-y-1.5 text-sm">
              <div>
                <span className="section-title mr-2">Evidence</span>
                {r.evidence_status === 'ABSENT' && <Badge color="slate">No evidence in CV</Badge>}
                {r.evidence_status === 'NEGATIVE' && <Badge color="red">Contrary evidence</Badge>}
                {r.evidence_status !== 'ABSENT' && !r.evidence_verified && (
                  <Badge color="amber" title="The quoted text could not be matched word-for-word in the CV. Check the CV before relying on it.">
                    Not found verbatim
                  </Badge>
                )}
                <p className={`mt-0.5 ${r.evidence_status === 'ABSENT' ? 'text-slate-500 italic' : 'text-slate-800'}`}>{r.evidence}</p>
              </div>
              <div>
                <span className="section-title">Reasoning</span>
                <p className="mt-0.5 text-slate-600">{r.reasoning}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EvaluationTabs({ applied, other }: { applied: RoleData; other: RoleData }) {
  const [showOther, setShowOther] = useState(false);
  const data = showOther ? other : applied;
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-slate-50 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-navy-900">
          {showOther ? `Cross-role evaluation: ${ROLE_LABEL[other.role]}` : `Applied role evaluation: ${ROLE_LABEL[applied.role]}`}
        </h2>
        <button className="btn-secondary text-xs" onClick={() => setShowOther((v) => !v)}>
          {showOther ? `Back to ${applied.role} (applied role)` : `View other role score (${other.role} ${other.total !== null ? fmt(other.total) : '—'})`}
        </button>
      </div>
      {showOther && <p className="border-b border-line bg-sky-50 px-4 py-1.5 text-xs text-sky-900">Information only. The candidate stays in the {applied.role} list; nothing moves them between roles automatically.</p>}
      <Table data={data} />
    </section>
  );
}
