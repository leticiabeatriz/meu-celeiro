import { cloneSeedState, FARM_COLORS } from './seed-data.js';
import { initNavigation } from './navigation.js';
import { renderFarms, normalizePositions } from './farms.js';
import { renderItems, refillItemFilters } from './items.js';
import {
  refillBarnFilters,
  renderInventory,
  refreshInventoryComputed,
  renderCheckFarm,
  renderWhere,
  renderSellConfig,
  renderSell
} from './inventory.js';
import {
  activeFarms,
  farmUsed,
  overallStats,
  fullestFarm,
  maxActiveFarmLevel
} from './calculations.js';
import { normalizeCatalogJson, buildCatalogSyncPlan, applyCatalogSync } from './catalog.js';
import { exportBackup } from './backup.js';
import {
  getSession,
  signIn,
  signOut,
  loadState,
  verifyPin,
  saveFarm,
  saveFarmPositions,
  deleteFarm,
  saveInventoryQuantity,
  saveMinimum,
  saveSellable,
  saveSellableMany,
  saveTranslation,
  saveCatalog,
  saveLastChecked,
  seedDatabase
} from './database.js';

let state = {
  settings: { defaultMinimum: 10, pinSalt: '', pinHash: '' },
  farms: [],
  items: [],
  itemPreferences: {},
  inventory: {}
};
let currentSession = null;
let navigationStarted = false;
let seedOfferShown = false;
const pendingSaves = new Map();
let activeSaveCount = 0;

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const els = {
  authView: $('#authView'), authForm: $('#authForm'), authEmail: $('#authEmail'), authPassword: $('#authPassword'), authSubmitButton: $('#authSubmitButton'), authStatus: $('#authStatus'), authMessage: $('#authMessage'),
  accessView: $('#accessView'), appView: $('#appView'), pinForm: $('#pinForm'), pinInput: $('#pinInput'), pinMessage: $('#pinMessage'),
  lockButton: $('#lockButton'), settingsButton: $('#settingsButton'), globalSaveStatus: $('#globalSaveStatus'), barnSaveStatus: $('#barnSaveStatus'), toastRegion: $('#toastRegion'),
  summaryPreview: $('#summaryPreview'), summaryFarmCount: $('#summaryFarmCount'), summaryArchivedCount: $('#summaryArchivedCount'), summaryCapacity: $('#summaryCapacity'), summaryUsed: $('#summaryUsed'), summaryOccupancy: $('#summaryOccupancy'), summaryFree: $('#summaryFree'), summaryStored: $('#summaryStored'), summaryItemCount: $('#summaryItemCount'), summaryMaxLevel: $('#summaryMaxLevel'), fullestFarmBox: $('#fullestFarmBox'), lastChecksBox: $('#lastChecksBox'),
  addFarmButton: $('#addFarmButton'), farmsBody: $('#farmsBody'), farmsStatus: $('#farmsStatus'), showArchivedFarms: $('#showArchivedFarms'),
  farmDialog: $('#farmDialog'), farmForm: $('#farmForm'), farmDialogTitle: $('#farmDialogTitle'), farmEditId: $('#farmEditId'), farmName: $('#farmName'), farmLevel: $('#farmLevel'), farmCapacity: $('#farmCapacity'), farmColor: $('#farmColor'), farmColorPalette: $('#farmColorPalette'), farmFormMessage: $('#farmFormMessage'),
  catalogJsonInput: $('#catalogJsonInput'), catalogSyncStatus: $('#catalogSyncStatus'), itemsBody: $('#itemsBody'), itemsSearch: $('#itemsSearch'), itemsCategoryFilter: $('#itemsCategoryFilter'), itemsMachineFilter: $('#itemsMachineFilter'), showInactiveItems: $('#showInactiveItems'),
  barnSearch: $('#barnSearch'), barnCategoryFilter: $('#barnCategoryFilter'), barnMachineFilter: $('#barnMachineFilter'), barnLevelFilter: $('#barnLevelFilter'), barnStockOnly: $('#barnStockOnly'), barnExcessOnly: $('#barnExcessOnly'), barnBelowMinOnly: $('#barnBelowMinOnly'), clearBarnFilters: $('#clearBarnFilters'), inventoryHead: $('#inventoryHead'), inventoryBody: $('#inventoryBody'),
  checkFarmSelect: $('#checkFarmSelect'), checkSearch: $('#checkSearch'), checkStatus: $('#checkStatus'), checkList: $('#checkList'), finishCheckButton: $('#finishCheckButton'),
  whereSearch: $('#whereSearch'), whereResults: $('#whereResults'),
  sellConfigSearch: $('#sellConfigSearch'), sellConfigList: $('#sellConfigList'), sellSort: $('#sellSort'), sellBody: $('#sellBody'),
  settingsDialog: $('#settingsDialog'), exportBackupButton: $('#exportBackupButton'), backupStatus: $('#backupStatus'), sessionEmail: $('#sessionEmail'), logoutButton: $('#logoutButton'),
  confirmDialog: $('#confirmDialog'), confirmTitle: $('#confirmTitle'), confirmMessage: $('#confirmMessage'), confirmCancelButton: $('#confirmCancelButton'), confirmOkButton: $('#confirmOkButton')
};

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function toast(message, error = false) {
  const node = document.createElement('div');
  node.className = `toast${error ? ' error' : ''}`;
  node.textContent = message;
  els.toastRegion.append(node);
  setTimeout(() => node.remove(), 3200);
}

