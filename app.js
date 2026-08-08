import { cloneInitialState, FARM_COLORS } from './mock-data.js';
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
  itemTotal,
  overallStats,
  fullestFarm,
  maxActiveFarmLevel
} from './calculations.js';
import { normalizeCatalogJson, buildCatalogSyncPlan, applyCatalogSync } from './catalog.js';
import { exportBackup, readBackup } from './backup.js';

let state = cloneInitialState();
let navigationStarted = false;
const saveTimers = new Map();

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const els = {
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

  settingsDialog: $('#settingsDialog'), exportBackupButton: $('#exportBackupButton'), importBackupInput: $('#importBackupInput'), backupStatus: $('#backupStatus'), resetDemoButton: $('#resetDemoButton'),

  confirmDialog: $('#confirmDialog'), confirmTitle: $('#confirmTitle'), confirmMessage: $('#confirmMessage'), confirmCancelButton: $('#confirmCancelButton'), confirmOkButton: $('#confirmOkButton')
};

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function uid(prefix) {
  return `${prefix}-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
}

function toast(message, error = false) {
  const node = document.createElement('div');
  node.className = `toast${error ? ' error' : ''}`;
  node.textContent = message;
  els.toastRegion.append(node);
  setTimeout(() => node.remove(), 2800);
}

function setSaveStatus(text) {
  els.globalSaveStatus.textContent = text;
  els.barnSaveStatus.textContent = text;
}

function simulateSave(key = 'global') {
  setSaveStatus('Salvando…');
  clearTimeout(saveTimers.get(key));
  saveTimers.set(key, setTimeout(() => {
    saveTimers.delete(key);
    if (!saveTimers.size) setSaveStatus('Salvo');
  }, 600));
}

function flushSaves() {
  saveTimers.forEach(timer => clearTimeout(timer));
  saveTimers.clear();
  setSaveStatus('Salvo');
}

function showApp() {
  els.accessView.hidden = true;
  els.appView.hidden = false;
}

function showAccess() {
  els.appView.hidden = true;
  els.accessView.hidden = false;
  els.pinForm.reset();
  els.pinMessage.textContent = '';
  setTimeout(() => els.pinInput.focus(), 40);
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

function farmElements() {
  return { body: els.farmsBody, status: els.farmsStatus, showArchived: els.showArchivedFarms };
}
function itemElements() {
  return { body: els.itemsBody, search: els.itemsSearch, category: els.itemsCategoryFilter, machine: els.itemsMachineFilter, showInactive: els.showInactiveItems };
}
function barnElements() {
  return { search: els.barnSearch, category: els.barnCategoryFilter, machine: els.barnMachineFilter, level: els.barnLevelFilter, stockOnly: els.barnStockOnly, excessOnly: els.barnExcessOnly, belowMinOnly: els.barnBelowMinOnly, head: els.inventoryHead, body: els.inventoryBody };
}
function checkElements() {
  return { farmSelect: els.checkFarmSelect, search: els.checkSearch, status: els.checkStatus, list: els.checkList };
}
function whereElements() {
  return { search: els.whereSearch, results: els.whereResults };
}
function sellConfigElements() {
  return { search: els.sellConfigSearch, list: els.sellConfigList };
}
function sellElements() {
  return { sort: els.sellSort, body: els.sellBody };
}

const farmHandlers = {
  edit: openEditFarm,
  archive(id) {
    const farm = state.farms.find(entry => entry.id === id);
    if (!farm) return;
    farm.archived = !farm.archived;
    simulateSave(`farm-${id}`);
    renderAll();
    toast(farm.archived ? `${farm.name} foi arquivada e saiu dos cálculos.` : `${farm.name} foi restaurada.`);
  },
  async delete(id) {
    const farm = state.farms.find(entry => entry.id === id);
    if (!farm) return;
    const ok = await confirmAction({
      title: 'Excluir farm?',
      message: `Excluir definitivamente a farm “${farm.name}”? O inventário dela também será removido deste protótipo.`,
      confirmText: 'Excluir'
    });
    if (!ok) return;
    state.farms = state.farms.filter(entry => entry.id !== id);
    delete state.inventory[id];
    normalizePositions(state);
    simulateSave(`farm-${id}`);
    renderAll();
    toast('Farm excluída.');
  },
  move(id, direction) {
    const visible = [...state.farms].sort((a,b) => a.position - b.position).filter(farm => els.showArchivedFarms.checked || !farm.archived);
    const index = visible.findIndex(farm => farm.id === id);
    const target = visible[index + direction];
    if (!target) return;
    const current = visible[index];
    [current.position, target.position] = [target.position, current.position];
    normalizePositions(state);
    simulateSave('farm-order');
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
    state.inventory[farmId][itemId] = quantity;
    simulateSave(`inventory-${farmId}-${itemId}`);

    refreshInventoryComputed(state, barnElements(), itemId, farmId);
    renderSummary();
    renderFarms(state, farmElements(), farmHandlers);
    renderWhere(state, whereElements());
    renderSell(state, sellElements());
  },
  minimum(itemId, raw) {
    const minimum = raw === '' ? 0 : Number(raw);
    if (!Number.isInteger(minimum) || minimum < 0) return;
    state.itemPreferences[itemId] ||= { minimum: state.settings.defaultMinimum, sellable: true };
    state.itemPreferences[itemId].minimum = minimum;
    simulateSave(`minimum-${itemId}`);
    renderSell(state, sellElements());
  },
  sellable(itemId, value) {
    state.itemPreferences[itemId] ||= { minimum: state.settings.defaultMinimum, sellable: true };
    state.itemPreferences[itemId].sellable = Boolean(value);
    simulateSave(`sellable-${itemId}`);
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
  renderItems(state, itemElements());
  renderInventory(state, barnElements(), inventoryHandlers);
  renderCheckFarm(state, checkElements(), inventoryHandlers);
  renderWhere(state, whereElements());
  renderSellConfig(state, sellConfigElements(), inventoryHandlers);
  renderSell(state, sellElements());
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

function saveFarmFromForm() {
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
    Object.assign(farm, { name, level, barnCapacity: capacity, color });
  } else {
    const newId = uid('farm');
    state.farms.push({ id: newId, name, level, barnCapacity: capacity, color, position: state.farms.length, archived: false, lastCheckedAt: null });
    state.inventory[newId] = {};
  }

  normalizePositions(state);
  simulateSave(id || 'new-farm');
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

function finishCheck() {
  flushSaves();
  const farm = state.farms.find(entry => entry.id === els.checkFarmSelect.value && !entry.archived);
  if (!farm) return;
  farm.lastCheckedAt = new Date().toISOString();
  renderSummary();
  renderFarms(state, farmElements(), farmHandlers);
  renderCheckFarm(state, checkElements(), inventoryHandlers);
  toast(`Conferência de ${farm.name} concluída.`);
}

async function handleCatalogFile(file) {
  try {
    const payload = JSON.parse(await file.text());
    const incoming = normalizeCatalogJson(payload);
    const plan = buildCatalogSyncPlan(state, incoming);

    els.catalogSyncStatus.className = 'status-box neutral';
    els.catalogSyncStatus.textContent = `${incoming.length} itens no JSON · ${plan.added.length} novos · ${plan.updated.length} atualizados · ${plan.unchanged.length} iguais · ${plan.removed.length} serão removidos.`;

    const ok = await confirmAction({
      title: 'Sincronizar catálogo?',
      message: `${plan.added.length} itens serão adicionados, ${plan.updated.length} atualizados e ${plan.removed.length} removidos porque não existem no JSON. As preferências pessoais dos itens que continuam serão preservadas.`,
      confirmText: 'Sincronizar',
      danger: plan.removed.length > 0
    });

    if (!ok) return;
    applyCatalogSync(state, plan);
    simulateSave('catalog-sync');
    renderAll();
    els.catalogSyncStatus.className = 'status-box ok';
    els.catalogSyncStatus.textContent = `Catálogo sincronizado: ${state.items.length} itens ativos no protótipo.`;
    toast('Catálogo sincronizado.');
  } catch (error) {
    els.catalogSyncStatus.className = 'status-box error';
    els.catalogSyncStatus.textContent = error.message;
  }
}

els.pinForm.addEventListener('submit', event => {
  event.preventDefault();
  if (els.pinInput.value === state.settings.pin) {
    els.pinMessage.textContent = '';
    showApp();
    if (!navigationStarted) {
      initNavigation(() => {});
      navigationStarted = true;
    }
    renderAll();
  } else {
    els.pinMessage.textContent = 'PIN incorreto.';
    els.pinMessage.classList.add('error');
    els.pinInput.select();
  }
});

els.pinInput.addEventListener('input', () => {
  els.pinMessage.textContent = '';
  els.pinMessage.classList.remove('error');
});
els.lockButton.addEventListener('click', showAccess);
els.settingsButton.addEventListener('click', () => els.settingsDialog.showModal());

$$('[data-close-dialog]').forEach(button => button.addEventListener('click', () => document.getElementById(button.dataset.closeDialog)?.close()));

els.addFarmButton.addEventListener('click', openNewFarm);
els.farmColor.addEventListener('input', () => renderColorPalette(els.farmColor.value));
els.farmForm.addEventListener('submit', event => {
  event.preventDefault();
  try {
    saveFarmFromForm();
    els.farmDialog.close();
  } catch (error) {
    els.farmFormMessage.textContent = error.message;
    els.farmFormMessage.classList.add('error');
  }
});
els.showArchivedFarms.addEventListener('change', () => renderFarms(state, farmElements(), farmHandlers));

els.catalogJsonInput.addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (file) await handleCatalogFile(file);
  event.target.value = '';
});

[els.itemsSearch, els.itemsCategoryFilter, els.itemsMachineFilter, els.showInactiveItems].forEach(control => {
  control.addEventListener('input', () => renderItems(state, itemElements()));
  control.addEventListener('change', () => renderItems(state, itemElements()));
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

els.importBackupInput.addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const imported = await readBackup(file);
    const ok = await confirmAction({ title: 'Importar backup?', message: 'Neste protótipo, a importação substituirá os dados atuais da sessão pelos dados do arquivo.', confirmText: 'Importar' });
    if (!ok) return;
    state = imported;
    flushSaves();
    renderAll();
    els.backupStatus.className = 'status-box ok';
    els.backupStatus.textContent = 'Backup importado nesta sessão.';
  } catch (error) {
    els.backupStatus.className = 'status-box error';
    els.backupStatus.textContent = error.message;
  } finally {
    event.target.value = '';
  }
});

els.resetDemoButton.addEventListener('click', async () => {
  const ok = await confirmAction({ title: 'Restaurar demonstração?', message: 'Todas as alterações feitas nesta sessão serão descartadas e os dados de demonstração voltarão.', confirmText: 'Restaurar' });
  if (!ok) return;
  state = cloneInitialState();
  flushSaves();
  renderAll();
  els.settingsDialog.close();
  toast('Dados de demonstração restaurados.');
});

showAccess();
