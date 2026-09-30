'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DECISION_LABEL, EMAIL_TYPE_LABEL, emailTypeForDecision, type EmailType, type FounderDecision, type SuggestedAction } from '@/lib/domain';
import { FIRST_NAME_TOKEN, personalize } from '@/lib/email/compose';
import { Badge } from '../badges';
import { StageList, type StageState } from '../StageList';
import { readProgress } from '../useStream';

async function call(url: string, method: string, body?: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (res.ok) return null;
    const b = (await res.json().catch(() => ({}))) as { error?: string };
    return b.error ?? `Request failed (${res.status}).`;
  } catch {
    return 'Network error. Check your connection and try again.';
  }
}

// ------------------------------------------------------------------ retry / re-evaluate

export function ProcessPanel({ candidateId, mode, label, note }: { candidateId: string; mode: 'auto' | 'score'; label: string; note?: string }) {
  const router = useRouter();
  const [stages, setStages] = useState<StageState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    setStages({});
    const res = await fetch(`/api/candidates/${candidateId}/process`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: mode }) }).catch(() => null);
    if (!res) {
      setError('Network error.');
      setBusy(false);
      return;
    }
    await readProgress(res, (e) => {
      if (e.type === 'stage') setStages((s) => ({ ...s, [e.stage]: e.state }));
      if (e.type === 'error') {
        setStages((s) => {
          const next = { ...s };
          for (const [k, v] of Object.entries(next)) if (v === 'active') next[k as keyof StageState] = 'error';
          return next;
        });
        setError(e.message);
      }
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" onClick={run} disabled={busy}>
          {busy ? 'Working…' : label}
        </button>
        {note && <span className="text-xs text-slate-500">{note}</span>}
      </div>
      {stages && <StageList state={stages} compact />}
      {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}

// ------------------------------------------------------------------ shortlist override

export function ShortlistControl({ candidateId, recommended, override }: { candidateId: string; recommended: boolean; override: 'IN' | 'OUT' | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shortlisted = override === 'IN' || (override !== 'OUT' && recommended);

  async function set(next: 'IN' | 'OUT' | null) {
    setBusy(true);
    setError(await call(`/api/candidates/${candidateId}/shortlist`, 'POST', { override: next }));
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-500">System:</span>
        {recommended ? <Badge color="blue">Shortlist recommended</Badge> : <Badge>Not in top 5</Badge>}
        <span className="ml-2 text-slate-500">Founder:</span>
        {override === 'IN' ? <Badge color="navy">In shortlist</Badge> : override === 'OUT' ? <Badge>Removed</Badge> : <span className="text-xs text-slate-400">no override</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        {recommended && override === null && (
          <>
            <button className="btn-secondary text-xs" disabled={busy} onClick={() => set('IN')}>
              Accept recommendation
            </button>
            <button className="btn-secondary text-xs" disabled={busy} onClick={() => set('OUT')}>
              Reject recommendation
            </button>
          </>
        )}
        {!shortlisted && (
          <button className="btn-secondary text-xs" disabled={busy} onClick={() => set('IN')}>
            Move into shortlist
          </button>
        )}
        {shortlisted && override !== null && (
          <button className="btn-secondary text-xs" disabled={busy} onClick={() => set('OUT')}>
            Remove from shortlist
          </button>
        )}
        {override !== null && (
          <button className="btn-secondary text-xs" disabled={busy} onClick={() => set(null)}>
            Clear override
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

// ------------------------------------------------------------------ founder decision

const DECISIONS: FounderDecision[] = ['UNDECIDED', 'INTERVIEW', 'REJECT', 'HOLD'];

export function DecisionPanel({
  candidateId,
  current,
  suggestion,
  history,
}: {
  candidateId: string;
  current: FounderDecision;
  suggestion: SuggestedAction | null;
  history: { founder_decision: FounderDecision; ai_suggested_action: SuggestedAction | null; decision_notes: string | null; decided_at: string }[];
}) {
  const router = useRouter();
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(d: FounderDecision) {
    setBusy(true);
    setError(await call(`/api/candidates/${candidateId}/decision`, 'POST', { decision: d, notes: notes || undefined }));
    setBusy(false);
    setNotes('');
    router.refresh();
  }

  const overrides = suggestion && (current === 'INTERVIEW' || current === 'REJECT') && current !== suggestion;
  return (
    <section className="card p-4">
      <h2 className="text-sm font-semibold text-navy-900">Founder decision</h2>
      <p className="mt-0.5 text-xs text-slate-500">The system suggests; you decide. Your decision is stored separately and never overwrites the suggestion.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-500">AI suggestion:</span>
        {suggestion ? <Badge color="blue">{suggestion === 'INTERVIEW' ? 'Interview (in top 5)' : 'Reject (outside top 5)'}</Badge> : <span className="text-xs text-slate-400">not scored yet</span>}
        {overrides && <Badge color="amber">You overrode the suggestion</Badge>}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {DECISIONS.map((d) => (
          <button
            key={d}
            disabled={busy}
            onClick={() => decide(d)}
            className={`rounded-md border px-2 py-2 text-sm font-medium ${
              current === d
                ? d === 'INTERVIEW'
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : d === 'REJECT'
                    ? 'border-red-600 bg-red-600 text-white'
                    : d === 'HOLD'
                      ? 'border-amber-500 bg-amber-500 text-white'
                      : 'border-slate-500 bg-slate-500 text-white'
                : 'border-line bg-white hover:border-slate-400'
            }`}
          >
            {DECISION_LABEL[d]}
          </button>
        ))}
      </div>
      <textarea className="input mt-2 h-16" placeholder="Optional note (saved with the next decision you click)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {history.length > 0 && (
        <details className="mt-2 text-xs text-slate-500">
          <summary className="cursor-pointer">Decision history ({history.length})</summary>
          <ul className="mt-1 space-y-1">
            {history.map((h, i) => (
              <li key={i}>
                {new Date(h.decided_at).toLocaleString()}: <span className="font-medium text-slate-700">{DECISION_LABEL[h.founder_decision]}</span>
                {h.ai_suggested_action && <> (AI suggested {h.ai_suggested_action === 'INTERVIEW' ? 'Interview' : 'Reject'})</>}
                {h.decision_notes && <> · “{h.decision_notes}”</>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ email draft + confirm & send

export interface EmailPanelProps {
  candidateId: string;
  decision: FounderDecision;
  draft: { type: EmailType | null; subject: string | null; body: string | null } | null;
  aiDrafts: { invite: { subject: string; body: string }; rejection: { subject: string; body: string } } | null;
  firstName: string | null;
  candidateEmail: string | null;
  testEmail: string | null;
  sent: { recipient: string; intended: string | null; testMode: boolean; sentAt: string | null; providerId: string | null; type: EmailType } | null;
  failures: { at: string; error: string | null }[];
}

export function EmailPanel(p: EmailPanelProps) {
  const router = useRouter();
  const required = emailTypeForDecision(p.decision);
  const initial = p.draft?.type === required ? p.draft : null;
  const aiFor = (t: EmailType) => (t === 'INTERVIEW_INVITE' ? p.aiDrafts?.invite : p.aiDrafts?.rejection);
  const [subject, setSubject] = useState(initial?.subject ?? (required ? aiFor(required)?.subject ?? '' : ''));
  const [body, setBody] = useState(initial?.body ?? (required ? aiFor(required)?.body ?? '' : ''));
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  if (!p.aiDrafts) return <section className="card p-4 text-sm text-slate-500">Email drafts appear once processing completes.</section>;

  if (p.sent) {
    return (
      <section className="card p-4">
        <h2 className="text-sm font-semibold text-navy-900">Send status</h2>
        <div className="mt-2 space-y-1 text-sm">
          <div>
            <Badge color="violet">Sent</Badge> <span className="ml-1">{EMAIL_TYPE_LABEL[p.sent.type]}</span> · {p.sent.sentAt && new Date(p.sent.sentAt).toLocaleString()}
          </div>
          {p.sent.testMode && (
            <div className="text-xs text-sky-800">
              TEST MODE · candidate: {p.sent.intended ?? '(no address)'} · delivered to: {p.sent.recipient}
            </div>
          )}
          {!p.sent.testMode && <div className="text-xs text-slate-600">Delivered to {p.sent.recipient}</div>}
          <div className="font-mono text-[11px] text-slate-400">Resend id {p.sent.providerId}</div>
          <p className="text-xs text-slate-500">Duplicate sends to this candidate are blocked.</p>
        </div>
      </section>
    );
  }

  const dirty = required && (subject !== (initial?.subject ?? aiFor(required)?.subject) || body !== (initial?.body ?? aiFor(required)?.body));

  async function save() {
    if (!required) return;
    setError(null);
    const err = await call(`/api/candidates/${p.candidateId}/draft`, 'PUT', { email_type: required, subject, body });
    if (err) setError(err);
    else {
      setStatus('Draft saved.');
      router.refresh();
    }
  }

  function reset() {
    if (!required) return;
    setSubject(aiFor(required)!.subject);
    setBody(aiFor(required)!.body);
    setStatus('Reset to the AI draft (not saved yet).');
  }

  async function send() {
    if (!required) return;
    setSending(true);
    setError(null);
    const err = await call(`/api/candidates/${p.candidateId}/send`, 'POST', { confirm: true, email_type: required, subject, body });
    setSending(false);
    setConfirming(false);
    if (err) setError(err);
    else router.refresh();
  }

  const deliverTo = p.testEmail ?? p.candidateEmail;
  const missingAddress = !p.testEmail && !p.candidateEmail;

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-navy-900">Email draft</h2>
        {required && <Badge color={required === 'INTERVIEW_INVITE' ? 'green' : 'red'}>{EMAIL_TYPE_LABEL[required]}</Badge>}
      </div>

      {!required ? (
        <div className="mt-3 space-y-3">
          <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">
            Choose <span className="font-semibold">Interview</span> or <span className="font-semibold">Reject</span> to review and send the matching email. Nothing can be sent while the decision is {DECISION_LABEL[p.decision]}.
          </p>
          <details className="text-xs text-slate-500">
            <summary className="cursor-pointer">Preview AI drafts</summary>
            {(['invite', 'rejection'] as const).map((k) => (
              <div key={k} className="mt-2 rounded border border-line p-2">
                <div className="font-semibold text-slate-700">{personalize(p.aiDrafts![k].subject, p.firstName)}</div>
                <pre className="mt-1 whitespace-pre-wrap font-sans text-slate-600">{personalize(p.aiDrafts![k].body, p.firstName)}</pre>
              </div>
            ))}
          </details>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {p.testEmail ? (
              <>
                <span className="mr-1 rounded bg-sky-600 px-1 py-px font-semibold text-white">TEST MODE</span> Actual candidate: <span className="font-mono">{p.candidateEmail ?? '(no address found)'}</span> · Email delivered to:{' '}
                <span className="font-mono">{p.testEmail}</span>
              </>
            ) : (
              <>
                <span className="mr-1 rounded bg-red-600 px-1 py-px font-semibold text-white">LIVE</span> Will be delivered to <span className="font-mono">{p.candidateEmail ?? '(no address: add one above)'}</span>
              </>
            )}
          </div>
          <label className="label" htmlFor="subject">
            Subject
          </label>
          <input id="subject" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <label className="label" htmlFor="body">
            Body <span className="normal-case text-slate-400">({FIRST_NAME_TOKEN} becomes “{p.firstName ?? 'there'}”)</span>
          </label>
          <textarea id="body" className="input h-64 font-[inherit] leading-relaxed" value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-secondary" onClick={save} disabled={!dirty}>
              Save draft
            </button>
            <button className="btn-secondary" onClick={reset}>
              Reset to AI draft
            </button>
            <button className="btn-primary ml-auto" disabled={!subject.trim() || !body.trim() || missingAddress} onClick={() => setConfirming(true)}>
              Confirm &amp; Send…
            </button>
          </div>
          {status && <p className="text-xs text-slate-500">{status}</p>}
          {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
          {p.failures.length > 0 && <p className="text-xs text-red-600">Previous attempt failed ({new Date(p.failures[0]!.at).toLocaleString()}): {p.failures[0]!.error}</p>}
        </div>
      )}

      {confirming && required && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-navy-900">Send this {EMAIL_TYPE_LABEL[required].toLowerCase()}?</h3>
            <p className="mt-1 text-sm text-slate-600">This sends a real email through Resend and cannot be undone. Only one email can be sent per candidate.</p>
            <dl className="mt-3 space-y-1 rounded-md bg-slate-50 p-3 text-xs">
              {p.testEmail && (
                <div>
                  <dt className="inline font-semibold">Mode: </dt>
                  <dd className="inline text-sky-800">TEST MODE</dd>
                </div>
              )}
              <div>
                <dt className="inline font-semibold">Actual candidate: </dt>
                <dd className="inline font-mono">{p.candidateEmail ?? '(none)'}</dd>
              </div>
              <div>
                <dt className="inline font-semibold">Email delivered to: </dt>
                <dd className="inline font-mono">{deliverTo}</dd>
              </div>
              <div>
                <dt className="inline font-semibold">Subject: </dt>
                <dd className="inline">{personalize(subject, p.firstName)}</dd>
              </div>
            </dl>
            <pre className="mt-3 max-h-60 overflow-y-auto whitespace-pre-wrap rounded-md border border-line p-3 font-sans text-sm text-slate-700">{personalize(body, p.firstName)}</pre>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setConfirming(false)} disabled={sending}>
                Cancel
              </button>
              <button className="btn-primary" onClick={send} disabled={sending}>
                {sending ? 'Sending…' : 'Confirm & Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ private details

export function PrivateDetails({ candidateId, name, email }: { candidateId: string; name: string | null; email: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [n, setN] = useState(name ?? '');
  const [e, setE] = useState(email ?? '');
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const err = await call(`/api/candidates/${candidateId}`, 'PATCH', { candidate_name: n.trim() || null, email: e.trim() || null });
    if (err) setError(err);
    else {
      setEditing(false);
      router.refresh();
    }
  }

  if (!editing)
    return (
      <button className="text-xs text-slate-500 underline hover:text-slate-800" onClick={() => setEditing(true)}>
        Correct name / email
      </button>
    );
  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
      <input className="input" placeholder="Full name" value={n} onChange={(x) => setN(x.target.value)} />
      <input className="input" placeholder="Email" value={e} onChange={(x) => setE(x.target.value)} />
      <button className="btn-primary" onClick={save}>
        Save
      </button>
      <button className="btn-secondary" onClick={() => setEditing(false)}>
        Cancel
      </button>
      {error && <p className="text-xs text-red-600 sm:col-span-4">{error}</p>}
    </div>
  );
}

export function DeleteCandidate({ candidateId }: { candidateId: string }) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function del() {
    const err = await call(`/api/candidates/${candidateId}`, 'DELETE');
    if (err) setError(err);
    else window.location.href = '/';
  }
  return confirm ? (
    <span className="inline-flex items-center gap-2 text-xs">
      Delete this candidate and all their data?
      <button className="btn-danger text-xs" onClick={del}>
        Delete
      </button>
      <button className="btn-secondary text-xs" onClick={() => setConfirm(false)}>
        Cancel
      </button>
      {error && <span className="text-red-600">{error}</span>}
    </span>
  ) : (
    <button className="text-xs text-slate-400 underline hover:text-red-600" onClick={() => setConfirm(true)}>
      Delete candidate
    </button>
  );
}