function setSaveStatus(text) {
  els.globalSaveStatus.textContent = text;
  els.barnSaveStatus.textContent = text;
}

function updateSaveStatus() {
  if (pendingSaves.size || activeSaveCount) setSaveStatus('Salvando…');
  else setSaveStatus('Salvo');
}

async function executeSave(key, operation) {
  activeSaveCount += 1;
  updateSaveStatus();
  try {
    await operation();
  } catch (error) {
    console.error(error);
    setSaveStatus('Erro ao salvar');
    toast(error.message || 'Erro ao salvar no banco.', true);
  } finally {
    activeSaveCount -= 1;
    if (!pendingSaves.size && !activeSaveCount && els.globalSaveStatus.textContent !== 'Erro ao salvar') updateSaveStatus();
  }
}

function queueSave(key, operation, delay = 450) {
  const previous = pendingSaves.get(key);
  if (previous) clearTimeout(previous.timer);
  const entry = { operation, timer: null };
  entry.timer = setTimeout(() => {
    pendingSaves.delete(key);
    executeSave(key, operation);
  }, delay);
  pendingSaves.set(key, entry);
  updateSaveStatus();
}

async function flushSaves() {
  const entries = [...pendingSaves.entries()];
  pendingSaves.clear();
  entries.forEach(([, entry]) => clearTimeout(entry.timer));
  if (entries.length) await Promise.all(entries.map(([key, entry]) => executeSave(key, entry.operation)));
  while (activeSaveCount > 0) await new Promise(resolve => setTimeout(resolve, 20));
  if (els.globalSaveStatus.textContent !== 'Erro ao salvar') updateSaveStatus();
}

function hideAllViews() {
  els.authView.hidden = true;
  els.accessView.hidden = true;
  els.appView.hidden = true;
}

function showAuth(message = '') {
  hideAllViews();
  els.authView.hidden = false;
  els.authForm.hidden = false;
  els.authStatus.hidden = true;
  els.authMessage.textContent = message;
  els.authMessage.classList.toggle('error', Boolean(message));
  els.authPassword.value = '';
  setTimeout(() => els.authEmail.focus(), 40);
}

function showAuthLoading(text = 'Carregando seus dados…') {
  hideAllViews();
  els.authView.hidden = false;
  els.authForm.hidden = true;
  els.authStatus.hidden = false;
  els.authStatus.className = 'status-box neutral';
  els.authStatus.textContent = text;
  els.authMessage.textContent = '';
}

