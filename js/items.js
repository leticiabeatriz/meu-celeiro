import { iconMarkup, bindImageFallbacks } from './icons.js';

let currentState = null;
let currentElements = null;

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

function ensureItemsTabs() {
  const page = document.querySelector('#page-itens');
  const catalogPanel = page?.querySelector(':scope > .panel');
  if (!page || !catalogPanel) return;

  let nav = page.querySelector('#itemsModeNav');
  if (nav) return;

  catalogPanel.id = catalogPanel.id || 'itemsCatalogPanel';
  catalogPanel.dataset.itemsView = 'catalogo';

  nav = document.createElement('nav');
  nav.id = 'itemsModeNav';
  nav.className = 'inner-mode-nav items-mode-nav';
  nav.setAttribute('aria-label', 'Modos da área de itens');
  nav.innerHTML = `
    <button type="button" class="active" data-items-view="catalogo">Catálogo</button>
    <button type="button" data-items-view="traducoes">Traduções</button>
  `;

  const translationPanel = document.createElement('article');
  translationPanel.id = 'itemsTranslationPanel';
  translationPanel.className = 'panel translation-panel';
  translationPanel.dataset.itemsView = 'traducoes';
  translationPanel.hidden = true;
  translationPanel.innerHTML = `
    <div class="translation-heading">
      <div>
        <p class="eyebrow">NOMES NO JOGO</p>
        <h3>Traduções PT-BR</h3>
        <p class="muted">Preencha exatamente como o nome aparece no Hay Day. Campo vazio usa o nome original no restante do site.</p>
      </div>
      <span id="translationStats" class="translation-stats">—</span>
    </div>
    <div class="translation-toolbar">
      <label class="field grow"><span>Pesquisar</span><input id="translationSearch" type="search" placeholder="Nome original, tradução ou ID…"></label>
      <label class="toggle-control translation-missing-toggle"><input id="translationMissingOnly" type="checkbox"><span class="toggle-ui"></span><span>Só sem tradução</span></label>
    </div>
    <div class="table-scroll">
      <table class="data-table translation-table">
        <thead><tr><th>Item</th><th>Nome original</th><th>Nome no jogo (PT-BR)</th><th>Nível</th></tr></thead>
        <tbody id="translationsBody"></tbody>
      </table>
    </div>
  `;

  catalogPanel.before(nav);
  catalogPanel.after(translationPanel);

  nav.addEventListener('click', event => {
    const button = event.target.closest('[data-items-view]');
    if (!button) return;
    const view = button.dataset.itemsView;
    nav.querySelectorAll('[data-items-view]').forEach(node => node.classList.toggle('active', node === button));
    catalogPanel.hidden = view !== 'catalogo';
    translationPanel.hidden = view !== 'traducoes';
    if (view === 'traducoes') renderTranslationTable();
  });

  translationPanel.querySelector('#translationSearch').addEventListener('input', renderTranslationTable);
  translationPanel.querySelector('#translationMissingOnly').addEventListener('change', renderTranslationTable);
}

function renderTranslationTable() {
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
    .filter(item => !query || normalize([item.id, item.nameEn, item.namePt].join(' ')).includes(query))
    .sort((a,b) => a.unlockLevel - b.unlockLevel || displayName(a).localeCompare(displayName(b), 'pt-BR'));

  body.innerHTML = '';
  if (!items.length) {
    body.innerHTML = '<tr class="empty-row"><td colspan="4">Nenhum item corresponde ao filtro.</td></tr>';
    return;
  }

  items.forEach(item => {
    const row = document.createElement('tr');
    const missing = !String(item.namePt || '').trim();
    if (missing) row.classList.add('translation-missing-row');
    row.innerHTML = `
      <td><div class="translation-item-icon">${iconMarkup(item, true)}<span class="item-id">${esc(item.id)}</span></div></td>
      <td><strong>${esc(item.nameEn || '—')}</strong></td>
      <td>
        <input class="translation-input${missing ? ' missing' : ''}" type="text" value="${esc(item.namePt || '')}" placeholder="Digite exatamente como aparece no jogo" data-translation-id="${esc(item.id)}">
      </td>
      <td><span class="level-chip">Nv. ${item.unlockLevel}</span></td>
    `;

    const input = row.querySelector('[data-translation-id]');
    input.addEventListener('change', () => {
      const target = currentState.items.find(entry => entry.id === item.id);
      if (!target) return;
      target.namePt = input.value.trim();
      document.querySelectorAll('[data-item-display]').forEach(node => {
        if (node.dataset.itemDisplay === target.id) node.textContent = displayName(target);
      });
      renderItems(currentState, currentElements);
    });
    body.append(row);
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

export function renderItems(state, elements) {
  currentState = state;
  currentElements = elements;
  ensureItemsTabs();

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
    elements.body.innerHTML = '<tr class="empty-row"><td colspan="6">Nenhum item encontrado.</td></tr>';
    renderTranslationTable();
    return;
  }

  items.forEach(item => {
    const row = document.createElement('tr');
    const translated = Boolean(String(item.namePt || '').trim());
    row.innerHTML = `
      <td><div class="item-main">${iconMarkup(item)}<div><span class="item-name" data-item-display="${esc(item.id)}">${esc(displayName(item))}</span><span class="item-sub">${esc(item.nameEn || '—')}</span><span class="item-id">${esc(item.id)}</span></div></div></td>
      <td><span class="level-chip">Nv. ${item.unlockLevel}</span></td>
      <td>${esc(item.category || '—')}</td>
      <td>${esc(item.machine || '—')}</td>
      <td>${item.maxSalePrice == null ? '—' : Number(item.maxSalePrice).toLocaleString('pt-BR')}</td>
      <td><span class="state-chip ${item.active ? 'active' : 'inactive'}">${item.active ? (translated ? 'Ativo' : 'Ativo · sem PT-BR') : 'Inativo'}</span></td>
    `;
    elements.body.append(row);
  });

  bindImageFallbacks(elements.body);
  renderTranslationTable();
}
