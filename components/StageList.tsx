'use client';
import type { StageKey } from '@/lib/pipeline/process';

export const STAGES: { key: StageKey; label: string; failure: string }[] = [
  { key: 'reading', label: 'Reading CV', failure: 'The CV could not be read.' },
  { key: 'separating', label: 'Separating personal details', failure: 'Personal details could not be separated.' },
  { key: 'evaluating_pm', label: 'Evaluating Product Manager evidence', failure: 'AI scoring failed.' },
  { key: 'evaluating_spm', label: 'Evaluating Senior Product Manager evidence', failure: 'AI scoring failed.' },
  { key: 'calculating', label: 'Calculating scores', failure: 'Scores could not be saved.' },
  { key: 'brief', label: 'Preparing interview brief', failure: 'The interview brief could not be prepared.' },
  { key: 'email', label: 'Preparing email draft', failure: 'The email draft could not be prepared.' },
];

export type StageState = Partial<Record<StageKey, 'active' | 'done' | 'error'>>;

export function failedStageLabel(state: StageState): string | null {
  return STAGES.find((s) => state[s.key] === 'error')?.failure ?? null;
}

export function StageList({ state }: { state: StageState }) {
  return (
    <ol className="space-y-2">
      {STAGES.map((s) => {
        const st = state[s.key];
        return (
          <li key={s.key} className="flex items-center gap-3 text-sm">
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                st === 'done' ? 'bg-emerald-500 text-white' : st === 'active' ? 'animate-spin border-2 border-navy-700 border-t-transparent' : st === 'error' ? 'bg-red-500 text-white' : 'border border-slate-300'
              }`}
            >
              {st === 'done' ? '✓' : st === 'error' ? '!' : ''}
            </span>
            <span className={st === 'done' ? 'text-slate-700' : st === 'active' ? 'font-medium text-navy-900' : st === 'error' ? 'font-medium text-red-700' : 'text-slate-400'}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
