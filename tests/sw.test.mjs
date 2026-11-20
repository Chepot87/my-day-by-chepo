import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

function worker() {
  const listeners=new Map(),stores=new Map(),scope='https://example.test/planner/';
  let networkCalls=0;
  const caches={
    async open(name){if(!stores.has(name))stores.set(name,new Map());const entries=stores.get(name);return {
      async addAll(paths){for(const p of paths)entries.set(new URL(p,scope).href,new Response(`cached ${p}`));},
      async match(url){return entries.get(url)?.clone();},
      async put(url,response){entries.set(url,response);}
    };},
    async keys(){return [...stores.keys()];},
    async delete(name){return stores.delete(name);}
  };
  const self={registration:{scope},location:{origin:'https://example.test'},clients:{async claim(){}},async skipWaiting(){},addEventListener(name,handler){listeners.set(name,handler);}};
  vm.runInNewContext(fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8'),{self,caches,URL,Response,fetch:async()=>{networkCalls++;throw new Error('offline');}});
  return {listeners,stores,scope,get networkCalls(){return networkCalls;},async lifecycle(name){let wait;listeners.get(name)({waitUntil(value){wait=value;}});await wait;},async request(path,method='GET'){let reply;listeners.get('fetch')({request:{url:new URL(path,scope).href,method},respondWith(value){reply=value;}});return reply?await reply:null;}};
}
test('offline shell uses one complete asset release even with an older query string',async()=>{
  const w=worker();await w.lifecycle('install');
  for(const name of ['app.mjs','core.mjs','styles.css']){const response=await w.request(name+'?v=old');assert.equal(response.status,200);assert.match(await response.text(),/20261120-3/);}
  assert.equal(w.networkCalls,0);
});
test('worker leaves other applications and non-GET requests alone',async()=>{
  const w=worker();await w.lifecycle('install');
  assert.equal(await w.request('https://example.test/another-app/app.mjs'),null);
  assert.equal(await w.request('app.mjs','POST'),null);
});
test('cache cleanup preserves other application caches',async()=>{
  const w=worker();w.stores.set('my-day-by-chepo:/different-app/:old',new Map());w.stores.set('another-app-cache',new Map());w.stores.set('my-day-by-chepo:/planner/:old',new Map());
  await w.lifecycle('install');await w.lifecycle('activate');
  assert.ok(w.stores.has('my-day-by-chepo:/different-app/:old'));assert.ok(w.stores.has('another-app-cache'));assert.equal(w.stores.has('my-day-by-chepo:/planner/:old'),false);
});
