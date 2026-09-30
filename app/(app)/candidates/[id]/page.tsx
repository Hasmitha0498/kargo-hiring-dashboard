import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/badges';
import { DecisionPanel, DeleteCandidate, EmailPanel, PrivateDetails, ProcessPanel, ShortlistControl } from '@/components/candidate/Actions';
import { EvaluationTabs } from '@/components/candidate/EvaluationTabs';
import { ScoreLabel } from '@/components/ScoreLabel';
import { StepIndicator } from '@/components/StepIndicator';
import { IN_PROGRESS_STATUSES, ROLE_LABEL, type Role } from '@/lib/domain';
import { env } from '@/lib/env';
import { formatDateTime } from '@/lib/format';
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
  const appliedData = roleData(applied);
  const otherData = roleData(other);
  const scoredVersion = appliedData.rubricVersion;
  const outdated = scoredVersion !== null && d.activeRubricVersion !== null && scoredVersion !== d.activeRubricVersion;
  const stale = IN_PROGRESS_STATUSES.includes(c.processing_status) && Date.now() - new Date(c.updated_at).getTime() > 5 * 60_000;
  const failed = c.processing_status === 'AI_FAILED' || c.processing_status === 'PARSE_FAILED';
  // Consistency guard: a candidate is only "analysed" when scores AND their breakdown exist for the applied role.
  const incomplete = !failed && !stale && (c.processing_status === 'READY' || c.processing_status === 'EMAIL_SENT') && (appliedData.total === null || appliedData.rows.length === 0 || !outputs);
  const sent = d.emails.find((e) => e.status === 'SENT');
  const lastFailure = d.emails.find((e) => e.status === 'FAILED');
  const name = displayName(priv ?? undefined, c.original_file_name);
  const analysed = appliedData.total !== null && appliedData.rows.length > 0;

  const status = failed
    ? c.processing_status === 'PARSE_FAILED'
      ? 'CV could not be read'
      : 'Analysis failed: candidate saved'
    : IN_PROGRESS_STATUSES.includes(c.processing_status)
      ? stale
        ? 'Analysis stopped before finishing'
        : 'Analysing…'
      : sent
        ? `Email sent ${formatDateTime(sent.sent_at)}`
        : d.currentDecision === 'UNDECIDED'
          ? 'Awaiting decision'
          : d.currentDecision === 'HOLD'
            ? 'On hold'
            : `Decision: ${d.currentDecision === 'INTERVIEW' ? 'Interview' : 'Reject'} · email not sent`;
  const step = sent ? 5 : d.currentDecision === 'INTERVIEW' || d.currentDecision === 'REJECT' ? 5 : analysed ? (d.currentDecision === 'HOLD' ? 4 : 3) : 2;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={applied === 'PM' ? '/dashboard' : '/dashboard?role=SPM'} className="text-sm text-slate-500 hover:text-navy-900">
          ← {ROLE_LABEL[applied]} ranking
        </Link>
        <StepIndicator current={step as 1 | 2 | 3 | 4 | 5} />
      </div>

      {/* A. Candidate summary */}
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-navy-900">{name}</h1>
            <p className="mt-1 text-sm text-slate-600">
              Applied for <span className="font-medium text-slate-800">{ROLE_LABEL[applied]}</span>
              {d.rank && (
                <>
                  {' · '}Rank #{d.rank} of {d.applicants} {applied} applicants
                </>
              )}
            </p>
            <p className="mt-2 text-sm">
              <span className="text-slate-500">Status: </span>
              <span className={`font-medium ${failed || stale ? 'text-red-700' : sent ? 'text-violet-800' : 'text-navy-900'}`}>{status}</span>
            </p>
            {analysed && (
              <div className="mt-2">
                <ShortlistControl candidateId={c.id} recommended={d.recommended} override={c.shortlist_override} />
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              {priv?.email && <span>{priv.email}</span>}
              {priv?.phone && <span>{priv.phone}</span>}
              {priv?.linkedin_url && <span>{priv.linkedin_url}</span>}
              {priv?.address && <span>{priv.address}</span>}
              <PrivateDetails candidateId={c.id} name={priv?.candidate_name ?? null} email={priv?.email ?? null} />
            </div>
          </div>
          {analysed && (
            <div className="rounded-lg border border-line bg-slate-50 px-5 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{applied} score (applied role)</div>
              <ScoreLabel score={appliedData.total} size="lg" />
              <div className="mt-2 border-t border-line pt-2 text-xs text-slate-500">
                Secondary score: {other} {displayScore(otherData.total)}
                {scoredVersion !== null && <> · rubric v{scoredVersion}</>}
              </div>
            </div>
          )}
        </div>

        {(failed || stale || incomplete) && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-800">
              {c.processing_status === 'PARSE_FAILED'
                ? 'The CV file could not be read.'
                : incomplete
                  ? 'Some analysis results are missing.'
                  : stale
                    ? 'Analysis stopped before finishing.'
                    : c.failed_stage === 'GENERATING_OUTPUTS'
                      ? 'The interview brief or email draft could not be prepared.'
                      : 'AI scoring failed.'}
            </p>
            <p className="mt-0.5 text-sm text-red-700">
              {c.error_message ?? ''} {c.processing_status === 'PARSE_FAILED' ? 'Upload a readable PDF, DOCX or TXT copy instead.' : 'Your candidate has been saved; you do not need to upload the CV again.'}
            </p>
            {c.processing_status !== 'PARSE_FAILED' && (
              <div className="mt-3">
                <ProcessPanel candidateId={c.id} mode={incomplete ? 'score' : 'auto'} label={c.failed_stage === 'GENERATING_OUTPUTS' ? 'Retry' : 'Retry Scoring'} />
              </div>
            )}
          </div>
        )}
        {outdated && !failed && (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4">
            <ProcessPanel
              candidateId={c.id}
              mode="score"
              label={`Re-score with the current rubric (v${d.activeRubricVersion})`}
              note={`These scores use rubric v${scoredVersion}. The earlier result is kept in the audit trail.`}
            />
          </div>
        )}
      </section>

      {/* B. Why this candidate ranked here */}
      {analysed && <EvaluationTabs applied={appliedData} other={otherData} />}

      {/* C. Interview brief */}
      {outputs && (
        <section className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-navy-900">Interview brief</h2>
            {d.shortlisted ? <Badge color="navy">Shortlisted</Badge> : <Badge>For reference: not in the shortlist</Badge>}
          </div>
          <dl className="mt-3 space-y-4 text-[15px] leading-relaxed">
            <div>
              <dt className="section-title">{d.shortlisted ? 'Why they ranked high' : 'Strongest evidence'}</dt>
              <dd className="mt-1 text-slate-800">{outputs.interview_brief}</dd>
            </div>
            <div>
              <dt className="section-title">What is uncertain</dt>
              <dd className="mt-1 text-slate-800">{outputs.uncertainty}</dd>
            </div>
            <div className="rounded-md border-l-4 border-navy-700 bg-slate-50 p-3">
              <dt className="section-title">What to probe</dt>
              <dd className="mt-1 font-medium text-navy-900">“{outputs.interview_probe}”</dd>
            </div>
          </dl>
        </section>
      )}

      {/* D. Founder decision */}
      {analysed && (
        <DecisionPanel
          candidateId={c.id}
          current={d.currentDecision}
          suggestion={d.suggestedAction}
          emailSent={Boolean(sent)}
          history={d.decisions.map((h) => ({ founder_decision: h.founder_decision, ai_suggested_action: h.ai_suggested_action, decision_notes: h.decision_notes, decided_at: h.decided_at }))}
        />
      )}

      {/* E. Email */}
      {analysed && (
        <EmailPanel
          key={`${d.currentDecision}-${outputs?.email_type}-${outputs?.updated_at}-${sent?.id}`}
          candidateId={c.id}
          candidateName={name}
          decision={d.currentDecision}
          draft={outputs ? { type: outputs.email_type, subject: outputs.email_subject, body: outputs.email_body } : null}
          aiDrafts={outputs ? { invite: { subject: outputs.invite_subject, body: outputs.invite_body }, rejection: { subject: outputs.rejection_subject, body: outputs.rejection_body } } : null}
          firstName={firstName(priv?.candidate_name)}
          candidateEmail={priv?.email ?? null}
          testEmail={env.resendTestEmail() ?? null}
          sent={sent ? { recipient: sent.recipient, intended: sent.intended_recipient, testMode: sent.test_mode, sentAt: sent.sent_at, providerId: sent.provider_message_id, type: sent.message_type } : null}
          lastFailure={lastFailure && !sent ? { at: lastFailure.created_at, error: lastFailure.error_message } : null}
        />
      )}

      <details className="card p-4 text-sm">
        <summary className="cursor-pointer font-medium text-navy-900">CV text used for evaluation (contact details removed)</summary>
        <pre className="mt-3 max-h-[480px] overflow-y-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-700">{c.professional_cv_text ?? 'No text could be extracted from this file.'}</pre>
      </details>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <span>
          File: {c.original_file_name} · uploaded {formatDateTime(c.created_at)}
          {d.evaluationsCount > 1 && <> · {d.evaluationsCount} evaluations on record</>}
        </span>
        <DeleteCandidate candidateId={c.id} />
      </div>
    </div>
  );
}
