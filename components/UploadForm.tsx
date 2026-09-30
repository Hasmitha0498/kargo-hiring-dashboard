'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import type { Role } from '@/lib/domain';
import { StageList, type StageState } from './StageList';
import { readProgress } from './useStream';

interface Job {
  file: File;
  stages: StageState;
  candidateId: string | null;
  error: string | null;
  finished: boolean;
}

const ACCEPT = '.pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain';

export function UploadForm({ rubricReady }: { rubricReady: boolean }) {
  const [role, setRole] = useState<Role | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [running, setRunning] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const update = (i: number, fn: (j: Job) => Job) => setJobs((prev) => prev.map((j, k) => (k === i ? fn(j) : j)));

  async function processAll() {
    if (!role || !files.length) return;
    setRunning(true);
    const initial = files.map((file) => ({ file, stages: {}, candidateId: null, error: null, finished: false }));
    setJobs(initial);
    // One at a time: keeps Gemini usage within rate limits and makes progress easy to follow.
    for (let i = 0; i < initial.length; i++) {
      const form = new FormData();
      form.set('applied_role', role);
      form.set('file', initial[i]!.file);
      let res: Response;
      try {
        res = await fetch('/api/candidates', { method: 'POST', body: form });
      } catch {
        update(i, (j) => ({ ...j, error: 'Network error: could not reach the server.', finished: true }));
        continue;
      }
      await readProgress(res, (e) => {
        if (e.type === 'candidate') update(i, (j) => ({ ...j, candidateId: e.candidateId }));
        if (e.type === 'stage') update(i, (j) => ({ ...j, stages: { ...j.stages, [e.stage]: e.state } }));
        if (e.type === 'error')
          update(i, (j) => {
            const stages = { ...j.stages };
            for (const [k, v] of Object.entries(stages)) if (v === 'active') stages[k as keyof StageState] = 'error';
            if (!Object.values(stages).includes('error')) stages[e.stage] = 'error';
            return { ...j, stages, error: e.message, finished: true };
          });
        if (e.type === 'complete') update(i, (j) => ({ ...j, finished: true }));
      });
    }
    setRunning(false);
    setFiles([]);
    if (input.current) input.current.value = '';
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
      <div className="card space-y-5 p-5">
        <div>
          <span className="label">Applied role</span>
          <div className="grid grid-cols-2 gap-2">
            {(['PM', 'SPM'] as Role[]).map((r) => (
              <button
                key={r}
                type="button"
                disabled={running}
                onClick={() => setRole(r)}
                className={`rounded-md border px-3 py-2.5 text-left text-sm ${role === r ? 'border-navy-900 bg-navy-900 text-white' : 'border-line bg-white hover:border-slate-400'}`}
              >
                <div className="font-semibold">{r === 'PM' ? 'Product Manager' : 'Senior Product Manager'}</div>
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">Every candidate is scored against both rubrics; they are ranked in the role they applied for.</p>
        </div>
        <div>
          <label className="label" htmlFor="cv">
            CV upload
          </label>
          <input
            ref={input}
            id="cv"
            type="file"
            multiple
            accept={ACCEPT}
            disabled={running}
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-slate-200"
          />
          <p className="mt-1.5 text-xs text-slate-500">PDF, DOCX or TXT, up to 4 MB each. Select several files to batch-upload for the same role.</p>
        </div>
        {!rubricReady && <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">No approved rubric yet: CVs will be stored and parsed, but scoring will wait until a rubric is approved (then press Retry).</p>}
        <button className="btn-primary w-full py-2" disabled={!role || !files.length || running} onClick={processAll}>
          {running ? 'Processing…' : files.length > 1 ? `Process ${files.length} candidates` : 'Process Candidate'}
        </button>
        <p className="text-xs text-slate-500">Processing prepares scores, an interview brief and an email draft. Nothing is sent and no decision is made.</p>
      </div>

      <div className="space-y-3">
        {jobs.length === 0 && <div className="card p-8 text-center text-sm text-slate-500">Progress will appear here.</div>}
        {jobs.map((j, i) => (
          <div key={i} className="card p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="truncate text-sm font-semibold text-navy-900">{j.file.name}</div>
              {j.candidateId && j.finished && (
                <Link href={`/candidates/${j.candidateId}`} className="btn-secondary shrink-0 text-xs">
                  {j.error ? 'Open & retry' : 'View candidate'}
                </Link>
              )}
            </div>
            <StageList state={j.stages} compact />
            {j.error && <p className="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-700">{j.error}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
