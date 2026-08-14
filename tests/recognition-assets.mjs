import fs from 'node:fs';
import path from 'node:path';
import { normalizeCatalogJson } from '../js/catalog.js';

const root = path.resolve(import.meta.dirname, '..');
const payload = JSON.parse(fs.readFileSync(path.join(root, 'assets/hayday-items-374-por-nivel-v0.3.1.json'), 'utf8'));
const items = normalizeCatalogJson(payload);
const iconDir = path.join(root, 'assets/icons');
const iconNames = new Set(fs.readdirSync(iconDir).filter(name => name.endsWith('.png')));
const missing = items.filter(item => !iconNames.has(`${item.id}.png`)).map(item => item.id);
const extra = [...iconNames].filter(name => !items.some(item => `${item.id}.png` === name));

if (items.length !== 374) throw new Error(`Catálogo com ${items.length} itens.`);
if (iconNames.size !== 374) throw new Error(`Pasta com ${iconNames.size} PNGs.`);
if (missing.length) throw new Error(`Ícones ausentes: ${missing.join(', ')}`);
if (extra.length) throw new Error(`Ícones sem item: ${extra.join(', ')}`);

for (const file of ['mobilenet-v2-model.json', 'group1-shard1of2.bin', 'group1-shard2of2.bin']) {
  const target = path.join(root, 'assets/recognition/model', file);
  if (!fs.existsSync(target) || fs.statSync(target).size === 0) throw new Error(`Modelo ausente: ${file}`);
}

console.log('recognition assets ok');