function showAccess() {
  hideAllViews();
  els.accessView.hidden = false;
  els.pinForm.reset();
  els.pinMessage.textContent = '';
  els.pinMessage.classList.remove('error');
  setTimeout(() => els.pinInput.focus(), 40);
}

function showApp() {
  hideAllViews();
  els.appView.hidden = false;
}

function fmtDate(value) {
  if (!value) return 'Nunca';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function confirmAction({ title, message, confirmText = 'Confirmar', danger = true }) {
  els.confirmTitle.textContent = title;
  els.confirmMessage.textContent = message;
  els.confirmOkButton.textContent = confirmText;
  els.confirmOkButton.className = `button ${danger ? 'danger' : 'primary'}`;
  els.confirmDialog.showModal();

  return new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      cleanup();
      if (els.confirmDialog.open) els.confirmDialog.close();
      resolve(value);
    };
    const onOk = () => finish(true);
    const onCancel = () => finish(false);
    const onDialogCancel = event => { event.preventDefault(); finish(false); };
    const cleanup = () => {
      els.confirmOkButton.removeEventListener('click', onOk);
      els.confirmCancelButton.removeEventListener('click', onCancel);
      els.confirmDialog.removeEventListener('cancel', onDialogCancel);
    };
    els.confirmOkButton.addEventListener('click', onOk);
    els.confirmCancelButton.addEventListener('click', onCancel);
    els.confirmDialog.addEventListener('cancel', onDialogCancel);
  });
}

function renderSummary() {
  const stats = overallStats(state);
  const archived = state.farms.filter(farm => farm.archived).length;
  const activeItemCount = state.items.filter(item => item.active).length;

  els.summaryFarmCount.textContent = stats.farms.length;
  els.summaryArchivedCount.textContent = `${archived} arquivada(s)`;
  els.summaryCapacity.textContent = stats.capacity.toLocaleString('pt-BR');
  els.summaryUsed.textContent = stats.used.toLocaleString('pt-BR');
  els.summaryOccupancy.textContent = `${Math.round(stats.occupancy)}% de ocupação`;
  els.summaryFree.textContent = stats.free.toLocaleString('pt-BR');
  els.summaryStored.textContent = stats.stored.toLocaleString('pt-BR');
  els.summaryItemCount.textContent = activeItemCount;
  els.summaryMaxLevel.textContent = `Maior nível: ${maxActiveFarmLevel(state) || '—'}`;
  els.summaryPreview.textContent = `${stats.used}/${stats.capacity} ocupados · ${stats.free} livres`;

  const fullest = fullestFarm(state);
  if (!fullest) {
    els.fullestFarmBox.className = 'status-box neutral';
    els.fullestFarmBox.textContent = 'Nenhuma farm ativa.';
  } else {
    const over = fullest.used > fullest.farm.barnCapacity;
    els.fullestFarmBox.className = `status-box ${over ? 'warning' : 'neutral'}`;
    els.fullestFarmBox.textContent = `Mais cheia: ${fullest.farm.name} · ${fullest.farm.barnCapacity}/${fullest.used} · ${Math.round(fullest.occupancy)}%`;
  }

  const farms = activeFarms(state);
  els.lastChecksBox.innerHTML = farms.length
    ? farms.map(farm => `<div><strong>${esc(farm.name)}</strong>: ${fmtDate(farm.lastCheckedAt)}</div>`).join('')
    : 'Nenhuma farm ativa.';
}

