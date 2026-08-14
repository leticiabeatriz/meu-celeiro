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
    elements.body.innerHTML = '<div class="status-box neutral compact-empty">Nenhuma farm cadastrada.</div>';
    elements.status.textContent = '0 farms';
    return;
  }

  farms.forEach((farm, index) => {
    const used = farmUsed(state, farm.id);
    const free = farmFree(state, farm.id);
    const occupancy = farmOccupancy(state, farm.id);
    const over = !farm.archived && used > farm.barnCapacity;

    const card = document.createElement('article');
    card.className = `farm-card${farm.archived ? ' archived' : ''}`;
    card.style.setProperty('--farm-color', farm.color);
    card.innerHTML = `
      <div class="farm-card-head">
        <div class="farm-card-name"><span class="farm-color-dot"></span><strong>${esc(farm.name)}</strong></div>
        <span class="state-chip ${farm.archived ? 'archived' : 'active'}">${farm.archived ? 'Arquivada' : 'Ativa'}</span>
      </div>

      <div class="farm-card-stats">
        <div><span>Nível</span><strong>${farm.level}</strong></div>
        <div><span>Celeiro</span><strong>${Number(farm.barnCapacity).toLocaleString('pt-BR')}</strong></div>
        <div><span>Ocupado</span><strong class="${over ? 'danger-text' : ''}">${farm.archived ? '—' : used.toLocaleString('pt-BR')}</strong></div>
        <div><span>Livre</span><strong>${farm.archived ? '—' : (free >= 0 ? free.toLocaleString('pt-BR') : `-${Math.abs(free).toLocaleString('pt-BR')}`)}</strong></div>
      </div>

      <div class="farm-card-check"><span>Última conferência</span><strong>${fmtDate(farm.lastCheckedAt)}</strong>${!farm.archived ? `<small>${Math.round(occupancy)}% ocupado</small>` : ''}</div>

      <div class="farm-card-actions">
        <div class="order-actions" aria-label="Ordenar farm">
          <button class="mini-button" data-action="up" ${index === 0 ? 'disabled' : ''} title="Mover para cima">↑</button>
          <button class="mini-button" data-action="down" ${index === farms.length - 1 ? 'disabled' : ''} title="Mover para baixo">↓</button>
        </div>
        <div class="row-actions">
          <button class="mini-button" data-action="edit">Editar</button>
          <button class="mini-button" data-action="archive">${farm.archived ? 'Restaurar' : 'Arquivar'}</button>
          <button class="mini-button danger" data-action="delete">Excluir</button>
        </div>
      </div>
    `;

    card.querySelector('[data-action="edit"]').addEventListener('click', () => handlers.edit(farm.id));
    card.querySelector('[data-action="archive"]').addEventListener('click', () => handlers.archive(farm.id));
    card.querySelector('[data-action="delete"]').addEventListener('click', () => handlers.delete(farm.id));
    card.querySelector('[data-action="up"]').addEventListener('click', () => handlers.move(farm.id, -1));
    card.querySelector('[data-action="down"]').addEventListener('click', () => handlers.move(farm.id, 1));
    elements.body.append(card);
  });

  elements.status.textContent = `${farms.length} farm(s) exibida(s).`;
}
