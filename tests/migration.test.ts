// Runs the real migration in an in-memory Postgres (PGlite) and exercises the database rules the app relies on.
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '0001_init.sql'), 'utf8');
let db: PGlite;

const one = async <T>(q: string, p: unknown[] = []) => (await db.query<T>(q, p)).rows[0]!;

async function makeRubric(version: number, pm: number[], spm: number[]) {
  const { id } = await one<{ id: string }>(`insert into rubrics (name, version, status, source) values ('r', $1, 'DRAFT', 'CALIBRATION') returning id`, [version]);
  const add = async (role: string, weights: number[]) => {
    for (const [i, w] of weights.entries()) {
      await db.query(
        `insert into rubric_criteria (rubric_id, role, criterion_key, criterion_name, description, observable_evidence, weak_evidence_description, strong_evidence_description, scoring_guidance, weight, sort_order, calibration_rationale)
         values ($1, $2, $3, 'n', 'd', 'o', 'w', 's', 'g', $4, $5, 'c')`,
        [id, role, `k${i}`, w, i],
      );
    }
  };
  await add('PM', pm);
  await add('SPM', spm);
  return id;
}

async function makeCandidate(role: string, createdAt: string) {
  return (await one<{ id: string }>(`insert into candidates (applied_role, original_file_name, created_at) values ($1, 'cv.pdf', $2) returning id`, [role, createdAt])).id;
}

async function score(candidate: string, rubric: string, version: number, pm: number, spm: number) {
  const crit = (await db.query<{ id: string; role: string; criterion_key: string; weight: string }>(`select id, role, criterion_key, weight from rubric_criteria where rubric_id = $1`, [rubric])).rows;
  const scores = crit.map((c) => ({ evaluated_role: c.role, criterion_id: c.id, criterion_key: c.criterion_key, criterion_name: 'n', raw_score: 2, criterion_weight: Number(c.weight), weighted_score: Number(c.weight) / 2, evidence: 'e', evidence_status: 'PRESENT', evidence_verified: true, reasoning: 'r' }));
  return (await one<{ record_evaluation: string }>(`select record_evaluation($1, $2, $3, 'model-x', 'eval-v1', $4::jsonb, $5::jsonb)`, [candidate, rubric, version, JSON.stringify(scores), JSON.stringify([{ role: 'PM', total_score: pm }, { role: 'SPM', total_score: spm }])])).record_evaluation;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(sql.replace(/create extension if not exists pgcrypto;/, ''));
});

