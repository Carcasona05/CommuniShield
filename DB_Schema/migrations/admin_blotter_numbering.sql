-- Apply after admin_blotters.sql and admin_blotter_certification.sql.
-- Each new electronic log-book entry receives the next entry and page number.
-- Existing records keep their recorded numbers, including on subsequent edits.
begin;

lock table public.admin_blotters in share row exclusive mode;

create sequence if not exists public.admin_blotter_entry_seq;
create sequence if not exists public.admin_blotter_page_seq;

-- Resume beyond existing numbers and never rewind an already-used sequence.
select setval(
  'public.admin_blotter_entry_seq',
  greatest(
    coalesce(max(substring(blotter_no from '^ARGAO-BLT-([0-9]{1,18})$')::bigint), 0) + 1,
    (select last_value + case when is_called then 1 else 0 end from public.admin_blotter_entry_seq)
  ),
  false
) from public.admin_blotters;

select setval(
  'public.admin_blotter_page_seq',
  greatest(
    coalesce(max(case when btrim(page_number) ~ '^[0-9]{1,18}$' then btrim(page_number)::bigint end), 0) + 1,
    (select last_value + case when is_called then 1 else 0 end from public.admin_blotter_page_seq)
  ),
  false
) from public.admin_blotters;

create or replace function public.assign_admin_blotter_numbers()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  entry_number bigint;
begin
  if tg_op = 'UPDATE' then
    new.blotter_no := old.blotter_no;
    new.page_number := old.page_number;
    return new;
  end if;

  entry_number := nextval('public.admin_blotter_entry_seq');
  new.blotter_no := 'ARGAO-BLT-' || lpad(entry_number::text, greatest(6, length(entry_number::text)), '0');
  new.page_number := nextval('public.admin_blotter_page_seq')::text;
  return new;
end;
$$;

drop trigger if exists assign_admin_blotter_numbers on public.admin_blotters;
create trigger assign_admin_blotter_numbers
  before insert or update on public.admin_blotters
  for each row execute function public.assign_admin_blotter_numbers();

revoke all on sequence public.admin_blotter_entry_seq, public.admin_blotter_page_seq from public, anon, authenticated;
grant usage, select on sequence public.admin_blotter_entry_seq, public.admin_blotter_page_seq to service_role;
revoke all on function public.assign_admin_blotter_numbers() from public, anon, authenticated;
grant execute on function public.assign_admin_blotter_numbers() to service_role;

commit;
