-- Cleanup scheduler for expired auth rate-limit windows.
do $$
begin
  if to_regclass('public.auth_rate_limits') is null then
    raise exception 'public.auth_rate_limits is missing. Run migration 011 before 013.';
  end if;

  if to_regprocedure('public.rpc_check_rate_limit(text, text, integer, integer)') is null then
    raise exception 'public.rpc_check_rate_limit(...) is missing. Run migration 011 before 013.';
  end if;
end $$;

create or replace function public.rpc_cleanup_auth_rate_limits()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
begin
  delete from public.auth_rate_limits
  where window_ends_at <= now();

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.rpc_cleanup_auth_rate_limits()
from public, anon, authenticated;
grant execute on function public.rpc_cleanup_auth_rate_limits()
to service_role;

do $job$
declare
  v_job_id bigint;
begin
  if to_regclass('cron.job') is null then
    raise notice 'cron.job not found. Enable pg_cron before scheduling auth rate-limit cleanup.';
  else
    select jobid
    into v_job_id
    from cron.job
    where jobname = 'auth_rate_limit_cleanup_10m'
    limit 1;

    if v_job_id is not null then
      perform cron.unschedule(v_job_id);
    end if;

    perform cron.schedule(
      'auth_rate_limit_cleanup_10m',
      '*/10 * * * *',
      $cmd$select public.rpc_cleanup_auth_rate_limits();$cmd$
    );
  end if;
end
$job$;
