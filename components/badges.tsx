import { DECISION_LABEL, type FounderDecision, type ProcessingStatus } from '@/lib/domain';

const tone = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  blue: 'bg-sky-50 text-sky-800 ring-sky-200',
  green: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  navy: 'bg-navy-900 text-white ring-navy-900',
  violet: 'bg-violet-50 text-violet-800 ring-violet-200',
};
export type Tone = keyof typeof tone;

export function Badge({ children, color = 'slate', title }: { children: React.ReactNode; color?: Tone; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${tone[color]}`}>
      {children}
    </span>
  );
}

const STATUS: Record<ProcessingStatus, { label: string; color: Tone }> = {
  UPLOADED: { label: 'Uploaded', color: 'slate' },
  PARSING: { label: 'Parsing', color: 'blue' },
  EXTRACTING: { label: 'Extracting', color: 'blue' },
  SCORING: { label: 'Scoring', color: 'blue' },
  GENERATING_OUTPUTS: { label: 'Generating outputs', color: 'blue' },
  READY: { label: 'Ready', color: 'green' },
  AI_FAILED: { label: 'AI failed', color: 'red' },
  PARSE_FAILED: { label: 'Parse failed', color: 'red' },
  EMAIL_SENT: { label: 'Email sent', color: 'violet' },
};

export function StatusBadge({ status, stale }: { status: ProcessingStatus; stale?: boolean }) {
  const s = STATUS[status];
  return (
    <Badge color={stale ? 'amber' : s.color} title={stale ? 'No progress for over 5 minutes: open the candidate and press Retry.' : undefined}>
      {stale ? `${s.label} (stalled)` : s.label}
    </Badge>
  );
}

export function DecisionBadge({ decision }: { decision: FounderDecision }) {
  const color: Tone = decision === 'INTERVIEW' ? 'green' : decision === 'REJECT' ? 'red' : decision === 'HOLD' ? 'amber' : 'slate';
  return <Badge color={color}>{DECISION_LABEL[decision]}</Badge>;
}

export function EmailStatusBadge({ status }: { status: 'SENT' | 'FAILED' | 'SENDING' | null }) {
  if (!status) return <span className="text-xs text-slate-400">Not sent</span>;
  return <Badge color={status === 'SENT' ? 'violet' : status === 'FAILED' ? 'red' : 'blue'}>{status === 'SENT' ? 'Sent' : status === 'FAILED' ? 'Failed' : 'Sending'}</Badge>;
}

