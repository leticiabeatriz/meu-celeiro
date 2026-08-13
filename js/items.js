import { iconMarkup, bindImageFallbacks } from './icons.js';

let currentState = null;
let currentElements = null;
let currentHandlers = {};
let tabsBound = false;

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

function bindItemsTabs() {
  if (tabsBound) return;
  const nav = document.querySelector('#itemsModeNav');
  const catalogPanel = document.querySelector('#itemsCatalogPanel');
  const translationPanel = document.querySelector('#itemsTranslationPanel');
  const translationSearch = document.querySelector('#translationSearch');
  const translationMissingOnly = document.querySelector('#translationMissingOnly');
  if (!nav || !catalogPanel || !translationPanel || !translationSearch || !translationMissingOnly) return;

  nav.addEventListener('click', event => {
    const button = event.target.closest('[data-items-view]');
    if (!button) return;
    const view = button.dataset.itemsView;
    nav.querySelectorAll('[data-items-view]').forEach(node => node.classList.toggle('active', node === button));
    catalogPanel.hidden = view !== 'catalogo';
    translationPanel.hidden = view !== 'traducoes';
    if (view === 'traducoes') renderTranslationCards();
  });
  translationSearch.addEventListener('input', renderTranslationCards);
  translationMissingOnly.addEventListener('change', renderTranslationCards);
  tabsBound = true;
}

function renderTranslationCards() {
  if (!currentState) return;
  const body = document.querySelector('#translationsBody');
  const searchInput = document.querySelector('#translationSearch');
  const missingOnlyInput = document.querySelector('#translationMissingOnly');
  const stats = document.querySelector('#translationStats');
  if (!body || !searchInput || !missingOnlyInput || !stats) return;

  const translated = currentState.items.filter(item => String(item.namePt || '').trim()).length;
  stats.textContent = `${translated}/${currentState.items.length} traduzidos`;

  const query = normalize(searchInput.value);
  const missingOnly = missingOnlyInput.checked;
  const items = currentState.items
    .filter(item => !missingOnly || !String(item.namePt || '').trim())
    .filter(item => !query || normalize([item.nameEn, item.namePt].join(' ')).includes(query))
    .sort((a,b) => a.unlockLevel - b.unlockLevel || displayName(a).localeCompare(displayName(b), 'pt-BR'));

  body.innerHTML = '';
  if (!items.length) {
    body.innerHTML = '<div class="status-box neutral compact-empty">Nenhum item corresponde ao filtro.</div>';
    return;
  }

  items.forEach(item => {
    const card = document.createElement('article');
    const missing = !String(item.namePt || '').trim();
    card.className = `translation-card${missing ? ' translation-missing-card' : ''}`;
    card.innerHTML = `
      <div class="translation-card-head">
        ${iconMarkup(item)}
        <div>
          <strong>${esc(item.nameEn || '—')}</strong>
          <span class="item-sub">Nível ${item.unlockLevel}</span>
        </div>
      </div>
      <label class="field translation-field">
        <span>Nome no jogo (PT-BR)</span>
        <input class="translation-input${missing ? ' missing' : ''}" type="text" value="${esc(item.namePt || '')}" placeholder="Digite exatamente como aparece no jogo" data-translation-id="${esc(item.id)}">
      </label>
    `;

    const input = card.querySelector('[data-translation-id]');
    input.addEventListener('change', () => {
      const target = currentState.items.find(entry => entry.id === item.id);
      if (!target) return;
      target.namePt = input.value.trim();
      currentHandlers.translation?.(target.id, target.namePt);
      renderItems(currentState, currentElements, currentHandlers);
    });
    body.append(card);
  });

  bindImageFallbacks(body);
}

export function refillItemFilters(state, elements) {
  const categories = [...new Set(state.items.map(item => item.category).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'pt-BR'));
  const machines = [...new Set(state.items.map(item => item.machine).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'pt-BR'));

  const fill = (select, values) => {
    const current = select.value;
    select.innerHTML = '<option value="">Todas</option>' + values.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
    if (values.includes(current)) select.value = current;
  };

  fill(elements.category, categories);
  fill(elements.machine, machines);
}

export function renderItems(state, elements, handlers = {}) {
  currentState = state;
  currentElements = elements;
  currentHandlers = handlers;
  bindItemsTabs();

  const search = normalize(elements.search.value);
  const category = elements.category.value;
  const machine = elements.machine.value;
  const showInactive = elements.showInactive.checked;

  const items = state.items
    .filter(item => showInactive || item.active)
    .filter(item => !category || item.category === category)
    .filter(item => !machine || item.machine === machine)
    .filter(item => !search || normalize([item.id, item.namePt, item.nameEn, item.category, item.machine].join(' ')).includes(search))
    .sort((a,b) => a.unlockLevel - b.unlockLevel || displayName(a).localeCompare(displayName(b), 'pt-BR'));

  elements.body.innerHTML = '';

  if (!items.length) {
    elements.body.innerHTML = '<div class="status-box neutral compact-empty">Nenhum item encontrado.</div>';
    renderTranslationCards();
    return;
  }

  items.forEach(item => {
    const card = document.createElement('article');
    const translated = Boolean(String(item.namePt || '').trim());
    const meta = [item.machine, item.category].filter(Boolean);
    card.className = 'item-catalog-card';
    card.innerHTML = `
      <div class="item-card-head">
        ${iconMarkup(item)}
        <div class="item-card-title">
          <strong data-item-display="${esc(item.id)}">${esc(displayName(item))}</strong>
          ${item.namePt && item.nameEn ? `<span>${esc(item.nameEn)}</span>` : ''}
        </div>
        <span class="level-chip">Nv. ${item.unlockLevel}</span>
      </div>
      <div class="item-card-meta">
        ${meta.length ? meta.map(value => `<span class="mini-chip">${esc(value)}</span>`).join('') : '<span class="muted-small">Sem máquina ou categoria cadastrada</span>'}
      </div>
      <div class="item-card-footer">
        <span class="state-chip ${item.active ? 'active' : 'inactive'}">${item.active ? (translated ? 'Ativo' : 'Ativo · sem PT-BR') : 'Inativo'}</span>
        ${item.maxSalePrice == null ? '' : `<span class="muted-small">Máx. ${Number(item.maxSalePrice).toLocaleString('pt-BR')} moedas</span>`}
      </div>
    `;
    elements.body.append(card);
  });

  bindImageFallbacks(elements.body);
  renderTranslationCards();
}
