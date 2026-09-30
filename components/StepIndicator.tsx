const STEPS = ['Upload', 'Analyse', 'Review', 'Decide', 'Send'];

/** The five-step journey, shown on upload and candidate pages only. */
export function StepIndicator({ current }: { current: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {STEPS.map((s, i) => {
        const n = i + 1;
        const state = n < current ? 'done' : n === current ? 'now' : 'next';
        return (
          <li key={s} className="flex items-center gap-2">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                state === 'done' ? 'bg-emerald-500 text-white' : state === 'now' ? 'bg-navy-900 text-white' : 'bg-slate-200 text-slate-500'
              }`}
            >
              {state === 'done' ? '✓' : n}
            </span>
            <span className={state === 'now' ? 'font-semibold text-navy-900' : 'text-slate-500'}>{s}</span>
            {n < STEPS.length && <span className="text-slate-300">—</span>}
          </li>
        );
      })}
    </ol>
  );
}
