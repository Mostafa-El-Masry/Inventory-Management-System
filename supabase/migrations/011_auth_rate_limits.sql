-- Durable auth rate limiting for login and password reset flows.
create table if not exists public.auth_rate_limits (
  endpoint text not null check (char_length(trim(endpoint)) > 0),
  bucket text not null check (char_length(trim(bucket)) > 0),
  attempt_count integer not null check (attempt_count >= 0),
  window_ends_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (endpoint, bucket)
);

create index if not exists auth_rate_limits_window_ends_at_idx
on public.auth_rate_limits (window_ends_at);

revoke all on table public.auth_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.auth_rate_limits to service_role;

create or replace function public.rpc_check_rate_limit(
  p_endpoint text,
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_window_end timestamptz;
  v_attempt_count integer;
  v_endpoint text := trim(lower(coalesce(p_endpoint, '')));
  v_bucket text := trim(coalesce(p_bucket, ''));
begin
  if char_length(v_endpoint) = 0 then
    raise exception 'p_endpoint is required';
  end if;

  if char_length(v_bucket) = 0 then
    raise exception 'p_bucket is required';
  end if;

  if p_limit <= 0 then
    raise exception 'p_limit must be > 0';
  end if;

  if p_window_seconds <= 0 then
    raise exception 'p_window_seconds must be > 0';
  end if;

  insert into public.auth_rate_limits as arl (
    endpoint,
    bucket,
    attempt_count,
    window_ends_at,
    updated_at
  )
  values (
    v_endpoint,
    v_bucket,
    1,
    v_now + make_interval(secs => p_window_seconds),
    v_now
  )
  on conflict (endpoint, bucket) do update
  set
    attempt_count = case
      when arl.window_ends_at <= v_now then 1
      else arl.attempt_count + 1
    end,
    window_ends_at = case
      when arl.window_ends_at <= v_now then v_now + make_interval(secs => p_window_seconds)
      else arl.window_ends_at
    end,
    updated_at = v_now
  returning attempt_count, window_ends_at
  into v_attempt_count, v_window_end;

  allowed := v_attempt_count <= p_limit;

  if allowed then
    retry_after_seconds := 0;
  else
    retry_after_seconds := greatest(
      0,
      ceil(extract(epoch from (v_window_end - v_now)))::integer
    );
  end if;

  return next;
end;
$$;

revoke all on function public.rpc_check_rate_limit(text, text, integer, integer)
from public, anon, authenticated;
grant execute on function public.rpc_check_rate_limit(text, text, integer, integer)
to service_role;
