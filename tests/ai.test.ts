import { describe, expect, it } from 'vitest';
import type { AiContext } from '@/lib/ai/context';
import { evaluateCandidate } from '@/lib/ai/evaluate';
import { GeminiError, type GeminiRequest } from '@/lib/ai/gemini';
import { CALIBRATION_SYSTEM, EVALUATION_SYSTEM, evaluationUser } from '@/lib/ai/prompts';
import { evaluationSchema, outputsSchema, outputsSchemaFor } from '@/lib/ai/schemas';
import { hireLabel } from '@/lib/ai/calibrate';
import { criteriaFor } from '@/lib/domain';
import { answer, cvText, rubric } from './helpers/fixtures';

const pmKeys = criteriaFor(rubric, 'PM').map((c) => c.criterion_key);
const spmKeys = criteriaFor(rubric, 'SPM').map((c) => c.criterion_key);

function ctxFrom(responses: (string | Error)[], seen: GeminiRequest[] = []): AiContext {
  let i = 0;
  return {
    models: ['primary', 'fallback'],
    retry: { baseDelayMs: 1, sleep: async () => {} },
    transport: async (req) => {
      seen.push(req);
      const r = responses[Math.min(i++, responses.length - 1)]!;
      if (r instanceof Error) throw r;
      return r;
    },
  };
}

describe('structured evaluation output (TEST 5, 6, 15)', () => {
  const schema = evaluationSchema(pmKeys, spmKeys);
  it('accepts every criterion exactly once for both roles', () => expect(schema.safeParse({ pm: { criteria: answer(pmKeys) }, spm: { criteria: answer(spmKeys) } }).success).toBe(true));
  it('rejects an omitted criterion', () => expect(schema.safeParse({ pm: { criteria: answer(pmKeys.slice(1)) }, spm: { criteria: answer(spmKeys) } }).success).toBe(false));
  it('rejects an undocumented criterion', () => expect(schema.safeParse({ pm: { criteria: [...answer(pmKeys.slice(1)), ...answer(['made_up'])] }, spm: { criteria: answer(spmKeys) } }).success).toBe(false));
  it('rejects invalid raw scores', () => expect(schema.safeParse({ pm: { criteria: answer(pmKeys, 5) }, spm: { criteria: answer(spmKeys) } }).success).toBe(false));
  it('rejects a positive score without evidence', () => {
    const bad = answer(pmKeys).map((a) => ({ ...a, evidence_status: 'ABSENT' }));
    expect(schema.safeParse({ pm: { criteria: bad }, spm: { criteria: answer(spmKeys) } }).success).toBe(false);
  });
});

describe('evaluateCandidate', () => {
  it('scores both rubrics, applies weights in code and records grounding', async () => {
    const seen: GeminiRequest[] = [];
    const pm = answer(pmKeys, 4);
    pm[3] = { ...pm[3]!, raw_score: 0, evidence_status: 'ABSENT', evidence: 'No evidence present in the CV.' };
    const spm = answer(spmKeys, 2, 'Increased ARR by 300% globally');
    const result = await evaluateCandidate(ctxFrom([JSON.stringify({ pm: { criteria: pm }, spm: { criteria: spm } })], seen), rubric, cvText);
    expect(result.pm.total).toBe(30 + 30 + 25 + 0);
    expect(result.spm.total).toBe(50);
    expect(result.pm.criteria[0]!.weighted_score).toBe(30);
    expect(result.pm.criteria[0]!.evidence_verified).toBe(true);
    expect(result.spm.criteria[0]!.evidence_verified).toBe(false); // invented quote is flagged
    expect(result.pm.criteria[3]!.evidence_status).toBe('ABSENT');
    // weights are never sent to the model
    expect(seen[0]!.parts.map((p) => ('text' in p ? p.text : '')).join()).not.toMatch(/weight/i);
  });

  it('retries invalid JSON, telling the model what was wrong (TEST 16 path)', async () => {
    const seen: GeminiRequest[] = [];
    const good = JSON.stringify({ pm: { criteria: answer(pmKeys) }, spm: { criteria: answer(spmKeys) } });
    const missing = JSON.stringify({ pm: { criteria: answer(pmKeys.slice(1)) }, spm: { criteria: answer(spmKeys) } });
    const r = await evaluateCandidate(ctxFrom(['not json', missing, good], seen), rubric, cvText);
    expect(r.pm.criteria).toHaveLength(4);
    expect(seen).toHaveLength(3);
    const lastPrompt = seen[2]!.parts.map((p) => ('text' in p ? p.text : '')).join('\n');
    expect(lastPrompt).toMatch(/rejected by validation: .*missing criteria: ground_truth/);
    expect(seen[2]!.model).toBe('fallback'); // 2 attempts per model, then the fallback model
  });

  it('gives up with a typed error after repeated failure (candidate is then marked AI_FAILED)', async () => {
    await expect(evaluateCandidate(ctxFrom([new Error('fetch failed')]), rubric, cvText)).rejects.toBeInstanceOf(GeminiError);
    const rate = Object.assign(new Error('{"code": 429} Please retry in 1s'), {});
    await expect(evaluateCandidate(ctxFrom([rate]), rubric, cvText)).rejects.toMatchObject({ kind: 'rate_limited' });
  });
});

