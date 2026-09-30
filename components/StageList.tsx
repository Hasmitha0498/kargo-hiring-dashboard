'use client';
import type { StageKey } from '@/lib/pipeline/process';

export const STAGES: { key: StageKey; label: string }[] = [
  { key: 'reading', label: 'Reading CV' },
  { key: 'separating', label: 'Separating candidate details' },
  { key: 'evaluating_pm', label: 'Evaluating PM criteria' },
  { key: 'evaluating_spm', label: 'Evaluating SPM criteria' },
  { key: 'calculating', label: 'Calculating scores' },
  { key: 'brief', label: 'Preparing interview information' },
  { key: 'email', label: 'Preparing communication' },
  { key: 'done', label: 'Done' },
];

export type StageState = Partial<Record<StageKey, 'active' | 'done' | 'error'>>;

export function StageList({ state, compact }: { state: StageState; compact?: boolean }) {
  return (
    <ol className={compact ? 'grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4' : 'space-y-1.5'}>
      {STAGES.map((s) => {
        const st = state[s.key];
        return (
          <li key={s.key} className="flex items-center gap-2 text-sm">
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                st === 'done' ? 'bg-emerald-500 text-white' : st === 'active' ? 'border-2 border-navy-700 border-t-transparent animate-spin' : st === 'error' ? 'bg-red-500 text-white' : 'border border-slate-300'
              }`}
            >
              {st === 'done' ? '✓' : st === 'error' ? '!' : ''}
            </span>
            <span className={st === 'done' ? 'text-slate-700' : st === 'active' ? 'font-medium text-navy-900' : st === 'error' ? 'text-red-700' : 'text-slate-400'}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
