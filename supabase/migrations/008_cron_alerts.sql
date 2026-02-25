do $job$
declare
  v_job_id bigint;
begin
  if to_regclass('cron.job') is null then
    raise notice 'cron.job not found. Enable pg_cron before scheduling inventory alert refresh.';
  else
    select jobid
    into v_job_id
    from cron.job
    where jobname = 'inventory_alert_refresh_hourly'
    limit 1;

    if v_job_id is not null then
      perform cron.unschedule(v_job_id);
    end if;

    perform cron.schedule(
      'inventory_alert_refresh_hourly',
      '0 * * * *',
      $cmd$select public.rpc_refresh_alerts();$cmd$
    );
  end if;
end
$job$;
