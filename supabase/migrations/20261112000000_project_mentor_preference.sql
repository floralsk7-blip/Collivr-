-- Collivra Smart Mentor Matching: Sub-phase 2
-- Add mentor_preference column to public.projects.
-- Allowed values: 'none', 'professor', 'industry', 'ai'

alter table public.projects
  add column if not exists mentor_preference text not null default 'none'
  check (mentor_preference in ('none', 'professor', 'industry', 'ai'));

comment on column public.projects.mentor_preference is
  'Mentor preference chosen during project creation: none, professor, industry, ai.';

