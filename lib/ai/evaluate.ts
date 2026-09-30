// Runtime evaluation: one identity-free CV against the ACTIVE rubric for both roles. Gemini returns raw 0-4 scores
// with evidence; weights and totals are applied here in code.
import { criteriaFor, type EvidenceStatus, type Role, type RubricWithCriteria } from '../domain';
import { isEvidenceGrounded } from '../scoring/grounding';
import { roleTotal, weightedScore } from '../scoring/calculate';
import type { AiContext } from './context';
import { generateJsonWithModel } from './gemini';
import { EVALUATION_SYSTEM, evaluationUser } from './prompts';
import { evaluationJsonSchema, evaluationSchema } from './schemas';

export interface CriterionResult {
  evaluated_role: Role;
  criterion_id: string;
  criterion_key: string;
  criterion_name: string;
  sort_order: number;
  raw_score: number;
  criterion_weight: number;
  weighted_score: number;
  evidence: string;
  evidence_status: EvidenceStatus;
  evidence_verified: boolean;
  reasoning: string;
}

export interface RoleResult {
  role: Role;
  total: number;
  criteria: CriterionResult[];
}

export interface EvaluationResult {
  model: string;
  pm: RoleResult;
  spm: RoleResult;
}

export async function evaluateCandidate(ctx: AiContext, rubric: RubricWithCriteria, professionalText: string, logFields?: Record<string, string>): Promise<EvaluationResult> {
  const pm = criteriaFor(rubric, 'PM');
  const spm = criteriaFor(rubric, 'SPM');
  if (!pm.length || !spm.length) throw new Error('The active rubric has no criteria for one of the roles.');
  const pmKeys = pm.map((c) => c.criterion_key);
  const spmKeys = spm.map((c) => c.criterion_key);

  const { data, model } = await generateJsonWithModel(
    ctx.transport,
    {
      label: 'evaluate_candidate',
      models: ctx.models,
      system: EVALUATION_SYSTEM,
      parts: [{ text: evaluationUser(pm, spm, professionalText) }],
      jsonSchema: evaluationJsonSchema(pmKeys, spmKeys),
      schema: evaluationSchema(pmKeys, spmKeys),
      temperature: 0,
      logFields,
    },
    ctx.retry,
  );

  const build = (role: Role, criteria: typeof pm, answers: typeof data.pm.criteria): RoleResult => {
    const rows = criteria.map((c) => {
      const a = answers.find((x) => x.criterion_key === c.criterion_key)!; // presence guaranteed by the schema
      const weight = Number(c.weight);
      return {
        evaluated_role: role,
        criterion_id: c.id,
        criterion_key: c.criterion_key,
        criterion_name: c.criterion_name,
        sort_order: c.sort_order,
        raw_score: a.raw_score,
        criterion_weight: weight,
        weighted_score: weightedScore(a.raw_score, weight),
        evidence: a.evidence,
        evidence_status: a.evidence_status,
        evidence_verified: a.evidence_status === 'ABSENT' ? true : isEvidenceGrounded(a.evidence, professionalText),
        reasoning: a.reasoning,
      };
    });
    return { role, total: roleTotal(rows.map((r) => r.weighted_score)), criteria: rows };
  };

  return { model, pm: build('PM', pm, data.pm.criteria), spm: build('SPM', spm, data.spm.criteria) };
}
