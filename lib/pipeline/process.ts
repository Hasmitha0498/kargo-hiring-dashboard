// The candidate pipeline: parse -> separate identity -> score (PM + SPM) -> calculate -> rank -> brief -> email drafts.
// Each stage persists its result before the next starts, so a failure never loses earlier work and Retry resumes
// from the failed stage. Nothing in here sends email or records a hiring decision.
import 'server-only';
import { defaultAiContext } from '../ai/default-context';
import type { AiContext } from '../ai/context';
import { evaluateCandidate } from '../ai/evaluate';
import { GeminiError } from '../ai/gemini';
import { generateOutputs } from '../ai/outputs';
import { EVALUATION_PROMPT_VERSION } from '../ai/prompts';
import { ROLES, type Role, type SuggestedAction } from '../domain';
import { env, MissingEnvError } from '../env';
import { describeError, log } from '../log';
import { extractText, ParseError } from '../parse/extract-text';
import { separateIdentity } from '../parse/identity';
import { isShortlistRecommended } from '../scoring/calculate';
import * as repo from '../db/repo';

export type StageKey = 'reading' | 'separating' | 'evaluating_pm' | 'evaluating_spm' | 'calculating' | 'brief' | 'email' | 'done';

export type ProgressEvent =
  | { type: 'candidate'; candidateId: string }
  | { type: 'stage'; stage: StageKey; state: 'active' | 'done' }
  | { type: 'error'; stage: StageKey; message: string; retryable: boolean }
  | { type: 'complete'; candidateId: string };

export type Emit = (event: ProgressEvent) => void;

/** Turns any failure into a short message the founder can act on. Never includes CV text or contact details. */
export function friendlyError(error: unknown): string {
  if (error instanceof ParseError || error instanceof MissingEnvError) return error.message;
  if (error instanceof GeminiError) {
    if (error.kind === 'rate_limited') return 'The AI service is busy (rate limit). Wait a minute, then press Retry.';
    if (error.kind === 'unavailable') return 'The AI service did not respond in time. Press Retry.';
    if (error.kind === 'invalid_output') return 'The AI returned an incomplete answer several times. Press Retry.';
    return 'The AI service refused the request. This is a server configuration problem (API key or model); the administrator can find details in the server logs.';
  }
  if (error instanceof Error && /Database error/.test(error.message)) return 'The database could not be reached while saving. Press Retry in a moment.';
  if (error instanceof Error && /fetch failed|ENOTFOUND|ECONNRESET|network/i.test(error.message)) return 'A network error interrupted the analysis. Press Retry.';
  return error instanceof Error ? error.message.slice(0, 300) : 'Unexpected error.';
}

class StageError extends Error {
  constructor(
    readonly stage: StageKey,
    readonly cause: unknown,
  ) {
    super(friendlyError(cause));
  }
}

// ------------------------------------------------------------------ stages

async function parseStage(candidateId: string, fileName: string, bytes: Uint8Array, emit: Emit) {
  emit({ type: 'stage', stage: 'reading', state: 'active' });
  await repo.setStatus(candidateId, 'PARSING');
  let text: string;
  try {
    text = (await extractText(fileName, bytes)).text;
  } catch (error) {
    await repo.setStatus(candidateId, 'PARSE_FAILED', { failed_stage: 'PARSING', error_message: friendlyError(error) });
    throw new StageError('reading', error);
  }
  emit({ type: 'stage', stage: 'reading', state: 'done' });

  emit({ type: 'stage', stage: 'separating', state: 'active' });
  await repo.setStatus(candidateId, 'EXTRACTING');
  const { identity, professionalText } = separateIdentity(text);
  await repo.saveParsed(candidateId, professionalText, identity);
  log.info('candidate.parsed', { candidateId, chars: professionalText.length, hasName: Boolean(identity.candidate_name), hasEmail: Boolean(identity.email) });
  emit({ type: 'stage', stage: 'separating', state: 'done' });
}

