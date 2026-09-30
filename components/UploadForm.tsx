'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import type { Role } from '@/lib/domain';
import { failedStageLabel, StageList, type StageState } from './StageList';
import { StepIndicator } from './StepIndicator';
import { readProgress } from './useStream';

const ACCEPT = '.pdf,.docx,.txt';
const ROLE_CARDS: { role: Role; title: string; hint: string }[] = [
  { role: 'PM', title: 'Product Manager', hint: 'Core platform, discovery, shipping features' },
  { role: 'SPM', title: 'Senior Product Manager', hint: 'Integrations, data layer, high-consequence calls' },
];

type Phase = 'form' | 'processing' | 'done' | 'failed';

export function UploadForm({ rubricReady }: { rubricReady: boolean }) {
  const [role, setRole] = useState<Role | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<Phase>('form');
  const [stages, setStages] = useState<StageState>({});
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  function pick(f: File | undefined | null) {
    if (f) setFile(f);
  }

  async function consume(res: Response | null) {
    if (!res) {
      setError({ message: 'Could not reach the server. Check your connection and try again.', retryable: false });
      setPhase('failed');
      return;
    }
    let failed = false;
    await readProgress(res, (e) => {
      if (e.type === 'candidate') setCandidateId(e.candidateId);
      if (e.type === 'stage' && e.stage !== 'done') setStages((s) => ({ ...s, [e.stage]: e.state }));
      if (e.type === 'error') {
        failed = true;
        setStages((s) => {
          const next = { ...s };
          let marked = false;
          for (const [k, v] of Object.entries(next)) {
            if (v === 'active') {
              next[k as keyof StageState] = 'error';
              marked = true;
            }
          }
          if (!marked) next[e.stage] = 'error';
          return next;
        });
        setError({ message: e.message, retryable: e.retryable });
      }
    });
    setPhase(failed ? 'failed' : 'done');
  }

  async function analyse() {
    if (!role || !file) return;
    setPhase('processing');
    setStages({});
    setError(null);
    const form = new FormData();
    form.set('applied_role', role);
    form.set('file', file);
    await consume(await fetch('/api/candidates', { method: 'POST', body: form }).catch(() => null));
  }

  async function retry() {
    if (!candidateId) return;
    setPhase('processing');
    setError(null);
    setStages((s) => Object.fromEntries(Object.entries(s).filter(([, v]) => v === 'done')) as StageState);
    await consume(await fetch(`/api/candidates/${candidateId}/process`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: 'auto' }) }).catch(() => null));
  }

  function reset() {
    setPhase('form');
    setFile(null);
    setStages({});
    setCandidateId(null);
    setError(null);
    if (input.current) input.current.value = '';
  }

  if (phase !== 'form') {
    const failedWhere = failedStageLabel(stages);
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <StepIndicator current={phase === 'done' ? 3 : 2} />
        <div className="card p-6">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            {file?.name} · {role === 'PM' ? 'Product Manager' : 'Senior Product Manager'}
          </div>
          <h2 className="mb-4 text-lg font-semibold text-navy-900">
            {phase === 'processing' ? 'Analysing candidate…' : phase === 'done' ? 'Candidate analysed successfully' : 'Analysis stopped'}
          </h2>
          <StageList state={stages} />
          <p className="mt-4 text-xs text-slate-500">Personal contact details are separated before AI evaluation.</p>

          {phase === 'done' && candidateId && (
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href={`/candidates/${candidateId}`} className="btn-primary px-4 py-2">
                View Candidate
              </Link>
              <Link href="/dashboard" className="btn-secondary px-4 py-2">
                Back to Dashboard
              </Link>
              <button onClick={reset} className="btn-secondary px-4 py-2">
                Upload another
              </button>
            </div>
          )}

          {phase === 'failed' && error && (
            <div className="mt-5 rounded-md border border-red-200 bg-red-50 p-4 text-sm">
              <p className="font-semibold text-red-800">{failedWhere ?? 'Something went wrong.'}</p>
              <p className="mt-1 text-red-700">{error.message}</p>
              <p className="mt-1 text-red-700">
                {candidateId && error.retryable ? 'Your candidate has been saved. You do not need to upload the CV again.' : candidateId ? 'Nothing was scored. Upload a readable copy of the CV.' : 'Nothing was saved.'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {candidateId && error.retryable && (
                  <button onClick={retry} className="btn-primary">
                    Retry Scoring
                  </button>
                )}
                <button onClick={reset} className="btn-secondary">
                  Upload a different file
                </button>
                <Link href="/dashboard" className="btn-secondary">
                  Back to Dashboard
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <StepIndicator current={1} />
      {!rubricReady && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          The hiring rubric hasn&apos;t been configured yet. The CV will be saved, but scoring will fail until the{' '}
          <Link href="/rubric" className="font-semibold underline">
            rubric is set up
          </Link>
          .
        </p>
      )}

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-navy-900">
          <span className="mr-2 rounded bg-navy-900 px-1.5 py-0.5 text-xs text-white">1</span>Which role did they apply for?
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {ROLE_CARDS.map((r) => (
            <button
              key={r.role}
              type="button"
              aria-pressed={role === r.role}
              onClick={() => setRole(r.role)}
              className={`rounded-lg border-2 p-4 text-left transition-colors ${role === r.role ? 'border-navy-900 bg-navy-900 text-white' : 'border-line bg-white hover:border-slate-400'}`}
            >
              <div className="font-semibold">{r.title}</div>
              <div className={`mt-0.5 text-xs ${role === r.role ? 'text-white/70' : 'text-slate-500'}`}>{r.hint}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-navy-900">
          <span className="mr-2 rounded bg-navy-900 px-1.5 py-0.5 text-xs text-white">2</span>Upload CV
        </h2>
        <label
          htmlFor="cv"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files?.[0]);
          }}
          className={`mt-3 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 text-center ${dragging ? 'border-navy-700 bg-slate-50' : file ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 hover:border-slate-400'}`}
        >
          {file ? (
            <>
              <span className="text-sm font-semibold text-navy-900">{file.name}</span>
              <span className="mt-1 text-xs text-slate-500">{Math.max(1, Math.round(file.size / 1024))} KB · click to choose a different file</span>
            </>
          ) : (
            <>
              <span className="text-sm font-medium text-navy-900">Drag &amp; drop the CV here, or click to browse</span>
              <span className="mt-1 text-xs text-slate-500">PDF, DOCX or TXT · up to 4 MB</span>
            </>
          )}
          <input ref={input} id="cv" type="file" accept={ACCEPT} className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
        </label>
      </section>

      <section className="flex flex-wrap items-center gap-3">
        <span className="rounded bg-navy-900 px-1.5 py-0.5 text-xs font-semibold text-white">3</span>
        <button className="btn-primary px-5 py-2.5 text-base" disabled={!role || !file} onClick={analyse}>
          Analyse Candidate
        </button>
        <span className="text-xs text-slate-500">{!role ? 'Choose a role first.' : !file ? 'Add a CV file.' : 'Takes about 30 seconds. Nothing is sent to the candidate.'}</span>
      </section>
    </div>
  );
}
