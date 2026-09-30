// All database reads and writes. Server-only.
import 'server-only';
import type {
  CalibrationPattern,
  Criterion,
  EmailType,
  FounderDecision,
  Outcome,
  ProcessingStatus,
  Role,
  Rubric,
  RubricWithCriteria,
  SuggestedAction,
} from '../domain';
import type { Identity } from '../parse/identity';
import type { CriterionResult, EvaluationResult } from '../ai/evaluate';
import { db, DbError, must } from './client';

// ------------------------------------------------------------------ row types

export interface CandidateRow {
  id: string;
  applied_role: Role;
  original_file_name: string;
  professional_cv_text: string | null;
  processing_status: ProcessingStatus;
  failed_stage: string | null;
  error_message: string | null;
  shortlist_override: 'IN' | 'OUT' | null;
  created_at: string;
  updated_at: string;
}

export interface PrivateRow {
  candidate_id: string;
  candidate_name: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  github_url: string | null;
  address: string | null;
  other_private_metadata: Record<string, string>;
}

export interface RoleScoreRow {
  candidate_id: string;
  evaluation_id: string;
  role: Role;
  rubric_version: number;
  total_score: number;
  rank: number | null;
}

export interface ScoreRow {
  id: string;
  evaluation_id: string;
  candidate_id: string;
  rubric_version: number;
  evaluated_role: Role;
  criterion_id: string;
  criterion_key: string;
  criterion_name: string;
  raw_score: number;
  criterion_weight: number;
  weighted_score: number;
  evidence: string;
  evidence_status: 'PRESENT' | 'ABSENT' | 'NEGATIVE';
  evidence_verified: boolean;
  reasoning: string;
  model: string;
  created_at: string;
}

export interface EvaluationRow {
  id: string;
  candidate_id: string;
  rubric_id: string;
  rubric_version: number;
  model: string;
  prompt_version: string;
  created_at: string;
}

export interface OutputsRow {
  candidate_id: string;
  evaluation_id: string | null;
  interview_brief: string;
  uncertainty: string;
  interview_probe: string;
  suggested_action: SuggestedAction;
  invite_subject: string;
  invite_body: string;
  rejection_subject: string;
  rejection_body: string;
  email_type: EmailType | null;
  email_subject: string | null;
  email_body: string | null;
  model: string;
  updated_at: string;
}

export interface DecisionRow {
  id: string;
  candidate_id: string;
  ai_suggested_action: SuggestedAction | null;
  founder_decision: FounderDecision;
  decision_notes: string | null;
  decided_at: string;
}

