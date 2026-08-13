import {
  activeFarms,
  farmUsed,
  itemTotal,
  minimumFor,
  excessFor,
  excessValue,
  maxActiveFarmLevel,
  rawQuantity,
  effectiveQuantity,
  isSellable
} from './calculations.js';
import { iconMarkup, bindImageFallbacks } from './icons.js';

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function normalize(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function displayName(item) {
  return item?.namePt || item?.nameEn || item?.id || 'Item';
}

export function refillBarnFilters(state, elements) {
  const items = state.items.filter(item => item.active);
  const categories = [...new Set(items.map(item => item.category).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'pt-BR'));
  const machines = [...new Set(items.map(item => item.machine).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'pt-BR'));

  const fill = (select, values) => {
    const current = select.value;
    select.innerHTML = '<option value="">Todas</option>' + values.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
    if (values.includes(current)) select.value = current;
  };

  fill(elements.category, categories);
  fill(elements.machine, machines);
}

export function filteredBarnItems(state, elements) {
  const maxLevel = maxActiveFarmLevel(state);
  const search = normalize(elements.search.value);
  const category = elements.category.value;
  const machine = elements.machine.value;
  const level = Number(elements.level.value || 0);

  return state.items
    .filter(item => item.active)
    .filter(item => item.unlockLevel <= maxLevel)
    .filter(item => !level || item.unlockLevel <= level)
    .filter(item => !category || item.category === category)
    .filter(item => !machine || item.machine === machine)
    .filter(item => !search || normalize([item.namePt,item.nameEn,item.category,item.machine].join(' ')).includes(search))
    .filter(item => !elements.stockOnly.checked || itemTotal(state, item.id) > 0)
    .filter(item => !elements.excessOnly.checked || excessFor(state, item.id) > 0)
    .filter(item => !elements.belowMinOnly.checked || itemTotal(state, item.id) < minimumFor(state, item.id))
    .sort((a,b) => a.unlockLevel - b.unlockLevel || displayName(a).localeCompare(displayName(b), 'pt-BR'));
}

function itemCell(item) {
  return `<div class="item-main">${iconMarkup(item)}<div><span class="item-name" data-item-display="${esc(item.id)}">${esc(displayName(item))}</span><span class="item-sub">Nv. ${item.unlockLevel} · ${esc(item.machine || item.category || '—')}</span></div></div>`;
}

export function renderInventory(state, elements, handlers) {
  const farms = activeFarms(state);
  const items = filteredBarnItems(state, elements);

  elements.head.innerHTML = `
    <tr>
      <th>Item</th>
      ${farms.map(farm => {
        const used = farmUsed(state, farm.id);
        return `<th class="farm-column" data-farm-head="${farm.id}" style="--farm-color:${farm.color}"><span class="farm-head-name"><span class="farm-color-dot"></span>${esc(farm.name)}</span><span class="farm-head-meta">Nv. ${farm.level} · ${farm.barnCapacity}/${used}</span></th>`;
      }).join('')}
      <th class="summary-column">Total</th>
    </tr>
  `;

  elements.body.innerHTML = '';

  if (!items.length) {
    elements.body.innerHTML = `<tr class="empty-row"><td colspan="${farms.length + 2}">Nenhum item corresponde aos filtros.</td></tr>`;
    return;
  }

  items.forEach(item => {
    const total = itemTotal(state, item.id);
    const row = document.createElement('tr');
    row.dataset.itemRow = item.id;

    const farmCells = farms.map(farm => {
      if (item.unlockLevel > farm.level) {
        return `<td class="locked-cell" title="Registro preservado, mas ignorado enquanto estiver bloqueado">🔒</td>`;
      }

      const quantity = rawQuantity(state, farm.id, item.id);
      return `<td><input class="qty-input" type="number" inputmode="numeric" min="0" step="1" value="${quantity || ''}" data-farm-id="${farm.id}" data-item-id="${item.id}" aria-label="${esc(displayName(item))} em ${esc(farm.name)}"></td>`;
    }).join('');

    const distribution = total > 0
      ? farms.map(farm => {
          const quantity = effectiveQuantity(state, farm.id, item.id);
          if (!quantity) return '';
          return `<span class="distribution-segment" style="width:${(quantity / total) * 100}%;background:${farm.color}" title="${esc(farm.name)}: ${quantity}"></span>`;
        }).join('')
      : '';

    row.innerHTML = `
      <td>${itemCell(item)}</td>
      ${farmCells}
      <td class="summary-column"><div class="total-compact"><strong data-item-total>${total}</strong><div class="distribution-bar" data-item-distribution>${distribution}</div></div></td>
    `;

    row.querySelectorAll('.qty-input').forEach(input => {
      input.addEventListener('input', () => handlers.quantity(input.dataset.farmId, input.dataset.itemId, input.value));
    });

    elements.body.append(row);
  });

  bindImageFallbacks(elements.body);
}

export function renderCheckFarm(state, elements, handlers) {
  const farms = activeFarms(state);

  if (!farms.length) {
    elements.farmSelect.innerHTML = '';
    elements.list.innerHTML = '';
    elements.status.textContent = 'Nenhuma farm ativa.';
    return;
  }

  const previous = elements.farmSelect.value;
  elements.farmSelect.innerHTML = farms.map(farm => `<option value="${farm.id}">${esc(farm.name)}</option>`).join('');
  if (farms.some(farm => farm.id === previous)) elements.farmSelect.value = previous;

  const farm = farms.find(f => f.id === elements.farmSelect.value) || farms[0];
  elements.farmSelect.value = farm.id;
  const query = normalize(elements.search.value);

  const items = state.items
    .filter(item => item.active && item.unlockLevel <= farm.level)
    .filter(item => !query || normalize([item.namePt,item.nameEn,item.machine,item.category].join(' ')).includes(query))
    .sort((a,b) => a.unlockLevel - b.unlockLevel || displayName(a).localeCompare(displayName(b), 'pt-BR'));

  elements.status.className = 'status-box neutral check-farm-accent';
  elements.status.style.setProperty('--farm-color', farm.color);
  elements.status.textContent = `${farm.name} · Nv. ${farm.level} · ${farm.barnCapacity}/${farmUsed(state, farm.id)}`;
  elements.list.innerHTML = '';

  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'check-row';
    row.innerHTML = `<div class="check-row-main">${iconMarkup(item, true)}<div><span class="item-name" data-item-display="${esc(item.id)}">${esc(displayName(item))}</span><span class="item-sub">Nv. ${item.unlockLevel} · ${esc(item.machine || item.category || '—')}</span></div></div><input class="qty-input" type="number" inputmode="numeric" min="0" step="1" value="${rawQuantity(state, farm.id, item.id) || ''}" aria-label="${esc(displayName(item))}">`;
    row.querySelector('input').addEventListener('input', event => handlers.quantity(farm.id, item.id, event.target.value));
    elements.list.append(row);
  });

  bindImageFallbacks(elements.list);
}

