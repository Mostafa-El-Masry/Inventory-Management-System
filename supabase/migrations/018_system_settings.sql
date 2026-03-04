create table if not exists public.system_settings (
  key text primary key,
  value_text text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.system_settings (key, value_text)
values ('company_name', 'ICE')
on conflict (key) do nothing;

alter table public.system_settings enable row level security;

drop policy if exists system_settings_select on public.system_settings;
create policy system_settings_select on public.system_settings
for select using (
  auth.role() in ('authenticated', 'anon')
);

drop policy if exists system_settings_write on public.system_settings;
create policy system_settings_write on public.system_settings
for all using (
  public.is_admin()
)
with check (
  public.is_admin()
);

do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    drop trigger if exists trg_system_settings_set_updated_at on public.system_settings;
    create trigger trg_system_settings_set_updated_at
    before update on public.system_settings
    for each row execute procedure public.set_updated_at();
  end if;
end $$;
