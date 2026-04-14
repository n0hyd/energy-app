set statement_timeout = 0;
set lock_timeout = '30s';
begin;

with mapped as (
  select
    i.id,
    i.org_id,
    i.building_id,
    i.source_usage_point_id,
    i.source_reading_ref,
    i.duration_seconds,
    i.value_wh,
    i.is_duplicate,
    gi.created_at as import_created_at,
    i.interval_start_utc as old_ts,
    (
      (i.interval_start_utc at time zone 'UTC')
      at time zone coalesce(
        nullif(to_jsonb(b) ->> 'timezone', ''),
        nullif(to_jsonb(b) ->> 'time_zone', ''),
        nullif(to_jsonb(b) ->> 'tz', ''),
        'America/Chicago'
      )
    ) as new_ts
  from public.green_button_intervals i
  join public.green_button_imports gi on gi.id = i.import_id
  join public.buildings b on b.id = i.building_id
  where i.org_id = :'org_id'::uuid
    and i.building_id = :'building_id'::uuid
    and lower(coalesce(gi.source_utility,'')) = 'evergy'
),
ranked as (
  select
    m.*,
    row_number() over (
      partition by m.building_id, m.source_usage_point_id, m.source_reading_ref, m.new_ts, m.duration_seconds
      order by m.is_duplicate asc, m.import_created_at desc nulls last, m.id desc
    ) as rn
  from mapped m
),
deleted_internal as (
  delete from public.green_button_intervals i
  using ranked r
  where i.id = r.id and r.rn > 1
  returning 1
),
updated as (
  update public.green_button_intervals i
  set interval_start_utc = r.new_ts
  from ranked r
  where i.id = r.id
    and r.rn = 1
    and r.old_ts <> r.new_ts
    and not exists (
      select 1
      from public.green_button_intervals x
      where x.id <> i.id
        and x.building_id = r.building_id
        and x.source_usage_point_id = r.source_usage_point_id
        and x.source_reading_ref = r.source_reading_ref
        and x.interval_start_utc = r.new_ts
        and x.duration_seconds = r.duration_seconds
    )
  returning 1
),
deleted_conflict_same_value as (
  delete from public.green_button_intervals i
  using ranked r
  where i.id = r.id
    and r.rn = 1
    and r.old_ts <> r.new_ts
    and exists (
      select 1
      from public.green_button_intervals x
      where x.id <> i.id
        and x.building_id = r.building_id
        and x.source_usage_point_id = r.source_usage_point_id
        and x.source_reading_ref = r.source_reading_ref
        and x.interval_start_utc = r.new_ts
        and x.duration_seconds = r.duration_seconds
        and coalesce(x.value_wh, -1) = coalesce(r.value_wh, -1)
    )
  returning 1
)
select
  (select count(*) from deleted_internal) as deleted_internal,
  (select count(*) from updated) as updated_rows,
  (select count(*) from deleted_conflict_same_value) as deleted_conflict_same_value;

commit;
