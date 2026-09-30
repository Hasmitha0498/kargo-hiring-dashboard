// A generic, invented rubric for tests. Not derived from any real or historical person.
import type { Criterion, RubricWithCriteria, Role } from '@/lib/domain';

function c(role: Role, key: string, weight: number, i: number): Criterion {
  return {
    id: `${role}-${key}`,
    rubric_id: 'r1',
    role,
    criterion_key: key,
    criterion_name: key.replace(/_/g, ' '),
    description: `Description of ${key}`,
    observable_evidence: `Observable evidence for ${key}`,
    weak_evidence_description: `Weak ${key}`,
    strong_evidence_description: `Strong ${key}`,
    scoring_guidance: `Guidance ${key}`,
    weight,
    sort_order: i,
    calibration_rationale: `Rationale ${key}`,
  };
}

export const rubric: RubricWithCriteria = {
  id: 'r1',
  name: 'Test rubric',
  version: 3,
  status: 'ACTIVE',
  source: 'CALIBRATION',
  parent_rubric_id: null,
  calibration_patterns: [],
  calibration_model: 'm',
  created_at: '2026-01-01T00:00:00Z',
  approved_at: '2026-01-01T00:00:00Z',
  criteria: [
    c('PM', 'ground_truth', 30, 0),
    c('PM', 'self_started', 30, 1),
    c('PM', 'ownership', 25, 2),
    c('PM', 'learning_loop', 15, 3),
    c('SPM', 'ground_truth', 20, 0),
    c('SPM', 'self_started', 20, 1),
    c('SPM', 'ownership', 35, 2),
    c('SPM', 'systems_scope', 25, 3),
  ],
};

export const cvText = `Product Manager | Stockline Systems
- Spent six weeks on warehouse floors shadowing pickers before writing the first spec for cycle counting
- Killed a barcode feature after two weeks of low usage and moved the team to exception alerts, which cut mis-picks by 18%`;

export function answer(keys: string[], score = 3, evidence = 'Spent six weeks on warehouse floors shadowing pickers') {
  return keys.map((k) => ({ criterion_key: k, raw_score: score, evidence_status: score === 0 ? 'ABSENT' : 'PRESENT', evidence: score === 0 ? 'No evidence present in the CV.' : evidence, reasoning: 'Clear ownership and outcome.' }));
}
