-- Optional, additive: lets match cards show matched / related / missing skills, availability and
-- collaboration for each recommended student. Nothing existing is changed or deleted.
-- Without it matching still works (core score, matched skills and explanation are saved as before).
alter table public.match_scores add column if not exists details jsonb;
comment on column public.match_scores.details is
  'Skill-first matching breakdown (algorithm_version, per-category scores, matched/related/missing skills).';
