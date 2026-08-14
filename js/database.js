const SUPABASE_URL = 'https://oxduwygcuzvmtvryiedu.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_OFLbnWg-X_C0Lc4AIStKtw_Pheh67qH';
const PIN_ITERATIONS = 210000;
const PUBLIC_APP_URL = 'https://leticiabeatriz.github.io/meu-celeiro/';

if (!globalThis.supabase?.createClient) {
  throw new Error('Supabase JS não carregou. Verifique a conexão com a internet.');
}

export const db = globalThis.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

function fail(error, fallback) {
  if (error) throw new Error(error.message || fallback);
}

function toFarmRow(farm) {
  return {
    id: farm.id,
    name: farm.name,
    level: Number(farm.level),
    barn_capacity: Number(farm.barnCapacity),
    position: Number(farm.position || 0),
    archived: Boolean(farm.archived),
    color: farm.color || '#5b8d58',
    last_checked_at: farm.lastCheckedAt || null
  };
}

function toItemRow(item, preference, defaultMinimum = 10) {
  if (!Number.isInteger(Number(item.dbId))) {
    throw new Error(`Item ${item.id}: ID numérico ausente.`);
  }
  return {
    id: Number(item.dbId),
    slug: item.id,
    name_original: item.nameEn || item.id,
    name_pt: item.namePt || null,
    unlock_level: Number(item.unlockLevel),
    category: item.category || null,
    machine: item.machine || null,
    max_sale_price: item.maxSalePrice == null ? null : Number(item.maxSalePrice),
    active: item.active !== false,
    sellable: preference?.sellable !== false,
    minimum_stock: Math.max(0, Number(preference?.minimum ?? defaultMinimum ?? 10))
  };
}

function base64ToBytes(value) {
  const raw = atob(value);
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}

function bytesToBase64(bytes) {
  let raw = '';
  bytes.forEach(byte => { raw += String.fromCharCode(byte); });
  return btoa(raw);
}

export async function verifyPin(pin, settings) {
  if (!settings?.pinSalt || !settings?.pinHash) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(pin)),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    hash: 'SHA-256',
    salt: base64ToBytes(settings.pinSalt),
    iterations: PIN_ITERATIONS
  }, key, 256);
  return bytesToBase64(new Uint8Array(bits)) === settings.pinHash;
}

export async function getSession() {
  const { data, error } = await db.auth.getSession();
  fail(error, 'Não foi possível recuperar a sessão.');
  return data.session || null;
}

export async function signIn(email, password) {
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  fail(error, 'Não foi possível entrar.');
  return data.session || null;
}

export async function signOut() {
  // Sai somente deste navegador/dispositivo. O padrão do Supabase é global.
  const { error } = await db.auth.signOut({ scope: 'local' });
  fail(error, 'Não foi possível sair.');
}

export function recoveryRedirectUrl() {
  const current = new URL(window.location.href);
  const isUsableWebUrl = ['http:', 'https:'].includes(current.protocol)
    && !['localhost', '127.0.0.1', '[::1]'].includes(current.hostname);

  if (!isUsableWebUrl) return PUBLIC_APP_URL;

  current.search = '';
  current.hash = '';
  return current.href;
}

export async function requestPasswordReset(email) {
  const redirectTo = recoveryRedirectUrl();
  const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo });
  fail(error, 'Não foi possível enviar o e-mail de recuperação.');
  return redirectTo;
}

export async function updatePassword(password) {
  const { data, error } = await db.auth.updateUser({ password });
  fail(error, 'Não foi possível alterar a senha.');
  return data.user || null;
}

export function observeAuth(callback) {
  const { data } = db.auth.onAuthStateChange((event, session) => callback(event, session));
  return () => data.subscription.unsubscribe();
}

export async function loadState() {
  const [settingsResult, itemsResult, farmsResult, inventoryResult] = await Promise.all([
    db.from('settings').select('id,pin_salt,pin_hash,default_minimum').eq('id', 1).single(),
    db.from('items').select('id,slug,name_original,name_pt,unlock_level,category,machine,max_sale_price,active,sellable,minimum_stock').order('unlock_level').order('id'),
    db.from('farms').select('id,name,level,barn_capacity,position,archived,color,last_checked_at').order('position'),
    db.from('inventory').select('farm_id,item_id,quantity')
  ]);

  fail(settingsResult.error, 'Não foi possível carregar as configurações.');
  fail(itemsResult.error, 'Não foi possível carregar os itens.');
  fail(farmsResult.error, 'Não foi possível carregar as farms.');
  fail(inventoryResult.error, 'Não foi possível carregar o inventário.');

  const settingsRow = settingsResult.data;
  const items = (itemsResult.data || []).map(row => ({
    id: row.slug,
    dbId: Number(row.id),
    namePt: row.name_pt || '',
    nameEn: row.name_original || row.slug,
    unlockLevel: Number(row.unlock_level),
    category: row.category || '',
    machine: row.machine || '',
    maxSalePrice: row.max_sale_price == null ? null : Number(row.max_sale_price),
    active: row.active !== false
  }));

  const itemPreferences = {};
  (itemsResult.data || []).forEach(row => {
    itemPreferences[row.slug] = {
      sellable: row.sellable !== false,
      minimum: Math.max(0, Number(row.minimum_stock ?? settingsRow.default_minimum ?? 10))
    };
  });

  const farms = (farmsResult.data || []).map(row => ({
    id: row.id,
    name: row.name,
    level: Number(row.level),
    barnCapacity: Number(row.barn_capacity),
    position: Number(row.position || 0),
    archived: Boolean(row.archived),
    color: row.color || '#5b8d58',
    lastCheckedAt: row.last_checked_at || null
  }));

  const inventory = Object.fromEntries(farms.map(farm => [farm.id, {}]));
  const slugByDbId = new Map(items.map(item => [Number(item.dbId), item.id]));
  (inventoryResult.data || []).forEach(row => {
    const slug = slugByDbId.get(Number(row.item_id));
    if (!slug || !inventory[row.farm_id]) return;
    inventory[row.farm_id][slug] = Number(row.quantity || 0);
  });

  return {
    settings: {
      defaultMinimum: Math.max(0, Number(settingsRow.default_minimum ?? 10)),
      pinSalt: settingsRow.pin_salt || '',
      pinHash: settingsRow.pin_hash || ''
    },
    farms,
    items,
    itemPreferences,
    inventory
  };
}