function farmElements() { return { body: els.farmsBody, status: els.farmsStatus, showArchived: els.showArchivedFarms }; }
function itemElements() { return { body: els.itemsBody, search: els.itemsSearch, category: els.itemsCategoryFilter, machine: els.itemsMachineFilter, showInactive: els.showInactiveItems }; }
function barnElements() { return { search: els.barnSearch, category: els.barnCategoryFilter, machine: els.barnMachineFilter, level: els.barnLevelFilter, stockOnly: els.barnStockOnly, excessOnly: els.barnExcessOnly, belowMinOnly: els.barnBelowMinOnly, head: els.inventoryHead, body: els.inventoryBody }; }
function checkElements() { return { farmSelect: els.checkFarmSelect, search: els.checkSearch, status: els.checkStatus, list: els.checkList }; }
function whereElements() { return { search: els.whereSearch, results: els.whereResults }; }
function sellConfigElements() { return { search: els.sellConfigSearch, list: els.sellConfigList }; }
function sellElements() { return { sort: els.sellSort, body: els.sellBody }; }

const itemHandlers = {
  translation(itemId, namePt) {
    const item = state.items.find(entry => entry.id === itemId);
    if (!item) return;
    queueSave(`translation-${itemId}`, () => saveTranslation(item, namePt));
  }
};

const farmHandlers = {
  edit: openEditFarm,
  async archive(id) {
    const farm = state.farms.find(entry => entry.id === id);
    if (!farm) return;
    const next = { ...farm, archived: !farm.archived };
    try {
      setSaveStatus('Salvando…');
      await saveFarm(next);
      Object.assign(farm, next);
      renderAll();
      setSaveStatus('Salvo');
      toast(farm.archived ? `${farm.name} foi arquivada e saiu dos cálculos.` : `${farm.name} foi restaurada.`);
    } catch (error) {
      setSaveStatus('Erro ao salvar');
      toast(error.message, true);
    }
  },
  async delete(id) {
    const farm = state.farms.find(entry => entry.id === id);
    if (!farm) return;
    const ok = await confirmAction({
      title: 'Excluir farm?',
      message: `Excluir definitivamente a farm “${farm.name}”? O inventário dela também será removido.`,
      confirmText: 'Excluir'
    });
    if (!ok) return;
    try {
      setSaveStatus('Salvando…');
      await deleteFarm(id);
      state.farms = state.farms.filter(entry => entry.id !== id);
      delete state.inventory[id];
      normalizePositions(state);
      await saveFarmPositions(state.farms);
      renderAll();
      setSaveStatus('Salvo');
      toast('Farm excluída.');
    } catch (error) {
      setSaveStatus('Erro ao salvar');
      toast(error.message, true);
    }
  },
  move(id, direction) {
    const visible = [...state.farms].sort((a,b) => a.position - b.position).filter(farm => els.showArchivedFarms.checked || !farm.archived);
    const index = visible.findIndex(farm => farm.id === id);
    const target = visible[index + direction];
    if (!target) return;
    const current = visible[index];
    [current.position, target.position] = [target.position, current.position];
    normalizePositions(state);
    queueSave('farm-order', () => saveFarmPositions(state.farms));
    renderAll();
  }
};