describe('runtime prompt separation (TEST 18, 39)', () => {
  it('the runtime prompt contains only the rubric and the professional CV', () => {
    const prompt = evaluationUser(criteriaFor(rubric, 'PM'), criteriaFor(rubric, 'SPM'), cvText);
    expect(prompt).toContain('PM ACTIVE RUBRIC');
    expect(prompt).toContain('SPM ACTIVE RUBRIC');
    expect(prompt).toContain(cvText);
    expect(prompt + EVALUATION_SYSTEM).not.toMatch(/past hire|historical|Hire [A-Z]\b|performance outcome|Exceeds Expectations/i);
  });
  it('calibration prompts label hires anonymously', () => {
    expect([0, 1, 25, 26].map(hireLabel)).toEqual(['Hire A', 'Hire B', 'Hire Z', 'Hire AA']);
    expect(CALIBRATION_SYSTEM).toMatch(/never mention any past hire/);
  });
});

describe('interview brief + email output validation (TEST 10, 11, 24)', () => {
  const ok = {
    why_ranked: 'Shadowed warehouse pickers for six weeks before specifying cycle counting.',
    uncertainty: 'The CV does not show work across sales and engineering on one decision.',
    interview_probe: 'When you killed the barcode feature, who disagreed and how did you decide?',
    invite: { subject: 'Next step for the Product Manager role', body: 'Hi {{first_name}},\n\nThank you for applying. Your time on warehouse floors before writing specs stood out. I would like to meet for a conversation about the role. Could you reply with a few times that work over the next week?\n\nArjun Mehta\nFounder, Kargo' },
    rejection: { subject: 'Your application to Kargo', body: 'Hi {{first_name}},\n\nThank you for applying and for the care you put into your application. We have decided not to move forward at this stage. I appreciated reading about your operations work and wish you the very best.\n\nArjun Mehta\nFounder, Kargo' },
  };
  it('accepts a clean output', () => expect(outputsSchema.safeParse(ok).success).toBe(true));
  it('blocks scores, rankings and rubric language from candidate emails', () => {
    for (const leak of ['You scored 82.3/100.', 'You ranked in our top 5.', 'Our rubric flagged a gap.', 'you were shortlisted']) {
      expect(outputsSchema.safeParse({ ...ok, rejection: { ...ok.rejection, body: ok.rejection.body.replace('We have', `${leak} We have`) } }).success).toBe(false);
    }
  });
  it('blocks rubric criterion names from candidate emails', () => {
    const leaky = { ...ok, invite: { ...ok.invite, body: ok.invite.body.replace('stood out.', 'is the kind of Operational Immersion we value.') } };
    expect(outputsSchemaFor(['Operational Immersion']).safeParse(leaky).success).toBe(false);
    expect(outputsSchemaFor(['Operational Immersion']).safeParse(ok).success).toBe(true);
  });
  it('allows real achievements with percentages', () => {
    expect(outputsSchema.safeParse({ ...ok, invite: { ...ok.invite, body: ok.invite.body.replace('stood out.', 'stood out, as did cutting mis-picks by 18%.') } }).success).toBe(true);
  });
  it('requires the first-name placeholder and a question as the probe', () => {
    expect(outputsSchema.safeParse({ ...ok, invite: { ...ok.invite, body: ok.invite.body.replace('{{first_name}}', 'Priya') } }).success).toBe(false);
    expect(outputsSchema.safeParse({ ...ok, interview_probe: 'Ask about their decisions in detail.' }).success).toBe(false);
  });
});
