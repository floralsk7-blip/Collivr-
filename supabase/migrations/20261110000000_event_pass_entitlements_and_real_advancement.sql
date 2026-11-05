-- Enforce paid Event Pass entitlements and implement deterministic automatic advancement.
-- Safe additive migration: existing events/stages/submissions/payments are retained.
begin;

alter table public.event_stages
  add column if not exists advancement_rule text not null default 'score_threshold',
  add column if not exists advancement_threshold numeric(5,2),
  add column if not exists advancement_top_n integer,
  add column if not exists evaluation_criteria jsonb not null default '[]'::jsonb;

alter table public.event_evaluations
  add column if not exists criteria_scores jsonb not null default '{}'::jsonb;

-- Give legacy automatic stages explicit defaults and move legacy Standard-pass stages
-- to manual mode, because automatic advancement is now an Advanced/Complex entitlement.
update public.event_stages s set advancement_mode='manual'
where s.advancement_mode='automatic' and exists (
  select 1 from public.events e where e.id=s.event_id and coalesce(e.event_pass_tier,'standard')='standard'
);
update public.event_stages set advancement_threshold=70
where advancement_mode='automatic' and advancement_rule='score_threshold' and advancement_threshold is null;
update public.event_stages set advancement_top_n=10
where advancement_mode='automatic' and advancement_rule='top_n' and advancement_top_n is null;

alter table public.event_stages drop constraint if exists event_stages_advancement_rule_check;
alter table public.event_stages add constraint event_stages_advancement_rule_check
  check (advancement_rule in ('score_threshold','top_n'));
alter table public.event_stages drop constraint if exists event_stages_advancement_threshold_check;
alter table public.event_stages add constraint event_stages_advancement_threshold_check
  check (advancement_threshold is null or advancement_threshold between 0 and 100);
alter table public.event_stages drop constraint if exists event_stages_advancement_top_n_check;
alter table public.event_stages add constraint event_stages_advancement_top_n_check
  check (advancement_top_n is null or advancement_top_n > 0);

create or replace function public.enforce_collivra_stage_entitlements()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_tier text; v_count integer;
begin
  select coalesce(event_pass_tier,'standard') into v_tier from public.events where id=new.event_id;
  if v_tier is null then raise exception 'Event not found.'; end if;
  if tg_op='INSERT' then
    select count(*) into v_count from public.event_stages where event_id=new.event_id;
    if v_tier='standard' and v_count>=3 then raise exception 'Standard Event Pass allows up to 3 stages. Upgrade to Advanced for up to 10 stages.'; end if;
    if v_tier='advanced' and v_count>=10 then raise exception 'Advanced Event Pass allows up to 10 stages. Upgrade to Complex for unlimited stages.'; end if;
  end if;
  if new.advancement_mode='automatic' and v_tier not in ('advanced','complex') then
    raise exception 'Automatic advancement requires the Advanced or Complex Event Pass.';
  end if;
  if new.advancement_mode='automatic' then
    if new.advancement_rule='score_threshold' and (new.advancement_threshold is null or new.advancement_threshold<0 or new.advancement_threshold>100) then
      raise exception 'Set an automatic advancement score threshold from 0 to 100.';
    end if;
    if new.advancement_rule='top_n' and (new.advancement_top_n is null or new.advancement_top_n<1) then
      raise exception 'Set how many top participants should advance.';
    end if;
  end if;
  if jsonb_typeof(coalesce(new.evaluation_criteria,'[]'::jsonb))<>'array' then raise exception 'Evaluation criteria must be a JSON array.'; end if;
  if jsonb_array_length(coalesce(new.evaluation_criteria,'[]'::jsonb))>0 then
    if v_tier<>'complex' then raise exception 'Weighted judging rubrics require the Complex Event Pass.'; end if;
    if abs(coalesce((select sum((item->>'weight')::numeric) from jsonb_array_elements(new.evaluation_criteria) item),0)-100)>0.01 then
      raise exception 'Evaluation criteria weights must total 100.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_collivra_stage_entitlements_trg on public.event_stages;
create trigger enforce_collivra_stage_entitlements_trg
before insert or update on public.event_stages
for each row execute function public.enforce_collivra_stage_entitlements();

create or replace function public.enforce_collivra_activity_entitlements()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_tier text;
begin
  select coalesce(e.event_pass_tier,'standard') into v_tier
  from public.event_stages s join public.events e on e.id=s.event_id where s.id=new.stage_id;
  if new.team_submission and v_tier not in ('advanced','complex') then
    raise exception 'Team submissions require the Advanced or Complex Event Pass.';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_collivra_activity_entitlements_trg on public.event_activities;
create trigger enforce_collivra_activity_entitlements_trg
before insert or update on public.event_activities
for each row execute function public.enforce_collivra_activity_entitlements();

