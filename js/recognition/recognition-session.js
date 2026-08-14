import { iconUrl } from '../icons.js';
import { applyRecognizedInventory, loadRecognitionMemory, saveRecognitionMemory } from '../database.js';

function displayName(item) {
  return item?.namePt || item?.nameEn || item?.id || 'Item';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function drawCanvas(source, className) {
  const canvas = document.createElement('canvas');
  canvas.className = className;
  canvas.width = source.width;
  canvas.height = source.height;
  canvas.getContext('2d').drawImage(source, 0, 0);
  return canvas;
}

function downloadJson(data, fileName) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export class RecognitionSession {
  constructor({ getState, engineLoader, elements, onApplied, notify }) {
    this.getState = getState;
    this.engineLoader = engineLoader;
    this.elements = elements;
    this.onApplied = onApplied;
    this.notify = notify;
    this.engine = null;
    this.report = null;
    this.memoryLoaded = false;
    this.bind();
  }

  bind() {
    this.elements.run.addEventListener('click', () => this.run());
    this.elements.apply.addEventListener('click', () => this.apply());
    this.elements.download.addEventListener('click', () => {
      if (this.report) downloadJson(this.report, `reconhecimento-${Date.now()}.json`);
    });
  }

  reset() {
    this.report = null;
    this.elements.results.innerHTML = '';
    this.elements.summary.textContent = '';
    this.elements.apply.disabled = true;
    this.elements.download.disabled = true;
    this.setStatus('Escolha um ou mais prints da farm selecionada.');
  }

  setStatus(message, type = 'neutral') {
    this.elements.status.className = `status-box ${type}`;
    this.elements.status.textContent = message;
  }

  farm() {
    const state = this.getState();
    return state.farms.find(farm => farm.id === this.elements.farmSelect.value && !farm.archived);
  }

  async prepare() {
    const state = this.getState();
    this.engine = await this.engineLoader(state.items, message => this.setStatus(message));
    if (!this.memoryLoaded) {
      try {
        const memory = await loadRecognitionMemory();
        if (memory) await this.engine.importLearningData(memory, { replace: true });
      } catch (error) {
        console.warn('Memória online indisponível; mantendo o cache local.', error);
        this.notify('Memória online indisponível; o reconhecimento continua com o cache deste navegador.');
      }
      this.memoryLoaded = true;
    }
  }

  async persistMemory() {
    try {
      await saveRecognitionMemory(await this.engine.exportLearningData());
    } catch (error) {
      console.warn('A correção ficou local, mas ainda não foi sincronizada.', error);
      this.notify('Correção guardada neste navegador; a sincronização online falhou.');
    }
  }

  async run() {
    const files = [...(this.elements.files.files || [])];
    const farm = this.farm();
    if (!farm) return this.setStatus('Escolha uma farm.', 'error');
    if (!files.length) return this.setStatus('Escolha pelo menos um print.', 'error');

    this.elements.run.disabled = true;
    this.elements.apply.disabled = true;
    this.elements.results.innerHTML = '';
    try {
      await this.prepare();
      this.report = await this.engine.recognize(files, {
        farmName: farm.name,
        farmLevel: farm.level,
        onProgress: ({ message, progress, max }) => {
          this.setStatus(message);
          this.elements.progress.hidden = false;
          this.elements.progress.max = Math.max(1, max || 1);
          this.elements.progress.value = progress || 0;
        }
      });
      this.render();
      this.setStatus(`${this.report.summary.imageCount} print(s) · ${this.report.inventory.length} item(ns) prontos para conferência.`, 'ok');
    } catch (error) {
      console.error(error);
      this.setStatus(error.message || 'Falha no reconhecimento.', 'error');
    } finally {
      this.elements.run.disabled = false;
      this.elements.progress.hidden = true;
    }
  }

  itemByDbId(id) {
    return this.getState().items.find(item => Number(item.dbId) === Number(id));
  }

  render() {
    const runs = this.engine.getRuntimeRuns();
    this.elements.results.innerHTML = '';
    runs.forEach((run, runIndex) => {
      const section = document.createElement('section');
      section.className = 'recognition-print';
      section.innerHTML = `<h4>${runIndex + 1}. ${escapeHtml(run.file.name)}</h4><div class="recognition-grid"></div>`;
      const grid = section.querySelector('.recognition-grid');
      run.detections.forEach((detection, detectionIndex) => {
        if (detection.zeroSkipped) return;
        grid.append(this.detectionCard(runIndex, detectionIndex, detection));
      });
      this.elements.results.append(section);
    });
    this.refreshReadyState();
  }

  detectionCard(runIndex, detectionIndex, detection) {
    const selected = this.itemByDbId((detection.review.correctItem || detection.finalPredicted)?.id);
    const card = document.createElement('article');
    card.className = `recognition-card ${detection.decision.needsReview ? 'needs-review' : 'accepted'}`;
    card.dataset.run = runIndex;
    card.dataset.detection = detectionIndex;

    const visuals = document.createElement('div');
    visuals.className = 'recognition-visuals';
    visuals.append(drawCanvas(detection.analysis.canvas, 'recognition-segment'));
    const icon = document.createElement('img');
    icon.className = 'recognition-choice-icon';
    icon.src = iconUrl(selected);
    icon.alt = displayName(selected);
    visuals.append(icon);
    card.append(visuals);

    const body = document.createElement('div');
    body.className = 'recognition-card-body';
    body.innerHTML = `
      <strong class="recognition-name">${escapeHtml(displayName(selected))}</strong>
      <label class="field recognition-quantity"><span>Quantidade</span><input type="number" min="0" step="1" inputmode="numeric" value="${detection.quantity.effectiveValue ?? ''}"></label>
      <div class="recognition-review-actions">
        <button class="button compact recognition-correct" type="button">✓ Correto</button>
        <button class="button compact danger recognition-wrong" type="button">✕ Corrigir item</button>
      </div>
      <label class="field recognition-correction" hidden><span>Item correto</span><select></select></label>`;
    card.append(body);

    const quantity = body.querySelector('input');
    quantity.addEventListener('change', () => {
      const value = Number(quantity.value);
      if (!Number.isInteger(value) || value < 0) return;
      this.engine.reviewQuantity({ runIndex, detectionIndex, correctValue: value });
      this.report = this.engine.getReport();
      card.classList.add('reviewed');
      this.refreshReadyState();
    });

    body.querySelector('.recognition-correct').addEventListener('click', async () => {
      await this.engine.reviewItem({ runIndex, detectionIndex, status: 'correct' });
      this.report = this.engine.getReport();
      card.classList.remove('needs-review');
      card.classList.add('reviewed');
      this.refreshReadyState();
    });

    const correction = body.querySelector('.recognition-correction');
    const select = correction.querySelector('select');
    body.querySelector('.recognition-wrong').addEventListener('click', () => {
      const farm = this.farm();
      const options = this.getState().items
        .filter(item => item.active && item.unlockLevel <= farm.level)
        .sort((a, b) => displayName(a).localeCompare(displayName(b), 'pt-BR'));
      select.innerHTML = options.map(item => `<option value="${item.dbId}">${escapeHtml(displayName(item))} — Nv. ${item.unlockLevel}</option>`).join('');
      select.value = selected?.dbId || '';
      correction.hidden = false;
      select.focus();
    });
    select.addEventListener('change', async () => {
      const correct = this.itemByDbId(select.value);
      if (!correct) return;
      await this.engine.reviewItem({ runIndex, detectionIndex, status: 'incorrect', correctItem: { id: correct.dbId } });
      await this.persistMemory();
      this.report = this.engine.getReport();
      body.querySelector('.recognition-name').textContent = displayName(correct);
      icon.src = iconUrl(correct);
      icon.alt = displayName(correct);
      correction.hidden = true;
      card.classList.remove('needs-review');
      card.classList.add('reviewed', 'corrected');
      this.refreshReadyState();
    });
    return card;
  }

  refreshReadyState() {
    this.report = this.engine?.getReport() || this.report;
    const ready = Boolean(this.report?.inventoryReady && !this.report?.errors?.length);
    this.elements.apply.disabled = !ready;
    this.elements.download.disabled = !this.report;
    this.elements.summary.textContent = !this.report ? '' : ready
      ? `${this.report.inventory.length} item(ns) prontos. Confira visualmente e aplique quando estiver satisfeita.`
      : 'Há discordâncias, números ausentes ou conflitos que precisam de correção.';
  }

  async apply() {
    const farm = this.farm();
    if (!farm || !this.report?.inventoryReady) return;
    this.elements.apply.disabled = true;
    try {
      await applyRecognizedInventory(farm.id, this.report.inventory);
      const inventory = this.getState().inventory[farm.id] ||= {};
      this.report.inventory.forEach(row => {
        const item = this.itemByDbId(row.item.id);
        if (!item) return;
        if (row.quantity > 0) inventory[item.id] = row.quantity;
        else delete inventory[item.id];
      });
      farm.lastCheckedAt = new Date().toISOString();
      await this.onApplied();
      this.notify(`Inventário de ${farm.name} atualizado.`);
      this.setStatus('Inventário aplicado com segurança. Os itens que não apareceram nos prints foram preservados.', 'ok');
    } catch (error) {
      this.setStatus(error.message || 'Não foi possível aplicar o inventário.', 'error');
      this.elements.apply.disabled = false;
    }
  }
}
