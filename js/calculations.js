export function activeFarms(state){return state.farms.filter(f=>!f.archived).sort((a,b)=>a.position-b.position)}
export function itemTotal(state,itemId,includeArchived=false){const farms=includeArchived?state.farms:activeFarms(state);return farms.reduce((s,f)=>s+Number(state.inventory[f.id]?.[itemId]||0),0)}
export function farmUsed(state,farmId){return Object.values(state.inventory[farmId]||{}).reduce((s,v)=>s+Number(v||0),0)}
export function farmFree(state,farmId){const f=state.farms.find(x=>x.id===farmId);return f?Number(f.barnCapacity)-farmUsed(state,farmId):0}
export function farmOccupancy(state,farmId){const f=state.farms.find(x=>x.id===farmId);return !f||!f.barnCapacity?0:farmUsed(state,farmId)/f.barnCapacity*100}
export function minimumFor(state,itemId){return Number(state.preferences[itemId]??state.settings.defaultMinimum??10)}
export function excessFor(state,itemId){return Math.max(itemTotal(state,itemId)-minimumFor(state,itemId),0)}
export function stockValue(state){return state.items.reduce((s,i)=>s+itemTotal(state,i.id)*Number(i.maxSalePrice||0),0)}
export function excessValue(state){return state.items.reduce((s,i)=>s+excessFor(state,i.id)*Number(i.maxSalePrice||0),0)}
export function overallStats(state){const farms=activeFarms(state),capacity=farms.reduce((s,f)=>s+Number(f.barnCapacity||0),0),used=farms.reduce((s,f)=>s+farmUsed(state,f.id),0),free=capacity-used,occupancy=capacity>0?used/capacity*100:0;return{farms,capacity,used,free,occupancy}}
export function fullestFarm(state){const farms=activeFarms(state);if(!farms.length)return null;return farms.map(f=>({farm:f,used:farmUsed(state,f.id),occupancy:farmOccupancy(state,f.id)})).sort((a,b)=>b.occupancy-a.occupancy)[0]}
export function maxActiveFarmLevel(state){const farms=activeFarms(state);return farms.length?Math.max(...farms.map(f=>Number(f.level||0))):0}
