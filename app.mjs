import { AREAS, DAYS, WEEK_ORDER, dateKey, asDate, addDays, weekFor, validDate, uid, makeInitialState, tasksFor, putTask, removeTask, moveTask, dayStats, validateState, upgradePlan, weekPlan, workoutStats, isWorkout, timeMinutes } from './core.mjs';

const STORAGE = 'chepo-mi-dia-v1';
const IMPORT_BACKUP = 'chepo-mi-dia-before-import';
const $ = s => document.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const paths = {
  day: '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4m8-4v4M3 10h18m-12 5 2 2 4-4"/>',
  week: '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4m8-4v4M3 10h18m-13 4v3m4-3v3m4-3v3"/>',
  routine: '<path d="M4 9a8 8 0 0 1 14-3l2 3M20 15a8 8 0 0 1-14 3l-2-3M4 4v5h5m11 11v-5h-5"/>',
  settings: '<path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  edit: '<path d="m15 5 4 4M4 20l5-1L21 7a2.8 2.8 0 0 0-4-4L5 15l-1 5Z"/>',
  calendar: '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4m8-4v4M3 10h18"/>',
  move: '<path d="M8 2v4m8-4v4M3 10h18M12 15h6m-3-3v6"/><rect x="3" y="4" width="18" height="17" rx="3"/>',
  prev: '<path d="m14 6-6 6 6 6"/>',
  next: '<path d="m10 6 6 6-6 6"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6m-3 0v3m5-1 2 2"/>',
  reset: '<path d="M4 9a8 8 0 1 1 1 10M4 4v5h5"/>',
  note: '<path d="M14 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9M8 9h4m-4 5h8m-8 4h5m4-16v6h6"/>',
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
  backup: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>'
};
function icon(name) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.spark}</svg>`; }
let state;
let storageError = false;
let corruptData = false;
try {
  const raw = localStorage.getItem(STORAGE);
  state = raw ? upgradePlan(validateState(JSON.parse(raw))) : makeInitialState();
} catch {
  state = makeInitialState(); storageError = true; corruptData = true;
}
let selected = dateKey();
let route = ['day', 'week', 'routine', 'settings'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'week';
let filter = 'all';
let routineDay = asDate(selected).getDay();
let editing = null;
let editingRoutine = null;
let toastTimeout;
let undoAction;
let timer = { remaining: state.settings.focusMinutes * 60, endAt: null, running: false };
try { const saved = JSON.parse(sessionStorage.getItem('mi-dia-timer')); if (saved && Number.isFinite(saved.remaining) && (!saved.endAt || Number.isFinite(saved.endAt))) timer = saved; } catch {}

function persist() {
  if (corruptData) { toast('No se guardó: exporta tus datos anteriores desde Ajustes antes de reemplazarlos.'); return false; }
  try { localStorage.setItem(STORAGE, JSON.stringify(state)); storageError = false; updateSaveStatus(); return true; }
  catch { storageError = true; updateSaveStatus(); toast('No se pudo guardar. Descarga un respaldo desde Ajustes.'); return false; }
}
function updateSaveStatus() {
  $('#save-status').textContent = storageError ? 'No se pudo guardar' : 'Guardado en este dispositivo';
  $('#save-status').classList.toggle('error', storageError);
}
function applySettings() {
  const colors = { lime: ['#d1f86b', '#202b10', '#283322'], violet: ['#c9b4ff', '#291b44', '#312a3b'], cyan: ['#8ce5e1', '#123732', '#203735'] };
  const [accent, ink, soft] = colors[state.settings.accent];
  document.documentElement.style.setProperty('--accent', accent);
  document.documentElement.style.setProperty('--accent-ink', ink);
  document.documentElement.style.setProperty('--accent-soft', soft);
  document.title = 'My Day by Chepo';
  $('#profile-name').innerHTML = `${esc(state.settings.name)}<small>A tu propio ritmo</small>`;
  $('.avatar').textContent = state.settings.name.charAt(0).toUpperCase();
  updateSaveStatus();
}
function toast(message, undo) {
  clearTimeout(toastTimeout);
  const element = $('#toast');
  element.innerHTML = `<span>${esc(message)}</span>${undo ? '<button data-action="undo">Deshacer</button>' : ''}`;
  undoAction = undo;
  element.hidden = false;
  toastTimeout = setTimeout(() => { element.hidden = true; undoAction = null; }, undo ? 12000 : 5500);
}
function changeWithUndo(message, mutate) {
  const previous = structuredClone(state);
  mutate(); persist(); render();
  toast(message, () => { state = previous; persist(); applySettings(); render(); toast('Cambio deshecho.'); });
}
function duration(minutes) { if (!minutes) return ''; const hours = Math.floor(minutes / 60), rem = minutes % 60; return hours ? `${hours} h${rem ? ` ${rem} min` : ''}` : `${minutes} min`; }
function timeLabel(time) { if (!time) return 'Sin hora fija'; const [h, m] = time.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`; }
function monthTitle() { return asDate(selected).toLocaleDateString('es-PR', { month: 'long', year: 'numeric' }); }
function areaBadge(area) { return `<span class="area-label" style="--area:${AREAS[area].color}">${AREAS[area].name}</span>`; }
function taskForId(id) { return tasksFor(state, selected).find(t => t.id === id); }
function intro(eyebrow, title, subtitle) { return `<section class="intro"><div><span class="eyebrow">${esc(eyebrow)}</span><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div><div class="intro-symbol" aria-hidden="true"></div></section>`; }
function nav() {
  const pages = { day: 'Mi día', week: 'Mi semana', routine: 'Mi rutina', settings: 'Ajustes' };
  $('#navigation').innerHTML = Object.entries(pages).map(([key, label]) => `<a href="#${key}" class="nav-item ${route === key ? 'active' : ''}" ${route === key ? 'aria-current="page"' : ''}>${icon(key)}<span>${label}</span></a>`).join('');
  $('#view-label').textContent = pages[route];
}
function dateNav() {
  return `<div class="date-nav"><div class="date-heading">${esc(monthTitle())}</div><div class="date-controls"><button class="button ghost" data-action="today">Hoy</button><button class="icon-button" data-action="previous-week" aria-label="Semana anterior">${icon('prev')}</button><label class="date-picker" title="Elegir fecha">${icon('calendar')}<input type="date" id="date-picker" aria-label="Elegir fecha" value="${selected}"></label><button class="icon-button" data-action="next-week" aria-label="Semana siguiente">${icon('next')}</button></div></div>`;
}
function dayStrip() {
  return `<div class="week-strip" aria-label="Días de la semana">${weekFor(selected).map(date => { const stats = dayStats(state, date); return `<button class="day-button ${date === selected ? 'selected' : ''} ${date === dateKey() ? 'is-today' : ''}" data-action="select-day" data-date="${date}" aria-pressed="${date === selected}" aria-label="${esc(asDate(date).toLocaleDateString('es-PR', { weekday: 'long', month: 'long', day: 'numeric' }))}, ${stats.done} de ${stats.total} completadas"><span class="weekday">${DAYS[asDate(date).getDay()].slice(0, 3)}</span><span class="day-number">${asDate(date).getDate()}</span><span class="day-dots" aria-hidden="true">${'<i></i>'.repeat(Math.min(3, stats.total))}</span></button>`; }).join('')}</div>`;
}
function taskRow(task) {
  return `<div class="task-row ${task.done ? 'done' : ''} ${task.optional ? 'optional-row' : ''}" data-id="${esc(task.id)}"><button class="task-check ${task.done ? 'checked' : ''}" data-action="toggle" aria-label="${task.done ? 'Marcar pendiente' : 'Completar'}: ${esc(task.title)}" aria-pressed="${!!task.done}">${task.done ? icon('check') : ''}</button><div><button class="task-title" data-action="edit">${esc(task.title)}${task.priority ? '<span class="priority-star" aria-label="Prioridad">★</span>' : ''}</button><div class="task-meta">${areaBadge(task.area)}<span>${timeLabel(task.time)}</span>${task.minutes ? `<span class="meta-divider">·</span><span>${duration(task.minutes)}</span>` : ''}${isWorkout(task) ? '<span class="workout-tag">ENTRENO</span>' : ''}${task.optional ? '<span class="optional-tag">OPCIONAL</span>' : ''}</div></div><div class="task-actions">${!task.done ? `<button class="icon-button" data-action="${isWorkout(task) ? 'reschedule' : 'tomorrow'}" aria-label="${isWorkout(task) ? 'Reprogramar entrenamiento' : 'Mover a mañana'}: ${esc(task.title)}" title="${isWorkout(task) ? 'Elegir otro día' : 'Mover a mañana'}">${icon('move')}</button>` : ''}<button class="icon-button" data-action="edit" aria-label="Editar: ${esc(task.title)}" title="Editar">${icon('edit')}</button></div></div>`;
}
function anchorRow(task) {
  const end = task.time ? timeMinutes(task.time) + task.minutes : 0;
  const until = end && end < 1440 ? timeLabel(`${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`) : '';
  return `<div class="anchor-row" data-id="${esc(task.id)}"><span class="anchor-icon" style="--area:${AREAS[task.area].color}">${icon(task.area === 'trabajo' ? 'week' : 'day')}</span><div><button class="task-title" data-action="edit">${esc(task.title)}</button><div class="task-meta"><span>${timeLabel(task.time)}${until && task.area === 'trabajo' ? ` – ${until}` : ''}</span><span class="anchor-tag">FIJO</span></div></div><button class="icon-button" data-action="edit" aria-label="Editar compromiso: ${esc(task.title)}">${icon('edit')}</button></div>`;
}
function tasksCard() {
  const tasks = tasksFor(state, selected);
  const filtered = tasks.filter(t => filter === 'all' || (filter === 'priority' ? t.priority : t.area === filter));
  const anchors = filtered.filter(t => t.fixed), actionable = filtered.filter(t => !t.fixed);
  const pending = actionable.filter(t => !t.done && !t.optional), optional = actionable.filter(t => !t.done && t.optional), done = actionable.filter(t => t.done);
  const stats = dayStats(state, selected), allDone = stats.total > 0 && stats.done === stats.total;
  return `<section class="card task-card" aria-labelledby="tasks-title"><div class="card-heading"><h2 id="tasks-title">Tu plan del día <span class="count-pill">${stats.total - stats.done}</span></h2><span>${selected === dateKey() ? 'HOY' : asDate(selected).toLocaleDateString('es-PR', { day: 'numeric', month: 'short' })}</span></div><div class="filters"><button class="filter ${filter === 'all' ? 'active' : ''}" data-action="filter" data-filter="all" aria-pressed="${filter === 'all'}">Todo</button><button class="filter ${filter === 'priority' ? 'active' : ''}" data-action="filter" data-filter="priority" aria-pressed="${filter === 'priority'}">★ Prioridades</button><label class="filter filter-select ${Object.hasOwn(AREAS, filter) ? 'active' : ''}"><select id="area-filter" aria-label="Filtrar por área"><option value="all">Todas las áreas</option>${Object.entries(AREAS).map(([key, area]) => `<option value="${key}" ${filter === key ? 'selected' : ''}>${area.name}</option>`).join('')}</select></label></div>${anchors.length ? `<div class="anchor-section"><h3 class="section-label">Compromisos fijos</h3>${anchors.map(anchorRow).join('')}</div>` : ''}${pending.length ? `<div class="task-list"><h3 class="section-label">Lo esencial</h3>${pending.map(taskRow).join('')}</div>` : `<div class="empty-state"><span class="empty-icon" aria-hidden="true">${allDone ? '✓' : '✦'}</span><h3>${allDone ? 'Lo esencial, resuelto.' : filter !== 'all' ? 'Todo despejado por aquí.' : 'El descanso está en el plan.'}</h3><p>${allDone ? 'Lo que hiciste cuenta. Lo opcional es un extra.' : filter !== 'all' ? 'Prueba otra área para ver el resto de tu día.' : 'Come, descansa y recupera energía. Los extras de abajo pueden esperar.'}</p></div>`}${optional.length ? `<details class="optional-section" open><summary>Si queda energía <span>${optional.length} opcionales</span></summary><div class="task-list">${optional.map(taskRow).join('')}</div></details>` : ''}${done.length ? `<details class="completed" ${!pending.length ? 'open' : ''}><summary>Hechas · ${done.length}</summary><div class="task-list">${done.map(taskRow).join('')}</div></details>` : ''}<form id="quick-add" class="quick-add"><span aria-hidden="true">＋</span><input name="title" maxlength="180" required autocomplete="off" aria-label="Añadir una tarea rápida" placeholder="Algo más para este día…"><button type="submit">Añadir</button></form></section>`;
}
function workoutPanel(compact = false) {
  const stats = workoutStats(state, selected);
  const message = stats.done >= 3 ? 'Tres días cumplidos. Dale crédito a esa constancia.' : stats.planned >= 3 ? 'Hay tres días reservados. Puedes reubicar las sesiones.' : `Hay ${stats.planned} días agendados; reserva ${3 - stats.planned} más para llegar a la meta.`;
  return `<section class="card workout-panel ${compact ? 'compact' : ''}"><div class="workout-heading"><div><span class="eyebrow">DISCIPLINA, MÚSCULO Y ENFOQUE</span><h2>Tres días para ti.</h2></div><div class="workout-total"><strong>${stats.done}</strong><span>/ 3 días</span></div></div><div class="workout-week" aria-label="Entrenamientos de esta semana">${stats.days.map(d => `<button class="workout-day ${d.done ? 'done' : d.planned ? 'planned' : ''}" data-action="open-day" data-date="${d.date}" aria-label="${DAYS[asDate(d.date).getDay()]}: ${d.done ? 'entrenamiento completado' : d.planned ? 'entrenamiento programado' : 'sin entrenamiento'}"><span>${DAYS[asDate(d.date).getDay()].slice(0, 3)}</span><i aria-hidden="true">${d.done ? '✓' : d.planned ? '○' : '·'}</i></button>`).join('')}</div><p>${message}</p><button class="button ghost" data-action="add-workout">Reservar otro entrenamiento</button></section>`;
}
function weekModeCard() {
  const plan = weekPlan(state, selected), friday = weekFor(selected)[4];
  return `<section class="card friday-card"><div class="friday-heading"><div><span class="eyebrow">CADA SEMANA PUEDE SER DISTINTA</span><h2>Viernes ${asDate(friday).getDate()} · ¿libre u OT?</h2></div><span class="mode-badge">${plan.friday === 'ot' ? 'OT ACTIVADO' : plan.friday === 'off' ? 'DÍA LIBRE' : 'POR CONFIRMAR'}</span></div><div class="friday-switch" aria-label="Tipo de viernes de esta semana">${[['unknown', 'Por confirmar'], ['off', 'Día libre'], ['ot', 'Trabajo OT']].map(([mode, label]) => `<button class="button ${plan.friday === mode ? 'primary' : 'secondary'}" data-action="friday-mode" data-mode="${mode}" aria-pressed="${plan.friday === mode}">${label}</button>`).join('')}</div><p>${plan.friday === 'ot' ? 'El plan se acorta: turno, entrenamiento corto y un proyecto opcional. Las gestiones esperan.' : plan.friday === 'off' ? 'Gestiones de adulto, entrenamiento y una mejora pequeña. La tarde queda con espacio.' : 'Mientras decides, ves una propuesta de viernes libre. Cámbialo cuando confirmes el OT.'}</p>${plan.friday === 'ot' ? `<form id="ot-form"><div class="ot-fields"><label>Entrada OT<input name="otStart" type="time" required value="${plan.otStart}"></label><label>Salida OT<input name="otEnd" type="time" required value="${plan.otEnd}"></label><button type="submit" class="button secondary">Ajustar horas</button></div><p class="form-hint">Ajusta la entrada y salida a tu turno real. La sesión va 75 minutos después de salir; si termina demasiado tarde, queda sin hora para que la reubiques.</p><p class="form-error" id="ot-error" role="alert"></p></form>` : ''}</section>`;
}
function dayGuidance() {
  const tasks = tasksFor(state, selected);
  if (tasks.some(t => t.fixed && t.area === 'trabajo')) return { title: 'Trabajo y espacio para recuperar.', sub: 'Tu turno tiene su lugar. Ajusta las tareas según la energía que tengas al salir.', intent: 'Los extras opcionales pueden esperar.' };
  if (!tasks.length) return { title: 'Un día con espacio para ti.', sub: 'Añade tareas o importa tu plan desde Ajustes para empezar.', intent: 'Tu plan lo decides tú. Una cosa a la vez.' };
  return { title: 'A tu ritmo, una cosa a la vez.', sub: 'Tus compromisos, proyectos y tiempo personal tienen su espacio.', intent: 'Concentra la energía en lo esencial y ajusta el resto cuando haga falta.' };
}
function dayView() {
  const weekday = asDate(selected).getDay(), stats = dayStats(state, selected), percent = stats.total ? Math.round(stats.done / stats.total * 100) : 0;
  const rhythm = state.rhythms[selected] || ([6, 0, 1, 2].includes(weekday) ? 'soft' : 'normal'), guide = dayGuidance(weekday);
  const heading = !stats.total ? 'Descansar también es cumplir.' : stats.done === stats.total ? 'Lo esencial, resuelto.' : stats.done ? 'Mira, ya estás avanzando.' : 'Una cosa a la vez, sin revolú.';
  const notice = !state.settings.noticeDismissed ? `<div class="starter-notice">${icon('spark')}<span>Hazlo tuyo: importa tu plan desde Ajustes o añade tareas; <a href="#routine">ajusta tu rutina</a> cuando lo necesites.</span><button class="icon-button" data-action="dismiss-notice" aria-label="Ocultar bienvenida">✕</button></div>` : '';
  return `${intro(asDate(selected).toLocaleDateString('es-PR', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase(), guide.title, guide.sub)}${notice}<section class="overview" aria-label="Resumen del día"><div class="day-summary"><div class="progress-ring"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="ring-track" cx="50" cy="50" r="44"/><circle class="ring-fill" cx="50" cy="50" r="44" stroke-dasharray="276.46" stroke-dashoffset="${276.46 * (1 - percent / 100)}"/></svg><div class="ring-number">${stats.total ? percent + '%' : '☕'}<small>${stats.total ? 'LO ESENCIAL' : 'RECARGAR'}</small></div></div><div class="summary-copy"><span class="eyebrow">${stats.total ? `${stats.done} DE ${stats.total} ESENCIALES COMPLETADAS` : 'DESCANSO PROTEGIDO'}</span><h2>${heading}</h2><p>${esc(guide.intent)}</p><div class="summary-counts"><span><strong>${stats.total - stats.done}</strong> pendientes</span><span><strong>${duration(stats.minutes) || '0 min'}</strong> esenciales</span><span><strong>${stats.optional}</strong> opcionales</span></div></div></div><div class="rhythm-card"><span class="eyebrow">TU RITMO DE HOY</span><div class="rhythm-options" aria-label="Ritmo del día">${[['soft', 'Suave'], ['normal', 'Normal'], ['full', 'Con todo']].map(([value, label]) => `<button class="rhythm-option ${rhythm === value ? 'selected' : ''}" data-action="rhythm" data-rhythm="${value}" aria-pressed="${rhythm === value}">${label}</button>`).join('')}</div><p class="rhythm-copy">${rhythm === 'soft' ? 'Baja un cambio. Escoge lo esencial.' : rhythm === 'full' ? 'Hay energía. Dale espacio a una prioridad.' : 'Un paso firme, con espacio para ti.'}</p></div></section>${dateNav()}${dayStrip()}${weekday === 5 ? weekModeCard() : ''}<div class="day-layout">${tasksCard()}<div class="right-column">${workoutPanel(true)}${focusCard()}<section class="card note-card"><div class="note-heading"><h3>Para sacar de la mente</h3>${icon('note')}</div><textarea id="daily-note" maxlength="5000" placeholder="Una idea, un pendiente, el próximo paso del proyecto…" aria-label="Nota de este día">${esc(state.notes[selected] || '')}</textarea><p class="note-foot">Solo de este día · se guarda al escribir</p></section></div></div>`;
}
function weekView() {
  const dates = weekFor(selected), total = dates.reduce((a, d) => a + dayStats(state, d).total, 0), done = dates.reduce((a, d) => a + dayStats(state, d).done, 0);
  const themes = Array.from({length: 7}, (_, day) => { const date = dates.find(d => asDate(d).getDay() === day), tasks = tasksFor(state, date); return tasks.some(t => t.fixed && t.area === 'trabajo') ? 'Trabajo + recuperar' : tasks.some(isWorkout) ? 'Avanzar + moverte' : tasks.length ? 'Tu día, a tu manera' : 'Espacio para lo que importa'; });
  return `${!state.routines.length && !state.tasks.length ? '<div class="import-welcome"><div><strong>Tu espacio está listo.</strong><p>¿Ya tienes tu plan? Impórtalo para cargar tu horario, rutinas y prioridades.</p></div><button class="button primary" data-action="import">Importar mi plan</button></div>' : ''}${intro('TU VIDA REAL, CON UN POCO DE INTENCIÓN', `Menos revolú. Más tú, ${state.settings.name}.`, 'Descanso donde lo necesitas. Foco donde te mueve hacia algo mejor.')}<section class="north-card"><div><span class="eyebrow">EL NORTE DE ESTA SEMANA</span><h2>Construir algo. Aprender algo. Abrir una puerta.</h2></div><div class="north-grid"><p><strong>Construir</strong>Un proyecto activo.<br>Avances pequeños y concretos.</p><p><strong>Aprender</strong>Práctica corta en el código real.<br>Lo aprendido se convierte en una mejora.</p><p><strong>Crear oportunidades</strong>Una oferta que puedas explicar.<br>Un contacto o propuesta con intención.</p></div></section><div class="weekly-controls">${workoutPanel()}${weekModeCard()}</div><div class="week-overview"><span><strong>${done}/${total}</strong> esenciales completadas</span><span>Los turnos y los extras opcionales quedan fuera de ese progreso.</span></div>${dateNav()}<div class="week-grid">${dates.map(date => { const tasks = tasksFor(state, date), stats = dayStats(state, date), visible = tasks.filter(t => !t.optional), optional = tasks.filter(t => t.optional); return `<button class="week-card ${date === dateKey() ? 'current' : ''}" data-action="open-day" data-date="${date}"><div class="week-card-header"><span class="eyebrow">${DAYS[asDate(date).getDay()].toUpperCase()}${date === dateKey() ? ' · HOY' : ''}</span><span class="week-date">${asDate(date).getDate()}</span></div><div class="week-theme">${themes[asDate(date).getDay()]}</div>${visible.map(t => `<div class="week-task ${t.done ? 'done' : ''} ${t.fixed ? 'fixed' : ''}"><span class="week-task-time">${t.time ? timeLabel(t.time) : 'Por ubicar'}</span><span>${esc(t.title)}${isWorkout(t) ? '<i class="mini-workout">ENTRENO</i>' : ''}</span></div>`).join('') || '<div class="week-task more">Espacio para recuperar energía.</div>'}${optional.length ? `<div class="week-optionals">${optional.length} extras opcionales · ${optional.map(t => t.area === 'norvak' ? `${t.minutes} min de proyecto` : t.title.includes('Preparar algo') ? 'cocina sencilla' : 'revisión semanal').join(' + ')}</div>` : ''}<div class="week-card-footer">${stats.total ? `${stats.done} de ${stats.total} esenciales hechas` : 'Al salir del turno: descansar.'}<div class="slim-progress"><span style="width:${stats.total ? stats.done / stats.total * 100 : 0}%"></span></div></div></button>`; }).join('')}</div><p class="schedule-note">Los horarios son editables. Deja margen entre tus compromisos y reserva espacio para descansar. Las tareas y notas que añades se guardan en este navegador.</p>`;
}
function routineView() {
  const routines = state.routines.filter(r => r.days.includes(routineDay)).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
  return `${intro('UNA BASE QUE SE ADAPTA A TI', 'Tu rutina. Tus reglas.', 'Lo fijo tiene su espacio. Lo opcional también tiene permiso para esperar.')}<div class="routine-intro"><strong>Tu rutina es personal.</strong> Añade lo que quieres repetir, diferencia los compromisos fijos de las tareas opcionales y reubica entrenamientos cuando haga falta. La meta es de tres días por semana. Puedes importar un plan propio desde Ajustes; sus datos permanecen en tu navegador.</div><div class="routine-day-tabs" aria-label="Día de la rutina">${WEEK_ORDER.map(d => `<button class="routine-tab ${d === routineDay ? 'active' : ''}" data-action="routine-day" data-day="${d}" aria-pressed="${d === routineDay}">${DAYS[d].slice(0, 3)}</button>`).join('')}</div><section class="card routine-list"><div class="card-heading"><h2>${DAYS[routineDay]} <span class="count-pill">${routines.length}</span></h2><span>BASE SEMANAL</span></div>${routines.map(r => `<div class="task-row" data-routine-id="${esc(r.id)}"><span class="routine-symbol" style="--area:${AREAS[r.area].color}">${AREAS[r.area].symbol}</span><div><button class="task-title" data-action="edit-routine">${esc(r.title)}${r.priority ? '<span class="priority-star">★</span>' : ''}</button><div class="task-meta">${areaBadge(r.area)}<span>${timeLabel(r.time)}</span>${r.minutes ? `<span>· ${duration(r.minutes)}</span>` : ''}${r.fixed ? '<span class="anchor-tag">FIJO</span>' : ''}${r.optional ? '<span class="optional-tag">OPCIONAL</span>' : ''}${isWorkout(r) ? '<span class="workout-tag">ENTRENO</span>' : ''}${r.friday ? `<span class="condition-tag">SOLO ${r.friday === 'ot' ? 'CON OT' : 'VIERNES LIBRE'}</span>` : ''}</div><div class="routine-days-label">${WEEK_ORDER.filter(d => r.days.includes(d)).map(d => DAYS[d].slice(0, 3)).join(' · ')}${r.id === 'plan-workout-fri' ? ' · con OT: 25 min después del turno' : r.id === 'plan-project-fri' ? ' · con OT: 15 min opcionales' : ''}</div></div><button class="icon-button" data-action="edit-routine" aria-label="Editar rutina: ${esc(r.title)}">${icon('edit')}</button></div>`).join('') || '<div class="empty-state"><h3>Este día está libre.</h3><p>Añade una rutina si hay algo que quieres repetir.</p></div>'}<div class="quick-add"><span aria-hidden="true">＋</span><button class="button ghost" data-action="add-routine">Añadir a mi rutina</button></div></section>`;
}
function settingsView() {
  return `${intro('HAZLO TUYO', 'Un espacio que se sienta tuyo.', 'Cambia lo básico, cuida tus datos y llévalo contigo.')}<div class="settings-layout"><section class="card settings-card"><h2>A tu manera</h2><p>Los pequeños detalles también hacen la diferencia.</p><form id="settings-form"><label>¿Cómo te llamamos?<input name="name" value="${esc(state.settings.name)}" required maxlength="40"></label><label>Minutos por sesión de enfoque<input name="focusMinutes" type="number" min="5" max="120" value="${state.settings.focusMinutes}" required></label><label>Un toque de color</label><div class="accent-picker">${[['lime', '#d1f86b', 'Lima'], ['violet', '#c9b4ff', 'Violeta'], ['cyan', '#8ce5e1', 'Cian']].map(([value, color, label]) => `<button type="button" class="accent-choice ${state.settings.accent === value ? 'selected' : ''}" style="--swatch:${color}" data-action="accent" data-accent="${value}" aria-pressed="${state.settings.accent === value}" aria-label="Color ${label}">${state.settings.accent === value ? icon('check') : ''}</button>`).join('')}</div><button class="button primary" type="submit">Guardar ajustes</button></form></section><section class="card settings-card"><h2>Tus datos, contigo</h2><p>Las tareas, las notas y tu progreso se guardan automáticamente <strong>en este navegador y dispositivo</strong>. Si borras los datos del navegador, puedes perderlos.</p><div class="backup-info"><strong>Respaldo completo</strong><br>Descárgalo para proteger tu progreso o importarlo en otro equipo. Esta versión todavía no sincroniza entre celular y PC.</div><div class="settings-actions"><button class="button primary" data-action="export">${icon('backup')} Descargar respaldo</button><button class="button secondary" data-action="import">Importar respaldo</button></div>${corruptData ? '<div class="storage-warning">El guardado anterior no se pudo leer. Se conservó sin sobrescribir. Descárgalo antes de importar un respaldo válido.</div>' : ''}<div class="install-help"><strong>Ábrelo como app</strong>En Chrome o Edge, usa «Instalar aplicación» si aparece en el menú. En el celular, prueba «Añadir a pantalla de inicio». La disponibilidad depende del navegador.</div></section><section class="card settings-card full-width"><h2>Espacio para todas tus partes</h2><p>Al crear una tarea, escoge un área. Después puedes filtrar tu día sin perder el resto.</p><div class="areas-grid">${Object.values(AREAS).map(a => `<div class="area-tile" style="--area:${a.color}"><span>${a.symbol}</span>${a.name}</div>`).join('')}</div></section></div>`;
}
function render() {
  nav(); applySettings();
  const views = { day: dayView, week: weekView, routine: routineView, settings: settingsView };
  $('#content').innerHTML = `${storageError ? '<p class="storage-warning" role="alert">El navegador no está guardando los cambios. Descarga un respaldo desde Ajustes para conservar tu progreso.</p>' : ''}${views[route]()}`;
  updateTimerUI();
}
function fillAreas(form) { form.elements.area.innerHTML = Object.entries(AREAS).map(([id, area]) => `<option value="${id}">${area.name}</option>`).join(''); }
function dayChecks(container, days = [], name = 'days') { container.innerHTML = WEEK_ORDER.map(d => `<label><input type="checkbox" name="${name}" value="${d}" ${days.includes(d) ? 'checked' : ''}><span>${DAYS[d].slice(0, 3)}</span></label>`).join(''); }
function openTask(task = null, asRoutine = false) {
  editing = task;
  const form = $('#task-form'); form.reset(); fillAreas(form);
  $('#task-dialog-title').textContent = task ? 'Ajusta el plan.' : asRoutine ? 'Una rutina para ti.' : 'Una cosa a la vez.';
  form.elements.title.value = task?.title || '';
  form.elements.date.value = task?.date || selected;
  form.elements.area.value = task?.area || 'personal';
  form.elements.time.value = task?.time || '';
  form.elements.minutes.value = task?.minutes ?? 30;
  form.elements.priority.checked = !!task?.priority;
  form.elements.workout.checked = !!task && isWorkout(task);
  form.elements.optional.checked = !!task?.optional;
  form.elements.fixed.checked = !!task?.fixed;
  form.elements.note.value = task?.note || '';
  $('#delete-task').hidden = !task;
  $('#repeat-fields').hidden = !!task;
  $('#edit-hint').hidden = !task?.routineId;
  $('#form-error').textContent = '';
  dayChecks($('#repeat-days .weekday-checkboxes'), [asRoutine ? routineDay : asDate(selected).getDay()]);
  form.elements.repeat.checked = asRoutine;
  $('#repeat-days').hidden = !asRoutine;
  $('#task-dialog').showModal();
  form.elements.title.focus();
}
function openRoutine(id) {
  editingRoutine = state.routines.find(r => r.id === id);
  if (!editingRoutine) return;
  const form = $('#routine-form'); form.reset(); fillAreas(form);
  for (const key of ['title', 'area', 'time', 'minutes']) form.elements[key].value = editingRoutine[key];
  form.elements.priority.checked = !!editingRoutine.priority;
  form.elements.workout.checked = isWorkout(editingRoutine);
  form.elements.optional.checked = !!editingRoutine.optional;
  form.elements.fixed.checked = !!editingRoutine.fixed;
  dayChecks($('#routine-days'), editingRoutine.days);
  $('#routine-error').textContent = '';
  $('#routine-dialog').showModal();
  form.elements.title.focus();
}
function saveTask(event) {
  event.preventDefault();
  const form = event.currentTarget, data = new FormData(form), title = data.get('title').trim(), date = data.get('date');
  if (!title || !validDate(date)) { $('#form-error').textContent = 'Escribe una tarea y escoge un día válido.'; return; }
  const values = { title, area: data.get('area'), date, time: data.get('time'), minutes: Number(data.get('minutes')), priority: data.has('priority'), optional: data.has('optional'), fixed: data.has('fixed'), workout: data.has('workout'), note: data.get('note').trim() };
  if (values.fixed && values.workout) { $('#form-error').textContent = 'Deja el entrenamiento como tarea para poder marcarlo completado; desactiva Compromiso fijo.'; return; }
  if (data.has('repeat') && !editing) {
    const days = data.getAll('days').map(Number);
    if (!days.length) { $('#form-error').textContent = 'Escoge al menos un día para repetir.'; return; }
    const { date: unused, ...routine } = values;
    state.routines.push({ ...routine, id: uid(), days });
    toast('Rutina lista. Puedes cambiarla cuando quieras.');
  } else {
    const task = { ...(editing || { id: uid(), done: false }), ...values };
    if (editing && date !== editing.date) {
      removeTask(state, editing);
      delete task.routineId; delete task.days;
      task.id = uid();
    }
    putTask(state, task);
    selected = date;
    toast(editing ? 'Plan ajustado.' : 'Listo. Una cosa menos en tu cabeza.');
  }
  persist(); $('#task-dialog').close(); render();
}
function saveRoutine(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget), title = data.get('title').trim(), days = data.getAll('days').map(Number);
  if (!title || !days.length) { $('#routine-error').textContent = 'Escribe un título y escoge al menos un día.'; return; }
  if (data.has('fixed') && data.has('workout')) { $('#routine-error').textContent = 'Un entrenamiento necesita poder marcarse completado; desactiva Compromiso fijo.'; return; }
  Object.assign(editingRoutine, { title, days, area: data.get('area'), time: data.get('time'), minutes: Number(data.get('minutes')), priority: data.has('priority'), optional: data.has('optional'), fixed: data.has('fixed'), workout: data.has('workout') });
  persist(); $('#routine-dialog').close(); render(); toast('Tu rutina está al día.');
}
function timerSeconds() { return timer.running ? Math.max(0, Math.ceil((timer.endAt - Date.now()) / 1000)) : timer.remaining; }
function timerText() { const sec = timerSeconds(); return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; }
function saveTimer() { try { sessionStorage.setItem('mi-dia-timer', JSON.stringify(timer)); } catch {} }
function updateTimerUI() {
  const el = $('#timer'); if (el) el.textContent = timerText();
  const button = $('#timer-toggle'); if (button) button.textContent = timer.running ? 'Pausar' : timer.remaining < state.settings.focusMinutes * 60 ? 'Continuar' : 'Empezar';
}
function toggleTimer() {
  if (timer.running) { timer.remaining = timerSeconds(); timer.running = false; timer.endAt = null; }
  else { if (timer.remaining <= 0) timer.remaining = state.settings.focusMinutes * 60; timer.endAt = Date.now() + timer.remaining * 1000; timer.running = true; }
  saveTimer(); updateTimerUI();
}
function resetTimer() { timer = { remaining: state.settings.focusMinutes * 60, endAt: null, running: false }; saveTimer(); updateTimerUI(); }
function download(content, name) { const a = document.createElement('a'), url = URL.createObjectURL(new Blob([content], { type: 'application/json' })); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function exportData() {
  if (corruptData) { try { download(localStorage.getItem(STORAGE) || '{}', `mi-dia-recuperacion-${dateKey()}.json`); toast('Guardado anterior descargado para recuperación.'); } catch { toast('No se pudo leer el guardado anterior.'); } }
  else { download(JSON.stringify(state, null, 2), `mi-dia-respaldo-${dateKey()}.json`); toast('Respaldo descargado. Guárdalo donde lo encuentres.'); }
}
async function importData(file) {
  if (!file) return;
  try {
    if (file.size > 15 * 1024 * 1024) throw new Error('El archivo es demasiado grande.');
    const imported = upgradePlan(validateState(JSON.parse(await file.text())));
    // Keep the previous data before replacing anything, including damaged raw data.
    const raw = localStorage.getItem(STORAGE);
    if (raw) localStorage.setItem(IMPORT_BACKUP, raw);
    const previous = structuredClone(state), wasCorrupt = corruptData;
    localStorage.setItem(STORAGE, JSON.stringify(imported));
    state = imported; corruptData = false; storageError = false;
    resetTimer(); applySettings(); render();
    toast('Respaldo importado. El anterior quedó protegido.', () => { state = previous; corruptData = wasCorrupt; if (raw) localStorage.setItem(STORAGE, raw); else localStorage.removeItem(STORAGE); applySettings(); resetTimer(); render(); toast('Importación deshecha.'); });
  } catch (e) { toast(e instanceof SyntaxError ? 'Ese archivo no contiene JSON válido.' : e.message || 'No se pudo importar el archivo.'); }
  finally { $('#import-file').value = ''; }
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]'); if (!button) return;
  const action = button.dataset.action, row = button.closest('[data-id]'), task = row ? taskForId(row.dataset.id) : null;
  if (action === 'add') openTask();
  else if (action === 'close-dialog') $('#task-dialog').close();
  else if (action === 'close-routine') $('#routine-dialog').close();
  else if (action === 'select-day' || action === 'open-day') { selected = button.dataset.date; filter = 'all'; if (action === 'open-day') { route = 'day'; location.hash = 'day'; } render(); }
  else if (action === 'today') { selected = dateKey(); filter = 'all'; render(); }
  else if (action === 'previous-week' || action === 'next-week') { selected = addDays(selected, action === 'previous-week' ? -7 : 7); render(); }
  else if (action === 'filter') { filter = button.dataset.filter; render(); }
  else if (action === 'toggle' && task) { putTask(state, { ...task, done: !task.done }); persist(); render(); if (!task.done) toast('Una menos. Eso cuenta. ✓'); }
  else if ((action === 'edit' || action === 'reschedule') && task) { openTask(task); if (action === 'reschedule') { $('#task-dialog-title').textContent = 'Muévelo, conserva la meta.'; $('#task-form').elements.date.focus(); } }
  else if (action === 'add-workout') { openTask(); const form = $('#task-form'); form.elements.title.value = 'Entrenamiento · sesión reubicada'; form.elements.area.value = 'salud'; form.elements.workout.checked = true; form.elements.minutes.value = 35; }
  else if (action === 'friday-mode') { const key = weekFor(selected)[0]; state.weekPlans ||= {}; state.weekPlans[key] = { ...weekPlan(state, selected), friday: button.dataset.mode }; persist(); render(); toast('Viernes ajustado solo para esta semana.'); }
  else if (action === 'tomorrow' && task) changeWithUndo('Movida al día siguiente. Sin drama.', () => moveTask(state, task, addDays(selected, 1)));
  else if (action === 'rhythm') { state.rhythms[selected] = button.dataset.rhythm; persist(); render(); }
  else if (action === 'dismiss-notice') { state.settings.noticeDismissed = true; persist(); render(); }
  else if (action === 'toggle-timer') toggleTimer();
  else if (action === 'reset-timer') resetTimer();
  else if (action === 'routine-day') { routineDay = Number(button.dataset.day); render(); }
  else if (action === 'add-routine') openTask(null, true);
  else if (action === 'edit-routine') openRoutine(button.closest('[data-routine-id]').dataset.routineId);
  else if (action === 'accent') { state.settings.accent = button.dataset.accent; persist(); applySettings(); document.querySelectorAll('.accent-choice').forEach(b => { const active = b.dataset.accent === state.settings.accent; b.classList.toggle('selected', active); b.setAttribute('aria-pressed', active); b.innerHTML = active ? icon('check') : ''; }); }
  else if (action === 'export') exportData();
  else if (action === 'import') $('#import-file').click();
  else if (action === 'undo' && undoAction) { const undo = undoAction; clearTimeout(toastTimeout); undoAction = null; undo(); }
});
document.addEventListener('input', event => { if (event.target.id === 'daily-note') { state.notes[selected] = event.target.value; persist(); } });
document.addEventListener('change', event => {
  if (event.target.id === 'date-picker' && validDate(event.target.value)) { selected = event.target.value; filter = 'all'; render(); }
  if (event.target.id === 'area-filter') { filter = event.target.value; render(); }
  if (event.target.name === 'repeat') $('#repeat-days').hidden = !event.target.checked;
  if (event.target.id === 'import-file') importData(event.target.files[0]);
});
document.addEventListener('submit', event => {
  if (event.target.id === 'ot-form') {
    event.preventDefault(); const data = new FormData(event.target), start = data.get('otStart'), end = data.get('otEnd');
    if (timeMinutes(end) <= timeMinutes(start)) { $('#ot-error').textContent = 'La salida debe ser después de la entrada en el mismo día.'; return; }
    const key = weekFor(selected)[0]; state.weekPlans ||= {}; state.weekPlans[key] = { ...weekPlan(state, selected), otStart: start, otEnd: end }; persist(); render(); toast('Horas de OT actualizadas para esta semana.');
  }
  if (event.target.id === 'quick-add') {
    event.preventDefault();
    const title = new FormData(event.target).get('title').trim(); if (!title) return;
    state.tasks.push({ id: uid(), title, date: selected, area: 'personal', time: '', minutes: 0, priority: false, note: '', done: false });
    persist(); filter = 'all'; render(); $('#quick-add input')?.focus(); toast('Añadida a tu día.');
  }
  if (event.target.id === 'settings-form') {
    event.preventDefault(); const data = new FormData(event.target), name = data.get('name').trim();
    if (!name) { toast('Escribe un nombre para tu espacio.'); return; }
    state.settings.name = name; state.settings.focusMinutes = Number(data.get('focusMinutes'));
    if (!timer.running) resetTimer();
    persist(); applySettings(); render(); toast('Así se siente más tuyo.');
  }
});
$('#task-form').addEventListener('submit', saveTask);
$('#routine-form').addEventListener('submit', saveRoutine);
$('#delete-task').addEventListener('click', () => { if (!editing) return; $('#task-dialog').close(); changeWithUndo('Tarea eliminada de este día.', () => removeTask(state, editing)); });
$('#delete-routine').addEventListener('click', () => { if (!editingRoutine) return; $('#routine-dialog').close(); changeWithUndo('Rutina eliminada. Las tareas ya editadas se conservan.', () => { state.routines = state.routines.filter(r => r.id !== editingRoutine.id); }); });
window.addEventListener('hashchange', () => { route = ['day', 'week', 'routine', 'settings'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'day'; render(); window.scrollTo({ top: 0 }); });
window.addEventListener('storage', event => {
  if (event.key !== STORAGE || !event.newValue) return;
  try { state = upgradePlan(validateState(JSON.parse(event.newValue))); applySettings(); if (!document.querySelector('dialog[open]') && document.activeElement?.id !== 'daily-note') render(); else toast('Hubo cambios en otra pestaña. Cierra el editor para verlos.'); } catch {}
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) updateTimerUI(); });
setInterval(() => {
  if (timer.running && timerSeconds() <= 0) { timer.running = false; timer.remaining = 0; timer.endAt = null; saveTimer(); toast('Sesión terminada. Estira, toma agua y respira.'); }
  updateTimerUI();
}, 500);
render();
try { if (!corruptData) persist(); }
catch { storageError = true; updateSaveStatus(); }
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
