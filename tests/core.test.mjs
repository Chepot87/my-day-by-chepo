import test from 'node:test';
import assert from 'node:assert/strict';
import { makeInitialState, tasksFor, putTask, removeTask, moveTask, validateState, weekFor, addDays, validDate, dayStats, weekPlan, upgradePlan, workoutStats, toggleWorkoutDay, readSavedState, validTimerSnapshot } from '../core.mjs';

// Synthetic fixtures: no user's personal plan is included.
function fixture() {
  const s = makeInitialState();
  s.routines = [
    { id:'example-work',title:'Example shift',area:'trabajo',time:'09:00',minutes:480,days:[1,2,3,4],fixed:true },
    { id:'example-project',title:'Example project',area:'norvak',time:'18:00',minutes:30,days:[1,4] },
    { id:'example-training',title:'Example session',area:'salud',time:'18:45',minutes:30,days:[1,3],workout:true },
    { id:'example-extra',title:'Optional extra',area:'personal',time:'20:00',minutes:15,days:[1],optional:true },
    { id:'plan-friday-ot',title:'Example extra shift',area:'trabajo',time:'09:00',minutes:480,days:[5],fixed:true,friday:'ot' },
    { id:'plan-workout-fri',title:'Example session',area:'salud',time:'11:00',minutes:30,days:[5],workout:true },
    { id:'example-admin',title:'Example household task',area:'personal',time:'10:00',minutes:20,days:[5],friday:'off' },
    { id:'plan-project-fri',title:'Example project',area:'norvak',time:'12:00',minutes:30,days:[5] }
  ].map(t=>({priority:false,note:'',...t}));
  return s;
}
const project = s=>tasksFor(s,'2026-11-16').find(t=>t.routineId==='example-project');
test('public defaults have no personal records',()=>{const s=makeInitialState();assert.deepEqual(s.routines,[]);assert.deepEqual(s.tasks,[]);assert.deepEqual(s.notes,{});assert.equal(validateState(s),s);});
test('recurrences respect selected weekdays',()=>{const s=fixture();assert.ok(project(s));assert.equal(tasksFor(s,'2026-11-22').some(t=>t.routineId==='example-work'),false);});
test('fixed and optional records are excluded from essential progress',()=>{const stats=dayStats(fixture(),'2026-11-16');assert.equal(stats.total,2);assert.equal(stats.fixed,1);assert.equal(stats.optional,1);assert.equal(stats.minutes,60);});
test('completion survives serialization and stays on its date',()=>{const s=fixture(),t=project(s);putTask(s,{...t,done:true});const restored=validateState(JSON.parse(JSON.stringify(s)));assert.equal(project(restored).done,true);assert.equal(tasksFor(restored,'2026-11-23').find(x=>x.routineId===t.routineId).done,false);});
test('individual edits survive routine edits',()=>{const s=fixture(),t=project(s);putTask(s,{...t,title:'Changed once'});s.routines.find(r=>r.id===t.routineId).title='Changed routine';assert.equal(project(s).title,'Changed once');assert.equal(tasksFor(s,'2026-11-23').find(x=>x.routineId===t.routineId).title,'Changed routine');});
test('moving and deleting an occurrence leaves its template intact',()=>{const s=fixture(),t=project(s);moveTask(s,t,'2026-11-17');assert.equal(tasksFor(s,'2026-11-16').some(x=>x.id===t.id),false);const moved=tasksFor(s,'2026-11-17').find(x=>x.title===t.title);assert.ok(moved);assert.equal(moved.routineId,undefined);removeTask(s,moved);assert.equal(tasksFor(s,'2026-11-17').some(x=>x.id===moved.id),false);assert.ok(tasksFor(s,'2026-11-23').find(x=>x.routineId===t.routineId));});
test('deleting a routine preserves completed occurrences',()=>{const s=fixture(),t=project(s);putTask(s,{...t,done:true});s.routines=s.routines.filter(r=>r.id!==t.routineId);assert.equal(tasksFor(s,'2026-11-16').find(x=>x.id===t.id).done,true);});
test('multiple workouts on one day count only once',()=>{const s=fixture();for(const date of ['2026-11-16','2026-11-18','2026-11-20']){const t=tasksFor(s,date).find(x=>x.workout);putTask(s,{...t,done:true});}const extra={...tasksFor(s,'2026-11-18').find(x=>x.workout),id:'extra'};delete extra.routineId;s.tasks.push(extra);assert.equal(workoutStats(s,'2026-11-19').done,3);assert.equal(workoutStats(s,'2026-11-26').done,0);});
test('workouts can move to another distinct date',()=>{const s=fixture(),t=tasksFor(s,'2026-11-16').find(x=>x.workout);moveTask(s,t,'2026-11-22');assert.equal(workoutStats(s,'2026-11-19').planned,3);});
test('OT applies to a single week and retains a short workout',()=>{const s=fixture();s.weekPlans['2026-11-16']={friday:'ot',otStart:'11:00',otEnd:'19:00'};const ts=tasksFor(s,'2026-11-20');assert.equal(ts.some(t=>t.friday==='off'),false);assert.equal(ts.find(t=>t.workout).time,'20:15');assert.equal(ts.find(t=>t.workout).minutes,25);assert.equal(ts.find(t=>t.routineId==='plan-project-fri').optional,true);assert.equal(weekPlan(s,'2026-11-27').friday,'unknown');assert.ok(tasksFor(s,'2026-11-27').find(t=>t.routineId==='example-admin'));});
test('late OT never wraps the workout into an earlier time',()=>{const s=fixture();s.weekPlans['2026-11-16']={friday:'ot',otStart:'11:00',otEnd:'23:00'};assert.equal(tasksFor(s,'2026-11-20').find(t=>t.workout).time,'');});
test('upgrades retain imported records and never inject presets',()=>{const s=fixture();delete s.planRevision;delete s.weekPlans;s.notes['2026-11-17']='Example note';const ids=s.routines.map(r=>r.id);upgradePlan(s);upgradePlan(s);assert.deepEqual(s.routines.map(r=>r.id),ids);assert.equal(s.notes['2026-11-17'],'Example note');});
test('dates cross year boundaries without UTC drift',()=>{assert.equal(addDays('2026-12-31',1),'2027-01-01');assert.deepEqual(weekFor('2027-01-03'),['2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03']);assert.equal(validDate('2026-02-30'),false);});
test('invalid backup data is rejected',()=>{const s=fixture();assert.equal(validateState(s),s);const area=structuredClone(s);area.routines[0].area='toString';assert.throws(()=>validateState(area));const time=structuredClone(s);time.routines[0].time='35:99';assert.throws(()=>validateState(time));const setting=structuredClone(s);setting.settings.otStart='<invalid>';assert.throws(()=>validateState(setting));assert.throws(()=>validateState({version:1,tasks:[]}));});
test('tracker marks and unmarks a planned day without changing adjacent days',()=>{
  const s=fixture();
  assert.equal(toggleWorkoutDay(s,'2026-11-16').status,'done');
  assert.equal(workoutStats(s,'2026-11-19').done,1);
  assert.equal(workoutStats(s,'2026-11-26').done,0);
  const restored=validateState(JSON.parse(JSON.stringify(s)));
  assert.equal(workoutStats(restored,'2026-11-19').done,1);
  assert.equal(toggleWorkoutDay(restored,'2026-11-16').status,'pending');
  assert.equal(workoutStats(restored,'2026-11-19').done,0);
});
test('an empty tracker day does not invent a completed workout',()=>{
  const s=makeInitialState(),before=JSON.stringify(s);
  assert.equal(toggleWorkoutDay(s,'2026-11-17').status,'empty');
  assert.equal(JSON.stringify(s),before);
});
test('unmarking a day clears every completed session on that date',()=>{
  const s=fixture();toggleWorkoutDay(s,'2026-11-16');
  const extra={...tasksFor(s,'2026-11-16').find(t=>t.workout),id:'another-completed-session'};delete extra.routineId;s.tasks.push(extra);
  assert.equal(workoutStats(s,'2026-11-19').done,1);
  toggleWorkoutDay(s,'2026-11-16');
  assert.equal(workoutStats(s,'2026-11-19').done,0);
});
test('legacy movement tasks still count while explicit non-workouts do not',()=>{
  const s=makeInitialState(),t={id:'legacy',title:'Example movement',area:'salud',time:'',minutes:20,note:'',date:'2026-11-17',done:false};s.tasks.push(t);
  assert.equal(workoutStats(s,'2026-11-19').planned,1);
  t.workout=false;assert.equal(workoutStats(s,'2026-11-19').planned,0);
});
test('backup maps and flags are strictly validated to prevent silent data loss',()=>{
  for(const field of ['notes','rhythms','settings','overrides']){const s=fixture();s[field]=[];assert.throws(()=>validateState(s));}
  for(const field of ['done','workout','optional','fixed','priority']){const s=fixture();s.routines[0][field]='false';assert.throws(()=>validateState(s));}
  const duplicate=fixture();duplicate.routines.push({...duplicate.routines[0]});assert.throws(()=>validateState(duplicate));
  const unsafe=fixture();unsafe.routines[0].id='__proto__';assert.throws(()=>validateState(unsafe));
});
test('corrupt saved data is retained for recovery without overwriting it',()=>{
  const raw='{broken json',result=readSavedState(()=>raw);
  assert.equal(result.corruptData,true);assert.equal(result.rawData,raw);assert.equal(result.storageError,true);
  assert.deepEqual(result.state.tasks,[]);
});
test('blocked browser storage is not misclassified as corrupt data',()=>{
  const result=readSavedState(()=>{throw new Error('Storage blocked');});
  assert.equal(result.storageError,true);assert.equal(result.corruptData,false);assert.equal(result.rawData,null);
  assert.equal(validateState(result.state),result.state);
});
test('valid saved data preserves notes and completion',()=>{
  const s=fixture();s.notes['2026-11-17']='Keep this';toggleWorkoutDay(s,'2026-11-16');
  const restored=readSavedState(()=>JSON.stringify(s));
  assert.equal(restored.corruptData,false);assert.equal(restored.storageError,false);
  assert.equal(restored.state.notes['2026-11-17'],'Keep this');assert.equal(workoutStats(restored.state,'2026-11-19').done,1);
});
test('malformed timer snapshots reset instead of rendering invalid time',()=>{
  assert.equal(validTimerSnapshot({remaining:1500,running:false,endAt:null}),true);
  assert.equal(validTimerSnapshot({remaining:1500,running:true,endAt:Date.now()+1500000}),true);
  for(const value of [null,{}, {remaining:-1,running:false,endAt:null}, {remaining:1500,running:true,endAt:null}, {remaining:1500,running:'yes',endAt:1}])assert.equal(validTimerSnapshot(value),false);
});
