import { farmUsed, farmOccupancy, farmFree } from './calculations.js';

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function fmtDate(value) {
  if (!value) return 'Nunca';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export function normalizePositions(state) {
  state.farms
    .sort((a, b) => a.position - b.position)
    .forEach((farm, index) => { farm.position = index; });
}

export function renderFarms(state, elements, handlers) {
  const showArchived = elements.showArchived.checked;
  const farms = [...state.farms]
    .sort((a, b) => a.position - b.position)
    .filter(farm => showArchived || !farm.archived);

  elements.body.innerHTML = '';

  if (!farms.length) {
    elements.body.innerHTML = '<tr class="empty-row"><td colspan="8">Nenhuma farm cadastrada.</td></tr>';
    elements.status.textContent = '0 farms';
    return;
  }

  farms.forEach((farm, index) => {
    const used = farmUsed(state, farm.id);
    const free = farmFree(state, farm.id);
    const occupancy = farmOccupancy(state, farm.id);
    const over = !farm.archived && used > farm.barnCapacity;

    const row = document.createElement('tr');
    row.innerHTML = `
      <td><div class="order-actions"><button class="mini-button" data-action="up" ${index === 0 ? 'disabled' : ''}>↑</button><button class="mini-button" data-action="down" ${index === farms.length - 1 ? 'disabled' : ''}>↓</button></div></td>
      <td><span style="display:inline-flex;align-items:center;gap:7px"><span class="farm-color-dot" style="--farm-color:${farm.color}"></span><strong>${esc(farm.name)}</strong></span></td>
      <td><span class="level-chip">Nv. ${farm.level}</span></td>
      <td>${Number(farm.barnCapacity).toLocaleString('pt-BR')}</td>
      <td>${farm.archived ? '<span class="muted-small">Ignorada</span>' : `<span class="usage-pill ${over ? 'over' : ''}">${used}/${farm.barnCapacity} · ${Math.round(occupancy)}%</span><span class="item-sub">${free >= 0 ? `${free} livres` : `${Math.abs(free)} acima`}</span>`}</td>
      <td>${fmtDate(farm.lastCheckedAt)}</td>
      <td><span class="state-chip ${farm.archived ? 'archived' : 'active'}">${farm.archived ? 'Arquivada' : 'Ativa'}</span></td>
      <td><div class="row-actions"><button class="mini-button" data-action="edit">Editar</button><button class="mini-button" data-action="archive">${farm.archived ? 'Restaurar' : 'Arquivar'}</button><button class="mini-button danger" data-action="delete">Excluir</button></div></td>
    `;

    row.querySelector('[data-action="edit"]').addEventListener('click', () => handlers.edit(farm.id));
    row.querySelector('[data-action="archive"]').addEventListener('click', () => handlers.archive(farm.id));
    row.querySelector('[data-action="delete"]').addEventListener('click', () => handlers.delete(farm.id));
    row.querySelector('[data-action="up"]').addEventListener('click', () => handlers.move(farm.id, -1));
    row.querySelector('[data-action="down"]').addEventListener('click', () => handlers.move(farm.id, 1));
    elements.body.append(row);
  });

  elements.status.textContent = `${farms.length} farm(s) exibida(s).`;
}
