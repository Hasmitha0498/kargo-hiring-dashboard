import Link from 'next/link';
import { listActivity, listCandidates, listPrivate, type ActivityRow } from '@/lib/db/repo';
import { formatDate } from '@/lib/format';
import { displayName } from '@/lib/views';

export const dynamic = 'force-dynamic';

type Filter = 'all' | 'uploads' | 'decisions' | 'emails';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'uploads', label: 'Uploads' },
  { key: 'decisions', label: 'Decisions' },
  { key: 'emails', label: 'Emails' },
];

const num = (v: unknown) => (typeof v === 'number' ? (Math.round(v * 10) / 10).toFixed(1) : '');
const roleName = (v: unknown) => (v === 'PM' ? 'Product Manager' : v === 'SPM' ? 'Senior Product Manager' : '');

/** Turns a stored event into one founder-readable line. Returns null for internal events not worth showing. */
function describe(e: ActivityRow): { group: Exclude<Filter, 'all'> | 'rubric'; text: string; tone?: 'good' | 'bad' } | null {
  const d = e.detail as Record<string, unknown>;
  switch (e.event_type) {
    case 'CANDIDATE_UPLOADED':
      return { group: 'uploads', text: `CV uploaded for ${roleName(d.applied_role)}` };
    case 'CANDIDATE_SCORED':
      return { group: 'uploads', text: `Candidate analysed · PM ${num(d.pm)} · SPM ${num(d.spm)} (rubric v${d.rubric_version})`, tone: 'good' };
    case 'ANALYSIS_FAILED':
      return { group: 'uploads', text: `Analysis failed: ${String(d.message ?? '')} Candidate saved.`, tone: 'bad' };
    case 'FOUNDER_DECISION': {
      const label = d.decision === 'INTERVIEW' ? 'Interview' : d.decision === 'REJECT' ? 'Reject' : d.decision === 'HOLD' ? 'Hold' : null;
      return { group: 'decisions', text: label ? `Founder selected ${label}${d.overrides_ai ? ' (different from the system recommendation)' : ''}` : 'Founder cleared the decision' };
    }
    case 'SHORTLIST_OVERRIDE':
      return { group: 'decisions', text: d.override === 'IN' ? 'Added to shortlist by founder' : d.override === 'OUT' ? 'Removed from shortlist by founder' : 'Shortlist reset to the system recommendation' };
    case 'EMAIL_SENT':
      return { group: 'emails', text: `${d.message_type === 'INTERVIEW_INVITE' ? 'Interview invitation' : 'Warm rejection'} sent${d.test_mode ? ' (test inbox)' : ''}`, tone: 'good' };
    case 'EMAIL_FAILED':
      return { group: 'emails', text: `Email could not be sent: ${String(d.error ?? '')}`, tone: 'bad' };
    case 'RUBRIC_APPROVED':
      return { group: 'rubric', text: `Hiring rubric v${d.version} approved${d.replaced_version ? ` (replaced v${d.replaced_version})` : ''}` };
    case 'CANDIDATE_DELETED':
      return { group: 'uploads', text: 'A candidate was deleted' };
    default:
      return null; // retries, draft edits, setup changes: kept in the database, not shown here
  }
}

const time = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true });

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { filter: f } = await searchParams;
  const filter: Filter = FILTERS.some((x) => x.key === f) ? (f as Filter) : 'all';
  const [events, candidates] = await Promise.all([listActivity(400), listCandidates()]);
  const privates = await listPrivate(candidates.map((c) => c.id));
  const name = (id: string | null) => {
    const c = id ? candidates.find((x) => x.id === id) : null;
    return c ? displayName(privates.find((p) => p.candidate_id === c.id), c.original_file_name) : null;
  };
  const rows = events
    .map((e) => ({ e, info: describe(e) }))
    .filter((r): r is { e: ActivityRow; info: NonNullable<ReturnType<typeof describe>> } => r.info !== null)
    .filter((r) => filter === 'all' || r.info.group === filter)
    // Repeated clicks (same candidate, same event, within 10 minutes) show once.
    .filter((r, i, all) => {
      const prev = all[i - 1];
      return !(prev && prev.e.candidate_id === r.e.candidate_id && prev.info.text === r.info.text && Math.abs(new Date(prev.e.created_at).getTime() - new Date(r.e.created_at).getTime()) < 10 * 60_000);
    });
  const days = new Map<string, typeof rows>();
  for (const r of rows) {
    const day = formatDate(r.e.created_at);
    days.set(day, [...(days.get(day) ?? []), r]);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">Activity</h1>
        <p className="text-sm text-slate-500">What has happened to each candidate, newest first.</p>
      </div>
      <div className="flex gap-1">
        {FILTERS.map((x) => (
          <Link
            key={x.key}
            href={x.key === 'all' ? '/activity' : `/activity?filter=${x.key}`}
            className={`rounded-full px-3 py-1 text-sm ${filter === x.key ? 'bg-navy-900 text-white' : 'bg-white text-slate-600 ring-1 ring-line hover:bg-slate-50'}`}
          >
            {x.label}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="font-medium text-navy-900">No activity yet.</p>
          <p className="mt-1 text-sm text-slate-500">Uploads, decisions and emails will appear here.</p>
          <Link href="/upload" className="btn-primary mt-4 px-4 py-2">
            Upload Candidate
          </Link>
        </div>
      ) : (
        [...days.entries()].map(([day, items]) => (
          <section key={day}>
            <h2 className="section-title mb-2">{day}</h2>
            <ul className="card divide-y divide-line">
              {items.map(({ e, info }) => {
                const who = name(e.candidate_id);
                return (
                  <li key={e.id} className="flex gap-4 px-4 py-3 text-sm">
                    <span className="w-20 shrink-0 text-xs tabular-nums text-slate-400">{time.format(new Date(e.created_at))}</span>
                    <div className="min-w-0">
                      {who && (
                        <Link href={`/candidates/${e.candidate_id}`} className="font-medium text-navy-900 hover:underline">
                          {who}
                        </Link>
                      )}
                      <p className={info.tone === 'bad' ? 'text-red-700' : info.tone === 'good' ? 'text-slate-800' : 'text-slate-600'}>{info.text}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
