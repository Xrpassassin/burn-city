// Dependency-free, runtime-agnostic objective core for BURN City.
// Deliberately not wired to gameplay or existing save files in this first reviewable slice.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EVENT_TYPES = new Set(['discover', 'fish-catch', 'zombie-kill', 'interact', 'visit-zone']);
const DAILY_TEMPLATES = Object.freeze([
  { id:'city-scout', title:'Eyes on BURN City', description:'Discover 3 points of interest.', type:'discover', target:'*', required:3, category:'exploration', reward:{ reputation:25 } },
  { id:'angler-shift', title:'A Quiet Shift', description:'Land 2 fish.', type:'fish-catch', target:'*', required:2, category:'fishing', reward:{ reputation:20 } },
  { id:'frontier-cleanup', title:'Frontier Cleanup', description:'Eliminate 5 zombies.', type:'zombie-kill', target:'zombie', required:5, category:'combat', reward:{ reputation:35 } },
  { id:'make-contact', title:'Make Contact', description:'Interact with 3 world characters or services.', type:'interact', target:'*', required:3, category:'social', reward:{ reputation:20 } },
  { id:'zone-hopper', title:'Know the Territory', description:'Visit 2 distinct zones.', type:'visit-zone', target:'*', required:2, category:'exploration', reward:{ reputation:25 } },
  { id:'lake-regular', title:'Lake Regular', description:'Land 4 fish.', type:'fish-catch', target:'*', required:4, category:'fishing', reward:{ reputation:35 } },
  { id:'undead-pressure', title:'Thin the Herd', description:'Eliminate 8 zombies.', type:'zombie-kill', target:'zombie', required:8, category:'combat', reward:{ reputation:50 } },
  { id:'city-helper', title:'A Hand in the City', description:'Interact with 5 world characters or services.', type:'interact', target:'*', required:5, category:'social', reward:{ reputation:40 } }
]);
const clampInt = (n, min, max) => Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : min;
const copy = value => JSON.parse(JSON.stringify(value));

export function createDailyObjectiveBoard(date, { seed = 0 } = {}) {
  if (typeof date !== 'string' || !DATE_RE.test(date) || Number.isNaN(Date.parse(date + 'T00:00:00Z'))) throw new TypeError('date must be a valid UTC date in YYYY-MM-DD format');
  let hash = 2166136261 ^ (Number.isFinite(seed) ? seed | 0 : 0);
  for (const ch of date) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  const start = (hash >>> 0) % DAILY_TEMPLATES.length;
  const chosen = [];
  for (let i = 0; chosen.length < 4; i++) {
    const item = DAILY_TEMPLATES[(start + i * 3) % DAILY_TEMPLATES.length];
    if (!chosen.some(x => x.id === item.id)) chosen.push(item);
  }
  return { schemaVersion:1, boardId:'daily:' + date + ':' + (Number.isFinite(seed) ? seed : 0), date, objectives:chosen.map(def => ({ ...copy(def), progress:0, completed:false })) };
}

export function applyObjectiveEvent(board, event) {
  if (!board || board.schemaVersion !== 1 || !Array.isArray(board.objectives)) throw new TypeError('A version 1 objective board is required');
  if (!event || !EVENT_TYPES.has(event.type)) return { board:copy(board), changed:[], completed:[] };
  const amount = clampInt(event.amount ?? 1, 0, 1000);
  if (amount === 0) return { board:copy(board), changed:[], completed:[] };
  const next = copy(board), changed = [], completed = [];
  for (const objective of next.objectives) {
    if (objective.completed || objective.type !== event.type) continue;
    if (objective.target !== '*' && event.target !== objective.target) continue;
    if (objective.type === 'visit-zone') {
      if (typeof event.zoneId !== 'string' || !event.zoneId.trim()) continue;
      objective.visitedZones = Array.isArray(objective.visitedZones) ? objective.visitedZones : [];
      if (objective.visitedZones.includes(event.zoneId)) continue;
      objective.visitedZones.push(event.zoneId);
      objective.progress = Math.min(objective.required, objective.visitedZones.length);
    } else objective.progress = Math.min(objective.required, objective.progress + amount);
    changed.push(objective.id);
    if (objective.progress >= objective.required) { objective.completed = true; completed.push({ id:objective.id, reward:copy(objective.reward) }); }
  }
  return { board:next, changed, completed };
}

export function summarizeObjectiveBoard(board) {
  const objectives = Array.isArray(board?.objectives) ? board.objectives : [];
  return { total:objectives.length, completed:objectives.filter(x => x.completed).length, progress:objectives.reduce((sum,x) => sum + clampInt(x.progress,0,clampInt(x.required,0,100000)),0), required:objectives.reduce((sum,x) => sum + clampInt(x.required,0,100000),0) };
}
export function objectiveEventTypes() { return [...EVENT_TYPES]; }
