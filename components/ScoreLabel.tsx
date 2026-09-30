import { displayScore, evidenceLevel } from '@/lib/scoring/calculate';

const TONE = { high: 'text-emerald-700', moderate: 'text-amber-700', limited: 'text-slate-500' };

/** "86.5 / 100" plus a neutral evidence label. Never a hiring verdict. */
export function ScoreLabel({ score, size = 'md' }: { score: number | null; size?: 'md' | 'lg' }) {
  const level = evidenceLevel(score);
  if (!level) return <span className="text-sm text-slate-400">Not scored</span>;
  return (
    <div>
      <div className={`font-semibold tabular-nums text-navy-900 ${size === 'lg' ? 'text-3xl' : 'text-base'}`}>
        {displayScore(score)}
        <span className={`font-normal text-slate-400 ${size === 'lg' ? 'text-base' : 'text-xs'}`}> / 100</span>
      </div>
      <div className={`text-xs ${TONE[level.tone]}`}>{level.label}</div>
    </div>
  );
}
