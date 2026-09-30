import Link from 'next/link';
import { RubricTabs } from '@/components/RubricTabs';
import * as repo from '@/lib/db/repo';
import { SCORE_SCALE } from '@/lib/domain';
import { formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function RubricPage() {
  const [rubrics, hires] = await Promise.all([repo.listRubrics(), repo.listCalibrationHires()]);
  const active = rubrics.find((r) => r.status === 'ACTIVE') ?? null;
  const draft = rubrics.find((r) => r.status === 'DRAFT') ?? null;
  const count = (o: string) => hires.filter((h) => h.performance_outcome === o).length;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">How Candidates Are Evaluated</h1>
        <p className="text-sm text-slate-500">Candidates are scored against evidence patterns derived from successful historical hires.</p>
      </div>

      {draft && (
        <div className="card border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          A new rubric version (v{draft.version}) is waiting for approval. Candidates are still scored with {active ? `v${active.version}` : 'no rubric'} until it is approved.{' '}
          <Link href="/calibration" className="font-semibold underline">
            Review it
          </Link>
        </div>
      )}

      {!active ? (
        <div className="card p-10 text-center">
          <p className="font-medium text-navy-900">The rubric hasn&apos;t been configured.</p>
          <p className="mt-1 text-sm text-slate-500">Generate it once from past hires and their performance outcomes, then approve it. After that, every new CV is scored against it.</p>
          <Link href="/calibration" className="btn-primary mt-4 px-4 py-2">
            Set up the rubric
          </Link>
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-500">
            Current rubric: version {active.version}, approved {formatDate(active.approved_at)}. Every candidate is scored against both roles; they are ranked in the role they applied for.
          </p>
          <RubricTabs criteria={active.criteria} />

          <section className="card p-5">
            <h2 className="text-base font-semibold text-navy-900">How each criterion is scored</h2>
            <p className="mt-1 text-sm text-slate-600">The AI reads the CV and gives each criterion a score from 0 to 4, quoting the evidence it used. The application then calculates the total: contribution = (score ÷ 4) × weight, and the contributions add up to a score out of 100.</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-5">
              {SCORE_SCALE.map((s) => (
                <li key={s.score} className="rounded-md bg-slate-50 p-2 text-xs text-slate-600">
                  <span className="block text-lg font-semibold text-navy-900">{s.score}</span>
                  {s.label}
                </li>
              ))}
            </ul>
          </section>

          <section className="card p-5">
            <h2 className="text-base font-semibold text-navy-900">How this rubric was created</h2>
            <ol className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              {['Historical hires', 'Performance outcomes', 'Success patterns', 'PM / SPM rubric'].map((s, i, all) => (
                <li key={s} className="flex items-center gap-2">
                  <span className="rounded-md border border-line bg-slate-50 px-3 py-1.5 font-medium text-slate-700">{s}</span>
                  {i < all.length - 1 && <span className="text-slate-400">→</span>}
                </li>
              ))}
            </ol>
            <p className="mt-3 text-sm text-slate-600">
              {hires.length > 0 && (
                <>
                  {hires.length} past hires were compared ({count('EXCEEDS')} exceeded expectations, {count('MEETS')} met, {count('BELOW')} below).{' '}
                </>
              )}
              What distinguished the strongest hires, beyond what the job descriptions ask for, became the criteria above. Past hires are used only to build the rubric: new candidates are never compared with them.
            </p>
            {active.calibration_patterns.length > 0 && (
              <ul className="mt-3 space-y-2">
                {active.calibration_patterns.map((p) => (
                  <li key={p.name} className="rounded-md bg-slate-50 p-3 text-sm">
                    <span className="font-semibold text-slate-800">{p.name}.</span> <span className="text-slate-600">{p.description}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <p className="text-center text-xs text-slate-400">
        <Link href="/calibration" className="underline hover:text-slate-600">
          Rubric setup &amp; versions (admin)
        </Link>
      </p>
    </div>
  );
}
