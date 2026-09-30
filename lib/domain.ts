// Shared vocabulary. Nothing in here knows about any particular person.

export const ROLES = ['PM', 'SPM'] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABEL: Record<Role, string> = { PM: 'Product Manager', SPM: 'Senior Product Manager' };
export const isRole = (v: unknown): v is Role => v === 'PM' || v === 'SPM';

export const OUTCOMES = ['EXCEEDS', 'MEETS', 'BELOW'] as const;
export type Outcome = (typeof OUTCOMES)[number];
export const OUTCOME_LABEL: Record<Outcome, string> = {
  EXCEEDS: 'Exceeds Expectations',
  MEETS: 'Meets Expectations',
  BELOW: 'Below Expectations',
};

export type ProcessingStatus =
  | 'UPLOADED'
  | 'PARSING'
  | 'EXTRACTING'
  | 'SCORING'
  | 'GENERATING_OUTPUTS'
  | 'READY'
  | 'AI_FAILED'
  | 'PARSE_FAILED'
  | 'EMAIL_SENT';
export const IN_PROGRESS_STATUSES: ProcessingStatus[] = ['UPLOADED', 'PARSING', 'EXTRACTING', 'SCORING', 'GENERATING_OUTPUTS'];

export type EvidenceStatus = 'PRESENT' | 'ABSENT' | 'NEGATIVE';
export type SuggestedAction = 'INTERVIEW' | 'REJECT';
export type FounderDecision = 'UNDECIDED' | 'INTERVIEW' | 'REJECT' | 'HOLD';
export const DECISION_LABEL: Record<FounderDecision, string> = {
  UNDECIDED: 'Undecided',
  INTERVIEW: 'Interview',
  REJECT: 'Reject',
  HOLD: 'Hold',
};
export type EmailType = 'INTERVIEW_INVITE' | 'WARM_REJECTION';
export const EMAIL_TYPE_LABEL: Record<EmailType, string> = { INTERVIEW_INVITE: 'Interview invite', WARM_REJECTION: 'Warm rejection' };
export const emailTypeForDecision = (d: FounderDecision): EmailType | null =>
  d === 'INTERVIEW' ? 'INTERVIEW_INVITE' : d === 'REJECT' ? 'WARM_REJECTION' : null;

/** Scoring scale shared by every criterion. The rubric defines what counts as evidence; this defines the levels. */
export const MAX_RAW_SCORE = 4;
export const SCORE_SCALE: { score: number; label: string }[] = [
  { score: 0, label: 'No relevant evidence' },
  { score: 1, label: 'Very weak / claim-level evidence' },
  { score: 2, label: 'Some relevant evidence, but ownership, complexity or outcome is unclear' },
  { score: 3, label: 'Clear evidence of ownership and outcome' },
  { score: 4, label: 'Strong evidence of ownership in a complex/ambiguous context with meaningful observable consequences' },
];

/** Default shortlist size per role. A recommendation only. */
export const SHORTLIST_SIZE = 5;

export interface Criterion {
  id: string;
  rubric_id: string;
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

export interface Rubric {
  id: string;
  name: string;
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  source: 'CALIBRATION' | 'EDIT';
  parent_rubric_id: string | null;
  calibration_patterns: CalibrationPattern[];
  calibration_model: string | null;
  created_at: string;
  approved_at: string | null;
}

export interface RubricWithCriteria extends Rubric {
  criteria: Criterion[];
}

export interface CalibrationPattern {
  name: string;
  description: string;
  evidence_in_higher_performers: string;
  contrast_with_others: string;
}

export const criteriaFor = (rubric: RubricWithCriteria, role: Role) =>
  rubric.criteria.filter((c) => c.role === role).sort((a, b) => a.sort_order - b.sort_order);
