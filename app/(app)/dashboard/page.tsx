import Link from 'next/link';
import { Badge, DecisionBadge, EmailStatusBadge, StatusBadge } from '@/components/badges';
import { ClickableRow } from '@/components/ClickableRow';
import { ScoreLabel } from '@/components/ScoreLabel';
import { getActiveRubric } from '@/lib/db/repo';
import { ROLE_LABEL, SHORTLIST_SIZE, type Role } from '@/lib/domain';
import { candidateList, failedUploads, rankedForRole, summary, type CandidateListItem } from '@/lib/views';

export const dynamic = 'force-dynamic';

function Stat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="card px-4 py-3" title={hint}>
      <div className="text-2xl font-semibold tabular-nums text-navy-900">{value}</div>
      <div className="text-xs font-medium text-slate-500">{label}</div>
    </div>
  );
}

function ShortlistTag({ c }: { c: CandidateListItem }) {
  if (c.override === 'IN') return <Badge color="navy">Shortlisted by you</Badge>;
  if (c.override === 'OUT') return <Badge>Removed from shortlist</Badge>;
  if (c.recommended) return <Badge color="blue">Shortlist recommended</Badge>;
  return null;
}

function Processing({ c }: { c: CandidateListItem }) {
  if (c.status === 'READY' || c.status === 'EMAIL_SENT') return null;
  return <StatusBadge status={c.status} stale={c.stale} />;
}

function Row({ c, outdated }: { c: CandidateListItem; outdated: boolean }) {
  return (
    <ClickableRow href={`/candidates/${c.id}`} className="border-t border-line align-top hover:bg-slate-50">
      <td className="px-3 py-3 text-sm font-semibold tabular-nums text-navy-900">{c.rank ? `#${c.rank}` : '—'}</td>
      <td className="px-3 py-3">
        <Link href={`/candidates/${c.id}`} className="font-medium text-navy-900 hover:underline">
          {c.name}
        </Link>
        <div className="mt-1 flex flex-wrap gap-1">
          <ShortlistTag c={c} />
          <Processing c={c} />
          {outdated && <Badge color="amber">Older rubric v{c.rubricVersion}</Badge>}
        </div>
      </td>
      <td className="px-3 py-3 text-sm text-slate-600">{ROLE_LABEL[c.appliedRole]}</td>
      <td className="px-3 py-3">
        <ScoreLabel score={c.appliedTotal} />
      </td>
      <td className="px-3 py-3 text-sm text-slate-700">{c.strongest?.name ?? <span className="text-slate-400">No strong signal yet</span>}</td>
      <td className="px-3 py-3 text-sm text-slate-700">{c.gap?.name ?? '—'}</td>
      <td className="px-3 py-3">{c.decision === 'UNDECIDED' ? <span className="text-sm text-slate-500">Pending</span> : <DecisionBadge decision={c.decision} />}</td>
      <td className="px-3 py-3">
        <EmailStatusBadge status={c.emailStatus} />
      </td>
      <td className="px-3 py-3 text-right">
        <Link href={`/candidates/${c.id}`} className="whitespace-nowrap text-sm font-medium text-navy-900 hover:underline">
          View →
        </Link>
      </td>
    </ClickableRow>
  );
}

