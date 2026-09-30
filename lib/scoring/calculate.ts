// Deterministic score arithmetic. The AI only ever returns raw 0-4 scores per criterion; everything here is code.
import { MAX_RAW_SCORE, SHORTLIST_SIZE } from '../domain';

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** weighted = (raw / max_raw) x weight. A criterion worth 25% scored 3/4 contributes 18.75 points. */
export function weightedScore(rawScore: number, weight: number): number {
  if (!Number.isInteger(rawScore) || rawScore < 0 || rawScore > MAX_RAW_SCORE) throw new Error(`raw score out of range: ${rawScore}`);
  if (!(weight > 0 && weight <= 100)) throw new Error(`weight out of range: ${weight}`);
  return round3((rawScore / MAX_RAW_SCORE) * weight);
}

/** Role total out of 100 = sum of weighted criterion scores. */
export function roleTotal(weighted: number[]): number {
  return round3(weighted.reduce((a, b) => a + b, 0));
}

/** Totals are displayed to one decimal place everywhere. */
export function displayScore(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : (Math.round(n * 10) / 10).toFixed(1);
}

export interface ScoredCriterion {
  criterion_key: string;
  criterion_name: string;
  raw_score: number;
  criterion_weight: number;
  weighted_score: number;
  evidence: string;
  sort_order?: number;
}

/** The criterion that contributed the most points (only if it reached at least "some evidence"). */
export function strongestCriterion<T extends ScoredCriterion>(scores: T[]): T | null {
  const ranked = [...scores].filter((s) => s.raw_score >= 2).sort((a, b) => b.weighted_score - a.weighted_score || b.criterion_weight - a.criterion_weight);
  return ranked[0] ?? null;
}

/** The criterion where the most available points were lost: the most important thing the CV leaves unproven. */
export function primaryGap<T extends ScoredCriterion>(scores: T[]): T | null {
  const lost = (s: ScoredCriterion) => s.criterion_weight - s.weighted_score;
  const ranked = [...scores].filter((s) => s.raw_score < MAX_RAW_SCORE).sort((a, b) => lost(b) - lost(a) || b.criterion_weight - a.criterion_weight);
  return ranked[0] ?? null;
}

/** System recommendation: inside the top N of the applied role. Ties at the boundary are all included. */
export function isShortlistRecommended(rank: number | null | undefined, size = SHORTLIST_SIZE): boolean {
  return rank !== null && rank !== undefined && rank <= size;
}

/** What the dashboard shows: the founder's override wins over the recommendation. */
export function isShortlisted(rank: number | null | undefined, override: 'IN' | 'OUT' | null | undefined, size = SHORTLIST_SIZE): boolean {
  if (override === 'IN') return true;
  if (override === 'OUT') return false;
  return isShortlistRecommended(rank, size);
}

/**
 * Standard competition ranking (1, 2, 2, 4) on totals rounded to the displayed precision, so candidates who look
 * tied are tied. Equal totals keep upload order, which is only used to order rows deterministically.
 */
export function competitionRank<T extends { total: number; createdAt: string }>(items: T[]): (T & { rank: number })[] {
  const sorted = [...items].sort((a, b) => Math.round(b.total * 10) - Math.round(a.total * 10) || a.createdAt.localeCompare(b.createdAt));
  let prev: number | null = null;
  let prevRank = 0;
  return sorted.map((item, i) => {
    const key = Math.round(item.total * 10);
    const rank = key === prev ? prevRank : i + 1;
    prev = key;
    prevRank = rank;
    return { ...item, rank };
  });
}
