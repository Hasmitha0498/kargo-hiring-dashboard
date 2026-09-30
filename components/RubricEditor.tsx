'use client';
import { formatDateTime } from '@/lib/format';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ROLE_LABEL, type CalibrationPattern, type Criterion, type Role } from '@/lib/domain';
import { checkRubric } from '@/lib/rubric/validate';
import { Badge } from './badges';

interface Props {
  rubric: { id: string; name: string; version: number; status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'; created_at: string; approved_at: string | null; calibration_model: string | null; patterns: CalibrationPattern[] };
  criteria: Criterion[];
  activeVersion: number | null;
}

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }).catch(() => null);
  if (!res) return { ok: false, error: 'Network error.' };
  const json = (await res.json().catch(() => ({}))) as { error?: string; rubricId?: string };
  return { ok: res.ok, error: json.error, rubricId: json.rubricId };
}

export function RubricView({ rubric, criteria, activeVersion }: Props) {
  const router = useRouter();
  const editable = rubric.status === 'DRAFT';
  const [role, setRole] = useState<Role>('PM');
  const [rows, setRows] = useState(criteria);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [busy, setBusy] = useState(false);

  const check = checkRubric(rows);
  const shown = rows.filter((c) => c.role === role).sort((a, b) => a.sort_order - b.sort_order);
  const original = (id: string) => criteria.find((c) => c.id === id)!;

  function edit(id: string, patch: Partial<Criterion>) {
    setRows((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  async function save(c: Criterion) {
    const o = original(c.id);
    const patch: Record<string, unknown> = {};
    if (c.description !== o.description) patch.description = c.description;
    if (c.strong_evidence_description !== o.strong_evidence_description) patch.strong_evidence_description = c.strong_evidence_description;
    if (c.weak_evidence_description !== o.weak_evidence_description) patch.weak_evidence_description = c.weak_evidence_description;
    if (c.observable_evidence !== o.observable_evidence) patch.observable_evidence = c.observable_evidence;
    if (c.scoring_guidance !== o.scoring_guidance) patch.scoring_guidance = c.scoring_guidance;
    if (Number(c.weight) !== Number(o.weight)) patch.weight = Number(c.weight);
    if (!Object.keys(patch).length) return;
    setSavingId(c.id);
    const r = await send(`/api/rubrics/criteria/${c.id}`, 'PATCH', patch);
    setSavingId(null);
    if (!r.ok) setError(r.error ?? 'Save failed.');
    else {
      setError(null);
      router.refresh();
    }
  }

  const unsaved = rows.some((c) => {
    const o = original(c.id);
    return (
      c.description !== o.description ||
      c.strong_evidence_description !== o.strong_evidence_description ||
      c.weak_evidence_description !== o.weak_evidence_description ||
      c.observable_evidence !== o.observable_evidence ||
      c.scoring_guidance !== o.scoring_guidance ||
      Number(c.weight) !== Number(o.weight)
    );
  });

  async function approve() {
    setBusy(true);
    const r = await send(`/api/rubrics/${rubric.id}/approve`, 'POST', { confirmReplace: true });
    setBusy(false);
    setConfirmApprove(false);
    if (!r.ok) setError(r.error ?? 'Approval failed.');
    else router.refresh();
  }

  async function discard() {
    if (!window.confirm(`Discard draft v${rubric.version}? This cannot be undone.`)) return;
    const r = await send(`/api/rubrics/${rubric.id}`, 'DELETE');
    if (!r.ok) setError(r.error ?? 'Could not discard.');
    else router.refresh();
  }

  async function newVersion() {
    const r = await send(`/api/rubrics/${rubric.id}/clone`, 'POST');
    if (!r.ok) setError(r.error ?? 'Could not create a new version.');
    else router.refresh();
  }

  return (
    <section className={`card overflow-hidden ${editable ? 'border-amber-300' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-slate-50 px-4 py-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-navy-900">
              Version {rubric.version} · {rubric.name}
            </h2>
            <Badge color={rubric.status === 'ACTIVE' ? 'green' : rubric.status === 'DRAFT' ? 'amber' : 'slate'}>{rubric.status}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Created {formatDateTime(rubric.created_at)}
            {rubric.approved_at && <> · approved {formatDateTime(rubric.approved_at)}</>}
            {rubric.calibration_model && <> · calibrated with {rubric.calibration_model}</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {editable ? (
            <>
              <button className="btn-secondary text-xs" onClick={discard}>
                Discard draft
              </button>
              <button className="btn-primary text-xs" disabled={!check.ok || unsaved} onClick={() => setConfirmApprove(true)} title={unsaved ? 'Save your edits first' : undefined}>
                Approve rubric…
              </button>
            </>
          ) : (
            <button className="btn-secondary text-xs" onClick={newVersion}>
              Create new version from this
            </button>
          )}
        </div>
      </div>

      {editable && (
        <div className={`border-b px-4 py-2 text-xs ${check.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
          Draft: not used for scoring until approved. Weights: PM {check.totals.PM}% · SPM {check.totals.SPM}%{' '}
          {check.ok ? '✓ both total 100%' : `· ${check.problems.join(' ')}`}
          {unsaved && ' · you have unsaved edits'}
        </div>
      )}

      {rubric.patterns.length > 0 && (
        <details className="border-b border-line px-4 py-3 text-sm">
          <summary className="cursor-pointer font-semibold text-navy-900">Calibration patterns ({rubric.patterns.length}) found in past hires</summary>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            {rubric.patterns.map((p, i) => (
              <div key={i} className="rounded-md border border-line p-3">
                <div className="font-semibold text-slate-800">{p.name}</div>
                <p className="mt-1 text-slate-600">{p.description}</p>
                <p className="mt-2 text-xs text-slate-500">
                  <span className="font-semibold">Higher performers:</span> {p.evidence_in_higher_performers}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  <span className="font-semibold">Others:</span> {p.contrast_with_others}
                </p>
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="flex gap-1 border-b border-line px-4 pt-2">
        {(['PM', 'SPM'] as Role[]).map((r) => (
          <button key={r} onClick={() => setRole(r)} className={`-mb-px border-b-2 px-3 pb-2 text-sm font-medium ${r === role ? 'border-navy-900 text-navy-900' : 'border-transparent text-slate-500'}`}>
            {ROLE_LABEL[r]} <span className="text-xs text-slate-400">{check.totals[r]}%</span>
          </button>
        ))}
      </div>

      <div className="divide-y divide-line">
        {shown.map((c) => (
          <div key={c.id} className="grid gap-3 p-4 md:grid-cols-[200px_1fr]">
            <div>
              <div className="text-sm font-semibold text-navy-900">{c.criterion_name}</div>
              <div className="font-mono text-[11px] text-slate-400">{c.criterion_key}</div>
              {editable ? (
                <label className="mt-2 flex items-center gap-1 text-sm">
                  <input type="number" min={1} max={100} step={1} className="input w-20 py-1" value={c.weight} onChange={(e) => edit(c.id, { weight: Number(e.target.value) })} onBlur={() => save(c)} />%
                </label>
              ) : (
                <div className="mt-2 text-2xl font-semibold tabular-nums text-navy-900">{Number(c.weight)}%</div>
              )}
              {savingId === c.id && <div className="text-xs text-slate-400">Saving…</div>}
            </div>
            <div className="space-y-2 text-sm">
              <Field label="Description" value={c.description} editable={editable} onChange={(v) => edit(c.id, { description: v })} onBlur={() => save(c)} />
              <Field label="Strong evidence looks like" value={c.strong_evidence_description} editable={editable} onChange={(v) => edit(c.id, { strong_evidence_description: v })} onBlur={() => save(c)} />
              <Field label="Weak evidence looks like" value={c.weak_evidence_description} editable={editable} onChange={(v) => edit(c.id, { weak_evidence_description: v })} onBlur={() => save(c)} />
              {editable ? (
                <>
                  <Field label="What counts as evidence" value={c.observable_evidence} editable onChange={(v) => edit(c.id, { observable_evidence: v })} onBlur={() => save(c)} />
                  <Field label="Scoring guidance (0-4)" value={c.scoring_guidance} editable onChange={(v) => edit(c.id, { scoring_guidance: v })} onBlur={() => save(c)} />
                  <p className="text-xs text-slate-500">
                    <span className="font-semibold">Calibration rationale:</span> {c.calibration_rationale}
                  </p>
                </>
              ) : (
                <details className="text-xs text-slate-600">
                  <summary className="cursor-pointer text-slate-500">What counts as evidence · scoring guidance · calibration rationale</summary>
                  <p className="mt-1">
                    <span className="font-semibold">Observable evidence:</span> {c.observable_evidence}
                  </p>
                  <p className="mt-1">
                    <span className="font-semibold">Scoring guidance:</span> {c.scoring_guidance}
                  </p>
                  <p className="mt-1">
                    <span className="font-semibold">Calibration rationale:</span> {c.calibration_rationale}
                  </p>
                </details>
              )}
            </div>
          </div>
        ))}
      </div>
      {error && <p className="border-t border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      {confirmApprove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-navy-900">Approve rubric v{rubric.version}?</h3>
            <p className="mt-2 text-sm text-slate-600">
              {activeVersion !== null ? (
                <>
                  This <span className="font-semibold">replaces active version {activeVersion}</span> for all new scoring. Candidates already scored keep their v{activeVersion} scores until you re-evaluate them one by one.
                </>
              ) : (
                <>This becomes the active rubric. New candidates will be scored against it.</>
              )}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setConfirmApprove(false)} disabled={busy}>
                Cancel
              </button>
              <button className="btn-primary" onClick={approve} disabled={busy}>
                {busy ? 'Approving…' : activeVersion !== null ? `Replace v${activeVersion}` : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Field({ label, value, editable, onChange, onBlur }: { label: string; value: string; editable: boolean; onChange: (v: string) => void; onBlur: () => void }) {
  return (
    <div>
      <div className="section-title">{label}</div>
      {editable ? <textarea className="input mt-0.5 min-h-16" value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} /> : <p className="mt-0.5 text-slate-700">{value}</p>}
    </div>
  );
}
