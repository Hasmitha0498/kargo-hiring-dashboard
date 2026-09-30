'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { OUTCOME_LABEL, OUTCOMES, ROLE_LABEL, type Outcome, type Role } from '@/lib/domain';
import { Badge } from './badges';

async function send(url: string, init: RequestInit) {
  const res = await fetch(url, init).catch(() => null);
  if (!res) return { ok: false, error: 'Network error.' };
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  return { ok: res.ok, error: json.error };
}

export function JdEditor({ role, title, jd }: { role: Role; title: string | null; jd: string | null }) {
  const router = useRouter();
  const [t, setT] = useState(title ?? ROLE_LABEL[role]);
  const [text, setText] = useState(jd ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  async function save() {
    const r = await send('/api/calibration/roles', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role, title: t, jd_text: text }) });
    setMsg(r.ok ? 'Saved.' : r.error ?? 'Save failed.');
    if (r.ok) router.refresh();
  }
  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-navy-900">{role} job description</h3>
        {jd ? <Badge color="green">Stored</Badge> : <Badge color="amber">Missing</Badge>}
      </div>
      <input className="input mb-2" value={t} onChange={(e) => setT(e.target.value)} />
      <textarea className="input h-40 text-xs" placeholder="Paste the full job description" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="mt-2 flex items-center gap-2">
        <button className="btn-secondary text-xs" onClick={save} disabled={text.trim().length < 100}>
          Save JD
        </button>
        {msg && <span className="text-xs text-slate-500">{msg}</span>}
      </div>
    </div>
  );
}

export function AddHireForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState('');
  const [roleHired, setRoleHired] = useState('');
  const [outcome, setOutcome] = useState<Outcome | ''>('');
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function add() {
    if (!file || !outcome) return;
    setBusy(true);
    const form = new FormData();
    form.set('file', file);
    form.set('private_label', label);
    form.set('role_hired', roleHired);
    form.set('performance_outcome', outcome);
    form.set('notes', notes);
    const r = await send('/api/calibration/hires', { method: 'POST', body: form });
    setBusy(false);
    setMsg(r.ok ? 'Added.' : r.error ?? 'Failed.');
    if (r.ok) {
      setFile(null);
      setLabel('');
      setRoleHired('');
      setOutcome('');
      setNotes('');
      router.refresh();
    }
  }
  return (
    <div className="card space-y-2 p-4">
      <h3 className="text-sm font-semibold text-navy-900">Add a past hire</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        <input className="input" placeholder="Private label (e.g. name) — never sent to AI" value={label} onChange={(e) => setLabel(e.target.value)} />
        <input className="input" placeholder="Role hired into" value={roleHired} onChange={(e) => setRoleHired(e.target.value)} />
        <select className="input" value={outcome} onChange={(e) => setOutcome(e.target.value as Outcome)}>
          <option value="">Performance outcome…</option>
          {OUTCOMES.map((o) => (
            <option key={o} value={o}>
              {OUTCOME_LABEL[o]}
            </option>
          ))}
        </select>
        <input type="file" accept=".pdf,.docx,.txt" className="text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <textarea className="input h-16" placeholder="Optional founder notes (what stood out, what the interview revealed, outcome note)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="flex items-center gap-2">
        <button className="btn-secondary text-xs" disabled={!file || !outcome || !roleHired.trim() || busy} onClick={add}>
          {busy ? 'Adding…' : 'Add past hire'}
        </button>
        {msg && <span className="text-xs text-slate-500">{msg}</span>}
      </div>
    </div>
  );
}

export function RemoveHire({ id }: { id: string }) {
  const router = useRouter();
  return (
    <button
      className="text-xs text-slate-400 underline hover:text-red-600"
      onClick={async () => {
        if (!window.confirm('Remove this past hire from calibration data? Existing rubrics are not affected.')) return;
        await send(`/api/calibration/hires/${id}`, { method: 'DELETE' });
        router.refresh();
      }}
    >
      Remove
    </button>
  );
}

export function GenerateRubric({ hasActive, ready, hireCount }: { hasActive: boolean; ready: boolean; hireCount: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setError(null);
    const r = await send('/api/calibration/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: true }) });
    setBusy(false);
    setConfirming(false);
    if (!r.ok) setError(r.error ?? 'Calibration failed.');
    else router.refresh();
  }
  return (
    <div>
      <button className="btn-primary" disabled={!ready || busy} onClick={() => setConfirming(true)}>
        {busy ? 'Analysing past hires… (up to 2 minutes)' : hasActive ? 'Recalibrate Rubric' : 'Generate Rubric'}
      </button>
      {error && <p className="mt-2 rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-navy-900">{hasActive ? 'Recalibrate the rubric?' : 'Generate the rubric?'}</h3>
            <p className="mt-2 text-sm text-slate-600">
              Gemini will compare {hireCount} past hires (names removed) and their outcomes with both job descriptions, then propose a NEW DRAFT rubric version for you to review on this page.
              {hasActive && ' The current rubric keeps being used until you approve the draft.'}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setConfirming(false)} disabled={busy}>
                Cancel
              </button>
              <button className="btn-primary" onClick={run} disabled={busy}>
                {busy ? 'Working…' : 'Create draft version'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
