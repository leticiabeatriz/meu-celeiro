-- Aplicado ao projeto Supabase como a migration `add_local_recognition_support`.
-- O lote é confirmado em uma única transação e respeita as políticas RLS atuais.

create table if not exists public.recognition_memory (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{"schemaVersion":1,"visualMemory":[],"confusionHistory":[]}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint recognition_memory_payload_object check (jsonb_typeof(payload) = 'object')
);

alter table public.recognition_memory enable row level security;

drop policy if exists recognition_memory_owner_all on public.recognition_memory;
create policy recognition_memory_owner_all
on public.recognition_memory
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on table public.recognition_memory from anon, authenticated;
grant select, insert, update on table public.recognition_memory to authenticated;

create index if not exists inventory_item_id_idx on public.inventory (item_id);

create or replace function public.apply_recognized_inventory(
  p_farm_id uuid,
  p_updates jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_farm_level integer;
  v_count integer;
begin
  if jsonb_typeof(p_updates) <> 'array' then
    raise exception 'p_updates must be a JSON array';
  end if;

  select f.level
    into v_farm_level
    from public.farms as f
   where f.id = p_farm_id
     and not f.archived;

  if v_farm_level is null then
    raise exception 'Farm not found or not authorized';
  end if;

  with parsed as (
    select item_id, quantity
      from jsonb_to_recordset(p_updates) as row(item_id integer, quantity integer)
  )
  select count(*) into v_count from parsed;

  if exists (
    with parsed as (
      select item_id, quantity
        from jsonb_to_recordset(p_updates) as row(item_id integer, quantity integer)
    )
    select 1 from parsed where item_id is null or quantity is null or quantity < 0
  ) then
    raise exception 'Invalid item or quantity in batch';
  end if;

  if (
    select count(*) <> count(distinct item_id)
      from jsonb_to_recordset(p_updates) as row(item_id integer, quantity integer)
  ) then
    raise exception 'Duplicate item in batch';
  end if;

  if exists (
    with parsed as (
      select item_id
        from jsonb_to_recordset(p_updates) as row(item_id integer, quantity integer)
    )
    select 1
      from parsed
      left join public.items as item on item.id = parsed.item_id
     where item.id is null
        or item.active is not true
        or item.unlock_level > v_farm_level
  ) then
    raise exception 'Batch contains an unavailable item';
  end if;

  delete from public.inventory as inventory
   using jsonb_to_recordset(p_updates) as row(item_id integer, quantity integer)
   where inventory.farm_id = p_farm_id
     and inventory.item_id = row.item_id
     and row.quantity = 0;

  insert into public.inventory (farm_id, item_id, quantity)
  select p_farm_id, row.item_id, row.quantity
    from jsonb_to_recordset(p_updates) as row(item_id integer, quantity integer)
   where row.quantity > 0
  on conflict (farm_id, item_id)
  do update set quantity = excluded.quantity;

  update public.farms
     set last_checked_at = now()
   where id = p_farm_id;

  return v_count;
end;
$$;

revoke all on function public.apply_recognized_inventory(uuid, jsonb) from public, anon;
grant execute on function public.apply_recognized_inventory(uuid, jsonb) to authenticated;