const inventoryHandlers = {
  quantity(farmId, itemId, raw) {
    const farm = state.farms.find(entry => entry.id === farmId);
    const item = state.items.find(entry => entry.id === itemId);
    if (!farm || !item || farm.archived || !item.active || item.unlockLevel > farm.level) return;

    const quantity = raw === '' ? 0 : Number(raw);
    if (!Number.isInteger(quantity) || quantity < 0) return;

    state.inventory[farmId] ||= {};
    if (quantity > 0) state.inventory[farmId][itemId] = quantity;
    else delete state.inventory[farmId][itemId];

    queueSave(`inventory-${farmId}-${itemId}`, () => saveInventoryQuantity(state, farmId, itemId, quantity));
    refreshInventoryComputed(state, barnElements(), itemId, farmId);
    renderSummary();
    renderFarms(state, farmElements(), farmHandlers);
    renderWhere(state, whereElements());
    renderSell(state, sellElements());
  },
  minimum(itemId, raw) {
    const minimum = raw === '' ? 0 : Number(raw);
    if (!Number.isInteger(minimum) || minimum < 0) return;
    const item = state.items.find(entry => entry.id === itemId);
    if (!item) return;
    state.itemPreferences[itemId] ||= { minimum: state.settings.defaultMinimum, sellable: true };
    state.itemPreferences[itemId].minimum = minimum;
    queueSave(`minimum-${itemId}`, () => saveMinimum(item, minimum));
    renderSell(state, sellElements());
  },
  sellable(itemId, value) {
    const item = state.items.find(entry => entry.id === itemId);
    if (!item) return;
    state.itemPreferences[itemId] ||= { minimum: state.settings.defaultMinimum, sellable: true };
    state.itemPreferences[itemId].sellable = Boolean(value);
    queueSave(`sellable-${itemId}`, () => saveSellable(item, value));
    renderSellConfig(state, sellConfigElements(), inventoryHandlers);
    renderSell(state, sellElements());
  },
  sellableMany(itemIds, value) {
    const items = itemIds.map(id => state.items.find(entry => entry.id === id)).filter(Boolean);
    items.forEach(item => {
      state.itemPreferences[item.id] ||= { minimum: state.settings.defaultMinimum, sellable: true };
      state.itemPreferences[item.id].sellable = Boolean(value);
    });
    queueSave(`sellable-group-${itemIds.join('|')}`, () => saveSellableMany(items, value), 150);
    renderSellConfig(state, sellConfigElements(), inventoryHandlers);
    renderSell(state, sellElements());
  }
};

function renderAll() {
  normalizePositions(state);
  refillItemFilters(state, itemElements());
  refillBarnFilters(state, barnElements());
  renderSummary();
  renderFarms(state, farmElements(), farmHandlers);
  renderItems(state, itemElements(), itemHandlers);
  renderInventory(state, barnElements(), inventoryHandlers);
  renderCheckFarm(state, checkElements(), inventoryHandlers);
  renderWhere(state, whereElements());
  renderSellConfig(state, sellConfigElements(), inventoryHandlers);
  renderSell(state, sellElements());
  els.sessionEmail.textContent = currentSession?.user?.email || 'Sessão autenticada';
}

function renderColorPalette(selected) {
  els.farmColorPalette.innerHTML = '';
  FARM_COLORS.forEach(color => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `color-swatch${color.toLowerCase() === selected.toLowerCase() ? ' selected' : ''}`;
    button.style.setProperty('--swatch', color);
    button.title = color;
    button.addEventListener('click', () => {
      els.farmColor.value = color;
      renderColorPalette(color);
    });
    els.farmColorPalette.append(button);
  });
}

function openNewFarm() {
  els.farmForm.reset();
  els.farmEditId.value = '';
  els.farmDialogTitle.textContent = 'Cadastrar farm';
  els.farmLevel.value = 1;
  els.farmCapacity.value = 100;
  const color = FARM_COLORS[state.farms.length % FARM_COLORS.length];
  els.farmColor.value = color;
  renderColorPalette(color);
  els.farmFormMessage.textContent = '';
  els.farmFormMessage.classList.remove('error');
  els.farmDialog.showModal();
}

function openEditFarm(id) {
  const farm = state.farms.find(entry => entry.id === id);
  if (!farm) return;
  els.farmEditId.value = farm.id;
  els.farmDialogTitle.textContent = 'Editar farm';
  els.farmName.value = farm.name;
  els.farmLevel.value = farm.level;
  els.farmCapacity.value = farm.barnCapacity;
  els.farmColor.value = farm.color || FARM_COLORS[0];
  renderColorPalette(els.farmColor.value);
  els.farmFormMessage.textContent = '';
  els.farmFormMessage.classList.remove('error');
  els.farmDialog.showModal();
}

