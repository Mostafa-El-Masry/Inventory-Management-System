alter table public.profiles
add column if not exists master_permissions jsonb not null default '{}'::jsonb;