export function renderWhere(state, elements) {
  const query = normalize(elements.search.value);
  elements.results.innerHTML = '';

  if (!query) {
    elements.results.innerHTML = '<div class="status-box neutral">Digite o nome de um item.</div>';
    return;
  }

  const matches = state.items
    .filter(item => item.active)
    .filter(item => normalize([item.namePt,item.nameEn].join(' ')).includes(query))
    .slice(0, 15);

  if (!matches.length) {
    elements.results.innerHTML = '<div class="status-box neutral">Nenhum item encontrado.</div>';
    return;
  }

  matches.forEach(item => {
    const farms = activeFarms(state)
      .map(farm => ({ farm, quantity: effectiveQuantity(state, farm.id, item.id) }))
      .filter(entry => entry.quantity > 0);
    const total = farms.reduce((sum, entry) => sum + entry.quantity, 0);
    const card = document.createElement('div');
    card.className = 'where-card';
    card.innerHTML = `
      <div class="where-title">${iconMarkup(item, true)}<div><strong data-item-display="${esc(item.id)}">${esc(displayName(item))}</strong><span class="item-sub">Total: ${total}</span></div></div>
      <div class="where-grid">${farms.length ? farms.map(entry => `<span class="where-farm"><span class="where-farm-dot" style="--farm-color:${entry.farm.color}"></span>${esc(entry.farm.name)}: <b>${entry.quantity}</b></span>`).join('') : '<span class="muted-small">Nenhuma farm ativa possui este item.</span>'}</div>
    `;
    elements.results.append(card);
  });

  bindImageFallbacks(elements.results);
}

