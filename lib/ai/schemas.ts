// Zod schemas (our validation) plus matching JSON schemas (sent to Gemini as the required response shape).
// The evaluation schema is built from the ACTIVE rubric's criterion keys, so the model can neither drop nor invent
// a criterion.
import { z } from 'zod';
import { MAX_CRITERIA, MIN_CRITERIA } from '../rubric/validate';

// ------------------------------------------------------------------ candidate evaluation

const EVIDENCE_STATUS = ['PRESENT', 'ABSENT', 'NEGATIVE'] as const;

function criterionScoreSchema(keys: [string, ...string[]]) {
  return z
    .object({
      criterion_key: z.enum(keys),
      raw_score: z.number().int().min(0).max(4),
      evidence_status: z.enum(EVIDENCE_STATUS),
      evidence: z.string().trim().min(1).max(1500),
      reasoning: z.string().trim().min(1).max(900),
    })
    .superRefine((c, ctx) => {
      if (c.raw_score > 0 && c.evidence_status === 'ABSENT') {
        ctx.addIssue({ code: 'custom', message: `${c.criterion_key}: a score above 0 needs evidence_status PRESENT (or NEGATIVE)` });
      }
      if (c.raw_score >= 2 && c.evidence_status !== 'PRESENT') {
        ctx.addIssue({ code: 'custom', message: `${c.criterion_key}: a score of 2+ requires evidence_status PRESENT` });
      }
    });
}

function roleBlock(keys: [string, ...string[]]) {
  return z.object({ criteria: z.array(criterionScoreSchema(keys)) }).superRefine((block, ctx) => {
    const got = block.criteria.map((c) => c.criterion_key);
    const missing = keys.filter((k) => !got.includes(k));
    const dupes = got.filter((k, i) => got.indexOf(k) !== i);
    if (missing.length) ctx.addIssue({ code: 'custom', message: `missing criteria: ${missing.join(', ')}` });
    if (dupes.length) ctx.addIssue({ code: 'custom', message: `duplicate criteria: ${[...new Set(dupes)].join(', ')}` });
  });
}

export function evaluationSchema(pmKeys: string[], spmKeys: string[]) {
  return z.object({ pm: roleBlock(pmKeys as [string, ...string[]]), spm: roleBlock(spmKeys as [string, ...string[]]) });
}
export type EvaluationOutput = z.infer<ReturnType<typeof evaluationSchema>>;

function roleBlockJson(keys: string[]) {
  return {
    type: 'object',
    properties: {
      criteria: {
        type: 'array',
        minItems: keys.length,
        maxItems: keys.length,
        items: {
          type: 'object',
          properties: {
            criterion_key: { type: 'string', enum: keys },
            raw_score: { type: 'integer', minimum: 0, maximum: 4 },
            evidence_status: { type: 'string', enum: [...EVIDENCE_STATUS] },
            evidence: { type: 'string', description: 'Verbatim excerpt(s) from the CV, joined with " … ". Or exactly "No evidence present in the CV." when absent.' },
            reasoning: { type: 'string', description: 'One or two sentences linking the evidence to the score level.' },
          },
          required: ['criterion_key', 'raw_score', 'evidence_status', 'evidence', 'reasoning'],
        },
      },
    },
    required: ['criteria'],
  };
}

export function evaluationJsonSchema(pmKeys: string[], spmKeys: string[]): Record<string, unknown> {
  return { type: 'object', properties: { pm: roleBlockJson(pmKeys), spm: roleBlockJson(spmKeys) }, required: ['pm', 'spm'] };
}

// ------------------------------------------------------------------ interview brief + email drafts

/** Candidate-facing text must never reveal internal scoring. */
const INTERNAL_LEAK = /\b(scor(?:e|es|ed|ing)|rank(?:ed|ing|ings)?|rubrics?|criteri(?:on|a)|shortlist(?:ed|ing)?|algorithm|automated evaluation)\b|\d+(?:\.\d+)?\s*(?:\/\s*100|out of 100)/i;

const email = z.object({
  subject: z.string().trim().min(3).max(140),
  body: z.string().trim().min(80).max(2500),
});

