'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'c4-mini.html'),'utf8');
const order=['c4-arc-engine.js','c4-arc-tasks.js','c4-arc-policy.js','c4-arc.js'];
let previous=-1;
for(const file of order){const pos=html.indexOf('src="'+file+'"');assert.ok(pos>previous,`Script load order: ${file}`);previous=pos;}
const storage=new Map();
const sandbox={console,URL,setTimeout,clearTimeout,
  document:{currentScript:{src:'http://localhost/c4-arc.js'},baseURI:'http://localhost/'},
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}};
sandbox.window=sandbox;sandbox.globalThis=sandbox;
const context=vm.createContext(sandbox);
for(const file of order)vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
assert.ok(sandbox.C4ARC.ready());assert.equal(sandbox.C4ARC.taskCount(),550);
assert.ok(sandbox.C4ARC.taskById('arc1_007bbfb7'));
const g=[[1,0],[1,1]];
const task={train:[{input:g,output:g}],test:[{input:g}]};
Object.defineProperty(task.test[0],'output',{get(){throw Error('Browser inference touched an answer');}});
const r=sandbox.C4ARC.solveTask(task,0.2);
assert.ok(r.predictions[0].length);
assert.deepEqual(JSON.parse(JSON.stringify(r.predictions[0][0])),g);
console.log('PASS browser globals, script order, planner load, corpus API, solving, answer isolation');
console.log('Scope: script-level browser integration. Unrelated scripts missing from the original archive are not supplied.');
