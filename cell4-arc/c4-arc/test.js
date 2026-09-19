'use strict';
const assert = require('node:assert/strict');
const E=require('../c4-arc-engine.js');
const {G}=E;
const eq=(a,b)=>assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name);}
test('scene shape equivalence, relations, strict tie rejection',()=>{
  const s=E.SCENE.make([[2,0,0,3],[2,0,3,3],[0,0,0,0],[4,4,0,0]],'m4',0);
  assert.equal(s.nodes.length,3);assert.equal(s.edges.length,3);
  assert.equal(s.nodes[0].shape,s.nodes[2].shape);
  assert.equal(E.SCENE.select(s,'size',false),null);
  assert.equal(E.SCENE.select(s,'size',true).size,3);
});
test('inverse constructors round-trip and reject invalid grids',()=>{
  const x=[[0,2,0],[2,2,0],[0,0,0]], y=G.upscale(x,2,3);
  const ctx=new E.Ctx([[x,y]],[x]);
  for(const w of E.BIDI.wrappers(ctx)){
    const latent=w.reduce(y,x);
    if(latent)eq(w.expand(latent,x),y);
  }
  const scale=E.BIDI.wrappers(ctx).find(w=>w.name==='scale:2x3');
  eq(scale.reduce(y,x),x);
  const corrupted=G.copyGrid(y);corrupted[0][1]=9;
  assert.equal(scale.reduce(corrupted,x),null);
});
function recover(train,inputs,expected,options){
  const ctx=new E.Ctx(train,inputs,Date.now()+10000);
  const hyps=E.BIDI.generate(ctx,options);
  assert.ok(hyps.length,'No generated programs');
  for(const h of hyps)assert.ok(h.fits(train),'Unverified program escaped');
  assert.ok(hyps.some(h=>inputs.every((x,i)=>G.gEq(h.apply(x),expected[i]))),'Correct held-out prediction not generated');
  return hyps;
}
test('inverse construction composes crop, rotation, and anisotropic scale',()=>{
  const xs=[[[0,0,0,0],[0,2,2,0],[0,2,0,0],[0,0,0,0]],[[0,0,0,0,0],[0,3,0,0,0],[0,3,3,3,0],[0,0,0,0,0]]];
  const rule=g=>G.upscale(G.rot90(G.cropToContent(g,0)),2,3);
  const t=[[0,0,0,0],[0,4,0,0],[0,4,4,0],[0,4,0,0],[0,0,0,0]];
  recover(xs.map(x=>[x,rule(x)]),[t],[rule(t)]);
});
test('nested inverse constructors transfer to different dimensions/colors',()=>{
  const xs=[[[2,0],[2,2]],[[3,3,0],[0,3,3]]];
  const rule=g=>G.pad(G.upscale(g,2,2),1,0);
  const t=[[4,0],[4,4],[0,4]];
  recover(xs.map(x=>[x,rule(x)]),[t],[rule(t)]);
});
test('partial periods extend with an induced palette change',()=>{
  const xs=[[[1,0],[1,1],[0,1],[0,0],[1,0],[1,1]],[[1,0],[0,1],[1,0],[0,1],[1,0],[0,1]]];
  function rule(g,p){return Array.from({length:9},(_,r)=>g[r%p].map(c=>c===1?2:c));}
  const t=[[1,1],[0,1],[1,0],[1,1],[0,1],[1,0]];
  recover(xs.map((x,i)=>[x,rule(x,i===0?4:2)]),[t],[rule(t,3)]);
});
test('typed filtered reduction transfers to new square sizes and positions',()=>{
  const x=[[0,2,2,0,2,0,0],[0,2,2,0,0,2,0],[0,0,0,0,0,0,0]];
  const y=[[2,2,0,2,2,0,0],[2,2,0,2,2,0,2],[0,0,0,0,0,0,0]];
  const z=[[0,2,2,2,0,2],[0,2,2,2,0,0],[0,2,2,2,0,0],[0,0,0,0,0,0]];
  const train=[[x,[[1,0,0,0]]],[y,[[1,1,0,0]]]];
  const hs=E.REDUCE.generate(new E.Ctx(train,[z],Date.now()+3000));
  assert.ok(hs.some(h=>G.gEq(h.apply(z),[[1,0,0,0]])));
  assert.ok(hs.every(h=>h.fits(train)));
});
test('marker-aligned assembly is invariant to positions and palette',()=>{
  const x=[[0,2,5,0,0,0],[0,0,0,0,5,3],[0,0,0,0,0,0]];
  eq(E.SCENE.align(x,'m4',null,false),[[2,5,3]]);
  const z=[[0,7,8,0,0,0],[0,0,0,0,0,0],[0,0,8,4,0,0]];
  eq(E.SCENE.align(z,'m4',null,false),[[7,8,4]]);
  const conflict=[[2,5,0,0,3,5]];
  assert.equal(E.SCENE.align(conflict,'m4',null,false),null);
});
test('all demos constrain a shared program',()=>{
  const x=[[0,2],[2,0]],train=[[x,[[1]]],[x,[[3]]]];
  assert.equal(E.BIDI.generate(new E.Ctx(train,[x],Date.now()+2000)).length,0);
});
test('inference cannot access a test answer and does not mutate inputs',()=>{
  const x=[[0,2],[2,2]],task={train:[{input:x,output:G.rot90(x)}],test:[{input:x}]};
  Object.defineProperty(task.test[0],'output',{get(){throw Error('LEAK');}});
  const before=JSON.stringify(task.train);
  const r=E.solveTask(task,{time_budget:0.1,modules:E.orderedModules().filter(m=>m.__name__==='geometry'),loo:false});
  assert.ok(r.predictions[0].length);assert.equal(JSON.stringify(task.train),before);
});
test('zero budget respects boundary',()=>{
  const x=[[1]];const r=E.solveTask({train:[{input:x,output:x}],test:[{input:x}]},{time_budget:0});
  assert.ok(r.elapsed<0.2);assert.ok(r.diagnostics.unrun_modules>=0);
});
test('conditional composition preserves budget after an executable exact fit',()=>{
  const x=[[0,2],[2,2]],task={train:[{input:x,output:x}],test:[{input:x}]};
  let called=false;
  const seed={__name__:'seed',SOLVER:'geometry',PHASE:1,generate:()=>[new E.Hyp('id',g=>g,0,'geometry')]};
  const extra={__name__:'extra',SOLVER:'bidirectional',PHASE:1,ONLY_IF_UNSOLVED:true,generate:()=>{called=true;return [];}};
  const r=E.solveTask(task,{time_budget:0.2,loo:false,modules:[seed,extra]});
  assert.equal(called,false);assert.equal(r.diagnostics.modules[1].status,'skipped_existing_explanation');
  E.solveTask(task,{time_budget:0.2,loo:false,modules:[{...seed,generate:()=>[]},extra]});
  assert.equal(called,true);
});
test('bounded search is repeatable when work cap completes',()=>{
  const x=[[0,2],[2,2]],y=G.upscale(x,2,2);
  const run=()=>E.BIDI.generate(new E.Ctx([[x,y]],[x],Date.now()+10000),{maxJobs:12,maxCalls:24}).map(h=>({name:h.name,pred:h.apply(x)}));
  eq(run(),run());
});
console.log(`${passed} tests passed`);
