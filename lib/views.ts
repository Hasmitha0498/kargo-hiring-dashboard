// Read models for pages: joins identity back onto results AFTER scoring, for display to the signed-in founder only.
import 'server-only';
import { IN_PROGRESS_STATUSES, type FounderDecision, type Role, type SuggestedAction } from './domain';
import * as repo from './db/repo';
import { isShortlisted, isShortlistRecommended, primaryGap, strongestCriterion } from './scoring/calculate';
import { suggestedActionFor } from './pipeline/process';

export interface CandidateListItem {
  id: string;
  name: string;
  fileName: string;
  appliedRole: Role;
  status: repo.CandidateRow['processing_status'];
  errorMessage: string | null;
  createdAt: string;
  pmTotal: number | null;
  spmTotal: number | null;
  appliedTotal: number | null;
  rank: number | null;
  rubricVersion: number | null;
  recommended: boolean;
  override: 'IN' | 'OUT' | null;
  shortlisted: boolean;
  strongest: { name: string; evidence: string } | null;
  gap: { name: string } | null;
  suggestedAction: SuggestedAction | null;
  decision: FounderDecision;
  emailStatus: 'SENT' | 'FAILED' | 'SENDING' | null;
  stale: boolean; // processing but not updated for a while (e.g. the tab was closed mid-run)
}

export function displayName(p: { candidate_name: string | null } | undefined, fileName: string): string {
  return p?.candidate_name?.trim() || `Unnamed (${fileName})`;
}

export async function candidateList(): Promise<CandidateListItem[]> {
  const candidates = await repo.listCandidates();
  const ids = candidates.map((c) => c.id);
  const [privates, roleScores, decisions, emails] = await Promise.all([repo.listPrivate(ids), repo.getRoleScores(ids), repo.getDecisions(ids), repo.getEmailEvents(ids)]);
  const appliedEvalIds = roleScores.filter((r) => candidates.find((c) => c.id === r.candidate_id)?.applied_role === r.role).map((r) => r.evaluation_id);
  const scores = await repo.getScoresForEvaluations([...new Set(appliedEvalIds)]);
  const now = Date.now();

  return candidates.map((c) => {
    const rs = roleScores.filter((r) => r.candidate_id === c.id);
    const applied = rs.find((r) => r.role === c.applied_role) ?? null;
    const mine = applied ? scores.filter((s) => s.evaluation_id === applied.evaluation_id && s.evaluated_role === c.applied_role) : [];
    const strongest = strongestCriterion(mine);
    const gap = primaryGap(mine);
    const email = emails.find((e) => e.candidate_id === c.id);
    const rank = applied?.rank ?? null;
    return {
      id: c.id,
      name: displayName(privates.find((p) => p.candidate_id === c.id), c.original_file_name),
      fileName: c.original_file_name,
      appliedRole: c.applied_role,
      status: c.processing_status,
      errorMessage: c.error_message,
      createdAt: c.created_at,
      pmTotal: rs.find((r) => r.role === 'PM')?.total_score ?? null,
      spmTotal: rs.find((r) => r.role === 'SPM')?.total_score ?? null,
      appliedTotal: applied?.total_score ?? null,
      rank,
      rubricVersion: applied?.rubric_version ?? null,
      recommended: isShortlistRecommended(rank),
      override: c.shortlist_override,
      shortlisted: applied ? isShortlisted(rank, c.shortlist_override) : false,
      strongest: strongest ? { name: strongest.criterion_name, evidence: strongest.evidence } : null,
      gap: gap ? { name: gap.criterion_name } : null,
      suggestedAction: applied ? suggestedActionFor(rank) : null,
      decision: decisions.find((d) => d.candidate_id === c.id)?.founder_decision ?? 'UNDECIDED',
      emailStatus: email?.status ?? null,
      stale: IN_PROGRESS_STATUSES.includes(c.processing_status) && now - new Date(c.updated_at).getTime() > 5 * 60_000,
    };
  });
}

/** Ranked list for one role: applicants for that role only, by that role's score (ties keep upload order). */
export function rankedForRole(items: CandidateListItem[], role: Role) {
  const mine = items.filter((i) => i.appliedRole === role && i.status !== 'PARSE_FAILED');
  const scored = mine.filter((i) => i.appliedTotal !== null).sort((a, b) => (a.rank ?? 9e9) - (b.rank ?? 9e9) || a.createdAt.localeCompare(b.createdAt));
  const unscored = mine.filter((i) => i.appliedTotal === null);
  return { scored, unscored };
}

/** Uploads whose file could not be read: not candidates yet, listed separately so they never distort counts. */
export const failedUploads = (items: CandidateListItem[]) => items.filter((i) => i.status === 'PARSE_FAILED');

export function summary(all: CandidateListItem[]) {
  const items = all.filter((i) => i.status !== 'PARSE_FAILED');
  return {
    total: items.length,
    pm: items.filter((i) => i.appliedRole === 'PM').length,
    spm: items.filter((i) => i.appliedRole === 'SPM').length,
    awaitingReview: items.filter((i) => (i.status === 'READY' || i.status === 'EMAIL_SENT') && i.decision === 'UNDECIDED').length,
    shortlisted: items.filter((i) => i.shortlisted).length,
    emailsSent: items.filter((i) => i.emailStatus === 'SENT').length,
  };
}

export async function candidateDetail(id: string) {
  const candidate = await repo.getCandidate(id);
  if (!candidate) return null;
  const [priv, roleScores, outputs, decisions, emails, evaluations, active, list] = await Promise.all([
    repo.getPrivate(id),
    repo.getRoleScores([id]),
    repo.getOutputs([id]),
    repo.getDecisions([id]),
    repo.getEmailEvents([id]),
    repo.getEvaluations(id),
    repo.getActiveRubric(),
    repo.listCandidates(),
  ]);
  const scores = await repo.getScoresForEvaluations([...new Set(roleScores.map((r) => r.evaluation_id))]);
  const byRole = (role: Role) => {
    const rs = roleScores.find((r) => r.role === role) ?? null;
    const rows = rs ? scores.filter((s) => s.evaluation_id === rs.evaluation_id && s.evaluated_role === role) : [];
    const evalRow = rs ? evaluations.find((e) => e.id === rs.evaluation_id) ?? null : null;
    return { roleScore: rs, rows: rows.sort((a, b) => b.criterion_weight - a.criterion_weight), evaluation: evalRow };
  };
  const applied = roleScores.find((r) => r.role === candidate.applied_role);
  const rank = applied?.rank ?? null;
  const applicants = list.filter((c) => c.applied_role === candidate.applied_role && c.processing_status !== 'PARSE_FAILED').length;
  return {
    candidate,
    priv,
    pm: byRole('PM'),
    spm: byRole('SPM'),
    outputs: outputs[0] ?? null,
    decisions,
    currentDecision: decisions[0]?.founder_decision ?? ('UNDECIDED' as FounderDecision),
    emails,
    evaluationsCount: evaluations.length,
    activeRubricVersion: active?.version ?? null,
    rank,
    applicants,
    recommended: applied ? isShortlistRecommended(rank) : false,
    shortlisted: applied ? isShortlisted(rank, candidate.shortlist_override) : false,
    suggestedAction: applied ? suggestedActionFor(rank) : null,
  };
}
export type CandidateDetail = NonNullable<Awaited<ReturnType<typeof candidateDetail>>>;
