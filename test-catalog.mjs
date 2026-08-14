import fs from 'node:fs';
import { cloneSeedState } from './js/seed-data.js';
import { normalizeCatalogJson, buildCatalogSyncPlan, applyCatalogSync } from './js/catalog.js';

const payload = JSON.parse(fs.readFileSync('./assets/hayday-items-374-por-nivel-v0.3.1.json','utf8'));
const incoming = normalizeCatalogJson(payload);
const state = cloneSeedState();
const plan = buildCatalogSyncPlan(state, incoming);
applyCatalogSync(state, plan);

console.log({count: state.items.length, first: state.items[0], cow: state.items.find(x=>x.id==='cow-feed'), chicken: state.items.find(x=>x.id==='chicken-feed')});
if (state.items.length !== 374) throw new Error('count');
if (state.items.find(x=>x.id==='cow-feed')?.namePt !== 'Ração das vacas') throw new Error('cow translation not preserved');
if (state.items.find(x=>x.id==='chicken-feed')?.namePt !== 'Ração das galinhas') throw new Error('chicken translation not preserved');
if (state.items.find(x=>x.id==='sushi-roll')?.namePt !== '') throw new Error('new translations should be blank');

state.items.find(x=>x.id==='sushi-roll').namePt = 'Teste PT';
const incoming2 = normalizeCatalogJson(payload);
applyCatalogSync(state, buildCatalogSyncPlan(state, incoming2));
if (state.items.find(x=>x.id==='sushi-roll')?.namePt !== 'Teste PT') throw new Error('translation lost on resync');
console.log('catalog tests ok');