async function scoreStage(candidateId: string, ai: AiContext, emit: Emit) {
  const candidate = await repo.getCandidate(candidateId);
  if (!candidate?.professional_cv_text) throw new StageError('evaluating_pm', new Error('No CV text stored for this candidate. Upload the CV again.'));
  await repo.setStatus(candidateId, 'SCORING');
  emit({ type: 'stage', stage: 'evaluating_pm', state: 'active' });
  emit({ type: 'stage', stage: 'evaluating_spm', state: 'active' });
  try {
    const rubric = await repo.getActiveRubric();
    if (!rubric) throw new Error('The hiring rubric has not been set up yet (Hiring Rubric → Rubric setup). Once it is approved, press Retry.');
    const result = await evaluateCandidate(ai, rubric, candidate.professional_cv_text, { candidateId });
    emit({ type: 'stage', stage: 'evaluating_pm', state: 'done' });
    emit({ type: 'stage', stage: 'evaluating_spm', state: 'done' });

    emit({ type: 'stage', stage: 'calculating', state: 'active' });
    await repo.recordEvaluation(candidateId, rubric, result, EVALUATION_PROMPT_VERSION);
    for (const role of ROLES) await repo.recomputeRanks(role);
    await syncSuggestedActions(candidate.applied_role);
    log.info('candidate.scored', { candidateId, rubricVersion: rubric.version, model: result.model, pm: result.pm.total, spm: result.spm.total });
    await repo.logActivity('CANDIDATE_SCORED', { candidate_id: candidateId, rubric_id: rubric.id, detail: { rubric_version: rubric.version, pm: result.pm.total, spm: result.spm.total, model: result.model } });
    emit({ type: 'stage', stage: 'calculating', state: 'done' });
  } catch (error) {
    if (error instanceof StageError) throw error;
    await repo.setStatus(candidateId, 'AI_FAILED', { failed_stage: 'SCORING', error_message: friendlyError(error) });
    throw new StageError('evaluating_pm', error);
  }
}

/** The system suggestion follows the current shortlist recommendation (rank within the applied role). */
export function suggestedActionFor(rank: number | null | undefined): SuggestedAction {
  return isShortlistRecommended(rank) ? 'INTERVIEW' : 'REJECT';
}

/** Ranks move as candidates arrive; keep each stored suggestion in line with its current rank. */
async function syncSuggestedActions(role: Role) {
  const candidates = (await repo.listCandidates()).filter((c) => c.applied_role === role);
  const ids = candidates.map((c) => c.id);
  const [scores, outputs] = await Promise.all([repo.getRoleScores(ids), repo.getOutputs(ids)]);
  for (const o of outputs) {
    const rank = scores.find((s) => s.candidate_id === o.candidate_id && s.role === role)?.rank;
    const next = suggestedActionFor(rank);
    if (o.suggested_action !== next) await repo.upsertOutputs({ ...o, suggested_action: next });
  }
}

async function outputsStage(candidateId: string, ai: AiContext, emit: Emit) {
  emit({ type: 'stage', stage: 'brief', state: 'active' });
  emit({ type: 'stage', stage: 'email', state: 'active' });
  try {
    const candidate = await repo.getCandidate(candidateId);
    if (!candidate) throw new Error('Candidate not found.');
    await repo.setStatus(candidateId, 'GENERATING_OUTPUTS');
    const roleScores = await repo.getRoleScores([candidateId]);
    const applied = roleScores.find((r) => r.role === candidate.applied_role);
    if (!applied) throw new Error('This candidate has not been scored yet.');
    const scores = (await repo.getScoresForEvaluations([applied.evaluation_id])).filter((s) => s.evaluated_role === candidate.applied_role);
    const evaluation = (await repo.getEvaluations(candidateId)).find((e) => e.id === applied.evaluation_id);
    const rubric = evaluation ? await repo.getRubric(evaluation.rubric_id) : null;
    const description = (criterionId: string) => rubric?.criteria.find((c) => c.id === criterionId)?.description ?? '';

    const { data, model } = await generateOutputs(
      ai,
      {
        appliedRole: candidate.applied_role,
        companyName: env.companyName(),
        senderName: env.senderName(),
        senderTitle: env.senderTitle(),
        scores: scores
          .sort((a, b) => b.criterion_weight - a.criterion_weight)
          .map((s) => ({ criterion_name: s.criterion_name, description: description(s.criterion_id), raw_score: s.raw_score, evidence: s.evidence, reasoning: s.reasoning })),
      },
      { candidateId },
    );
    emit({ type: 'stage', stage: 'brief', state: 'done' });

    const suggestion = suggestedActionFor(applied.rank);
    const decision = (await repo.getDecisions([candidateId]))[0]?.founder_decision;
    const draftType = decision === 'INTERVIEW' ? 'INTERVIEW_INVITE' : decision === 'REJECT' ? 'WARM_REJECTION' : suggestion === 'INTERVIEW' ? 'INTERVIEW_INVITE' : 'WARM_REJECTION';
    const draft = draftType === 'INTERVIEW_INVITE' ? data.invite : data.rejection;
    await repo.upsertOutputs({
      candidate_id: candidateId,
      evaluation_id: applied.evaluation_id,
      interview_brief: data.why_ranked,
      uncertainty: data.uncertainty,
      interview_probe: data.interview_probe,
      suggested_action: suggestion,
      invite_subject: data.invite.subject,
      invite_body: data.invite.body,
      rejection_subject: data.rejection.subject,
      rejection_body: data.rejection.body,
      email_type: draftType,
      email_subject: draft.subject,
      email_body: draft.body,
      model,
    });
    const sent = (await repo.getEmailEvents([candidateId])).some((e) => e.status === 'SENT');
    await repo.setStatus(candidateId, sent ? 'EMAIL_SENT' : 'READY');
    emit({ type: 'stage', stage: 'email', state: 'done' });
  } catch (error) {
    await repo.setStatus(candidateId, 'AI_FAILED', { failed_stage: 'GENERATING_OUTPUTS', error_message: friendlyError(error) });
    throw new StageError('brief', error);
  }
}

