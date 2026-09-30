import Link from 'next/link';
import { Badge, DecisionBadge, EmailStatusBadge, ShortlistBadge, StatusBadge } from '@/components/badges';
import { getActiveRubric } from '@/lib/db/repo';
import { ROLE_LABEL, SHORTLIST_SIZE, type Role } from '@/lib/domain';
import { displayScore } from '@/lib/scoring/calculate';
import { candidateList, rankedForRole, summary, type CandidateListItem } from '@/lib/views';

export const dynamic = 'force-dynamic';

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="card px-4 py-3" title={hint}>
      <div className="text-2xl font-semibold tabular-nums text-navy-900">{value}</div>
      <div className="text-xs font-medium text-slate-500">{label}</div>
    </div>
  );
}

function Row({ c, activeVersion }: { c: CandidateListItem; activeVersion: number | null }) {
  return (
    <tr className="border-t border-line align-top hover:bg-slate-50/70">
      <td className="px-3 py-3 text-sm font-semibold tabular-nums text-navy-900">{c.rank ?? '—'}</td>
      <td className="px-3 py-3">
        <Link href={`/candidates/${c.id}`} className="font-medium text-navy-900 hover:underline">
          {c.name}
        </Link>
        <div className="mt-0.5 flex flex-wrap gap-1">
          {c.status !== 'READY' && <StatusBadge status={c.status} stale={c.stale} />}
          {c.decision !== 'UNDECIDED' && <DecisionBadge decision={c.decision} />}
          {activeVersion !== null && c.rubricVersion !== null && c.rubricVersion !== activeVersion && (
            <Badge color="amber" title="Scored with an older rubric version. Open and re-evaluate to use the active rubric.">
              Rubric v{c.rubricVersion}
            </Badge>
          )}
        </div>
      </td>
      <td className="hidden px-3 py-3 text-xs text-slate-600 lg:table-cell">{c.appliedRole}</td>
      <td className="px-3 py-3 text-right">
        <div className="text-base font-semibold tabular-nums text-navy-900">{displayScore(c.appliedTotal)}</div>
        <div className="text-[11px] tabular-nums text-slate-400" title="Cross-role score (information only)">
          {c.appliedRole === 'PM' ? 'SPM' : 'PM'} {displayScore(c.appliedRole === 'PM' ? c.spmTotal : c.pmTotal)}
        </div>
      </td>
      <td className="hidden max-w-xs px-3 py-3 md:table-cell">
        {c.strongest ? (
          <>
            <div className="text-xs font-semibold text-slate-700">{c.strongest.name}</div>
            <div className="line-clamp-2 text-xs text-slate-500">{c.strongest.evidence}</div>
          </>
        ) : (
          <span className="text-xs text-slate-400">No strong evidence</span>
        )}
      </td>
      <td className="hidden px-3 py-3 text-xs text-slate-600 md:table-cell">{c.gap?.name ?? '—'}</td>
      <td className="px-3 py-3">
        <ShortlistBadge recommended={c.recommended} override={c.override} />
      </td>
      <td className="hidden px-3 py-3 sm:table-cell">
        <EmailStatusBadge status={c.emailStatus} />
      </td>
      <td className="px-3 py-3 text-right">
        <Link href={`/candidates/${c.id}`} className="btn-secondary text-xs">
          View
        </Link>
      </td>
    </tr>
  );
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const { role: roleParam } = await searchParams;
  const role: Role = roleParam === 'SPM' ? 'SPM' : 'PM';
  const [items, active] = await Promise.all([candidateList(), getActiveRubric()]);
  const s = summary(items);
  const { scored, unscored } = rankedForRole(items, role);
  const activeVersion = active?.version ?? null;

  return (
    <div className="space-y-5">
      {!active && (
        <div className="card border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          No approved rubric yet, so candidates cannot be scored. Go to{' '}
          <Link className="font-semibold underline" href="/calibration">
            Calibration
          </Link>{' '}
          to generate one, then review and approve it on the{' '}
          <Link className="font-semibold underline" href="/rubric">
            Rubric
          </Link>{' '}
          page.
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Total candidates" value={s.total} />
        <Stat label="PM candidates" value={s.pm} />
        <Stat label="SPM candidates" value={s.spm} />
        <Stat label="Awaiting review" value={s.awaitingReview} hint="Processed, no founder decision yet" />
        <Stat label="Shortlisted" value={s.shortlisted} hint="Recommended top 5 per role, after your overrides" />
        <Stat label="Emails sent" value={s.emailsSent} />
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 pt-3">
          <div className="flex gap-1">
            {(['PM', 'SPM'] as Role[]).map((r) => (
              <Link
                key={r}
                href={r === 'PM' ? '/' : '/?role=SPM'}
                className={`-mb-px border-b-2 px-3 pb-2.5 text-sm font-medium ${r === role ? 'border-navy-900 text-navy-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
              >
                {ROLE_LABEL[r]} <span className="ml-1 text-xs text-slate-400">{items.filter((i) => i.appliedRole === r).length}</span>
              </Link>
            ))}
          </div>
          <p className="pb-2.5 text-xs text-slate-500">
            Ranked by {role} score · top {SHORTLIST_SIZE} marked <span className="font-semibold">Shortlist recommended</span> · a recommendation, not a decision
            {activeVersion !== null && <> · active rubric v{activeVersion}</>}
          </p>
        </div>
        {scored.length === 0 && unscored.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No {ROLE_LABEL[role]} candidates yet.{' '}
            <Link href="/upload" className="font-medium text-navy-900 underline">
              Upload a CV
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Rank</th>
                  <th className="px-3 py-2">Candidate</th>
                  <th className="hidden px-3 py-2 lg:table-cell">Applied</th>
                  <th className="px-3 py-2 text-right">Role score</th>
                  <th className="hidden px-3 py-2 md:table-cell">Strongest evidence</th>
                  <th className="hidden px-3 py-2 md:table-cell">Primary gap</th>
                  <th className="px-3 py-2">Shortlist</th>
                  <th className="hidden px-3 py-2 sm:table-cell">Email</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {scored.map((c) => (
                  <Row key={c.id} c={c} activeVersion={activeVersion} />
                ))}
                {unscored.map((c) => (
                  <Row key={c.id} c={c} activeVersion={activeVersion} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