async function saveFarmFromForm() {
  const id = els.farmEditId.value;
  const name = els.farmName.value.trim();
  const level = Number(els.farmLevel.value);
  const capacity = Number(els.farmCapacity.value);
  const color = els.farmColor.value;

  if (!name) throw new Error('Digite o nome da farm.');
  if (!Number.isInteger(level) || level < 1) throw new Error('O nível precisa ser um inteiro maior ou igual a 1.');
  if (!Number.isInteger(capacity) || capacity <= 0) throw new Error('A capacidade precisa ser um inteiro maior que zero.');

  if (id) {
    const farm = state.farms.find(entry => entry.id === id);
    if (!farm) throw new Error('Farm não encontrada.');
    const updated = { ...farm, name, level, barnCapacity: capacity, color };
    await saveFarm(updated);
    Object.assign(farm, updated);
  } else {
    const farm = {
      id: crypto.randomUUID(),
      name,
      level,
      barnCapacity: capacity,
      color,
      position: state.farms.length,
      archived: false,
      lastCheckedAt: null
    };
    await saveFarm(farm);
    state.farms.push(farm);
    state.inventory[farm.id] = {};
  }

  normalizePositions(state);
  renderAll();
}

function switchBarnTab(name) {
  $$('[data-barn-tab]').forEach(button => button.classList.toggle('active', button.dataset.barnTab === name));
  $$('.barn-tab').forEach(section => { section.hidden = section.id !== `barnTab-${name}`; });
  if (name === 'conferir') renderCheckFarm(state, checkElements(), inventoryHandlers);
  if (name === 'onde') renderWhere(state, whereElements());
  if (name === 'vender') {
    renderSellConfig(state, sellConfigElements(), inventoryHandlers);
    renderSell(state, sellElements());
  }
}

async function finishCheck() {
  const farm = state.farms.find(entry => entry.id === els.checkFarmSelect.value && !entry.archived);
  if (!farm) return;
  try {
    await flushSaves();
    farm.lastCheckedAt = new Date().toISOString();
    await saveLastChecked(farm);
    renderSummary();
    renderFarms(state, farmElements(), farmHandlers);
    renderCheckFarm(state, checkElements(), inventoryHandlers);
    setSaveStatus('Salvo');
    toast(`Conferência de ${farm.name} concluída.`);
  } catch (error) {
    setSaveStatus('Erro ao salvar');
    toast(error.message, true);
  }
}

async function handleCatalogFile(file) {
  const before = structuredClone(state);
  try {
    const payload = JSON.parse(await file.text());
    const incoming = normalizeCatalogJson(payload);
    const plan = buildCatalogSyncPlan(state, incoming);

    els.catalogSyncStatus.className = 'status-box neutral';
    els.catalogSyncStatus.textContent = `${incoming.length} itens no JSON · ${plan.added.length} novos · ${plan.updated.length} atualizados · ${plan.unchanged.length} iguais · ${plan.removed.length} ficarão inativos.`;

    const ok = await confirmAction({
      title: 'Sincronizar catálogo?',
      message: `${plan.added.length} itens serão adicionados, ${plan.updated.length} atualizados e ${plan.removed.length} marcados como inativos por não aparecerem no JSON. Traduções, estoque e regras de venda serão preservados.`,
      confirmText: 'Sincronizar',
      danger: false
    });

    if (!ok) return;
    applyCatalogSync(state, plan);
    setSaveStatus('Salvando…');
    await saveCatalog(state);
    renderAll();
    const activeCount = state.items.filter(item => item.active).length;
    els.catalogSyncStatus.className = 'status-box ok';
    els.catalogSyncStatus.textContent = `Catálogo sincronizado: ${activeCount} itens ativos.`;
    setSaveStatus('Salvo');
    toast('Catálogo sincronizado com o banco.');
  } catch (error) {
    state = before;
    renderAll();
    els.catalogSyncStatus.className = 'status-box error';
    els.catalogSyncStatus.textContent = error.message;
    setSaveStatus('Erro ao salvar');
  }
}