export const outputsSchema = z
  .object({
    why_ranked: z.string().trim().min(20).max(600),
    uncertainty: z.string().trim().min(20).max(500),
    interview_probe: z.string().trim().min(20).max(400),
    invite: email,
    rejection: email,
  })
  .superRefine((o, ctx) => {
    for (const [name, e] of [['invite', o.invite], ['rejection', o.rejection]] as const) {
      if (!e.body.includes('{{first_name}}')) ctx.addIssue({ code: 'custom', path: [name, 'body'], message: 'must greet the candidate with the {{first_name}} placeholder' });
      const leak = `${e.subject}\n${e.body}`.match(INTERNAL_LEAK);
      if (leak) ctx.addIssue({ code: 'custom', path: [name], message: `must not mention internal evaluation details (found "${leak[0]}")` });
      if (/\[[^\]]*\]/.test(e.body.replace(/\[Candidate\]/g, ''))) ctx.addIssue({ code: 'custom', path: [name, 'body'], message: 'must not contain bracketed placeholders other than {{first_name}}' });
    }
    if (!o.interview_probe.includes('?')) ctx.addIssue({ code: 'custom', path: ['interview_probe'], message: 'must be a question' });
  });
export type OutputsResult = z.infer<typeof outputsSchema>;

const emailJson = {
  type: 'object',
  properties: { subject: { type: 'string' }, body: { type: 'string' } },
  required: ['subject', 'body'],
};
export const outputsJsonSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    why_ranked: { type: 'string' },
    uncertainty: { type: 'string' },
    interview_probe: { type: 'string' },
    invite: emailJson,
    rejection: emailJson,
  },
  required: ['why_ranked', 'uncertainty', 'interview_probe', 'invite', 'rejection'],
};

// ------------------------------------------------------------------ calibration

const calibratedCriterion = z.object({
  criterion_key: z.string().regex(/^[a-z][a-z0-9_]{1,59}$/, 'snake_case key'),
  criterion_name: z.string().trim().min(3).max(80),
  description: z.string().trim().min(20).max(600),
  observable_evidence: z.string().trim().min(20).max(600),
  weak_evidence: z.string().trim().min(10).max(500),
  strong_evidence: z.string().trim().min(10).max(500),
  scoring_guidance: z.string().trim().min(20).max(800),
  weight: z.number().int().min(5).max(50),
  calibration_rationale: z.string().trim().min(20).max(800),
});

function calibratedRole(label: string) {
  return z
    .object({ criteria: z.array(calibratedCriterion).min(MIN_CRITERIA).max(MAX_CRITERIA) })
    .superRefine((r, ctx) => {
      const total = r.criteria.reduce((a, c) => a + c.weight, 0);
      if (total !== 100) ctx.addIssue({ code: 'custom', message: `${label} weights total ${total}; they must total exactly 100` });
      const keys = r.criteria.map((c) => c.criterion_key);
      if (new Set(keys).size !== keys.length) ctx.addIssue({ code: 'custom', message: `${label} criterion keys must be unique` });
    });
}

export const calibrationSchema = z.object({
  patterns: z
    .array(
      z.object({
        name: z.string().trim().min(3).max(100),
        description: z.string().trim().min(20).max(700),
        evidence_in_higher_performers: z.string().trim().min(20).max(900),
        contrast_with_others: z.string().trim().min(20).max(900),
      }),
    )
    .min(2)
    .max(4),
  pm: calibratedRole('PM'),
  spm: calibratedRole('SPM'),
});
export type CalibrationOutput = z.infer<typeof calibrationSchema>;

const calibratedCriterionJson = {
  type: 'object',
  properties: {
    criterion_key: { type: 'string', description: 'snake_case, e.g. operational_immersion. Use the same key in PM and SPM when it is the same dimension.' },
    criterion_name: { type: 'string' },
    description: { type: 'string' },
    observable_evidence: { type: 'string', description: 'What in a CV counts as evidence for this criterion.' },
    weak_evidence: { type: 'string' },
    strong_evidence: { type: 'string' },
    scoring_guidance: { type: 'string', description: 'How the 0-4 scale applies to this criterion for this role.' },
    weight: { type: 'integer', minimum: 5, maximum: 50 },
    calibration_rationale: { type: 'string', description: 'Which calibration pattern this criterion comes from and why it matters for this role. Refer to hires only by label (Hire A, Hire B...).' },
  },
  required: ['criterion_key', 'criterion_name', 'description', 'observable_evidence', 'weak_evidence', 'strong_evidence', 'scoring_guidance', 'weight', 'calibration_rationale'],
};
const calibratedRoleJson = {
  type: 'object',
  properties: { criteria: { type: 'array', minItems: MIN_CRITERIA, maxItems: MAX_CRITERIA, items: calibratedCriterionJson } },
  required: ['criteria'],
};
export const calibrationJsonSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    patterns: {
      type: 'array',
      minItems: 2,
      maxItems: 4,
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          evidence_in_higher_performers: { type: 'string' },
          contrast_with_others: { type: 'string' },
        },
        required: ['name', 'description', 'evidence_in_higher_performers', 'contrast_with_others'],
      },
    },
    pm: calibratedRoleJson,
    spm: calibratedRoleJson,
  },
  required: ['patterns', 'pm', 'spm'],
};
