import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as core from '../core.mjs';

// Exercise the real page renderers with a small browser boundary.
// This catches missing UI helpers that data-model tests cannot detect.
function renderRoute(route, raw) {
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, { innerHTML:'', textContent:'', style:{setProperty(){}}, classList:{toggle(){}}, addEventListener(){}, remove(){} });
    return elements.get(selector);
  };
  const values = new Map(raw ? [['chepo-mi-dia-v1',raw]] : []);
  const storage = {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const document = {documentElement:element('html'),querySelector:element,addEventListener(){},querySelectorAll(){return []},title:''};
  const source = fs.readFileSync(new URL('../app.mjs',import.meta.url),'utf8').replace(/^import[^\n]+\n/,'');
  vm.runInNewContext(source, {...core,document,localStorage:storage,sessionStorage:storage,location:{hash:'#'+route},window:{addEventListener(){},scrollTo(){}},navigator:{},setInterval(){},setTimeout(){},clearTimeout(){},structuredClone}, {timeout:1000});
  return {content:element('#content').innerHTML,values,document};
}

for (const [route, expected] of [['day','id="timer"'],['week','Meta semanal de entrenamiento'],['routine','Tu rutina. Tus reglas.'],['settings','Tus datos, contigo']]) {
  test(`${route} renders completely on a fresh installation`,()=>{
    const result=renderRoute(route);
    assert.ok(result.content.includes(expected));
    assert.equal(result.document.title,'My Day by Chepo');
  });
}
test('day view renders imported tasks, completion and the focus timer together',()=>{
  const state=core.makeInitialState(),date=core.dateKey();
  state.tasks.push({id:'render-sample',title:'Example completed training',area:'salud',date,time:'',minutes:30,note:'',workout:true,done:true});
  state.notes[date]='Example daily note';
  const result=renderRoute('day',JSON.stringify(state));
  for(const text of ['Example completed training','Example daily note','1 de 3 días completados','id="timer"'])assert.ok(result.content.includes(text),text);
});
test('invalid stored JSON does not crash any route or overwrite recovery data',()=>{
  for(const route of ['day','week','routine','settings']){
    const result=renderRoute(route,'{broken');
    assert.ok(result.content.includes('storage-warning'));
    assert.equal(result.values.get('chepo-mi-dia-v1'),'{broken');
  }
});