export interface EmailEventRow {
  id: string;
  candidate_id: string;
  recipient: string;
  intended_recipient: string | null;
  test_mode: boolean;
  message_type: EmailType;
  subject: string;
  body: string;
  provider_message_id: string | null;
  status: 'SENDING' | 'SENT' | 'FAILED';
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface CalibrationHireRow {
  id: string;
  private_label: string;
  role_hired: string;
  performance_outcome: Outcome;
  original_file_name: string | null;
  professional_text: string;
  notes: string | null;
  last_used_at: string | null;
  created_at: string;
}

export interface ActivityRow {
  id: string;
  event_type: string;
  candidate_id: string | null;
  rubric_id: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

const num = (v: unknown) => (v === null || v === undefined ? v : Number(v)) as number;

// ------------------------------------------------------------------ activity

export async function logActivity(event_type: string, fields: { candidate_id?: string; rubric_id?: string; detail?: Record<string, unknown> } = {}) {
  // Activity logging must never break the action it records.
  const { error } = await db().from('activity_log').insert({ event_type, candidate_id: fields.candidate_id ?? null, rubric_id: fields.rubric_id ?? null, detail: fields.detail ?? {} });
  if (error) console.error(JSON.stringify({ level: 'error', event: 'activity_log.insert_failed', error: error.message.slice(0, 200) }));
}

export async function listActivity(limit = 200): Promise<ActivityRow[]> {
  return must('list activity', await db().from('activity_log').select('*').order('created_at', { ascending: false }).limit(limit));
}

// ------------------------------------------------------------------ rubrics

function normalizeCriterion(c: Criterion): Criterion {
  return { ...c, weight: Number(c.weight) };
}

export async function listRubrics(): Promise<RubricWithCriteria[]> {
  const rubrics = must<Rubric[]>('list rubrics', await db().from('rubrics').select('*').order('version', { ascending: false }));
  if (!rubrics.length) return [];
  const criteria = must<Criterion[]>('list criteria', await db().from('rubric_criteria').select('*').in('rubric_id', rubrics.map((r) => r.id)).order('sort_order'));
  return rubrics.map((r) => ({ ...r, criteria: criteria.filter((c) => c.rubric_id === r.id).map(normalizeCriterion) }));
}

export async function getRubric(id: string): Promise<RubricWithCriteria | null> {
  const r = must<Rubric | null>('get rubric', await db().from('rubrics').select('*').eq('id', id).maybeSingle());
  if (!r) return null;
  const criteria = must<Criterion[]>('get criteria', await db().from('rubric_criteria').select('*').eq('rubric_id', id).order('sort_order'));
  return { ...r, criteria: criteria.map(normalizeCriterion) };
}

/** The rubric the scoring engine uses. Loaded fresh on every evaluation. */
export async function getActiveRubric(): Promise<RubricWithCriteria | null> {
  const r = must<Rubric | null>('get active rubric', await db().from('rubrics').select('*').eq('status', 'ACTIVE').maybeSingle());
  return r ? getRubric(r.id) : null;
}

async function nextVersion(): Promise<number> {
  const rows = must<{ version: number }[]>('rubric version', await db().from('rubrics').select('version').order('version', { ascending: false }).limit(1));
  return (rows[0]?.version ?? 0) + 1;
}

export interface NewCriterion {
  role: Role;
  criterion_key: string;
  criterion_name: string;
  description: string;
  observable_evidence: string;
  weak_evidence_description: string;
  strong_evidence_description: string;
  scoring_guidance: string;
  weight: number;
  sort_order: number;
  calibration_rationale: string;
}

export async function createDraftRubric(input: {
  name: string;
  source: 'CALIBRATION' | 'EDIT';
  parent_rubric_id?: string | null;
  patterns: CalibrationPattern[];
  model: string | null;
  criteria: NewCriterion[];
  calibrationHireIds?: string[];
}): Promise<string> {
  // Retry once on a version clash (two drafts created at the same moment).
  for (let attempt = 0; attempt < 2; attempt++) {
    const version = await nextVersion();
    const res = await db()
      .from('rubrics')
      .insert({ name: input.name, version, status: 'DRAFT', source: input.source, parent_rubric_id: input.parent_rubric_id ?? null, calibration_patterns: input.patterns, calibration_model: input.model })
      .select('id')
      .single();
    if (res.error?.code === '23505' && attempt === 0) continue;
    const { id } = must<{ id: string }>('create rubric', res);
    const ins = await db().from('rubric_criteria').insert(input.criteria.map((c) => ({ ...c, rubric_id: id })));
    if (ins.error) {
      await db().from('rubrics').delete().eq('id', id);
      throw new DbError('create criteria', ins.error.message);
    }
    if (input.calibrationHireIds?.length) {
      must('link calibration sources', await db().from('rubric_calibration_sources').insert(input.calibrationHireIds.map((h) => ({ rubric_id: id, calibration_hire_id: h }))));
    }
    return id;
  }
  throw new DbError('create rubric', 'could not allocate a version number');
}

export async function updateDraftCriterion(criterionId: string, patch: { description?: string; weight?: number; strong_evidence_description?: string; weak_evidence_description?: string }) {
  const c = must<{ rubric_id: string } | null>('find criterion', await db().from('rubric_criteria').select('rubric_id').eq('id', criterionId).maybeSingle());
  if (!c) throw new Error('Criterion not found.');
  const r = must<{ status: string } | null>('find rubric', await db().from('rubrics').select('status').eq('id', c.rubric_id).maybeSingle());
  if (r?.status !== 'DRAFT') throw new Error('Only a DRAFT rubric can be edited. Create a new version to change an approved rubric.');
  must('update criterion', await db().from('rubric_criteria').update(patch).eq('id', criterionId));
  return c.rubric_id;
}

export async function approveRubric(id: string) {
  must('approve rubric', await db().rpc('activate_rubric', { p_rubric_id: id }));
}

export async function deleteDraftRubric(id: string) {
  must('delete draft', await db().from('rubrics').delete().eq('id', id).eq('status', 'DRAFT'));
}

// ------------------------------------------------------------------ role profiles + calibration hires

export async function getRoleProfiles(): Promise<{ role: Role; title: string; jd_text: string; updated_at: string }[]> {
  return must('role profiles', await db().from('role_profiles').select('*').order('role'));
}

export async function upsertRoleProfile(role: Role, title: string, jd_text: string) {
  must('save role profile', await db().from('role_profiles').upsert({ role, title, jd_text, updated_at: new Date().toISOString() }));
}

export async function listCalibrationHires(): Promise<CalibrationHireRow[]> {
  return must('calibration hires', await db().from('calibration_hires').select('*').order('created_at'));
}

export async function insertCalibrationHire(row: Omit<CalibrationHireRow, 'id' | 'created_at' | 'last_used_at'>) {
  return must<{ id: string }>('add calibration hire', await db().from('calibration_hires').insert(row).select('id').single()).id;
}

export async function deleteCalibrationHire(id: string) {
  must('delete calibration hire', await db().from('calibration_hires').delete().eq('id', id));
}

export async function markHiresUsed(ids: string[]) {
  if (ids.length) must('mark hires used', await db().from('calibration_hires').update({ last_used_at: new Date().toISOString() }).in('id', ids));
}

export async function rubricSources(): Promise<{ rubric_id: string; calibration_hire_id: string }[]> {
  return must('rubric sources', await db().from('rubric_calibration_sources').select('*'));
}

// ------------------------------------------------------------------ candidates

export async function createCandidate(applied_role: Role, original_file_name: string): Promise<string> {
  return must<{ id: string }>('create candidate', await db().from('candidates').insert({ applied_role, original_file_name, processing_status: 'UPLOADED' }).select('id').single()).id;
}

export async function setStatus(id: string, processing_status: ProcessingStatus, extra: { failed_stage?: string | null; error_message?: string | null } = {}) {
  const patch: Record<string, unknown> = { processing_status, updated_at: new Date().toISOString() };
  if (processing_status === 'AI_FAILED' || processing_status === 'PARSE_FAILED') {
    patch.failed_stage = extra.failed_stage ?? null;
    patch.error_message = extra.error_message ?? null;
  } else {
    patch.failed_stage = null;
    patch.error_message = null;
  }
  must('update status', await db().from('candidates').update(patch).eq('id', id));
}

export async function saveParsed(id: string, professionalText: string, identity: Identity) {
  must('save professional text', await db().from('candidates').update({ professional_cv_text: professionalText, updated_at: new Date().toISOString() }).eq('id', id));
  must(
    'save private details',
    await db().from('candidate_private').upsert(
      {
        candidate_id: id,
        candidate_name: identity.candidate_name,
        email: identity.email,
        phone: identity.phone,
        linkedin_url: identity.linkedin_url,
        portfolio_url: identity.portfolio_url,
        github_url: identity.github_url,
        address: identity.address,
        other_private_metadata: identity.other,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'candidate_id' },
    ),
  );
}

export async function updatePrivate(candidateId: string, patch: { candidate_name?: string | null; email?: string | null }) {
  must('update private details', await db().from('candidate_private').update({ ...patch, updated_at: new Date().toISOString() }).eq('candidate_id', candidateId));
}

export async function getCandidate(id: string): Promise<CandidateRow | null> {
  return must('get candidate', await db().from('candidates').select('*').eq('id', id).maybeSingle());
}

export async function getPrivate(candidateId: string): Promise<PrivateRow | null> {
  return must('get private', await db().from('candidate_private').select('*').eq('candidate_id', candidateId).maybeSingle());
}

export async function deleteCandidate(id: string) {
  must('delete candidate', await db().from('candidates').delete().eq('id', id));
}

export async function recordEvaluation(candidateId: string, rubric: RubricWithCriteria, result: EvaluationResult, promptVersion: string): Promise<string> {
  const scores = [...result.pm.criteria, ...result.spm.criteria].map((c: CriterionResult) => ({
    evaluated_role: c.evaluated_role,
    criterion_id: c.criterion_id,
    criterion_key: c.criterion_key,
    criterion_name: c.criterion_name,
    raw_score: c.raw_score,
    criterion_weight: c.criterion_weight,
    weighted_score: c.weighted_score,
    evidence: c.evidence,
    evidence_status: c.evidence_status,
    evidence_verified: c.evidence_verified,
    reasoning: c.reasoning,
  }));
  const totals = [
    { role: 'PM', total_score: result.pm.total },
    { role: 'SPM', total_score: result.spm.total },
  ];
  return must<string>(
    'record evaluation',
    await db().rpc('record_evaluation', {
      p_candidate_id: candidateId,
      p_rubric_id: rubric.id,
      p_rubric_version: rubric.version,
      p_model: result.model,
      p_prompt_version: promptVersion,
      p_scores: scores,
      p_totals: totals,
    }),
  );
}

export async function recomputeRanks(role: Role) {
  must('recompute ranks', await db().rpc('recompute_ranks', { p_role: role }));
}

export async function getRoleScores(candidateIds?: string[]): Promise<RoleScoreRow[]> {
  let q = db().from('candidate_role_scores').select('candidate_id, evaluation_id, role, rubric_version, total_score, rank');
  if (candidateIds) q = q.in('candidate_id', candidateIds);
  const rows = must<RoleScoreRow[]>('role scores', await q);
  return rows.map((r) => ({ ...r, total_score: num(r.total_score) }));
}

export async function getScoresForEvaluations(evaluationIds: string[]): Promise<ScoreRow[]> {
  if (!evaluationIds.length) return [];
  const rows = must<ScoreRow[]>('criterion scores', await db().from('candidate_scores').select('*').in('evaluation_id', evaluationIds));
  return rows.map((r) => ({ ...r, criterion_weight: num(r.criterion_weight), weighted_score: num(r.weighted_score) }));
}

export async function getEvaluations(candidateId: string): Promise<EvaluationRow[]> {
  return must('evaluations', await db().from('evaluations').select('*').eq('candidate_id', candidateId).order('created_at', { ascending: false }));
}

export async function upsertOutputs(row: Omit<OutputsRow, 'updated_at' | 'email_type' | 'email_subject' | 'email_body'> & Partial<Pick<OutputsRow, 'email_type' | 'email_subject' | 'email_body'>>) {
  must('save outputs', await db().from('candidate_outputs').upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'candidate_id' }));
}

