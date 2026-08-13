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
    // Quando existir slug, ele vira a chave estável do Meu Celeiro. Assim o JSON
    // de reconhecimento (que também traz um id numérico) continua compatível
    // com o inventário que já usa ids como "cow-feed" e "duct-tape".
    const id = text(raw.slug ?? raw.id ?? raw.item_id);
    const namePt = text(raw.namePt ?? raw.name_pt ?? raw.namePT) || '';
    const nameEn = text(
      raw.nameEn ?? raw.name_en ?? raw.name_original ?? raw.nameOriginal ??
      raw.englishName ?? raw.nameEnglish ?? raw.name
    ) || '';
    const unlockLevel = Number(raw.unlockLevel ?? raw.unlock_level ?? raw.level ?? 1);

    if (!id) throw new Error(`Item ${index + 1}: ID/slug ausente.`);
    if (seen.has(id)) throw new Error(`ID duplicado no JSON: ${id}.`);
    if (!namePt && !nameEn) throw new Error(`Item ${id}: nome original ausente.`);
    if (!Number.isInteger(unlockLevel) || unlockLevel < 1) throw new Error(`Item ${id}: nível inválido.`);
    seen.add(id);

    return {
      id,
      namePt,
      nameEn,
      unlockLevel,
      category: text(raw.category ?? raw.categoryPt ?? raw.category_pt) || categoryFromKind(raw.kind) || '',
      machine: text(raw.machine ?? raw.machineOrigin ?? raw.machine_origin ?? raw.origin ?? raw.source) || '',
      maxSalePrice: intOrNull(raw.maxSalePrice ?? raw.max_sale_price ?? raw.unitPrice ?? raw.unit_price),
      active: raw.active === false ? false : true
    };
  });

  return items;
}

// A tradução não faz parte do snapshot do catálogo. Ela é um dado editável do
// próprio Meu Celeiro e deve sobreviver às futuras sincronizações por JSON.
function mergeCatalogItem(previous, incoming) {
  if (!previous) return { ...incoming };
  return {
    ...incoming,
    category: incoming.category || previous.category || '',
    machine: incoming.machine || previous.machine || '',
    maxSalePrice: incoming.maxSalePrice ?? previous.maxSalePrice ?? null
  };
}

function catalogSnapshot(item) {
  return JSON.stringify({
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
    else if (catalogSnapshot(current) !== catalogSnapshot(mergeCatalogItem(current, item))) updated.push({ before: current, after: item });
    else unchanged.push(item);
  });

  state.items.forEach(item => {
    if (!incomingById.has(item.id)) removed.push(item);
  });

  return { incoming, added, updated, unchanged, removed };
}

export function applyCatalogSync(state, plan) {
  const oldItems = new Map(state.items.map(item => [item.id, item]));
  const oldPrefs = structuredClone(state.itemPreferences);
  const newIds = new Set(plan.incoming.map(item => item.id));

  state.items = plan.incoming.map(incoming => {
    const previous = oldItems.get(incoming.id);
    const merged = mergeCatalogItem(previous, structuredClone(incoming));
    return {
      ...merged,
      // Se o item já tinha tradução, ela ganha sempre do JSON novo.
      // Em item novo, aceitamos namePt caso o JSON traga um.
      namePt: previous?.namePt || incoming.namePt || ''
    };
  });

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
