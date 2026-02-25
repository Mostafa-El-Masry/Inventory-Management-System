-- Expand audit coverage to admin-managed entities.
do $$
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.user_location_access') is null then
    raise exception 'IMS base schema missing (public.profiles/public.user_location_access). Run migrations 001-008 before 010.';
  end if;

  if to_regclass('public.audit_log') is null
     or to_regprocedure('public.audit_row_changes()') is null then
    raise exception 'Audit dependencies missing (public.audit_log / public.audit_row_changes()). Run migration 007 before 010.';
  end if;
end $$;

drop trigger if exists trg_audit_profiles on public.profiles;
create trigger trg_audit_profiles
after insert or update or delete on public.profiles
for each row execute procedure public.audit_row_changes();

drop trigger if exists trg_audit_user_location_access on public.user_location_access;
create trigger trg_audit_user_location_access
after insert or update or delete on public.user_location_access
for each row execute procedure public.audit_row_changes();
