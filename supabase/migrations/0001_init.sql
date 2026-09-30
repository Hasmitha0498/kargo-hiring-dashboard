-- Kargo Hiring Dashboard: complete schema.
-- Run once in Supabase (SQL Editor -> New query -> paste -> Run).
--
-- Two separate worlds live here:
--   CALIBRATION: role_profiles, calibration_hires, rubrics, rubric_criteria, rubric_calibration_sources
--   RUNTIME:     candidates, candidate_private, evaluations, candidate_scores, candidate_role_scores,
--                candidate_outputs, founder_decisions, email_events
-- Runtime tables never reference calibration_hires.
--
-- Row Level Security is enabled on every table with NO policies: the public/anon key can read nothing.
-- The app talks to the database only from the server, with the service role key.

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------ calibration

create table role_profiles (
  role text primary key check (role in ('PM', 'SPM')),
  title text not null,
  jd_text text not null,
  updated_at timestamptz not null default now()
);

create table calibration_hires (
  id uuid primary key default gen_random_uuid(),
  -- Private label for the admin only (e.g. the person's name). Never sent to the AI.
  private_label text not null,
  role_hired text not null,
  performance_outcome text not null check (performance_outcome in ('EXCEEDS', 'MEETS', 'BELOW')),
  original_file_name text,
  -- CV text with identity removed. This is what calibration sends to the AI.
  professional_text text not null,
  notes text,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create table rubrics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version int not null unique,
  status text not null check (status in ('DRAFT', 'ACTIVE', 'ARCHIVED')),
  source text not null check (source in ('CALIBRATION', 'EDIT')),
  parent_rubric_id uuid references rubrics (id),
  -- Recurring success patterns found during calibration: [{name, description, evidence, contrast}]
  calibration_patterns jsonb not null default '[]'::jsonb,
  calibration_model text,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);
-- At most one ACTIVE rubric at any moment.
create unique index rubrics_one_active on rubrics (status) where status = 'ACTIVE';

create table rubric_criteria (
  id uuid primary key default gen_random_uuid(),
  rubric_id uuid not null references rubrics (id) on delete cascade,
  role text not null check (role in ('PM', 'SPM')),
  criterion_key text not null check (criterion_key ~ '^[a-z][a-z0-9_]{1,59}$'),
  criterion_name text not null,
  description text not null,
  observable_evidence text not null,
  weak_evidence_description text not null,
  strong_evidence_description text not null,
  scoring_guidance text not null,
  weight numeric(5, 2) not null check (weight > 0 and weight <= 100),
  sort_order int not null default 0,
  calibration_rationale text not null,
  created_at timestamptz not null default now(),
  unique (rubric_id, role, criterion_key)
);

create table rubric_calibration_sources (
  rubric_id uuid not null references rubrics (id) on delete cascade,
  calibration_hire_id uuid not null references calibration_hires (id) on delete cascade,
  primary key (rubric_id, calibration_hire_id)
);

-- ------------------------------------------------------------------ runtime

create table candidates (
  id uuid primary key default gen_random_uuid(),
  applied_role text not null check (applied_role in ('PM', 'SPM')),
  original_file_name text not null,
  -- CV content with identity removed. The only candidate text the AI ever sees.
  professional_cv_text text,
  processing_status text not null default 'UPLOADED' check (processing_status in (
    'UPLOADED', 'PARSING', 'EXTRACTING', 'SCORING', 'GENERATING_OUTPUTS', 'READY',
    'AI_FAILED', 'PARSE_FAILED', 'EMAIL_SENT')),
  failed_stage text,
  error_message text,
  -- Founder override of the shortlist recommendation: null = follow recommendation.
  shortlist_override text check (shortlist_override in ('IN', 'OUT')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index candidates_role_idx on candidates (applied_role, created_at);

create table candidate_private (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null unique references candidates (id) on delete cascade,
  candidate_name text,
  email text,
  phone text,
  linkedin_url text,
  portfolio_url text,
  github_url text,
  address text,
  other_private_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table evaluations (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates (id) on delete cascade,
  rubric_id uuid not null references rubrics (id),
  rubric_version int not null,
  model text not null,
  prompt_version text not null,
  created_at timestamptz not null default now()
);

create table candidate_scores (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references evaluations (id) on delete cascade,
  candidate_id uuid not null references candidates (id) on delete cascade,
  rubric_id uuid not null references rubrics (id),
  rubric_version int not null,
  evaluated_role text not null check (evaluated_role in ('PM', 'SPM')),
  criterion_id uuid not null references rubric_criteria (id),
  criterion_key text not null,
  criterion_name text not null,
  raw_score int not null check (raw_score between 0 and 4),
  criterion_weight numeric(5, 2) not null,
  weighted_score numeric(6, 3) not null,
  evidence text not null,
  evidence_status text not null check (evidence_status in ('PRESENT', 'ABSENT', 'NEGATIVE')),
  evidence_verified boolean not null default false,
  reasoning text not null,
  model text not null,
  created_at timestamptz not null default now()
);
create index candidate_scores_eval_idx on candidate_scores (evaluation_id);

-- Current total per candidate per role (always from the latest evaluation).
create table candidate_role_scores (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates (id) on delete cascade,
  evaluation_id uuid not null references evaluations (id) on delete cascade,
  role text not null check (role in ('PM', 'SPM')),
  rubric_version int not null,
  total_score numeric(6, 3) not null,
  -- Rank among applicants for this role; null for the cross-role (informational) score.
  rank int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (candidate_id, role)
);

create table candidate_outputs (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null unique references candidates (id) on delete cascade,
  evaluation_id uuid references evaluations (id) on delete set null,
  interview_brief text not null,   -- why they ranked where they did
  uncertainty text not null,       -- what the CV leaves unproven
  interview_probe text not null,   -- one specific question
  suggested_action text not null check (suggested_action in ('INTERVIEW', 'REJECT')),
  invite_subject text not null,
  invite_body text not null,
  rejection_subject text not null,
  rejection_body text not null,
  -- The editable draft the founder will send (starts as a copy of invite or rejection).
  email_type text check (email_type in ('INTERVIEW_INVITE', 'WARM_REJECTION')),
  email_subject text,
  email_body text,
  model text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Append-only: every decision change is a new row, the latest row is current.
create table founder_decisions (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates (id) on delete cascade,
  ai_suggested_action text check (ai_suggested_action in ('INTERVIEW', 'REJECT')),
  founder_decision text not null check (founder_decision in ('UNDECIDED', 'INTERVIEW', 'REJECT', 'HOLD')),
  decision_notes text,
  decided_at timestamptz not null default now()
);
create index founder_decisions_candidate_idx on founder_decisions (candidate_id, decided_at desc);

create table email_events (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates (id) on delete cascade,
  recipient text not null,           -- where it was actually delivered
  intended_recipient text,           -- the candidate address (differs in test mode)
  test_mode boolean not null,
  message_type text not null check (message_type in ('INTERVIEW_INVITE', 'WARM_REJECTION')),
  subject text not null,
  body text not null,
  provider_message_id text,
  status text not null check (status in ('SENDING', 'SENT', 'FAILED')),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
-- Duplicate-send guard: only one in-flight or delivered email per candidate.
create unique index email_events_one_live on email_events (candidate_id) where status in ('SENDING', 'SENT');

create table activity_log (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  candidate_id uuid references candidates (id) on delete set null,
  rubric_id uuid references rubrics (id) on delete set null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_log_created_idx on activity_log (created_at desc);

-- ------------------------------------------------------------------ functions

-- Activate a DRAFT rubric: archive the current ACTIVE one and activate this one in one transaction.
create or replace function activate_rubric(p_rubric_id uuid) returns void
language plpgsql as $$
declare
  v_status text;
  v_pm numeric;
  v_spm numeric;
begin
  select status into v_status from rubrics where id = p_rubric_id for update;
  if v_status is null then raise exception 'rubric not found'; end if;
  if v_status <> 'DRAFT' then raise exception 'only a DRAFT rubric can be approved'; end if;
  select coalesce(sum(weight), 0) into v_pm from rubric_criteria where rubric_id = p_rubric_id and role = 'PM';
  select coalesce(sum(weight), 0) into v_spm from rubric_criteria where rubric_id = p_rubric_id and role = 'SPM';
  if v_pm <> 100 or v_spm <> 100 then
    raise exception 'weights must total 100 for each role (PM %, SPM %)', v_pm, v_spm;
  end if;
  update rubrics set status = 'ARCHIVED' where status = 'ACTIVE';
  update rubrics set status = 'ACTIVE', approved_at = now() where id = p_rubric_id;
end;
$$;

-- Record one complete evaluation atomically: the evaluation, every criterion score and both role totals.
-- p_scores: [{evaluated_role, criterion_id, criterion_key, criterion_name, raw_score, criterion_weight,
--             weighted_score, evidence, evidence_status, evidence_verified, reasoning}]
-- p_totals: [{role, total_score}]
create or replace function record_evaluation(
  p_candidate_id uuid, p_rubric_id uuid, p_rubric_version int, p_model text, p_prompt_version text,
  p_scores jsonb, p_totals jsonb
) returns uuid
language plpgsql as $$
declare
  v_eval uuid;
begin
  insert into evaluations (candidate_id, rubric_id, rubric_version, model, prompt_version)
  values (p_candidate_id, p_rubric_id, p_rubric_version, p_model, p_prompt_version)
  returning id into v_eval;

  insert into candidate_scores (evaluation_id, candidate_id, rubric_id, rubric_version, evaluated_role,
    criterion_id, criterion_key, criterion_name, raw_score, criterion_weight, weighted_score,
    evidence, evidence_status, evidence_verified, reasoning, model)
  select v_eval, p_candidate_id, p_rubric_id, p_rubric_version, s->>'evaluated_role',
    (s->>'criterion_id')::uuid, s->>'criterion_key', s->>'criterion_name', (s->>'raw_score')::int,
    (s->>'criterion_weight')::numeric, (s->>'weighted_score')::numeric,
    s->>'evidence', s->>'evidence_status', coalesce((s->>'evidence_verified')::boolean, false), s->>'reasoning', p_model
  from jsonb_array_elements(p_scores) s;

  insert into candidate_role_scores (candidate_id, evaluation_id, role, rubric_version, total_score)
  select p_candidate_id, v_eval, t->>'role', p_rubric_version, (t->>'total_score')::numeric
  from jsonb_array_elements(p_totals) t
  on conflict (candidate_id, role) do update
    set evaluation_id = excluded.evaluation_id, rubric_version = excluded.rubric_version,
        total_score = excluded.total_score, updated_at = now();

  return v_eval;
end;
$$;

-- Re-rank applicants of one role by that role's total (desc). Ties share a rank (1, 2, 2, 4).
-- Cross-role scores (candidate did not apply for this role) get rank null.
create or replace function recompute_ranks(p_role text) returns void
language plpgsql as $$
begin
  update candidate_role_scores rs set rank = null, updated_at = now()
  from candidates c
  where rs.candidate_id = c.id and rs.role = p_role and c.applied_role <> p_role and rs.rank is not null;

  update candidate_role_scores rs set rank = r.rnk, updated_at = now()
  from (
    select rs2.id, rank() over (order by round(rs2.total_score, 1) desc) as rnk
    from candidate_role_scores rs2 join candidates c on c.id = rs2.candidate_id
    where rs2.role = p_role and c.applied_role = p_role
  ) r
  where rs.id = r.id and rs.rank is distinct from r.rnk;
end;
$$;

-- ------------------------------------------------------------------ security

alter table role_profiles enable row level security;
alter table calibration_hires enable row level security;
alter table rubrics enable row level security;
alter table rubric_criteria enable row level security;
alter table rubric_calibration_sources enable row level security;
alter table candidates enable row level security;
alter table candidate_private enable row level security;
alter table evaluations enable row level security;
alter table candidate_scores enable row level security;
alter table candidate_role_scores enable row level security;
alter table candidate_outputs enable row level security;
alter table founder_decisions enable row level security;
alter table email_events enable row level security;
alter table activity_log enable row level security;

-- Functions are callable only with the service role (Supabase grants anon/authenticated by default).
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function activate_rubric(uuid) from %I', r);
      execute format('revoke execute on function record_evaluation(uuid, uuid, int, text, text, jsonb, jsonb) from %I', r);
      execute format('revoke execute on function recompute_ranks(text) from %I', r);
    end if;
  end loop;
end $$;
revoke execute on function activate_rubric(uuid) from public;
revoke execute on function record_evaluation(uuid, uuid, int, text, text, jsonb, jsonb) from public;
revoke execute on function recompute_ranks(text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function activate_rubric(uuid) to service_role;
    grant execute on function record_evaluation(uuid, uuid, int, text, text, jsonb, jsonb) to service_role;
    grant execute on function recompute_ranks(text) to service_role;
  end if;
end $$;
