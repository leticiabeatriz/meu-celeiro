function text(value) {
  const result = String(value ?? '').trim();
  return result || null;
}

function intOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function positiveIntOrNull(value) {
  const n = intOrNull(value);
  return Number.isInteger(n) && n > 0 ? n : null;
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

  const seenSlugs = new Set();
  const seenDbIds = new Set();

  return source.map((raw, index) => {
    const id = text(raw.slug ?? raw.item_slug ?? (typeof raw.id === 'string' ? raw.id : null));
    const dbId = positiveIntOrNull(raw.dbId ?? raw.db_id ?? raw.sourceId ?? raw.source_id ?? (raw.slug ? raw.id : null));
    const namePt = text(raw.namePt ?? raw.name_pt ?? raw.namePT) || '';
    const nameEn = text(
      raw.nameEn ?? raw.name_en ?? raw.name_original ?? raw.nameOriginal ??
      raw.englishName ?? raw.nameEnglish ?? raw.name
    ) || '';
    const unlockLevel = Number(raw.unlockLevel ?? raw.unlock_level ?? raw.level ?? 1);

    if (!id) throw new Error(`Item ${index + 1}: slug ausente.`);
    if (!dbId) throw new Error(`Item ${id}: ID numérico ausente.`);
    if (seenSlugs.has(id)) throw new Error(`Slug duplicado no JSON: ${id}.`);
    if (seenDbIds.has(dbId)) throw new Error(`ID numérico duplicado no JSON: ${dbId}.`);
    if (!namePt && !nameEn) throw new Error(`Item ${id}: nome original ausente.`);
    if (!Number.isInteger(unlockLevel) || unlockLevel < 1) throw new Error(`Item ${id}: nível inválido.`);

    seenSlugs.add(id);
    seenDbIds.add(dbId);

    return {
      id,
      dbId,
      namePt,
      nameEn,
      unlockLevel,
      category: text(raw.category ?? raw.categoryPt ?? raw.category_pt) || categoryFromKind(raw.kind) || '',
      machine: text(raw.machine ?? raw.machineOrigin ?? raw.machine_origin ?? raw.origin ?? raw.source) || '',
      maxSalePrice: intOrNull(raw.maxSalePrice ?? raw.max_sale_price ?? raw.unitPrice ?? raw.unit_price),
      active: raw.active === false ? false : true
    };
  });
}

function mergeCatalogItem(previous, incoming) {
  if (!previous) return { ...incoming };
  if (previous.dbId != null && Number(previous.dbId) !== Number(incoming.dbId)) {
    throw new Error(`O item ${incoming.id} mudou de ID numérico (${previous.dbId} → ${incoming.dbId}). Confira o JSON antes de sincronizar.`);
  }
  return {
    ...incoming,
    category: incoming.category || previous.category || '',
    machine: incoming.machine || previous.machine || '',
    maxSalePrice: incoming.maxSalePrice ?? previous.maxSalePrice ?? null
  };
}

function catalogSnapshot(item) {
  return JSON.stringify({
    dbId: Number(item.dbId),
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
    if (!incomingById.has(item.id) && item.active !== false) removed.push(item);
  });

  return { incoming, added, updated, unchanged, removed };
}

export function applyCatalogSync(state, plan) {
  const oldItems = new Map(state.items.map(item => [item.id, item]));
  const oldPrefs = structuredClone(state.itemPreferences);
  const incomingIds = new Set(plan.incoming.map(item => item.id));

  const activeItems = plan.incoming.map(incoming => {
    const previous = oldItems.get(incoming.id);
    const merged = mergeCatalogItem(previous, structuredClone(incoming));
    return {
      ...merged,
      namePt: previous?.namePt || incoming.namePt || '',
      active: incoming.active !== false
    };
  });

  const inactiveItems = state.items
    .filter(item => !incomingIds.has(item.id))
    .map(item => ({ ...structuredClone(item), active: false }));

  state.items = [...activeItems, ...inactiveItems];

  const nextPreferences = {};
  state.items.forEach(item => {
    nextPreferences[item.id] = oldPrefs[item.id] || {
      minimum: Number(state.settings.defaultMinimum || 10),
      sellable: true
    };
  });
  state.itemPreferences = nextPreferences;

  // O inventário não é apagado quando um item some do snapshot. O item apenas
  // fica inativo e deixa de participar dos cálculos até reaparecer no catálogo.
}
