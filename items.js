import { iconMarkup, bindImageFallbacks } from './icons.js';

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function normalize(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
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
  const search = normalize(elements.search.value);
  const category = elements.category.value;
  const machine = elements.machine.value;
  const showInactive = elements.showInactive.checked;

  const items = state.items
    .filter(item => showInactive || item.active)
    .filter(item => !category || item.category === category)
    .filter(item => !machine || item.machine === machine)
    .filter(item => !search || normalize([item.id, item.namePt, item.nameEn, item.category, item.machine].join(' ')).includes(search))
    .sort((a,b) => a.unlockLevel - b.unlockLevel || a.namePt.localeCompare(b.namePt, 'pt-BR'));

  elements.body.innerHTML = '';

  if (!items.length) {
    elements.body.innerHTML = '<tr class="empty-row"><td colspan="6">Nenhum item encontrado.</td></tr>';
    return;
  }

  items.forEach(item => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><div class="item-main">${iconMarkup(item)}<div><span class="item-name">${esc(item.namePt)}</span><span class="item-sub">${esc(item.nameEn || '—')}</span><span class="item-id">${esc(item.id)}</span></div></div></td>
      <td><span class="level-chip">Nv. ${item.unlockLevel}</span></td>
      <td>${esc(item.category || '—')}</td>
      <td>${esc(item.machine || '—')}</td>
      <td>${item.maxSalePrice == null ? '—' : Number(item.maxSalePrice).toLocaleString('pt-BR')}</td>
      <td><span class="state-chip ${item.active ? 'active' : 'inactive'}">${item.active ? 'Ativo' : 'Inativo'}</span></td>
    `;
    elements.body.append(row);
  });

  bindImageFallbacks(elements.body);
}
