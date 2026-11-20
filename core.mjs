export const AREAS = {
  norvak: { name: 'Norvak', color: '#b99bff', symbol: '⌘' },
  aprender: { name: 'Aprender', color: '#87bbff', symbol: '◈' },
  salud: { name: 'Movimiento', color: '#d1f86b', symbol: 'ϟ' },
  familia: { name: 'Familia', color: '#ffa7b7', symbol: '♡' },
  personal: { name: 'Personal', color: '#f3c482', symbol: '☀' },
  trabajo: { name: 'Trabajo', color: '#9eb5b4', symbol: '▣' }
};
export const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function asDate(key) { return new Date(`${key}T12:00:00`); }
export function addDays(key, amount) { const d = asDate(key); d.setDate(d.getDate() + amount); return dateKey(d); }
export function weekFor(key) { const d = asDate(key).getDay(); const start = addDays(key, -(d === 0 ? 6 : d - 1)); return Array.from({ length: 7 }, (_, i) => addDays(start, i)); }
export function validDate(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(asDate(value).getTime()) && dateKey(asDate(value)) === value; }
export function uid() { return globalThis.crypto.randomUUID(); }
export function makeInitialState() {
  return { version: 1, planRevision: 2, tasks: [], routines: [], overrides: {}, notes: {}, rhythms: {}, weekPlans: {}, settings: { name: 'Mi espacio', focusMinutes: 25, accent: 'lime' } };
}
export function upgradePlan(state) {
  state.planRevision = 2;
  state.weekPlans ||= {};
  return state;
}
export function weekPlan(state, date) {
  return { friday: 'unknown', otStart: state.settings.otStart || '09:00', otEnd: state.settings.otEnd || '17:00', ...(state.weekPlans?.[weekFor(date)[0]] || {}) };
}
export function timeMinutes(time) { const [h, m] = time.split(':').map(Number); return h * 60 + m; }
function afterShift(end, offset, length) {
  const minutes = timeMinutes(end) + offset;
  if (minutes + length > 1440) return '';
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
export function tasksFor(state, date) {
  const day = asDate(date).getDay();
  const items = new Map();
  const plan = weekPlan(state, date);
  for (const r of state.routines) {
    if (!r.days.includes(day)) continue;
    if (r.friday && (r.friday === 'ot') !== (plan.friday === 'ot')) continue;
    const id = `${r.id}@${date}`;
    const occurrence = { ...r, id, routineId: r.id, date, done: false };
    if (day === 5 && plan.friday === 'ot') {
      if (r.id === 'plan-friday-ot') { occurrence.time = plan.otStart; occurrence.minutes = timeMinutes(plan.otEnd) - timeMinutes(plan.otStart); }
      if (r.id === 'plan-workout-fri') { occurrence.time = afterShift(plan.otEnd, 75, 25); occurrence.minutes = 25; }
      if (r.id === 'plan-project-fri') { occurrence.time = afterShift(plan.otEnd, 120, 15); occurrence.minutes = 15; occurrence.optional = true; occurrence.title = 'Proyecto · 15 minutos, solo si queda energía'; }
    }
    items.set(id, occurrence);
  }
  for (const override of Object.values(state.overrides)) {
    if (override.date !== date) continue;
    if (override.hidden) items.delete(override.id);
    else items.set(override.id, { ...override });
  }
  for (const t of state.tasks) if (t.date === date) items.set(t.id, { ...t });
  return [...items.values()].sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99') || a.title.localeCompare(b.title));
}
export function putTask(state, task) {
  if (task.routineId) state.overrides[task.id] = { ...task };
  else { const at = state.tasks.findIndex(t => t.id === task.id); if (at >= 0) state.tasks[at] = { ...task }; else state.tasks.push({ ...task }); }
}
export function removeTask(state, task) {
  if (task.routineId) state.overrides[task.id] = { ...task, hidden: true };
  else state.tasks = state.tasks.filter(t => t.id !== task.id);
}
export function moveTask(state, task, date) {
  if (task.routineId) {
    removeTask(state, task);
    const moved = { ...task, id: uid(), date, done: false };
    delete moved.routineId; delete moved.days;
    state.tasks.push(moved);
  } else putTask(state, { ...task, date, done: false });
}
export function dayStats(state, date) {
  const tasks = tasksFor(state, date);
  const essential = tasks.filter(t => !t.fixed && !t.optional);
  return { total: essential.length, done: essential.filter(t => t.done).length, minutes: essential.filter(t => !t.done).reduce((n, t) => n + t.minutes, 0), optional: tasks.filter(t => t.optional).length, fixed: tasks.filter(t => t.fixed).length };
}
export function isWorkout(task) { return task.workout === true || (task.area === 'salud' && task.workout !== false); }
export function workoutStats(state, date) {
  const days = weekFor(date).map(key => { const workouts = tasksFor(state, key).filter(isWorkout); return { date: key, planned: workouts.length > 0, done: workouts.some(t => t.done) }; });
  return { days, planned: days.filter(d => d.planned).length, done: days.filter(d => d.done).length, target: 3 };
}
export function validateState(s) {
  if (!s || s.version !== 1 || !Array.isArray(s.tasks) || !Array.isArray(s.routines) || !s.overrides || typeof s.overrides !== 'object' || Array.isArray(s.overrides) || !s.settings || !s.notes || !s.rhythms) throw new Error('Este archivo no es un respaldo de Mi Día.');
  if (s.tasks.length + s.routines.length + Object.keys(s.overrides).length > 50000) throw new Error('El respaldo es demasiado grande.');
  const validTask = t => t && typeof t.id === 'string' && t.id.length < 250 && typeof t.title === 'string' && t.title.trim().length > 0 && t.title.length <= 180 && Object.hasOwn(AREAS, t.area) && Number.isFinite(t.minutes) && t.minutes >= 0 && t.minutes <= 1440 && (t.time === '' || (typeof t.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t.time))) && typeof t.note === 'string' && t.note.length <= 2000;
  if (s.tasks.some(t => !validTask(t) || !validDate(t.date)) || s.routines.some(t => !validTask(t) || !Array.isArray(t.days) || !t.days.length || t.days.some(d => !Number.isInteger(d) || d < 0 || d > 6)) || Object.values(s.overrides).some(t => !validTask(t) || !validDate(t.date))) throw new Error('Hay tareas inválidas en el respaldo.');
  if (Object.entries(s.overrides).some(([key, t]) => t.id !== key)) throw new Error('Las tareas del respaldo no coinciden.');
  if (typeof s.settings.name !== 'string' || s.settings.name.length > 40 || !Number.isInteger(s.settings.focusMinutes) || s.settings.focusMinutes < 5 || s.settings.focusMinutes > 120 || !['lime', 'violet', 'cyan'].includes(s.settings.accent)) throw new Error('Los ajustes del respaldo no son válidos.');
  for (const [date, note] of Object.entries(s.notes)) if (!validDate(date) || typeof note !== 'string' || note.length > 5000) throw new Error('Una nota del respaldo no es válida.');
  for (const [date, rhythm] of Object.entries(s.rhythms)) if (!validDate(date) || !['soft', 'normal', 'full'].includes(rhythm)) throw new Error('Un ritmo del respaldo no es válido.');
  for (const field of ['otStart', 'otEnd']) if (s.settings[field] !== undefined && (typeof s.settings[field] !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.settings[field]))) throw new Error('La hora predeterminada de OT no es válida.');
  if (s.weekPlans !== undefined) {
    if (!s.weekPlans || typeof s.weekPlans !== 'object' || Array.isArray(s.weekPlans)) throw new Error('Las semanas del respaldo no son válidas.');
    for (const [date, plan] of Object.entries(s.weekPlans)) {
      if (!validDate(date) || weekFor(date)[0] !== date || !plan || !['unknown', 'off', 'ot'].includes(plan.friday) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(plan.otStart) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(plan.otEnd) || timeMinutes(plan.otEnd) <= timeMinutes(plan.otStart)) throw new Error('Un horario de OT no es válido.');
    }
  }
  return s;
}
