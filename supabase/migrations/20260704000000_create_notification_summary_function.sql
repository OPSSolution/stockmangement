-- Notification Analytics page (src/pages/notifications/analytics/page.tsx) calls
-- supabase.rpc('get_notification_summary', { days_back }) directly — this function
-- was referenced by the frontend but never defined, causing a 404 from PostgREST.
--
-- Note: public.notifications has no webhook-delivery column, so webhook_rate/
-- by_type.webhook are always 0 — this table doesn't track that channel.
create or replace function public.get_notification_summary(days_back integer default 30)
returns table (
  total integer,
  unread integer,
  read_rate numeric,
  email_rate numeric,
  sms_rate numeric,
  webhook_rate numeric,
  by_type jsonb
)
language sql
stable
as $$
  with scoped as (
    select *
    from public.notifications
    where created_at >= now() - (days_back || ' days')::interval
  ),
  totals as (
    select
      count(*)::int as total,
      count(*) filter (where not is_read)::int as unread,
      count(*) filter (where is_read)::int as read_count,
      count(*) filter (where is_emailed)::int as emailed_count,
      count(*) filter (where is_sms_sent)::int as sms_count
    from scoped
  ),
  by_type_agg as (
    select coalesce(jsonb_object_agg(
      per_type.type,
      jsonb_build_object(
        'total', per_type.t_total,
        'read', per_type.t_read,
        'emailed', per_type.t_emailed,
        'sms', per_type.t_sms,
        'webhook', 0
      )
    ), '{}'::jsonb) as by_type
    from (
      select
        type,
        count(*)::int as t_total,
        count(*) filter (where is_read)::int as t_read,
        count(*) filter (where is_emailed)::int as t_emailed,
        count(*) filter (where is_sms_sent)::int as t_sms
      from scoped
      group by type
    ) per_type
  )
  select
    totals.total,
    totals.unread,
    case when totals.total = 0 then 0 else round(totals.read_count::numeric / totals.total * 100, 1) end as read_rate,
    case when totals.total = 0 then 0 else round(totals.emailed_count::numeric / totals.total * 100, 1) end as email_rate,
    case when totals.total = 0 then 0 else round(totals.sms_count::numeric / totals.total * 100, 1) end as sms_rate,
    0::numeric as webhook_rate,
    by_type_agg.by_type
  from totals, by_type_agg;
$$;

grant execute on function public.get_notification_summary(integer) to authenticated;
