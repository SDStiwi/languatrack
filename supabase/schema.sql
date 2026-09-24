-- LinguaTrack database
-- Run this entire file in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  age_group text not null check (age_group in ('Child','Teen','Adult')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.tests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text not null default 'progress' check (type in ('initial','progress')),
  target_level text,
  description text,
  published boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.tests(id) on delete cascade,
  level text,
  skill text not null,
  question_text text not null,
  options jsonb not null,
  correct_answer integer not null,
  explanation text,
  sort_order integer not null default 0
);

create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  type text not null check (type in ('initial','progress')),
  test_id uuid references public.tests(id) on delete set null,
  title text not null,
  score integer not null check (score between 0 and 100),
  estimated_level text,
  started_at timestamptz,
  completed_at timestamptz not null default now()
);

create table if not exists public.assessment_answers (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  question_id text not null,
  selected_answer integer,
  is_correct boolean not null default false
);

create index if not exists idx_assessments_student on public.assessments(student_id);
create index if not exists idx_questions_test on public.questions(test_id);

-- Enable Row Level Security.
alter table public.students enable row level security;
alter table public.tests enable row level security;
alter table public.questions enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_answers enable row level security;

-- MVP policies:
-- These allow the browser to use the tables with the publishable/anon key.
-- IMPORTANT: before using this with real student data at scale, add teacher authentication
-- and replace these broad policies with authenticated teacher-only policies.

drop policy if exists "MVP students read" on public.students;
create policy "MVP students read" on public.students for select using (true);

drop policy if exists "MVP students insert" on public.students;
create policy "MVP students insert" on public.students for insert with check (true);

drop policy if exists "MVP students update" on public.students;
create policy "MVP students update" on public.students for update using (true) with check (true);

drop policy if exists "MVP tests read" on public.tests;
create policy "MVP tests read" on public.tests for select using (true);

drop policy if exists "MVP tests insert" on public.tests;
create policy "MVP tests insert" on public.tests for insert with check (true);

drop policy if exists "MVP questions read" on public.questions;
create policy "MVP questions read" on public.questions for select using (true);

drop policy if exists "MVP questions insert" on public.questions;
create policy "MVP questions insert" on public.questions for insert with check (true);

drop policy if exists "MVP assessments read" on public.assessments;
create policy "MVP assessments read" on public.assessments for select using (true);

drop policy if exists "MVP assessments insert" on public.assessments;
create policy "MVP assessments insert" on public.assessments for insert with check (true);

drop policy if exists "MVP answers read" on public.assessment_answers;
create policy "MVP answers read" on public.assessment_answers for select using (true);

drop policy if exists "MVP answers insert" on public.assessment_answers;
create policy "MVP answers insert" on public.assessment_answers for insert with check (true);

-- Speeds up loading a student's saved answers.
create index if not exists idx_answers_assessment on public.assessment_answers(assessment_id);
