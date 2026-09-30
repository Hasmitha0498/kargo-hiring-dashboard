'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { EMAIL_TYPE_LABEL, emailTypeForDecision, type EmailType, type FounderDecision, type SuggestedAction } from '@/lib/domain';
import { FIRST_NAME_TOKEN, personalize } from '@/lib/email/compose';
import { formatDateTime } from '@/lib/format';
import { failedStageLabel, StageList, type StageState } from '../StageList';
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

export function ProcessPanel({ candidateId, mode, label, note, children }: { candidateId: string; mode: 'auto' | 'score'; label: string; note?: string; children?: React.ReactNode }) {
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
      setError('Could not reach the server. Your candidate is still saved; try again.');
      setBusy(false);
      return;
    }
    let failed = false;
    await readProgress(res, (e) => {
      if (e.type === 'stage' && e.stage !== 'done') setStages((s) => ({ ...s, [e.stage]: e.state }));
      if (e.type === 'error') {
        failed = true;
        setStages((s) => {
          const next = { ...s };
          for (const [k, v] of Object.entries(next)) if (v === 'active') next[k as keyof StageState] = 'error';
          return next;
        });
        setError(e.message);
      }
    });
    setBusy(false);
    if (!failed) router.refresh();
  }

  return (
    <div className="space-y-3">
      {/* The original failure message is replaced by live progress as soon as a retry starts. */}
      {stages === null ? children : <p className="text-sm font-semibold text-navy-900">{busy ? 'Retrying…' : error ? 'Retry did not finish.' : 'Done.'}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" onClick={run} disabled={busy}>
          {busy ? 'Working…' : label}
        </button>
        {note && <span className="text-xs text-slate-600">{note}</span>}
      </div>
      {stages && <StageList state={stages} />}
      {error && (
        <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">
          <span className="font-semibold">{failedStageLabel(stages ?? {}) ?? 'It did not work.'}</span> {error} Your candidate is still saved.
        </p>
      )}
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

  const status =
    override === 'IN' ? (recommended ? 'Shortlisted (you confirmed the recommendation)' : 'Shortlisted (added by you)') : override === 'OUT' ? 'Not shortlisted (you removed them)' : recommended ? 'Shortlist recommended by the system' : 'Not shortlisted';

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className={shortlisted ? 'font-medium text-navy-900' : 'text-slate-600'}>{status}</span>
      {!shortlisted && (
        <button className="text-xs font-medium text-navy-900 underline" disabled={busy} onClick={() => set('IN')}>
          Add to shortlist
        </button>
      )}
      {shortlisted && (
        <button className="text-xs font-medium text-slate-600 underline" disabled={busy} onClick={() => set('OUT')}>
          Remove from shortlist
        </button>
      )}
      {override !== null && (
        <button className="text-xs text-slate-500 underline" disabled={busy} onClick={() => set(null)}>
          Use system recommendation
        </button>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

// ------------------------------------------------------------------ founder decision

const CHOICES: { d: FounderDecision; label: string; hint: string; active: string }[] = [
  { d: 'INTERVIEW', label: 'Interview', hint: 'Invite to a conversation', active: 'border-emerald-600 bg-emerald-600 text-white' },
  { d: 'HOLD', label: 'Hold', hint: 'Decide later, no email', active: 'border-amber-500 bg-amber-500 text-white' },
  { d: 'REJECT', label: 'Reject', hint: 'Send a warm rejection', active: 'border-red-600 bg-red-600 text-white' },
];

export function DecisionPanel({
  candidateId,
  current,
  suggestion,
  emailSent,
  history,
}: {
  candidateId: string;
  current: FounderDecision;
  suggestion: SuggestedAction | null;
  emailSent: boolean;
  history: { founder_decision: FounderDecision; ai_suggested_action: SuggestedAction | null; decision_notes: string | null; decided_at: string }[];
}) {
  const router = useRouter();
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState<FounderDecision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function decide(d: FounderDecision) {
    setBusy(d);
    setError(null);
    const err = await call(`/api/candidates/${candidateId}/decision`, 'POST', { decision: d, notes: notes || undefined });
    setBusy(null);
    if (err) return setError(err);
    setNotes('');
    setSaved(true);
    router.refresh();
  }

  const overrides = suggestion && (current === 'INTERVIEW' || current === 'REJECT') && current !== suggestion;
  return (
    <section className="card p-5">
      <h2 className="text-base font-semibold text-navy-900">Your decision</h2>
      <p className="text-xs text-slate-500">You make the call. Nothing is sent until you confirm an email below.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {CHOICES.map((c) => (
          <button
            key={c.d}
            disabled={busy !== null}
            onClick={() => decide(c.d)}
            aria-pressed={current === c.d}
            className={`rounded-lg border-2 px-4 py-3 text-left transition-colors ${current === c.d ? c.active : 'border-line bg-white hover:border-slate-400'}`}
          >
            <div className="font-semibold">{busy === c.d ? 'Saving…' : c.label}</div>
            <div className={`text-xs ${current === c.d ? 'text-white/80' : 'text-slate-500'}`}>{c.hint}</div>
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          System recommendation: {suggestion ? (suggestion === 'INTERVIEW' ? 'Interview (top 5 for this role)' : 'Reject (outside the top 5)') : 'not available yet'}
          {overrides && <span className="ml-1 text-amber-700">· you chose differently</span>}
        </span>
        {current !== 'UNDECIDED' && !emailSent && (
          <button className="underline hover:text-slate-800" disabled={busy !== null} onClick={() => decide('UNDECIDED')}>
            Clear decision
          </button>
        )}
      </div>
      {current === 'UNDECIDED' && <p className="mt-2 text-sm text-slate-600">No decision selected yet.</p>}
      <textarea className="input mt-3 h-14" placeholder="Optional note to save with your decision" value={notes} onChange={(e) => setNotes(e.target.value)} />
      {saved && !error && <p className="mt-1 text-xs text-emerald-700">Decision saved.</p>}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      {emailSent && <p className="mt-2 text-xs text-slate-500">An email has already been sent; changing the decision now will not send another.</p>}
      {history.length > 0 && (
        <details className="mt-2 text-xs text-slate-500">
          <summary className="cursor-pointer">Decision history ({history.length})</summary>
          <ul className="mt-1 space-y-1">
            {history.map((h, i) => (
              <li key={i}>
                {formatDateTime(h.decided_at)}: <span className="font-medium text-slate-700">{h.founder_decision === 'UNDECIDED' ? 'Cleared' : h.founder_decision === 'HOLD' ? 'Hold' : h.founder_decision === 'INTERVIEW' ? 'Interview' : 'Reject'}</span>
                {h.ai_suggested_action && <> (system recommended {h.ai_suggested_action === 'INTERVIEW' ? 'Interview' : 'Reject'})</>}
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
  candidateName: string;
  decision: FounderDecision;
  draft: { type: EmailType | null; subject: string | null; body: string | null } | null;
  aiDrafts: { invite: { subject: string; body: string }; rejection: { subject: string; body: string } } | null;
  firstName: string | null;
  candidateEmail: string | null;
  testEmail: string | null;
  sent: { recipient: string; intended: string | null; testMode: boolean; sentAt: string | null; providerId: string | null; type: EmailType } | null;
  lastFailure: { at: string; error: string | null } | null;
}

export function EmailPanel(p: EmailPanelProps) {
  const router = useRouter();
  const required = emailTypeForDecision(p.decision);
  const aiFor = (t: EmailType) => (t === 'INTERVIEW_INVITE' ? p.aiDrafts?.invite : p.aiDrafts?.rejection);
  const initial = required ? (p.draft?.type === required && p.draft.subject && p.draft.body ? { subject: p.draft.subject, body: p.draft.body } : aiFor(required)) : null;
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  if (p.sent) {
    return (
      <section className="card border-violet-200 p-5">
        <h2 className="text-base font-semibold text-navy-900">Email</h2>
        <p className="mt-2 text-sm font-medium text-violet-800">
          ✓ Email sent · {EMAIL_TYPE_LABEL[p.sent.type]} · {formatDateTime(p.sent.sentAt)}
        </p>
        {p.sent.testMode ? (
          <p className="mt-1 text-xs text-sky-800">
            TEST MODE · Actual candidate: {p.sent.intended ?? '(no address)'} · Delivered to: {p.sent.recipient}
          </p>
        ) : (
          <p className="mt-1 text-xs text-slate-600">Delivered to {p.sent.recipient}</p>
        )}
        <p className="mt-2 text-xs text-slate-400">Resend message id {p.sent.providerId}. A second email to this candidate is blocked.</p>
      </section>
    );
  }

  if (!p.aiDrafts) {
    return (
      <section className="card p-5 text-sm text-slate-500">
        <h2 className="text-base font-semibold text-navy-900">Email</h2>
        <p className="mt-1">The email draft appears once analysis is complete.</p>
      </section>
    );
  }

  if (p.decision === 'UNDECIDED') {
    return (
      <section className="card p-5 text-sm">
        <h2 className="text-base font-semibold text-navy-900">Email</h2>
        <p className="mt-1 text-slate-500">Choose Interview or Reject above to review the matching email draft.</p>
      </section>
    );
  }

  if (p.decision === 'HOLD' || !required) {
    return (
      <section className="card p-5 text-sm">
        <h2 className="text-base font-semibold text-navy-900">Email</h2>
        <p className="mt-1 text-slate-600">On hold: no email is needed now. Your decision is saved; choose Interview or Reject when you are ready.</p>
      </section>
    );
  }

  const base = initial!;
  const dirty = subject !== base.subject || body !== base.body;
  const deliverTo = p.testEmail ?? p.candidateEmail;
  const missingAddress = !p.testEmail && !p.candidateEmail;

  async function save() {
    setError(null);
    const err = await call(`/api/candidates/${p.candidateId}/draft`, 'PUT', { email_type: required, subject, body });
    if (err) setError(err);
    else {
      setNote('Draft saved.');
      router.refresh();
    }
  }

  async function send() {
    setSending(true);
    setError(null);
    const err = await call(`/api/candidates/${p.candidateId}/send`, 'POST', { confirm: true, email_type: required, subject, body });
    setSending(false);
    setConfirming(false);
    if (err) setError(err);
    else router.refresh();
  }

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-navy-900">{required === 'INTERVIEW_INVITE' ? 'Interview invitation' : 'Warm rejection'}</h2>
        <span className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-bold tracking-wide text-amber-800">DRAFT — NOT SENT</span>
      </div>
      <p className="mt-1 text-xs text-slate-500">Written by AI from the candidate&apos;s professional evidence. Edit anything before sending.</p>

      <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
        {p.testEmail ? (
          <>
            <span className="mr-1 rounded bg-sky-600 px-1 py-px font-semibold text-white">TEST MODE</span> Actual candidate: <span className="font-mono">{p.candidateEmail ?? '(no address found)'}</span> · Delivered to:{' '}
            <span className="font-mono">{p.testEmail}</span>
          </>
        ) : (
          <>To: <span className="font-mono">{p.candidateEmail ?? 'no email address found. Add one at the top of the page'}</span></>
        )}
      </div>

      <label className="label mt-4" htmlFor="subject">
        Subject
      </label>
      <input id="subject" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
      <label className="label mt-3" htmlFor="body">
        Message <span className="normal-case tracking-normal text-slate-400">({FIRST_NAME_TOKEN} becomes “{p.firstName ?? 'there'}” when sent)</span>
      </label>
      <textarea id="body" className="input h-72 text-[15px] leading-relaxed" value={body} onChange={(e) => setBody(e.target.value)} />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className="btn-secondary" onClick={save} disabled={!dirty}>
          Save draft
        </button>
        <button
          className="btn-secondary"
          disabled={!dirty}
          onClick={() => {
            setSubject(aiFor(required)!.subject);
            setBody(aiFor(required)!.body);
            setNote('Restored the original AI draft.');
          }}
        >
          Undo my edits
        </button>
        <button className="btn-primary ml-auto px-4 py-2" disabled={!subject.trim() || !body.trim() || missingAddress} onClick={() => setConfirming(true)}>
          Confirm &amp; Send
        </button>
      </div>
      {note && <p className="mt-2 text-xs text-slate-500">{note}</p>}
      {error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <p className="font-semibold">Email could not be sent.</p>
          <p>{error}</p>
          <button className="btn-secondary mt-2" onClick={() => setConfirming(true)}>
            Retry
          </button>
        </div>
      )}
      {!error && p.lastFailure && (
        <p className="mt-2 text-xs text-red-600">
          A previous attempt failed ({formatDateTime(p.lastFailure.at)}): {p.lastFailure.error} You can send again.
        </p>
      )}

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="send-title">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
            <h3 id="send-title" className="text-lg font-semibold text-navy-900">
              Send this email?
            </h3>
            <dl className="mt-3 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-slate-500">Candidate</dt>
              <dd className="font-medium text-slate-800">{p.candidateName}</dd>
              <dt className="text-slate-500">Email</dt>
              <dd className="font-mono text-xs leading-5 text-slate-800">{p.candidateEmail ?? '(none)'}</dd>
              {p.testEmail && (
                <>
                  <dt className="text-slate-500">Delivered to</dt>
                  <dd className="font-mono text-xs leading-5 text-sky-800">{deliverTo} (TEST MODE)</dd>
                </>
              )}
              <dt className="text-slate-500">Decision</dt>
              <dd className="text-slate-800">{p.decision === 'INTERVIEW' ? 'Interview' : 'Reject'}</dd>
              <dt className="text-slate-500">Subject</dt>
              <dd className="text-slate-800">{personalize(subject, p.firstName)}</dd>
            </dl>
            <pre className="mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-md border border-line bg-slate-50 p-3 font-sans text-sm text-slate-700">{personalize(body, p.firstName)}</pre>
            <p className="mt-2 text-xs text-slate-500">This cannot be undone. Only one email can be sent to each candidate.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setConfirming(false)} disabled={sending}>
                Cancel
              </button>
              <button className="btn-primary px-4" onClick={send} disabled={sending}>
                {sending ? 'Sending…' : 'Send Email'}
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
        Correct name or email
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
    else window.location.href = '/dashboard';
  }
  return confirm ? (
    <span className="inline-flex flex-wrap items-center gap-2 text-xs">
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
