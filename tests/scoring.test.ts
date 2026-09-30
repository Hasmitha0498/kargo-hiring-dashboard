import { describe, expect, it } from 'vitest';
import { competitionRank, displayScore, isShortlisted, isShortlistRecommended, primaryGap, roleTotal, strongestCriterion, weightedScore } from '@/lib/scoring/calculate';
import { checkRubric } from '@/lib/rubric/validate';
import { isEvidenceGrounded } from '@/lib/scoring/grounding';

describe('weighted score calculation (TEST 7)', () => {
  it('applies (raw / 4) x weight', () => {
    expect(weightedScore(4, 25)).toBe(25);
    expect(weightedScore(3, 25)).toBe(18.75);
    expect(weightedScore(0, 40)).toBe(0);
    expect(weightedScore(1, 15)).toBe(3.75);
  });
  it('sums to a role total of at most 100', () => {
    const t = roleTotal([weightedScore(4, 30), weightedScore(3, 30), weightedScore(2, 25), weightedScore(1, 15)]);
    expect(t).toBe(30 + 22.5 + 12.5 + 3.75);
    expect(roleTotal([30, 30, 25, 15])).toBe(100);
  });
  it('rejects out-of-range inputs', () => {
    expect(() => weightedScore(5, 20)).toThrow();
    expect(() => weightedScore(2.5, 20)).toThrow();
    expect(() => weightedScore(2, 0)).toThrow();
  });
  it('displays one decimal place', () => {
    expect(displayScore(68.75)).toBe('68.8');
    expect(displayScore(70)).toBe('70.0');
    expect(displayScore(null)).toBe('—');
  });
});

describe('ranking and shortlist (TEST 8)', () => {
  it('ranks by score descending with shared ranks for displayed ties, upload order as tiebreak', () => {
    const ranked = competitionRank([
      { id: 'a', total: 60, createdAt: '2026-01-03' },
      { id: 'b', total: 80.04, createdAt: '2026-01-02' },
      { id: 'c', total: 80.01, createdAt: '2026-01-01' },
      { id: 'd', total: 40, createdAt: '2026-01-04' },
    ]);
    expect(ranked.map((r) => [r.id, r.rank])).toEqual([
      ['c', 1],
      ['b', 1],
      ['a', 3],
      ['d', 4],
    ]);
  });
  it('recommends the top 5 only, and founder overrides win', () => {
    expect(isShortlistRecommended(5)).toBe(true);
    expect(isShortlistRecommended(6)).toBe(false);
    expect(isShortlistRecommended(null)).toBe(false);
    expect(isShortlisted(9, 'IN')).toBe(true);
    expect(isShortlisted(1, 'OUT')).toBe(false);
    expect(isShortlisted(2, null)).toBe(true);
  });
});

describe('strongest evidence and primary gap', () => {
  const rows = [
    { criterion_key: 'a', criterion_name: 'A', raw_score: 4, criterion_weight: 20, weighted_score: 20, evidence: 'x' },
    { criterion_key: 'b', criterion_name: 'B', raw_score: 2, criterion_weight: 40, weighted_score: 20, evidence: 'y' },
    { criterion_key: 'c', criterion_name: 'C', raw_score: 1, criterion_weight: 40, weighted_score: 10, evidence: 'z' },
  ];
  it('strongest = most points earned (weight breaks ties)', () => expect(strongestCriterion(rows)?.criterion_key).toBe('b'));
  it('gap = most points lost', () => expect(primaryGap(rows)?.criterion_key).toBe('c'));
  it('no strongest when nothing reaches 2', () => expect(strongestCriterion(rows.map((r) => ({ ...r, raw_score: 1 })))).toBeNull());
});

describe('rubric validation (TEST 2)', () => {
  const base = (w: number[], role: 'PM' | 'SPM') => w.map((weight, i) => ({ role, criterion_key: `k${i}`, weight }));
  it('accepts 4-6 criteria per role totalling 100', () => expect(checkRubric([...base([25, 25, 25, 25], 'PM'), ...base([20, 20, 20, 20, 20], 'SPM')]).ok).toBe(true));
  it('rejects weights that do not total 100', () => {
    const r = checkRubric([...base([25, 25, 25, 20], 'PM'), ...base([20, 20, 20, 20, 20], 'SPM')]);
    expect(r.ok).toBe(false);
    expect(r.totals.PM).toBe(95);
  });
  it('rejects too few criteria', () => expect(checkRubric([...base([50, 50], 'PM'), ...base([25, 25, 25, 25], 'SPM')]).ok).toBe(false));
});

describe('evidence grounding', () => {
  const cv = 'Killed a barcode feature after two weeks of low usage and moved the team to exception alerts, which cut mis-picks by 18%';
  it('accepts verbatim excerpts, ignoring punctuation and quotes', () => expect(isEvidenceGrounded('"killed a barcode feature after two weeks" … cut mis-picks by 18%', cv)).toBe(true));
  it('flags invented text', () => expect(isEvidenceGrounded('Increased revenue by 40% across four regions', cv)).toBe(false));
});
