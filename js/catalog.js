function text(value) {
  const result = String(value ?? '').trim();
  return result || null;
}

function intOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function categoryFromKind(kind) {
  const map = {
    product: 'Produto',
    animal_good: 'Produto animal',
    supply: 'Suprimento',
    material: 'Material',
    feed: 'Ração'
  };
  return map[kind] || text(kind);
}

export function normalizeCatalogJson(payload) {
  const source = Array.isArray(payload) ? payload : payload?.items;
  if (!Array.isArray(source)) throw new Error('O JSON precisa conter uma lista de itens ou uma propriedade "items".');

  const seen = new Set();
  const items = source.map((raw, index) => {
    const id = text(raw.id ?? raw.item_id ?? raw.slug);
    const namePt = text(raw.namePt ?? raw.name_pt ?? raw.namePT ?? raw.name);
    const nameEn = text(raw.nameEn ?? raw.name_en ?? raw.englishName ?? raw.nameEnglish);
    const unlockLevel = Number(raw.unlockLevel ?? raw.unlock_level ?? raw.level ?? 1);

    if (!id) throw new Error(`Item ${index + 1}: ID ausente.`);
    if (seen.has(id)) throw new Error(`ID duplicado no JSON: ${id}.`);
    if (!namePt) throw new Error(`Item ${id}: nome em português ausente.`);
    if (!Number.isInteger(unlockLevel) || unlockLevel < 1) throw new Error(`Item ${id}: nível inválido.`);
    seen.add(id);

    return {
      id,
      namePt,
      nameEn: nameEn || '',
      unlockLevel,
      category: text(raw.category ?? raw.categoryPt ?? raw.category_pt) || categoryFromKind(raw.kind) || '',
      machine: text(raw.machine ?? raw.machineOrigin ?? raw.machine_origin ?? raw.origin ?? raw.source) || '',
      maxSalePrice: intOrNull(raw.maxSalePrice ?? raw.max_sale_price ?? raw.unitPrice ?? raw.unit_price),
      active: raw.active === false ? false : true
    };
  });

  return items;
}

function officialSnapshot(item) {
  return JSON.stringify({
    namePt: item.namePt,
    nameEn: item.nameEn || '',
    unlockLevel: Number(item.unlockLevel),
    category: item.category || '',
    machine: item.machine || '',
    maxSalePrice: item.maxSalePrice ?? null,
    active: item.active !== false
  });
}

export function buildCatalogSyncPlan(state, incoming) {
  const currentById = new Map(state.items.map(item => [item.id, item]));
  const incomingById = new Map(incoming.map(item => [item.id, item]));

  const added = [];
  const updated = [];
  const unchanged = [];
  const removed = [];

  incoming.forEach(item => {
    const current = currentById.get(item.id);
    if (!current) added.push(item);
    else if (officialSnapshot(current) !== officialSnapshot(item)) updated.push({ before: current, after: item });
    else unchanged.push(item);
  });

  state.items.forEach(item => {
    if (!incomingById.has(item.id)) removed.push(item);
  });

  return { incoming, added, updated, unchanged, removed };
}

export function applyCatalogSync(state, plan) {
  const oldPrefs = structuredClone(state.itemPreferences);
  const newIds = new Set(plan.incoming.map(item => item.id));

  state.items = structuredClone(plan.incoming);

  const nextPreferences = {};
  state.items.forEach(item => {
    nextPreferences[item.id] = oldPrefs[item.id] || {
      minimum: Number(state.settings.defaultMinimum || 10),
      sellable: true
    };
  });
  state.itemPreferences = nextPreferences;

  Object.keys(state.inventory).forEach(farmId => {
    const farmInventory = state.inventory[farmId] || {};
    Object.keys(farmInventory).forEach(itemId => {
      if (!newIds.has(itemId)) delete farmInventory[itemId];
    });
  });
}