function remapSeedFarmIds(seed) {
  const idMap = new Map(seed.farms.map(farm => [farm.id, crypto.randomUUID()]));
  seed.farms.forEach(farm => { farm.id = idMap.get(farm.id); });
  const remapped = {};
  Object.entries(seed.inventory).forEach(([oldId, quantities]) => {
    const newId = idMap.get(oldId);
    if (newId) remapped[newId] = quantities;
  });
  seed.inventory = remapped;
}

async function offerInitialSeed() {
  if (seedOfferShown || state.items.length || state.farms.length) return;
  seedOfferShown = true;
  const ok = await confirmAction({
    title: 'Banco vazio',
    message: 'Quer importar agora os dados que já existiam na v0.4.0 e completar o catálogo com os 374 itens? Isso é feito uma única vez.',
    confirmText: 'Importar dados',
    danger: false
  });
  if (!ok) return;

  try {
    setSaveStatus('Importando…');
    const response = await fetch('./assets/hayday-items-374-por-nivel-v0.3.1.json');
    if (!response.ok) throw new Error('Não foi possível abrir o JSON inicial.');
    const payload = await response.json();
    const seed = cloneSeedState();
    const incoming = normalizeCatalogJson(payload);
    applyCatalogSync(seed, buildCatalogSyncPlan(seed, incoming));
    remapSeedFarmIds(seed);
    await seedDatabase(seed);
    state = await loadState();
    renderAll();
    setSaveStatus('Salvo');
    toast('Dados iniciais importados para o Supabase.');
  } catch (error) {
    setSaveStatus('Erro ao salvar');
    toast(error.message, true);
  }
}

async function loadAuthenticatedState(session) {
  currentSession = session;
  showAuthLoading('Carregando seus dados…');
  state = await loadState();
  setSaveStatus('Salvo');
  showAccess();
}

async function initialize() {
  try {
    showAuthLoading('Verificando sessão…');
    const session = await getSession();
    if (!session) {
      showAuth();
      return;
    }
    await loadAuthenticatedState(session);
  } catch (error) {
    console.error(error);
    showAuth(error.message || 'Não foi possível conectar ao banco.');
  }
}

els.authForm.addEventListener('submit', async event => {
  event.preventDefault();
  els.authMessage.textContent = '';
  els.authMessage.classList.remove('error');
  els.authSubmitButton.disabled = true;
  els.authSubmitButton.textContent = 'Entrando…';
  try {
    const session = await signIn(els.authEmail.value.trim(), els.authPassword.value);
    if (!session) throw new Error('Sessão não criada.');
    await loadAuthenticatedState(session);
  } catch (error) {
    els.authMessage.textContent = error.message || 'Não foi possível entrar.';
    els.authMessage.classList.add('error');
  } finally {
    els.authSubmitButton.disabled = false;
    els.authSubmitButton.textContent = 'Entrar';
  }
});

els.pinForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = els.pinForm.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const valid = await verifyPin(els.pinInput.value, state.settings);
    if (!valid) {
      els.pinMessage.textContent = 'PIN incorreto.';
      els.pinMessage.classList.add('error');
      els.pinInput.select();
      return;
    }
    els.pinMessage.textContent = '';
    showApp();
    if (!navigationStarted) {
      initNavigation(() => {});
      navigationStarted = true;
    }
    renderAll();
    setTimeout(() => offerInitialSeed(), 80);
  } catch (error) {
    els.pinMessage.textContent = error.message || 'Não foi possível validar o PIN.';
    els.pinMessage.classList.add('error');
  } finally {
    button.disabled = false;
  }
});

els.pinInput.addEventListener('input', () => {
  els.pinMessage.textContent = '';
  els.pinMessage.classList.remove('error');
});
els.lockButton.addEventListener('click', async () => {
  await flushSaves();
  showAccess();
});
els.settingsButton.addEventListener('click', () => {
  els.sessionEmail.textContent = currentSession?.user?.email || 'Sessão autenticada';
  els.settingsDialog.showModal();
});

