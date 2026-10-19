-- PolyTag v0.6 migration
-- Internationalization + persistent language preferences.
-- Safe to run after v0.5. Existing project data is preserved.

alter table public.app_users
  add column if not exists language_selected boolean not null default false;

alter table public.app_users
  alter column locale set default 'ru';

-- v0.5 did not expose a language picker, so existing users can safely start in Russian.
update public.app_users
set locale = 'ru'
where language_selected = false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_users_locale_check'
      and conrelid = 'public.app_users'::regclass
  ) then
    alter table public.app_users
      add constraint app_users_locale_check
      check (locale in ('ru', 'en', 'ar', 'zh', 'vi', 'es', 'fr'));
  end if;
end $$;