export async function getOutputs(candidateIds: string[]): Promise<OutputsRow[]> {
  if (!candidateIds.length) return [];
  return must('outputs', await db().from('candidate_outputs').select('*').in('candidate_id', candidateIds));
}

export async function saveEmailDraft(candidateId: string, draft: { email_type: EmailType; email_subject: string; email_body: string }) {
  must('save draft', await db().from('candidate_outputs').update({ ...draft, updated_at: new Date().toISOString() }).eq('candidate_id', candidateId));
}

export async function setShortlistOverride(candidateId: string, override: 'IN' | 'OUT' | null) {
  must('shortlist override', await db().from('candidates').update({ shortlist_override: override, updated_at: new Date().toISOString() }).eq('id', candidateId));
}

export async function addDecision(row: Omit<DecisionRow, 'id' | 'decided_at'>) {
  must('save decision', await db().from('founder_decisions').insert(row));
}

export async function getDecisions(candidateIds: string[]): Promise<DecisionRow[]> {
  if (!candidateIds.length) return [];
  return must('decisions', await db().from('founder_decisions').select('*').in('candidate_id', candidateIds).order('decided_at', { ascending: false }));
}

export async function getEmailEvents(candidateIds?: string[]): Promise<EmailEventRow[]> {
  let q = db().from('email_events').select('*').order('created_at', { ascending: false });
  if (candidateIds) q = q.in('candidate_id', candidateIds);
  return must('email events', await q);
}

/** Claims the single live-email slot for a candidate. Returns null if an email is already sending or sent. */
export async function claimEmailSend(row: Omit<EmailEventRow, 'id' | 'created_at' | 'provider_message_id' | 'status' | 'error_message' | 'sent_at'>): Promise<string | null> {
  const res = await db().from('email_events').insert({ ...row, status: 'SENDING' }).select('id').single();
  if (res.error?.code === '23505') return null;
  return must<{ id: string }>('claim email', res).id;
}

export async function finishEmailSend(id: string, outcome: { status: 'SENT'; provider_message_id: string } | { status: 'FAILED'; error_message: string }) {
  const patch = outcome.status === 'SENT' ? { ...outcome, sent_at: new Date().toISOString() } : outcome;
  must('finish email', await db().from('email_events').update(patch).eq('id', id));
}

export async function listCandidates(): Promise<CandidateRow[]> {
  return must('list candidates', await db().from('candidates').select('*').order('created_at', { ascending: true }));
}

export async function listPrivate(candidateIds: string[]): Promise<PrivateRow[]> {
  if (!candidateIds.length) return [];
  return must('list private', await db().from('candidate_private').select('*').in('candidate_id', candidateIds));
}
