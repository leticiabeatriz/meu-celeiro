export const FARM_COLORS = [
  '#5b8d58', '#c39142', '#6f8ea8', '#a46a78',
  '#7a6aa4', '#53918d', '#b16b45', '#6f7650',
  '#8e6f9f', '#4f7f98', '#b18b3a', '#8a6553'
];

export const initialState = {
  settings: {
    pin: '3112',
    defaultMinimum: 10
  },

  farms: [
    { id: 'farm-1', name: 'Principal', level: 56, barnCapacity: 1350, position: 0, archived: false, color: '#5b8d58', lastCheckedAt: '2026-08-07T22:10:00' },
    { id: 'farm-2', name: 'Depósito', level: 53, barnCapacity: 3100, position: 1, archived: false, color: '#c39142', lastCheckedAt: '2026-08-06T20:30:00' },
    { id: 'farm-3', name: 'Tris Farm 2', level: 25, barnCapacity: 1350, position: 2, archived: false, color: '#6f8ea8', lastCheckedAt: '2026-08-05T18:00:00' },
    { id: 'farm-4', name: 'Tris Farm 3', level: 20, barnCapacity: 700, position: 3, archived: false, color: '#a46a78', lastCheckedAt: null },
    { id: 'farm-5', name: 'Baby 1', level: 14, barnCapacity: 325, position: 4, archived: false, color: '#7a6aa4', lastCheckedAt: null },
    { id: 'farm-6', name: 'Baby 2', level: 20, barnCapacity: 325, position: 5, archived: false, color: '#53918d', lastCheckedAt: null },
    { id: 'farm-7', name: 'Farm ração', level: 8, barnCapacity: 225, position: 6, archived: false, color: '#b16b45', lastCheckedAt: null }
  ],

  items: [
    { id: 'duct-tape', namePt: 'Fita adesiva', nameEn: 'Duct Tape', unlockLevel: 1, category: 'Material', machine: 'Expansão', maxSalePrice: null, active: true },
    { id: 'egg', namePt: 'Ovo', nameEn: 'Egg', unlockLevel: 1, category: 'Produto animal', machine: 'Galinheiro', maxSalePrice: null, active: true },
    { id: 'wood-panel', namePt: 'Painel de madeira', nameEn: 'Wood Panel', unlockLevel: 1, category: 'Material', machine: 'Expansão', maxSalePrice: null, active: true },
    { id: 'screw', namePt: 'Parafuso', nameEn: 'Screw', unlockLevel: 1, category: 'Material', machine: 'Expansão', maxSalePrice: null, active: true },
    { id: 'nail', namePt: 'Prego', nameEn: 'Nail', unlockLevel: 1, category: 'Material', machine: 'Expansão', maxSalePrice: null, active: true },
    { id: 'bolt', namePt: 'Rebite', nameEn: 'Bolt', unlockLevel: 1, category: 'Material', machine: 'Expansão', maxSalePrice: null, active: true },
    { id: 'plank', namePt: 'Tábua', nameEn: 'Plank', unlockLevel: 1, category: 'Material', machine: 'Expansão', maxSalePrice: null, active: true },
    { id: 'bread', namePt: 'Pão', nameEn: 'Bread', unlockLevel: 2, category: 'Produto', machine: 'Padaria', maxSalePrice: null, active: true },
    { id: 'chicken-feed', namePt: 'Ração de galinha', nameEn: 'Chicken Feed', unlockLevel: 3, category: 'Ração', machine: 'Fábrica de ração', maxSalePrice: null, active: true },
    { id: 'tnt-barrel', namePt: 'Barril de TNT', nameEn: 'TNT Barrel', unlockLevel: 5, category: 'Suprimento', machine: 'Mina', maxSalePrice: null, active: true },
    { id: 'dynamite', namePt: 'Dinamite', nameEn: 'Dynamite', unlockLevel: 5, category: 'Suprimento', machine: 'Mina', maxSalePrice: null, active: true },
    { id: 'axe', namePt: 'Machado', nameEn: 'Axe', unlockLevel: 5, category: 'Suprimento', machine: 'Ferramenta', maxSalePrice: null, active: true },
    { id: 'shovel', namePt: 'Pá', nameEn: 'Shovel', unlockLevel: 5, category: 'Suprimento', machine: 'Mina', maxSalePrice: null, active: true },
    { id: 'saw', namePt: 'Serra', nameEn: 'Saw', unlockLevel: 5, category: 'Suprimento', machine: 'Ferramenta', maxSalePrice: null, active: true },
    { id: 'milk', namePt: 'Leite', nameEn: 'Milk', unlockLevel: 6, category: 'Produto animal', machine: 'Pasto das vacas', maxSalePrice: null, active: true },
    { id: 'cream', namePt: 'Nata', nameEn: 'Cream', unlockLevel: 6, category: 'Produto', machine: 'Laticínios', maxSalePrice: null, active: true },
    { id: 'cow-feed', namePt: 'Ração de vaca', nameEn: 'Cow Feed', unlockLevel: 6, category: 'Ração', machine: 'Fábrica de ração', maxSalePrice: null, active: true },
    { id: 'brown-sugar', namePt: 'Açúcar mascavo', nameEn: 'Brown Sugar', unlockLevel: 7, category: 'Produto', machine: 'Açucareira', maxSalePrice: null, active: true },
    { id: 'corn-bread', namePt: 'Pão de milho', nameEn: 'Corn Bread', unlockLevel: 7, category: 'Produto', machine: 'Padaria', maxSalePrice: null, active: true },
    { id: 'popcorn', namePt: 'Pipoca', nameEn: 'Popcorn', unlockLevel: 8, category: 'Produto', machine: 'Pipoqueira', maxSalePrice: null, active: true }
  ],

  itemPreferences: {
    'duct-tape': { minimum: 10, sellable: false },
    'egg': { minimum: 20, sellable: false },
    'wood-panel': { minimum: 10, sellable: false },
    'screw': { minimum: 10, sellable: false },
    'nail': { minimum: 10, sellable: false },
    'bolt': { minimum: 10, sellable: false },
    'plank': { minimum: 10, sellable: false },
    'bread': { minimum: 10, sellable: true },
    'chicken-feed': { minimum: 15, sellable: false },
    'tnt-barrel': { minimum: 10, sellable: false },
    'dynamite': { minimum: 10, sellable: false },
    'axe': { minimum: 10, sellable: false },
    'shovel': { minimum: 10, sellable: false },
    'saw': { minimum: 10, sellable: false },
    'milk': { minimum: 15, sellable: false },
    'cream': { minimum: 10, sellable: true },
    'cow-feed': { minimum: 15, sellable: false },
    'brown-sugar': { minimum: 10, sellable: true },
    'corn-bread': { minimum: 10, sellable: true },
    'popcorn': { minimum: 10, sellable: true }
  },

  inventory: {
    'farm-1': { 'duct-tape': 28, egg: 17, 'wood-panel': 24, screw: 21, nail: 18, bolt: 25, plank: 23, bread: 12, 'chicken-feed': 10, 'tnt-barrel': 8, dynamite: 12, axe: 16, shovel: 34, saw: 20, milk: 18, cream: 15, 'cow-feed': 12, 'brown-sugar': 20, 'corn-bread': 13, popcorn: 11 },
    'farm-2': { 'duct-tape': 32, egg: 40, 'wood-panel': 30, screw: 26, nail: 29, bolt: 27, plank: 31, bread: 20, 'chicken-feed': 18, 'tnt-barrel': 11, dynamite: 9, axe: 25, shovel: 45, saw: 22, milk: 30, cream: 24, 'cow-feed': 20, 'brown-sugar': 25, 'corn-bread': 18, popcorn: 16 },
    'farm-3': { 'duct-tape': 12, egg: 14, 'wood-panel': 9, screw: 10, nail: 11, bolt: 13, plank: 8, bread: 9, 'chicken-feed': 11, 'tnt-barrel': 3, dynamite: 4, axe: 5, shovel: 10, saw: 7, milk: 8, cream: 6, 'cow-feed': 7, 'brown-sugar': 5, 'corn-bread': 4, popcorn: 4 },
    'farm-4': { 'duct-tape': 8, egg: 12, 'wood-panel': 6, screw: 7, nail: 7, bolt: 8, plank: 6, bread: 6, 'chicken-feed': 8, 'tnt-barrel': 2, dynamite: 2, axe: 3, shovel: 6, saw: 4, milk: 7, cream: 4, 'cow-feed': 5, 'brown-sugar': 4, 'corn-bread': 3, popcorn: 3 },
    'farm-5': { 'duct-tape': 5, egg: 10, 'wood-panel': 4, screw: 5, nail: 5, bolt: 4, plank: 4, bread: 4, 'chicken-feed': 5, 'tnt-barrel': 1, dynamite: 1, axe: 2, shovel: 3, saw: 2, milk: 3, cream: 2, 'cow-feed': 2, 'brown-sugar': 2, 'corn-bread': 2, popcorn: 2 },
    'farm-6': { 'duct-tape': 7, egg: 9, 'wood-panel': 6, screw: 7, nail: 6, bolt: 6, plank: 7, bread: 5, 'chicken-feed': 5, 'tnt-barrel': 2, dynamite: 2, axe: 2, shovel: 4, saw: 3, milk: 4, cream: 3, 'cow-feed': 4, 'brown-sugar': 3, 'corn-bread': 2, popcorn: 2 },
    'farm-7': { 'duct-tape': 3, egg: 6, 'wood-panel': 3, screw: 2, nail: 3, bolt: 3, plank: 2, bread: 3, 'chicken-feed': 8, 'tnt-barrel': 1, dynamite: 1, axe: 1, shovel: 2, saw: 1, milk: 2, cream: 1, 'cow-feed': 5, 'brown-sugar': 1, 'corn-bread': 1, popcorn: 1 }
  }
};

export function cloneInitialState() {
  return structuredClone(initialState);
}
