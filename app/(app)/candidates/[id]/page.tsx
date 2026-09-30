import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, DecisionBadge, StatusBadge } from '@/components/badges';
import { DecisionPanel, DeleteCandidate, EmailPanel, PrivateDetails, ProcessPanel, ShortlistControl } from '@/components/candidate/Actions';
import { EvaluationTabs } from '@/components/candidate/EvaluationTabs';
import { IN_PROGRESS_STATUSES, ROLE_LABEL, type Role } from '@/lib/domain';
import { env } from '@/lib/env';
import { firstName } from '@/lib/parse/identity';
import { displayScore } from '@/lib/scoring/calculate';
import { candidateDetail, displayName } from '@/lib/views';

export const dynamic = 'force-dynamic';

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await candidateDetail(id);
  if (!d) notFound();
  const { candidate: c, priv, outputs } = d;
  const applied: Role = c.applied_role;
  const other: Role = applied === 'PM' ? 'SPM' : 'PM';
  const roleData = (role: Role) => {
    const x = role === 'PM' ? d.pm : d.spm;
    return { role, total: x.roleScore?.total_score ?? null, rubricVersion: x.roleScore?.rubric_version ?? null, model: x.evaluation?.model ?? null, evaluatedAt: x.evaluation?.created_at ?? null, rows: x.rows };
  };
  const appliedScore = (applied === 'PM' ? d.pm : d.spm).roleScore;
  const scoredVersion = appliedScore?.rubric_version ?? null;
  const outdated = scoredVersion !== null && d.activeRubricVersion !== null && scoredVersion !== d.activeRubricVersion;
  const failed = c.processing_status === 'AI_FAILED' || c.processing_status === 'PARSE_FAILED';
  const stale = IN_PROGRESS_STATUSES.includes(c.processing_status) && Date.now() - new Date(c.updated_at).getTime() > 5 * 60_000;
  const sent = d.emails.find((e) => e.status === 'SENT');
  const name = displayName(priv ?? undefined, c.original_file_name);

  return (
    <div className="space-y-5">
      <div className="text-xs text-slate-500">
        <Link href={applied === 'PM' ? '/' : '/?role=SPM'} className="hover:underline">
          ← {ROLE_LABEL[applied]} ranking
        </Link>
      </div>

      {/* Header */}
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-navy-900">{name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <span>Applied for {ROLE_LABEL[applied]}</span>
              <StatusBadge status={c.processing_status} stale={stale} />
              <DecisionBadge decision={d.currentDecision} />
              {scoredVersion !== null && <Badge color={outdated ? 'amber' : 'slate'}>Scored with rubric v{scoredVersion}</Badge>}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              {priv?.email && <span>{priv.email}</span>}
              {priv?.phone && <span>{priv.phone}</span>}
              {priv?.linkedin_url && <span>{priv.linkedin_url}</span>}
              {priv?.github_url && <span>{priv.github_url}</span>}
              {priv?.portfolio_url && <span>{priv.portfolio_url}</span>}
              {priv?.address && <span>{priv.address}</span>}
              <span>File: {c.original_file_name}</span>
            </div>
            <div className="mt-1">
              <PrivateDetails candidateId={c.id} name={priv?.candidate_name ?? null} email={priv?.email ?? null} />
            </div>
          </div>
          <div className="flex gap-3">
            {(['PM', 'SPM'] as Role[]).map((r) => {
              const rs = (r === 'PM' ? d.pm : d.spm).roleScore;
              return (
                <div key={r} className={`rounded-lg border px-4 py-2 text-center ${r === applied ? 'border-navy-900 bg-navy-900 text-white' : 'border-line bg-slate-50 text-slate-700'}`}>
                  <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
                    {r} score{r === applied ? ' · applied' : ''}
                  </div>
                  <div className="text-2xl font-semibold tabular-nums">{displayScore(rs?.total_score)}</div>
                  <div className="text-[11px] opacity-70">{r === applied ? (d.rank ? `Rank ${d.rank} of ${d.applicants}` : 'Not ranked yet') : 'information only'}</div>
                </div>
              );
            })}
          </div>
        </div>

        {(failed || stale) && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3">
            <p className="mb-2 text-sm text-red-800">
              {stale ? 'Processing stopped without finishing (for example, the upload tab was closed).' : c.error_message ?? 'Processing failed.'} The CV and everything completed so far are saved.
            </p>
            {c.processing_status !== 'PARSE_FAILED' && <ProcessPanel candidateId={c.id} mode="auto" label={c.failed_stage === 'GENERATING_OUTPUTS' ? 'Retry outputs' : 'Retry evaluation'} />}
          </div>
        )}
        {outdated && !failed && (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
            <ProcessPanel
              candidateId={c.id}
              mode="score"
              label={`Re-evaluate with rubric v${d.activeRubricVersion}`}
              note={`Scored with v${scoredVersion}. Re-evaluating creates a new evaluation; the v${scoredVersion} result stays in the audit trail.`}
            />
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-[1fr_400px]">
        <div className="min-w-0 space-y-5">
          {appliedScore ? (
            <EvaluationTabs applied={roleData(applied)} other={roleData(other)} />
          ) : (
            <section className="card p-5 text-sm text-slate-500">Not scored yet.</section>
          )}

          <section className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-navy-900">Interview brief</h2>
              {d.shortlisted ? <Badge color="navy">Shortlisted</Badge> : <Badge>Not shortlisted: brief for reference</Badge>}
            </div>
            {outputs ? (
              <dl className="mt-3 space-y-3 text-sm">
                <div>
                  <dt className="section-title">Why they ranked here</dt>
                  <dd className="mt-0.5 text-slate-800">{outputs.interview_brief}</dd>
                </div>
                <div>
                  <dt className="section-title">What remains uncertain</dt>
                  <dd className="mt-0.5 text-slate-800">{outputs.uncertainty}</dd>
                </div>
                <div className="rounded-md border-l-4 border-navy-700 bg-slate-50 p-3">
                  <dt className="section-title">What to probe</dt>
                  <dd className="mt-0.5 font-medium text-navy-900">{outputs.interview_probe}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-2 text-sm text-slate-500">Generated after scoring.</p>
            )}
          </section>

          <details className="card p-4 text-sm">
            <summary className="cursor-pointer font-semibold text-navy-900">Professional CV text sent to the AI (identity removed)</summary>
            <pre className="mt-3 max-h-[480px] overflow-y-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-700">{c.professional_cv_text ?? 'No text extracted.'}</pre>
          </details>
        </div>

        <div className="space-y-5">
          {appliedScore && (
            <section className="card p-4">
              <h2 className="mb-2 text-sm font-semibold text-navy-900">Shortlist</h2>
              <ShortlistControl candidateId={c.id} recommended={d.recommended} override={c.shortlist_override} />
            </section>
          )}
          <DecisionPanel
            candidateId={c.id}
            current={d.currentDecision}
            suggestion={d.suggestedAction}
            history={d.decisions.map((h) => ({ founder_decision: h.founder_decision, ai_suggested_action: h.ai_suggested_action, decision_notes: h.decision_notes, decided_at: h.decided_at }))}
          />
          <EmailPanel
            key={`${d.currentDecision}-${outputs?.email_type}-${outputs?.updated_at}-${sent?.id}`}
            candidateId={c.id}
            decision={d.currentDecision}
            draft={outputs ? { type: outputs.email_type, subject: outputs.email_subject, body: outputs.email_body } : null}
            aiDrafts={outputs ? { invite: { subject: outputs.invite_subject, body: outputs.invite_body }, rejection: { subject: outputs.rejection_subject, body: outputs.rejection_body } } : null}
            firstName={firstName(priv?.candidate_name)}
            candidateEmail={priv?.email ?? null}
            testEmail={env.resendTestEmail() ?? null}
            sent={sent ? { recipient: sent.recipient, intended: sent.intended_recipient, testMode: sent.test_mode, sentAt: sent.sent_at, providerId: sent.provider_message_id, type: sent.message_type } : null}
            failures={d.emails.filter((e) => e.status === 'FAILED').map((e) => ({ at: e.created_at, error: e.error_message }))}
          />
          <div className="text-right text-xs text-slate-400">
            {d.evaluationsCount > 1 && <span className="mr-3">{d.evaluationsCount} evaluations on record</span>}
            <DeleteCandidate candidateId={c.id} />
          </div>
        </div>
      </div>
    </div>
  );
}
