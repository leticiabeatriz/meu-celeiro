-- Aplicado como `remove_obsolete_pin_api_and_reduce_privileges`.
-- Estas funções pertenciam a protótipos anteriores e não são chamadas pelo site
-- atual nem por políticas RLS. O PIN atual é validado no cliente após Supabase Auth.

drop function if exists public.mc_delete_farm(text, uuid);
drop function if exists public.mc_finish_check(text, uuid);
drop function if exists public.mc_get_data(text);
drop function if exists public.mc_save_farm(text, uuid, text, integer, integer, integer, boolean);
drop function if exists public.mc_save_inventory(text, uuid, text, integer);
drop function if exists public.mc_save_item(text, text, text, text, integer, text, text, integer, boolean);
drop function if exists public.mc_save_preference(text, text, integer);
drop function if exists public.mc_set_default_minimum(text, integer);
drop function if exists public.mc_check_pin(text);
drop function if exists public.mc_pin_ok(text);

drop function if exists public.can_access_farm(uuid);
drop function if exists public.lock_workspace();
drop function if exists public.unlock_workspace(text);
drop function if exists public.setup_workspace(text);
drop function if exists public.has_workspace_access();
drop function if exists public.is_workspace_member(uuid);
drop function if exists public.get_workspace_id();

revoke all on table public.settings, public.items, public.farms, public.inventory from anon, authenticated;

grant select, update on table public.settings to authenticated;
grant select, insert, update on table public.items to authenticated;
grant select, insert, update, delete on table public.farms to authenticated;
grant select, insert, update, delete on table public.inventory to authenticated;
