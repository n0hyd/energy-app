-- Adds Evergy demand-related bill fields and computed effective demand rate.
-- Safe to run multiple times.

begin;

alter table if exists public.bills
  add column if not exists demand_charge_usd numeric,
  add column if not exists actual_demand_kw numeric,
  add column if not exists adjusted_demand_kw numeric,
  add column if not exists summer_peak_kw numeric,
  add column if not exists ratchet_kw numeric,
  add column if not exists billing_demand_kw numeric,
  add column if not exists tariff_min_kw numeric;

-- Backfill demand_charge_usd from existing demand_cost where present.
update public.bills
set demand_charge_usd = demand_cost
where demand_charge_usd is null
  and demand_cost is not null;

alter table if exists public.bills
  add column if not exists effective_demand_rate_usd_per_kw numeric
    generated always as (
      case
        when demand_charge_usd is null then null
        when billing_demand_kw is null or billing_demand_kw = 0 then null
        else demand_charge_usd / billing_demand_kw
      end
    ) stored;

create or replace function public.bill_month_from_period(
  p_period_start date,
  p_period_end date
)
returns date
language sql
immutable
as $$
  select date_trunc(
    'month',
    case
      when p_period_start is not null and p_period_end is not null
        then p_period_start + ((p_period_end - p_period_start) / 2)
      when p_period_end is not null
        then p_period_end - 1
      else p_period_start
    end
  )::date
$$;

-- Rebuild bill_months view to include new demand fields.
-- Aggregation is by bill month + building + meter (same grain used by dashboard queries).
-- bill_month uses the billing-period midpoint when both dates exist; otherwise end-1 day, otherwise start.
create or replace view public.bill_months as
select
  min(b.id::text)::uuid as bill_id,
  b.building_id,
  b.meter_id,
  public.bill_month_from_period(b.period_start, b.period_end) as bill_month,
  sum(coalesce(b.total_cost, 0))::numeric(12,2) as total_cost,
  sum(coalesce(b.demand_cost, 0))::numeric as demand_cost,
  sum(coalesce(b.demand_charge_usd, b.demand_cost, 0))::numeric as demand_charge_usd,
  max(b.actual_demand_kw)::numeric as actual_demand_kw,
  max(b.adjusted_demand_kw)::numeric as adjusted_demand_kw,
  max(b.summer_peak_kw)::numeric as summer_peak_kw,
  max(b.ratchet_kw)::numeric as ratchet_kw,
  max(b.billing_demand_kw)::numeric as billing_demand_kw,
  max(b.tariff_min_kw)::numeric as tariff_min_kw,
  case
    when max(b.billing_demand_kw) is null or max(b.billing_demand_kw) = 0 then null
    else sum(coalesce(b.demand_charge_usd, b.demand_cost, 0))::numeric / max(b.billing_demand_kw)::numeric
  end as effective_demand_rate_usd_per_kw
from public.bills b
where coalesce(b.period_end, b.period_start) is not null
group by
  public.bill_month_from_period(b.period_start, b.period_end),
  b.building_id,
  b.meter_id;

commit;
