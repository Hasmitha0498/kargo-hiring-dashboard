import Link from 'next/link';
import { RubricView } from '@/components/RubricEditor';
import { listRubrics } from '@/lib/db/repo';
import { SCORE_SCALE } from '@/lib/domain';

export const dynamic = 'force-dynamic';

export default async function RubricPage() {
  const rubrics = await listRubrics();
  const active = rubrics.find((r) => r.status === 'ACTIVE') ?? null;
  const drafts = rubrics.filter((r) => r.status === 'DRAFT');
  const archived = rubrics.filter((r) => r.status === 'ARCHIVED');
  const view = (r: (typeof rubrics)[number]) => (
    <RubricView
      key={r.id}
      rubric={{ id: r.id, name: r.name, version: r.version, status: r.status, created_at: r.created_at, approved_at: r.approved_at, calibration_model: r.calibration_model, patterns: r.calibration_patterns }}
      criteria={r.criteria}
      activeVersion={active?.version ?? null}
    />
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-navy-900">Hiring Rubric</h1>
        <p className="text-sm text-slate-500">
          What the AI evaluates. Criteria and weights live in the database; the scoring prompt is built from the ACTIVE version on every evaluation. Weights are applied by the application, not by the AI.
        </p>
      </div>

      <section className="card p-4 text-sm">
        <h2 className="section-title mb-2">Scoring scale (every criterion)</h2>
        <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-5">
          {SCORE_SCALE.map((s) => (
            <li key={s.score} className="rounded-md bg-slate-50 p-2 text-xs text-slate-600">
              <span className="mr-1 font-semibold text-navy-900">{s.score}</span>
              {s.label}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-500">Weighted score = (raw ÷ 4) × weight. Role score = sum of weighted scores (max 100).</p>
      </section>

      {rubrics.length === 0 && (
        <div className="card p-8 text-center text-sm text-slate-500">
          No rubric yet. Generate one from past hires on the{' '}
          <Link href="/calibration" className="font-medium text-navy-900 underline">
            Calibration
          </Link>{' '}
          page.
        </div>
      )}

      {drafts.length > 0 && (
        <div className="space-y-3">
          <h2 className="section-title">Awaiting review</h2>
          {drafts.map(view)}
        </div>
      )}
      {active && (
        <div className="space-y-3">
          <h2 className="section-title">Active</h2>
          {view(active)}
        </div>
      )}
      {archived.length > 0 && (
        <details className="space-y-3">
          <summary className="section-title cursor-pointer">Previous versions ({archived.length})</summary>
          <div className="mt-3 space-y-3">{archived.map(view)}</div>
        </details>
      )}
    </div>
  );
}
