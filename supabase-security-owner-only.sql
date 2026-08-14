-- Meu Celeiro v0.5.1 — restringe o banco à única conta Auth
-- UID confirmado na tela Authentication > Users:
-- d3a22a67-2205-43cf-a908-f51b2ddcda4e

begin;

-- Garante RLS e mantém o papel não autenticado sem acesso direto.
alter table public.settings enable row level security;
alter table public.items enable row level security;
alter table public.farms enable row level security;
alter table public.inventory enable row level security;

revoke all on table public.settings from anon;
revoke all on table public.items from anon;
revoke all on table public.farms from anon;
revoke all on table public.inventory from anon;

-- Remove as policies amplas criadas na primeira versão e qualquer execução anterior deste patch.
drop policy if exists "settings_select" on public.settings;
drop policy if exists "settings_update" on public.settings;
drop policy if exists "items_authenticated" on public.items;
drop policy if exists "farms_authenticated" on public.farms;
drop policy if exists "inventory_authenticated" on public.inventory;
drop policy if exists "settings_owner_select" on public.settings;
drop policy if exists "settings_owner_update" on public.settings;
drop policy if exists "items_owner_all" on public.items;
drop policy if exists "farms_owner_all" on public.farms;
drop policy if exists "inventory_owner_all" on public.inventory;

-- SETTINGS
create policy "settings_owner_select"
on public.settings
for select
to authenticated
using ((select auth.uid()) = 'd3a22a67-2205-43cf-a908-f51b2ddcda4e'::uuid);

create policy "settings_owner_update"
on public.settings
for update
to authenticated
using ((select auth.uid()) = 'd3a22a67-2205-43cf-a908-f51b2ddcda4e'::uuid)
with check (
  (select auth.uid()) = 'd3a22a67-2205-43cf-a908-f51b2ddcda4e'::uuid
  and id = 1
);

-- ITEMS
create policy "items_owner_all"
on public.items
for all
to authenticated
using ((select auth.uid()) = 'd3a22a67-2205-43cf-a908-f51b2ddcda4e'::uuid)
with check ((select auth.uid()) = 'd3a22a67-2205-43cf-a908-f51b2ddcda4e'::uuid);

-- FARMS
create policy "farms_owner_all"
on public.farms
for all
to authenticated
using ((select auth.uid()) = 'd3a22a67-2205-43cf-a908-f51b2ddcda4e'::uuid)
with check ((select auth.uid()) = 'd3a22a67-2205-43cf-a908-f51b2ddcda4e'::uuid);

-- INVENTORY
create policy "inventory_owner_all"
on public.inventory
for all
to authenticated
using ((select auth.uid()) = 'd3a22a67-2205-43cf-a908-f51b2ddcda4e'::uuid)
with check ((select auth.uid()) = 'd3a22a67-2205-43cf-a908-f51b2ddcda4e'::uuid);

commit;