-- Complex-pass rubric scoring: weighted criterion scores are computed in the database,
-- so the stored overall score is not trusted from the browser.
create or replace function public.calculate_collivra_rubric_score()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_criteria jsonb; v_total numeric:=0; v_weight numeric:=0; v_item jsonb; v_value numeric; v_w numeric;
begin
  select s.evaluation_criteria into v_criteria
  from public.event_submissions sub join public.event_stages s on s.id=sub.stage_id
  where sub.id=new.submission_id;
  if jsonb_typeof(coalesce(v_criteria,'[]'::jsonb))='array' and jsonb_array_length(v_criteria)>0 then
    for v_item in select value from jsonb_array_elements(v_criteria) loop
      if not (new.criteria_scores ? (v_item->>'label')) then raise exception 'Enter a score for every judging criterion.'; end if;
      v_value := (new.criteria_scores->>(v_item->>'label'))::numeric;
      v_w := (v_item->>'weight')::numeric;
      if v_value<0 or v_value>100 then raise exception 'Each criterion score must be between 0 and 100.'; end if;
      v_total := v_total + (v_value*v_w);
      v_weight := v_weight + v_w;
    end loop;
    if v_weight<=0 then raise exception 'Judging rubric weights must total more than zero.'; end if;
    new.score := round(v_total/v_weight,2);
  end if;
  return new;
end;
$$;

drop trigger if exists calculate_collivra_rubric_score_trg on public.event_evaluations;
create trigger calculate_collivra_rubric_score_trg
before insert or update of criteria_scores,score on public.event_evaluations
for each row execute function public.calculate_collivra_rubric_score();

-- Disable the previous per-review automatic advancement trigger. Automatic progression
-- now happens once, after the organiser closes the stage and explicitly runs its rule.
drop trigger if exists auto_advance_event_participant_trg on public.event_evaluations;

create or replace function public.finalize_event_stage_advancement(p_stage_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_stage public.event_stages%rowtype;
  v_next public.event_stages%rowtype;
  v_advanced integer:=0;
  v_not_advanced integer:=0;
begin
  select * into v_stage from public.event_stages where id=p_stage_id;
  if v_stage.id is null then raise exception 'Stage not found.'; end if;
  if not public.can_manage_collivra_event(v_stage.event_id,auth.uid()) then raise exception 'Only the event organiser can run automatic advancement.'; end if;
  if v_stage.advancement_mode<>'automatic' then raise exception 'This stage uses manual advancement.'; end if;
  if v_stage.status<>'closed' then raise exception 'Close the stage before running automatic advancement.'; end if;
  if not exists(select 1 from public.events e where e.id=v_stage.event_id and e.event_pass_tier in ('advanced','complex')) then
    raise exception 'Automatic advancement requires the Advanced or Complex Event Pass.';
  end if;
  select * into v_next from public.event_stages where event_id=v_stage.event_id and stage_order>v_stage.stage_order order by stage_order limit 1;
  if v_next.id is null then raise exception 'There is no next stage to advance participants into.'; end if;

  with submission_scores as (
    select case when sub.team_id is not null then 'team:'||sub.team_id::text else 'user:'||sub.submitted_by::text end as entity_key,
      avg(ev.score)::numeric(7,2) as avg_score
    from public.event_submissions sub
    join public.event_evaluations ev on ev.submission_id=sub.id
    where sub.event_id=v_stage.event_id and sub.stage_id=v_stage.id and ev.score is not null
    group by case when sub.team_id is not null then 'team:'||sub.team_id::text else 'user:'||sub.submitted_by::text end
  ), ranked as (
    select entity_key, avg_score, row_number() over(order by avg_score desc, entity_key) as rank
    from submission_scores
  ), submitter_entities as (
    select distinct case when team_id is not null then 'team:'||team_id::text else 'user:'||submitted_by::text end as entity_key
    from public.event_submissions where event_id=v_stage.event_id and stage_id=v_stage.id
  ), decisions as (
    select a.entity_key, r.avg_score, r.rank,
      case when r.entity_key is null then 'not_advanced'
        when v_stage.advancement_rule='score_threshold' and r.avg_score>=v_stage.advancement_threshold then 'advanced'
        when v_stage.advancement_rule='top_n' and r.rank<=v_stage.advancement_top_n then 'advanced'
        else 'not_advanced' end as decision
    from submitter_entities a left join ranked r on r.entity_key=a.entity_key
  ), recipients as (
    select distinct d.decision, coalesce(tm.student_id,sub.submitted_by) as participant_id
    from decisions d
    join public.event_submissions sub on (case when sub.team_id is not null then 'team:'||sub.team_id::text else 'user:'||sub.submitted_by::text end)=d.entity_key
    left join public.event_team_members tm on tm.event_team_id=sub.team_id
  ), saved as (
    insert into public.event_stage_advancements(event_id,from_stage_id,to_stage_id,participant_id,decision,decided_by,decided_at)
    select v_stage.event_id,v_stage.id,v_next.id,r.participant_id,r.decision,auth.uid(),now() from recipients r
    on conflict(from_stage_id,to_stage_id,participant_id) do update
      set decision=excluded.decision,decided_by=excluded.decided_by,decided_at=excluded.decided_at
    returning decision
  )
  select count(*) filter(where decision='advanced'), count(*) filter(where decision='not_advanced')
  into v_advanced,v_not_advanced from saved;

  return jsonb_build_object('advanced_count',coalesce(v_advanced,0),'not_advanced_count',coalesce(v_not_advanced,0),'next_stage_id',v_next.id,'rule',v_stage.advancement_rule);
end;
$$;

revoke all on function public.finalize_event_stage_advancement(uuid) from public;
grant execute on function public.finalize_event_stage_advancement(uuid) to authenticated;

commit;
