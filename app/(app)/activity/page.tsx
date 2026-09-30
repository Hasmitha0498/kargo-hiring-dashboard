import Link from 'next/link';
import { listActivity, listCandidates, listPrivate } from '@/lib/db/repo';
import { displayName } from '@/lib/views';

export const dynamic = 'force-dynamic';

const LABEL: Record<string, string> = {
  CANDIDATE_UPLOADED: 'CV uploaded',
  CANDIDATE_SCORED: 'Scored',
  EVALUATION_RETRIED: 'Evaluation retried / re-run',
  OUTPUTS_RETRIED: 'Outputs retried',
  FOUNDER_DECISION: 'Founder decision',
  SHORTLIST_OVERRIDE: 'Shortlist override',
  EMAIL_SENT: 'Email sent',
  EMAIL_FAILED: 'Email failed',
  PRIVATE_DETAILS_EDITED: 'Private details corrected',
  CANDIDATE_DELETED: 'Candidate deleted',
  RUBRIC_DRAFT_CREATED: 'Rubric draft created',
  RUBRIC_DRAFT_EDITED: 'Rubric draft edited',
  RUBRIC_DRAFT_DISCARDED: 'Rubric draft discarded',
  RUBRIC_APPROVED: 'Rubric approved',
  CALIBRATION_FAILED: 'Calibration failed',
  CALIBRATION_HIRE_ADDED: 'Calibration hire added',
  CALIBRATION_HIRE_REMOVED: 'Calibration hire removed',
  JD_UPDATED: 'Job description updated',
};

function describe(detail: Record<string, unknown>): string {
  return Object.entries(detail)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${typeof v === 'number' ? Math.round(v * 10) / 10 : Array.isArray(v) ? v.join(', ') : String(v)}`)
    .join(' · ');
}

export default async function ActivityPage() {
  const [events, candidates] = await Promise.all([listActivity(300), listCandidates()]);
  const privates = await listPrivate(candidates.map((c) => c.id));
  const name = (id: string | null) => {
    const c = id ? candidates.find((x) => x.id === id) : null;
    return c ? displayName(privates.find((p) => p.candidate_id === c.id), c.original_file_name) : null;
  };
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-navy-900">Activity</h1>
        <p className="text-sm text-slate-500">Audit trail of uploads, scoring, decisions, rubric changes and emails (latest 300).</p>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Event</th>
              <th className="px-3 py-2">Candidate</th>
              <th className="px-3 py-2">Details</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-slate-500">
                  No activity yet.
                </td>
              </tr>
            )}
            {events.map((e) => (
              <tr key={e.id} className="border-t border-line align-top">
                <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">{new Date(e.created_at).toLocaleString()}</td>
                <td className="px-3 py-2 font-medium text-slate-800">{LABEL[e.event_type] ?? e.event_type}</td>
                <td className="px-3 py-2">
                  {e.candidate_id && name(e.candidate_id) ? (
                    <Link className="text-navy-900 hover:underline" href={`/candidates/${e.candidate_id}`}>
                      {name(e.candidate_id)}
                    </Link>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-slate-600">{describe(e.detail)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