function ensureSellModeUI(elements) {
  const panel = document.querySelector('#barnTab-vender .panel');
  if (!panel || panel.querySelector('#sellModeNav')) return;

  const oldDetails = panel.querySelector('.sell-config-details');
  const toolbar = panel.querySelector('.sell-toolbar');
  const tableWrap = elements.list?.closest('.sell-config-content') ? elements.body?.closest('.table-scroll') : null;
  const suggestionsTableWrap = elements.body?.closest('.table-scroll');
  const searchField = elements.search?.closest('.field');
  if (!oldDetails || !toolbar || !suggestionsTableWrap || !searchField || !elements.list) return;

  const nav = document.createElement('nav');
  nav.id = 'sellModeNav';
  nav.className = 'inner-mode-nav sell-mode-nav';
  nav.setAttribute('aria-label', 'Modos da área de venda');
  nav.innerHTML = `
    <button type="button" class="active" data-sell-view="sugestoes">Sugestões</button>
    <button type="button" data-sell-view="regras">Regras de venda</button>
  `;

  const suggestions = document.createElement('section');
  suggestions.id = 'sellSuggestionsView';
  suggestions.append(toolbar, suggestionsTableWrap);

  const rules = document.createElement('section');
  rules.id = 'sellRulesView';
  rules.hidden = true;
  const intro = document.createElement('div');
  intro.className = 'sell-rules-intro';
  intro.textContent = 'Defina regras em grupo e abra uma seção quando quiser criar exceções item por item.';
  rules.append(intro, searchField, elements.list);

  oldDetails.remove();
  panel.prepend(nav);
  panel.append(suggestions, rules);

  nav.addEventListener('click', event => {
    const button = event.target.closest('[data-sell-view]');
    if (!button) return;
    const view = button.dataset.sellView;
    nav.querySelectorAll('[data-sell-view]').forEach(node => node.classList.toggle('active', node === button));
    suggestions.hidden = view !== 'sugestoes';
    rules.hidden = view !== 'regras';
  });
}

function sellGroup(item) {
  if (item.machine) return { key: `machine:${item.machine}`, label: item.machine, type: 'Máquina / origem' };
  if (item.category) return { key: `category:${item.category}`, label: item.category, type: 'Categoria' };
  return { key: 'other:sem-grupo', label: 'Sem grupo', type: 'Sem máquina ou categoria' };
}

export function renderSellConfig(state, elements, handlers) {
  ensureSellModeUI(elements);

  const query = normalize(elements.search.value);
  const sourceItems = state.items
    .filter(item => item.active)
    .filter(item => !query || normalize([item.namePt,item.nameEn,item.category,item.machine].join(' ')).includes(query))
    .sort((a,b) => a.unlockLevel - b.unlockLevel || displayName(a).localeCompare(displayName(b), 'pt-BR'));

  const groups = new Map();
  sourceItems.forEach(item => {
    const group = sellGroup(item);
    if (!groups.has(group.key)) groups.set(group.key, { ...group, items: [] });
    groups.get(group.key).items.push(item);
  });

  const orderedGroups = [...groups.values()].sort((a,b) => a.label.localeCompare(b.label, 'pt-BR'));
  elements.list.innerHTML = '';

  if (!orderedGroups.length) {
    elements.list.innerHTML = '<div class="status-box neutral">Nenhum item corresponde à pesquisa.</div>';
    return;
  }

  orderedGroups.forEach(group => {
    const sellableCount = group.items.filter(item => {
      const pref = state.itemPreferences[item.id] || { sellable: true };
      return pref.sellable !== false;
    }).length;
    const mode = sellableCount === group.items.length ? 'all' : sellableCount === 0 ? 'none' : 'custom';
    const modeText = mode === 'all' ? 'Pode vender' : mode === 'none' ? 'Não vender' : 'Personalizado';

    const card = document.createElement('details');
    card.className = 'sell-rule-group';
    if (query) card.open = true;
    card.innerHTML = `
      <summary>
        <span class="sell-rule-title"><span><strong>${esc(group.label)}</strong><small>${esc(group.type)} · ${group.items.length} item(ns)</small></span></span>
        <span class="rule-status ${mode}">${modeText}</span>
      </summary>
      <div class="sell-rule-body">
        <div class="sell-rule-actions">
          <button class="button secondary compact ${mode === 'all' ? 'active-rule' : ''}" type="button" data-group-sellable="true">Pode vender tudo</button>
          <button class="button secondary compact ${mode === 'none' ? 'active-rule' : ''}" type="button" data-group-sellable="false">Não vender nada</button>
          <span class="muted-small">Para personalizar, altere os itens abaixo.</span>
        </div>
        <div class="sell-rule-items"></div>
      </div>
    `;

    const itemList = card.querySelector('.sell-rule-items');
    group.items.forEach(item => {
      const pref = state.itemPreferences[item.id] || { minimum: state.settings.defaultMinimum, sellable: true };
      const row = document.createElement('div');
      row.className = 'sell-rule-item';
      row.innerHTML = `
        <div class="sell-config-item">${iconMarkup(item, true)}<div><span class="item-name" data-item-display="${esc(item.id)}">${esc(displayName(item))}</span><span class="item-sub">${esc(item.nameEn || item.machine || item.category || '—')}</span></div></div>
        <label class="toggle-control"><input type="checkbox" data-sellable="${esc(item.id)}" ${pref.sellable !== false ? 'checked' : ''}><span class="toggle-ui"></span><span>Vender</span></label>
        <label class="field"><span>Estoque mínimo</span><input class="sell-config-min" type="number" inputmode="numeric" min="0" step="1" value="${Math.max(0, Number(pref.minimum || 0))}" data-minimum="${esc(item.id)}" ${pref.sellable === false ? 'disabled' : ''}></label>
      `;

      const toggle = row.querySelector('[data-sellable]');
      const minimum = row.querySelector('[data-minimum]');
      toggle.addEventListener('change', () => handlers.sellable(item.id, toggle.checked));
      minimum.addEventListener('input', () => handlers.minimum(item.id, minimum.value));
      itemList.append(row);
    });

    card.querySelectorAll('[data-group-sellable]').forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();
        const value = button.dataset.groupSellable === 'true';
        group.items.forEach(item => {
          state.itemPreferences[item.id] ||= { minimum: state.settings.defaultMinimum, sellable: true };
          state.itemPreferences[item.id].sellable = value;
        });
        const last = group.items[group.items.length - 1];
        if (last) handlers.sellable(last.id, value);
      });
    });

    elements.list.append(card);
  });

  bindImageFallbacks(elements.list);
}