// ------------------------------------------------------------------ entry points

async function run(candidateId: string, emit: Emit, steps: ((emit: Emit) => Promise<void>)[]) {
  try {
    for (const step of steps) await step(emit);
    emit({ type: 'stage', stage: 'done', state: 'done' });
    emit({ type: 'complete', candidateId });
  } catch (error) {
    const stage = error instanceof StageError ? error.stage : 'reading';
    const cause = error instanceof StageError ? error.cause : error;
    log.error('pipeline.failed', { candidateId, stage, error: describeError(cause) });
    await repo.logActivity('ANALYSIS_FAILED', { candidate_id: candidateId, detail: { stage, message: error instanceof Error ? error.message : friendlyError(cause) } }).catch(() => undefined);
    emit({ type: 'error', stage, message: error instanceof Error ? error.message : friendlyError(error), retryable: !(cause instanceof ParseError) });
  }
}

/** New upload: creates the candidate first so it survives any later failure. */
export async function processUpload(appliedRole: Role, fileName: string, bytes: Uint8Array, emit: Emit, ai?: AiContext) {
  let candidateId: string;
  try {
    candidateId = await repo.createCandidate(appliedRole, fileName.slice(0, 200));
  } catch (error) {
    emit({ type: 'error', stage: 'reading', message: friendlyError(error), retryable: false });
    return;
  }
  emit({ type: 'candidate', candidateId });
  await repo.logActivity('CANDIDATE_UPLOADED', { candidate_id: candidateId, detail: { applied_role: appliedRole } });
  await run(candidateId, emit, [
    (e) => parseStage(candidateId, fileName, bytes, e),
    async (e) => scoreStage(candidateId, ai ?? defaultAiContext(), e),
    async (e) => outputsStage(candidateId, ai ?? defaultAiContext(), e),
  ]);
}

/**
 * Retry / re-evaluate an existing candidate. `from: 'auto'` resumes at the failed stage; 'score' re-scores with the
 * currently ACTIVE rubric (a new evaluation row: earlier evaluations are kept for audit).
 */
export async function processExisting(candidateId: string, from: 'auto' | 'score' | 'outputs', emit: Emit, ai?: AiContext) {
  const candidate = await repo.getCandidate(candidateId);
  if (!candidate) {
    emit({ type: 'error', stage: 'reading', message: 'Candidate not found.', retryable: false });
    return;
  }
  emit({ type: 'candidate', candidateId });
  if (!candidate.professional_cv_text) {
    emit({ type: 'error', stage: 'reading', message: 'This CV could not be read, so there is nothing to retry. Upload a readable copy instead.', retryable: false });
    return;
  }
  emit({ type: 'stage', stage: 'reading', state: 'done' });
  emit({ type: 'stage', stage: 'separating', state: 'done' });
  const hasScores = (await repo.getRoleScores([candidateId])).length === ROLES.length;
  const start = from === 'auto' ? (candidate.failed_stage === 'GENERATING_OUTPUTS' && hasScores ? 'outputs' : 'score') : from;
  const getAi = () => ai ?? defaultAiContext();
  await repo.logActivity(start === 'score' ? 'EVALUATION_RETRIED' : 'OUTPUTS_RETRIED', { candidate_id: candidateId });
  await run(candidateId, emit, [
    ...(start === 'score' ? [(e: Emit) => scoreStage(candidateId, getAi(), e)] : [(e: Emit) => { e({ type: 'stage', stage: 'evaluating_pm', state: 'done' }); e({ type: 'stage', stage: 'evaluating_spm', state: 'done' }); e({ type: 'stage', stage: 'calculating', state: 'done' }); return Promise.resolve(); }]),
    (e: Emit) => outputsStage(candidateId, getAi(), e),
  ]);
}

