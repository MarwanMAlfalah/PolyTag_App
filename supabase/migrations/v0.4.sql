-- PolyTag v0.4 migration
-- Safe for an existing v0.3 database. Existing rows are preserved.

-- Replace the old 3-argument registration RPC with a category-aware version.
drop function if exists public.register_tagged_item(uuid, text, text);

create or replace function public.register_tagged_item(
  p_owner_id uuid,
  p_item_name text,
  p_tag_token text,
  p_category text
)
returns table(item_id uuid, tag_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_id uuid;
  v_tag_id uuid;
begin
  if length(trim(p_item_name)) < 2 then
    raise exception 'INVALID_ITEM_NAME';
  end if;

  if p_tag_token !~ '^PT-[A-Z0-9]{8}$' then
    raise exception 'INVALID_TAG_TOKEN';
  end if;

  if p_category not in ('keys', 'bag', 'laptop', 'phone', 'camera', 'card', 'other') then
    raise exception 'INVALID_CATEGORY';
  end if;

  insert into public.items(owner_id, name, category)
  values (p_owner_id, trim(p_item_name), p_category)
  returning id into v_item_id;

  insert into public.tags(public_token, item_id)
  values (upper(p_tag_token), v_item_id)
  returning id into v_tag_id;

  return query select v_item_id, v_tag_id;
exception
  when unique_violation then
    raise exception 'TAG_ALREADY_EXISTS';
end;
$$;

revoke all on function public.register_tagged_item(uuid, text, text, text) from public;
grant execute on function public.register_tagged_item(uuid, text, text, text) to service_role;