function MobileCard({ c }: { c: CandidateListItem }) {
  return (
    <Link href={`/candidates/${c.id}`} className="block border-t border-line p-4 hover:bg-slate-50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-navy-900">
            <span className="mr-1.5 tabular-nums text-slate-500">{c.rank ? `#${c.rank}` : '—'}</span>
            {c.name}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            <ShortlistTag c={c} />
            <Processing c={c} />
            {c.decision !== 'UNDECIDED' && <DecisionBadge decision={c.decision} />}
            {c.emailStatus === 'SENT' && <EmailStatusBadge status="SENT" />}
          </div>
        </div>
        <ScoreLabel score={c.appliedTotal} />
      </div>
      {c.strongest && (
        <p className="mt-2 text-xs text-slate-600">
          <span className="font-semibold">Strongest:</span> {c.strongest.name}
          {c.gap && (
            <>
              {' · '}
              <span className="font-semibold">Gap:</span> {c.gap.name}
            </>
          )}
        </p>
      )}
    </Link>
  );
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const { role: roleParam } = await searchParams;
  const role: Role = roleParam === 'SPM' ? 'SPM' : 'PM';
  const [items, active] = await Promise.all([candidateList(), getActiveRubric()]);
  const s = summary(items);
  const { scored, unscored } = rankedForRole(items, role);
  const rows = [...scored, ...unscored];
  const failed = failedUploads(items);
  const outdated = (c: CandidateListItem) => active !== null && c.rubricVersion !== null && c.rubricVersion !== active.version;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-navy-900">Kargo Hiring Dashboard</h1>
          <p className="text-sm text-slate-500">Review evidence-based PM and SPM recommendations. The system recommends; you decide.</p>
        </div>
        <Link href="/upload" className="btn-primary px-4 py-2">
          + Upload Candidate
        </Link>
      </div>

      {!active && (
        <div className="card border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          The hiring rubric hasn&apos;t been configured, so new CVs can&apos;t be scored yet.{' '}
          <Link className="font-semibold underline" href="/rubric">
            Set up the rubric
          </Link>
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Total Candidates" value={s.total} hint="Every analysed CV (failed uploads excluded)" />
        <Stat label="PM Applicants" value={s.pm} hint="Applied for Product Manager" />
        <Stat label="SPM Applicants" value={s.spm} hint="Applied for Senior Product Manager" />
        <Stat label="Awaiting Decision" value={s.awaitingReview} hint="Analysed, but you have not chosen Interview, Hold or Reject" />
        <Stat label="Shortlisted" value={s.shortlisted} hint={`Top ${SHORTLIST_SIZE} per role, after your changes`} />
        <Stat label="Emails Sent" value={s.emailsSent} hint="Confirmed and delivered through Resend" />
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-x-4 border-b border-line px-4 pt-3">
          <div className="flex gap-1">
            {(['PM', 'SPM'] as Role[]).map((r) => (
              <Link
                key={r}
                href={r === 'PM' ? '/dashboard' : '/dashboard?role=SPM'}
                className={`-mb-px border-b-2 px-3 pb-2.5 text-sm font-medium ${r === role ? 'border-navy-900 text-navy-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
              >
                {ROLE_LABEL[r]} <span className="ml-1 rounded-full bg-slate-100 px-1.5 text-xs text-slate-500">{r === 'PM' ? s.pm : s.spm}</span>
              </Link>
            ))}
          </div>
          <p className="pb-2.5 text-xs text-slate-500">
            {ROLE_LABEL[role]} applicants only, ranked by {role} score. Top {SHORTLIST_SIZE} are recommended for interview.
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="p-12 text-center">
            <p className="font-medium text-navy-900">No {ROLE_LABEL[role]} candidates yet.</p>
            <p className="mt-1 text-sm text-slate-500">Upload a CV and it will appear here, ranked by evidence.</p>
            <Link href="/upload" className="btn-primary mt-4 px-4 py-2">
              Upload your first candidate
            </Link>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Rank</th>
                    <th className="px-3 py-2">Candidate</th>
                    <th className="px-3 py-2">Applied Role</th>
                    <th className="px-3 py-2">Score</th>
                    <th className="px-3 py-2">Strongest Signal</th>
                    <th className="px-3 py-2">Primary Gap</th>
                    <th className="px-3 py-2">Decision</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <Row key={c.id} c={c} outdated={outdated(c)} />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="md:hidden">
              {rows.map((c) => (
                <MobileCard key={c.id} c={c} />
              ))}
            </div>
          </>
        )}
      </section>

      {failed.length > 0 && (
        <details className="card p-4 text-sm">
          <summary className="cursor-pointer font-medium text-red-700">
            {failed.length} upload{failed.length > 1 ? 's' : ''} could not be read
          </summary>
          <ul className="mt-2 divide-y divide-line">
            {failed.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-slate-600">
                  <span className="font-medium text-slate-800">{f.fileName}</span> · {ROLE_LABEL[f.appliedRole]} · {f.errorMessage}
                </span>
                <Link href={`/candidates/${f.id}`} className="text-sm text-navy-900 hover:underline">
                  Details →
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
