export function exportBackup(state) {
  const safeState = structuredClone(state);
  if (safeState.settings) {
    delete safeState.settings.pinSalt;
    delete safeState.settings.pinHash;
  }

  const payload = {
    app: 'Meu Celeiro',
    version: '0.5.1',
    exportedAt: new Date().toISOString(),
    data: safeState
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `meu-celeiro-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