export function renderSell(state, elements) {
  const sort = elements.sort.value;
  let rows = state.items
    .filter(item => item.active && isSellable(state, item.id))
    .map(item => ({
      item,
      total: itemTotal(state, item.id),
      minimum: minimumFor(state, item.id),
      excess: excessFor(state, item.id),
      value: excessValue(state, item.id)
    }))
    .filter(row => row.excess > 0);

  rows.sort((a,b) => {
    if (sort === 'value') return (b.value ?? -1) - (a.value ?? -1);
    if (sort === 'spaces') return b.excess - a.excess;
    if (sort === 'name') return displayName(a.item).localeCompare(displayName(b.item), 'pt-BR');
    return b.excess - a.excess;
  });

  elements.body.innerHTML = '';

  if (!rows.length) {
    elements.body.innerHTML = '<tr class="empty-row"><td colspan="5">Nenhum excedente vendável no momento.</td></tr>';
    return;
  }

  rows.forEach(data => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><div class="item-main">${iconMarkup(data.item, true)}<strong data-item-display="${esc(data.item.id)}">${esc(displayName(data.item))}</strong></div></td>
      <td>${data.total}</td>
      <td>${data.minimum}</td>
      <td><strong>${data.excess}</strong></td>
      <td>${data.value == null ? '—' : data.value.toLocaleString('pt-BR')}</td>
    `;
    elements.body.append(row);
  });

  bindImageFallbacks(elements.body);
}

export function refreshInventoryComputed(state, elements, itemId = null, farmId = null) {
  const farms = activeFarms(state);

  if (farmId) {
    const farm = farms.find(entry => entry.id === farmId);
    const head = [...elements.head.querySelectorAll('[data-farm-head]')].find(node => node.dataset.farmHead === farmId);
    if (farm && head) {
      const meta = head.querySelector('.farm-head-meta');
      if (meta) meta.textContent = `Nv. ${farm.level} · ${farm.barnCapacity}/${farmUsed(state, farm.id)}`;
    }
  } else {
    farms.forEach(farm => {
      const head = [...elements.head.querySelectorAll('[data-farm-head]')].find(node => node.dataset.farmHead === farm.id);
      const meta = head?.querySelector('.farm-head-meta');
      if (meta) meta.textContent = `Nv. ${farm.level} · ${farm.barnCapacity}/${farmUsed(state, farm.id)}`;
    });
  }

  if (!itemId) return;

  const row = [...elements.body.querySelectorAll('[data-item-row]')].find(node => node.dataset.itemRow === itemId);
  if (!row) return;

  const total = itemTotal(state, itemId);
  const totalNode = row.querySelector('[data-item-total]');
  const bar = row.querySelector('[data-item-distribution]');
  if (totalNode) totalNode.textContent = total;

  if (bar) {
    bar.innerHTML = total > 0
      ? farms.map(farm => {
          const quantity = effectiveQuantity(state, farm.id, itemId);
          if (!quantity) return '';
          return `<span class="distribution-segment" style="width:${(quantity / total) * 100}%;background:${farm.color}" title="${esc(farm.name)}: ${quantity}"></span>`;
        }).join('')
      : '';
  }
}
