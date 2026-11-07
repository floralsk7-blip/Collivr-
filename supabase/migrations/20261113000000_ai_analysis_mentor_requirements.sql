-- Collivra Smart Mentor Matching: Sub-phase 3
-- Add AI mentor requirement analysis columns to public.ai_analysis
-- and allow 'both' in public.projects.mentor_preference check constraint.

alter table public.ai_analysis
  add column if not exists recommended_mentor_type text,
  add column if not exists mentor_focus_areas text[] not null default '{}',
  add column if not exists mentor_guidance_notes text;

comment on column public.ai_analysis.recommended_mentor_type is
  'AI-recommended mentor type: College Professor, Industry Expert, or Both.';
comment on column public.ai_analysis.mentor_focus_areas is
  'Key technical or domain topics where mentorship is most valuable.';
comment on column public.ai_analysis.mentor_guidance_notes is
  'AI rationale explaining the mentor recommendation for this project.';

-- Allow 'both' in projects.mentor_preference for dual academic and industry guidance
alter table public.projects drop constraint if exists projects_mentor_preference_check;
alter table public.projects add constraint projects_mentor_preference_check
  check (mentor_preference in ('none', 'professor', 'industry', 'ai', 'both'));