describe('schema rules', () => {
  it('approval requires weights of exactly 100 per role, and only one ACTIVE rubric exists (TEST 2, 19)', async () => {
    const bad = await makeRubric(1, [25, 25, 25, 20], [25, 25, 25, 25]);
    await expect(db.query(`select activate_rubric($1)`, [bad])).rejects.toThrow(/weights must total 100/);
    const v2 = await makeRubric(2, [25, 25, 25, 25], [20, 20, 20, 20, 20]);
    await db.query(`select activate_rubric($1)`, [v2]);
    const v3 = await makeRubric(3, [40, 20, 20, 20], [30, 30, 20, 20]);
    await db.query(`select activate_rubric($1)`, [v3]);
    const rows = (await db.query<{ version: number; status: string; approved_at: string | null }>(`select version, status, approved_at from rubrics order by version`)).rows;
    expect(rows.map((r) => [r.version, r.status])).toEqual([
      [1, 'DRAFT'],
      [2, 'ARCHIVED'],
      [3, 'ACTIVE'],
    ]);
    expect(rows[2]!.approved_at).not.toBeNull();
    await expect(db.query(`select activate_rubric($1)`, [v2])).rejects.toThrow(/only a DRAFT/);
  });

  it('stores full evaluations with rubric version and ranks applicants per role, ties shared (TEST 8, 15, 19)', async () => {
    const v3 = (await one<{ id: string }>(`select id from rubrics where version = 3`)).id;
    const v2 = (await one<{ id: string }>(`select id from rubrics where version = 2`)).id;
    const a = await makeCandidate('PM', '2026-01-01');
    const b = await makeCandidate('PM', '2026-01-02');
    const c = await makeCandidate('PM', '2026-01-03');
    const s = await makeCandidate('SPM', '2026-01-04');
    await score(a, v2, 2, 70.04, 50);
    await score(b, v3, 3, 70.01, 90);
    await score(c, v3, 3, 81, 10);
    await score(s, v3, 3, 99, 40);
    await db.query(`select recompute_ranks('PM')`);
    await db.query(`select recompute_ranks('SPM')`);
    const ranks = (await db.query<{ candidate_id: string; role: string; rank: number | null; rubric_version: number }>(`select candidate_id, role, rank, rubric_version from candidate_role_scores`)).rows;
    const r = (id: string, role: string) => ranks.find((x) => x.candidate_id === id && x.role === role)!;
    expect(r(c, 'PM').rank).toBe(1);
    expect(r(a, 'PM').rank).toBe(2);
    expect(r(b, 'PM').rank).toBe(2); // 70.04 and 70.01 display as 70.0: tied
    expect(r(s, 'PM').rank).toBeNull(); // applied SPM: PM score is information only, not ranked
    expect(r(s, 'SPM').rank).toBe(1);
    expect(r(b, 'SPM').rank).toBeNull();
    expect(r(a, 'PM').rubric_version).toBe(2); // old scores keep their version
    const n = await one<{ n: number }>(`select count(*)::int n from candidate_scores where candidate_id = $1`, [a]);
    expect(n.n).toBe(9); // 4 PM + 5 SPM criteria for v2
  });

  it('re-evaluation keeps the old evaluation for audit and updates the current score', async () => {
    const v3 = (await one<{ id: string }>(`select id from rubrics where version = 3`)).id;
    const a = (await one<{ id: string }>(`select id from candidates where created_at = '2026-01-01'`)).id;
    await score(a, v3, 3, 60, 60);
    const evals = await one<{ n: number }>(`select count(*)::int n from evaluations where candidate_id = $1`, [a]);
    expect(evals.n).toBe(2);
    const cur = await one<{ rubric_version: number; total_score: string }>(`select rubric_version, total_score from candidate_role_scores where candidate_id = $1 and role = 'PM'`, [a]);
    expect([cur.rubric_version, Number(cur.total_score)]).toEqual([3, 60]);
  });

  it('blocks duplicate sends but allows a retry after a failure (TEST 13, 15)', async () => {
    const a = (await one<{ id: string }>(`select id from candidates where created_at = '2026-01-01'`)).id;
    const ins = (status: string) => db.query(`insert into email_events (candidate_id, recipient, test_mode, message_type, subject, body, status) values ($1, 'x@y.z', true, 'WARM_REJECTION', 's', 'b', $2)`, [a, status]);
    await ins('FAILED');
    await ins('SENDING');
    await expect(ins('SENDING')).rejects.toThrow(/duplicate key/);
    await db.query(`update email_events set status = 'SENT' where status = 'SENDING'`);
    await expect(ins('SENDING')).rejects.toThrow(/duplicate key/);
  });

  it('keeps the AI suggestion and founder decision as separate append-only rows (TEST 12)', async () => {
    const a = (await one<{ id: string }>(`select id from candidates where created_at = '2026-01-01'`)).id;
    await db.query(`insert into founder_decisions (candidate_id, ai_suggested_action, founder_decision) values ($1, 'REJECT', 'INTERVIEW')`, [a]);
    const d = await one<{ ai_suggested_action: string; founder_decision: string }>(`select * from founder_decisions where candidate_id = $1`, [a]);
    expect(d).toMatchObject({ ai_suggested_action: 'REJECT', founder_decision: 'INTERVIEW' });
  });

  it('enables row level security on every table', async () => {
    const off = (await db.query<{ relname: string }>(`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`)).rows;
    expect(off).toEqual([]);
  });
});
