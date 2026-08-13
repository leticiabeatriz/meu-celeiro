export function exportBackup(state) {
  const payload = {
    app: 'Meu Celeiro',
    version: '0.3.0-prototype',
    exportedAt: new Date().toISOString(),
    data: state
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `meu-celeiro-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readBackup(file) {
  const parsed = JSON.parse(await file.text());
  const state = parsed?.data;

  if (!parsed || parsed.app !== 'Meu Celeiro' || !state) throw new Error('Arquivo de backup inválido.');
  if (!Array.isArray(state.farms) || !Array.isArray(state.items)) throw new Error('Backup sem farms ou itens válidos.');
  if (!state.inventory || typeof state.inventory !== 'object') throw new Error('Backup sem inventário válido.');
  if (!state.itemPreferences || typeof state.itemPreferences !== 'object') throw new Error('Backup sem preferências válidas.');

  return structuredClone(state);
}