$$('[data-close-dialog]').forEach(button => button.addEventListener('click', () => document.getElementById(button.dataset.closeDialog)?.close()));

els.addFarmButton.addEventListener('click', openNewFarm);
els.farmColor.addEventListener('input', () => renderColorPalette(els.farmColor.value));
els.farmForm.addEventListener('submit', async event => {
  event.preventDefault();
  els.farmFormMessage.textContent = '';
  els.farmFormMessage.classList.remove('error');
  const submit = els.farmForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    setSaveStatus('Salvando…');
    await saveFarmFromForm();
    setSaveStatus('Salvo');
    els.farmDialog.close();
  } catch (error) {
    setSaveStatus('Erro ao salvar');
    els.farmFormMessage.textContent = error.message;
    els.farmFormMessage.classList.add('error');
  } finally {
    submit.disabled = false;
  }
});
els.showArchivedFarms.addEventListener('change', () => renderFarms(state, farmElements(), farmHandlers));

els.catalogJsonInput.addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (file) await handleCatalogFile(file);
  event.target.value = '';
});

[els.itemsSearch, els.itemsCategoryFilter, els.itemsMachineFilter, els.showInactiveItems].forEach(control => {
  control.addEventListener('input', () => renderItems(state, itemElements(), itemHandlers));
  control.addEventListener('change', () => renderItems(state, itemElements(), itemHandlers));
});

[els.barnSearch, els.barnCategoryFilter, els.barnMachineFilter, els.barnLevelFilter, els.barnStockOnly, els.barnExcessOnly, els.barnBelowMinOnly].forEach(control => {
  control.addEventListener('input', () => renderInventory(state, barnElements(), inventoryHandlers));
  control.addEventListener('change', () => renderInventory(state, barnElements(), inventoryHandlers));
});

els.clearBarnFilters.addEventListener('click', () => {
  els.barnSearch.value = '';
  els.barnCategoryFilter.value = '';
  els.barnMachineFilter.value = '';
  els.barnLevelFilter.value = '';
  els.barnStockOnly.checked = false;
  els.barnExcessOnly.checked = false;
  els.barnBelowMinOnly.checked = false;
  renderInventory(state, barnElements(), inventoryHandlers);
});

$$('[data-barn-tab]').forEach(button => button.addEventListener('click', () => switchBarnTab(button.dataset.barnTab)));
els.checkFarmSelect.addEventListener('change', () => renderCheckFarm(state, checkElements(), inventoryHandlers));
els.checkSearch.addEventListener('input', () => renderCheckFarm(state, checkElements(), inventoryHandlers));
els.finishCheckButton.addEventListener('click', finishCheck);
els.whereSearch.addEventListener('input', () => renderWhere(state, whereElements()));
els.sellConfigSearch.addEventListener('input', () => renderSellConfig(state, sellConfigElements(), inventoryHandlers));
els.sellSort.addEventListener('change', () => renderSell(state, sellElements()));

els.exportBackupButton.addEventListener('click', () => {
  exportBackup(state);
  els.backupStatus.className = 'status-box ok';
  els.backupStatus.textContent = 'Backup exportado.';
});

els.logoutButton.addEventListener('click', async () => {
  const ok = await confirmAction({
    title: 'Sair da conta?',
    message: 'A sessão do Supabase será removida deste navegador. No próximo acesso será preciso informar e-mail e senha novamente.',
    confirmText: 'Sair',
    danger: false
  });
  if (!ok) return;
  try {
    await flushSaves();
    await signOut();
    currentSession = null;
    state = { settings: { defaultMinimum: 10, pinSalt: '', pinHash: '' }, farms: [], items: [], itemPreferences: {}, inventory: {} };
    if (els.settingsDialog.open) els.settingsDialog.close();
    showAuth();
  } catch (error) {
    toast(error.message, true);
  }
});

initialize();
