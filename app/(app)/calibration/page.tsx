import { formatDate } from '@/lib/format';
import { Badge } from '@/components/badges';
import { AddHireForm, GenerateRubric, JdEditor, RemoveHire } from '@/components/CalibrationPanel';
import * as repo from '@/lib/db/repo';
import { OUTCOME_LABEL } from '@/lib/domain';

export const dynamic = 'force-dynamic';

export default async function CalibrationPage() {
  const [hires, profiles, rubrics, sources] = await Promise.all([repo.listCalibrationHires(), repo.getRoleProfiles(), repo.listRubrics(), repo.rubricSources()]);
  const active = rubrics.find((r) => r.status === 'ACTIVE');
  const versionsFor = (hireId: string) =>
    sources
      .filter((s) => s.calibration_hire_id === hireId)
      .map((s) => rubrics.find((r) => r.id === s.rubric_id)?.version)
      .filter((v): v is number => v !== undefined)
      .sort((a, b) => a - b);
  const pm = profiles.find((p) => p.role === 'PM');
  const spm = profiles.find((p) => p.role === 'SPM');
  const ready = Boolean(pm && spm) && hires.length >= 3 && hires.some((h) => h.performance_outcome === 'EXCEEDS') && hires.some((h) => h.performance_outcome !== 'EXCEEDS');

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-navy-900">Calibration</h1>
          <Badge color="navy">Admin only</Badge>
        </div>
        <p className="max-w-3xl text-sm text-slate-500">
          Past hires and their performance outcomes are used once, on request, to find what distinguished the strongest hires and turn it into PM and SPM rubrics. They are never shown to, compared with, or sent alongside new candidates. New uploads and hiring decisions never change the rubric automatically.
        </p>
      </div>

      <section className="card flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="text-sm text-slate-600">
          {active ? (
            <>
              Active rubric: <span className="font-semibold text-navy-900">v{active.version}</span> (approved {active.approved_at && formatDate(active.approved_at)})
            </>
          ) : (
            'No active rubric yet.'
          )}
          {!ready && <div className="mt-1 text-xs text-amber-700">Needs both JDs and at least 3 past hires including Exceeds and Meets/Below outcomes.</div>}
        </div>
        <GenerateRubric hasActive={Boolean(active)} ready={ready} hireCount={hires.length} />
      </section>

      <section className="card overflow-x-auto">
        <div className="border-b border-line px-4 py-2.5 text-sm font-semibold text-navy-900">Historical hires ({hires.length})</div>
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Private label</th>
              <th className="px-3 py-2">Role hired into</th>
              <th className="px-3 py-2">Performance outcome</th>
              <th className="px-3 py-2">Processed</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {hires.map((h) => {
              const versions = versionsFor(h.id);
              return (
                <tr key={h.id} className="border-t border-line">
                  <td className="px-3 py-2 text-slate-800">{h.private_label}</td>
                  <td className="px-3 py-2 text-slate-600">{h.role_hired}</td>
                  <td className="px-3 py-2">
                    <Badge color={h.performance_outcome === 'EXCEEDS' ? 'green' : h.performance_outcome === 'MEETS' ? 'slate' : 'red'}>{OUTCOME_LABEL[h.performance_outcome]}</Badge>
                  </td>
                  <td className="px-3 py-2 text-xs">{versions.length ? <span className="text-emerald-700">Processed · used in v{versions.join(', v')}</span> : <span className="text-slate-400">Not processed</span>}</td>
                  <td className="px-3 py-2 text-right">
                    <RemoveHire id={h.id} />
                  </td>
                </tr>
              );
            })}
            {hires.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-slate-500">
                  No past hires yet. Add them below or run <code>npm run seed:calibration</code>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <AddHireForm />

      <div className="grid gap-4 lg:grid-cols-2">
        <JdEditor role="PM" title={pm?.title ?? null} jd={pm?.jd_text ?? null} />
        <JdEditor role="SPM" title={spm?.title ?? null} jd={spm?.jd_text ?? null} />
      </div>
    </div>
  );
}
