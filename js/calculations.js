export function activeFarms(state) {
  return state.farms
    .filter(farm => !farm.archived)
    .sort((a, b) => a.position - b.position);
}

export function activeItems(state) {
  return state.items.filter(item => item.active);
}

export function rawQuantity(state, farmId, itemId) {
  return Number(state.inventory[farmId]?.[itemId] || 0);
}

export function effectiveQuantity(state, farmId, itemId) {
  const farm = state.farms.find(f => f.id === farmId);
  const item = state.items.find(i => i.id === itemId);

  if (!farm || !item) return 0;
  if (farm.archived || !item.active) return 0;
  if (Number(item.unlockLevel) > Number(farm.level)) return 0;

  return rawQuantity(state, farmId, itemId);
}

export function itemTotal(state, itemId) {
  return activeFarms(state).reduce(
    (sum, farm) => sum + effectiveQuantity(state, farm.id, itemId),
    0
  );
}

export function farmUsed(state, farmId) {
  const farm = state.farms.find(f => f.id === farmId);
  if (!farm || farm.archived) return 0;

  return activeItems(state).reduce(
    (sum, item) => sum + effectiveQuantity(state, farmId, item.id),
    0
  );
}

export function farmFree(state, farmId) {
  const farm = state.farms.find(f => f.id === farmId);
  if (!farm) return 0;
  return Number(farm.barnCapacity || 0) - farmUsed(state, farmId);
}

export function farmOccupancy(state, farmId) {
  const farm = state.farms.find(f => f.id === farmId);
  if (!farm || !farm.barnCapacity || farm.archived) return 0;
  return (farmUsed(state, farmId) / Number(farm.barnCapacity)) * 100;
}

export function preferenceFor(state, itemId) {
  return state.itemPreferences[itemId] || {
    minimum: Number(state.settings.defaultMinimum || 10),
    sellable: true
  };
}

export function minimumFor(state, itemId) {
  return Math.max(0, Number(preferenceFor(state, itemId).minimum || 0));
}

export function isSellable(state, itemId) {
  return preferenceFor(state, itemId).sellable !== false;
}

export function excessFor(state, itemId) {
  if (!isSellable(state, itemId)) return 0;
  return Math.max(itemTotal(state, itemId) - minimumFor(state, itemId), 0);
}

export function excessValue(state, itemId) {
  const item = state.items.find(i => i.id === itemId);
  const price = Number(item?.maxSalePrice);
  if (!Number.isFinite(price) || price < 0) return null;
  return excessFor(state, itemId) * price;
}

export function overallStats(state) {
  const farms = activeFarms(state);
  const capacity = farms.reduce((sum, farm) => sum + Number(farm.barnCapacity || 0), 0);
  const used = farms.reduce((sum, farm) => sum + farmUsed(state, farm.id), 0);
  const free = capacity - used;
  const occupancy = capacity > 0 ? (used / capacity) * 100 : 0;
  const stored = activeItems(state).reduce((sum, item) => sum + itemTotal(state, item.id), 0);
  return { farms, capacity, used, free, occupancy, stored };
}

export function fullestFarm(state) {
  const farms = activeFarms(state);
  if (!farms.length) return null;

  return farms
    .map(farm => ({ farm, used: farmUsed(state, farm.id), occupancy: farmOccupancy(state, farm.id) }))
    .sort((a, b) => b.occupancy - a.occupancy)[0];
}

export function maxActiveFarmLevel(state) {
  const farms = activeFarms(state);
  return farms.length ? Math.max(...farms.map(farm => Number(farm.level || 0))) : 0;
}