export async function saveFarm(farm) {
  const { error } = await db.from('farms').upsert(toFarmRow(farm), { onConflict: 'id' });
  fail(error, 'Não foi possível salvar a farm.');
}

export async function saveFarmPositions(farms) {
  if (!farms.length) return;
  const { error } = await db.from('farms').upsert(farms.map(toFarmRow), { onConflict: 'id' });
  fail(error, 'Não foi possível salvar a ordem das farms.');
}

export async function deleteFarm(farmId) {
  const { error } = await db.from('farms').delete().eq('id', farmId);
  fail(error, 'Não foi possível excluir a farm.');
}

export async function saveInventoryQuantity(state, farmId, itemSlug, quantity) {
  const item = state.items.find(entry => entry.id === itemSlug);
  if (!item) throw new Error(`Item não encontrado: ${itemSlug}.`);
  const itemId = Number(item.dbId);
  if (!Number.isInteger(itemId)) throw new Error(`Item ${itemSlug} sem ID numérico.`);

  if (Number(quantity) <= 0) {
    const { error } = await db.from('inventory').delete().eq('farm_id', farmId).eq('item_id', itemId);
    fail(error, 'Não foi possível zerar a quantidade.');
    return;
  }

  const { error } = await db.from('inventory').upsert({
    farm_id: farmId,
    item_id: itemId,
    quantity: Number(quantity)
  }, { onConflict: 'farm_id,item_id' });
  fail(error, 'Não foi possível salvar a quantidade.');
}

export async function saveMinimum(item, minimum) {
  const { error } = await db.from('items').update({ minimum_stock: Number(minimum) }).eq('id', Number(item.dbId));
  fail(error, 'Não foi possível salvar o estoque mínimo.');
}

export async function saveSellable(item, sellable) {
  const { error } = await db.from('items').update({ sellable: Boolean(sellable) }).eq('id', Number(item.dbId));
  fail(error, 'Não foi possível salvar a regra de venda.');
}

export async function saveSellableMany(items, sellable) {
  const ids = items.map(item => Number(item.dbId)).filter(Number.isInteger);
  if (!ids.length) return;
  const { error } = await db.from('items').update({ sellable: Boolean(sellable) }).in('id', ids);
  fail(error, 'Não foi possível salvar a regra do grupo.');
}

export async function saveTranslation(item, namePt) {
  const { error } = await db.from('items').update({ name_pt: namePt || null }).eq('id', Number(item.dbId));
  fail(error, 'Não foi possível salvar a tradução.');
}

export async function saveCatalog(state) {
  if (!state.items.length) return;
  const rows = state.items.map(item => toItemRow(
    item,
    state.itemPreferences[item.id],
    state.settings.defaultMinimum
  ));
  const { error } = await db.from('items').upsert(rows, { onConflict: 'id' });
  fail(error, 'Não foi possível sincronizar o catálogo com o banco.');
}

export async function saveLastChecked(farm) {
  const { error } = await db.from('farms').update({ last_checked_at: farm.lastCheckedAt }).eq('id', farm.id);
  fail(error, 'Não foi possível salvar a data da conferência.');
}

export async function seedDatabase(state) {
  const itemRows = state.items.map(item => toItemRow(
    item,
    state.itemPreferences[item.id],
    state.settings.defaultMinimum
  ));
  const farmRows = state.farms.map(toFarmRow);
  const itemBySlug = new Map(state.items.map(item => [item.id, item]));
  const inventoryRows = [];

  Object.entries(state.inventory).forEach(([farmId, quantities]) => {
    Object.entries(quantities || {}).forEach(([slug, quantity]) => {
      if (Number(quantity) <= 0) return;
      const item = itemBySlug.get(slug);
      if (!item || !Number.isInteger(Number(item.dbId))) return;
      inventoryRows.push({ farm_id: farmId, item_id: Number(item.dbId), quantity: Number(quantity) });
    });
  });

  if (itemRows.length) {
    const { error } = await db.from('items').upsert(itemRows, { onConflict: 'id' });
    fail(error, 'Não foi possível importar os itens iniciais.');
  }
  if (farmRows.length) {
    const { error } = await db.from('farms').upsert(farmRows, { onConflict: 'id' });
    fail(error, 'Não foi possível importar as farms iniciais.');
  }
  if (inventoryRows.length) {
    const { error } = await db.from('inventory').upsert(inventoryRows, { onConflict: 'farm_id,item_id' });
    fail(error, 'Não foi possível importar o inventário inicial.');
  }
}
