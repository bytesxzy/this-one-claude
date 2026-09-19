'use strict';
// Workers receive demonstrations and test INPUTS only. Commit before scoring.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const hash = x => crypto.createHash('sha256').update(x).digest('hex');
if (!isMainThread) {
  const E = require(workerData.engine);
  if (workerData.policy) E.activatePlanner(E.loadPlanner(require(workerData.policy)));
  parentPort.on('message', ({index, task}) => {
    try {
      for (const t of task.test) Object.defineProperty(t, 'output', {get() {throw Error('Test-output access during inference');}});
      const opts = {time_budget:workerData.budget, k:2, collect_all:true};
      if (workerData.without) opts.modules = E.orderedModules().filter(m => !workerData.without.includes(m.__name__));
      const r = E.solveTask(task, opts);
      parentPort.postMessage({index, result:JSON.parse(JSON.stringify(r))});
    } catch (e) {parentPort.postMessage({index, error:String(e.stack || e)});}
  });
} else {
  const args = process.argv.slice(2);
  function arg(k,d) {const i=args.indexOf('--'+k); return i<0?d:args[i+1];}
  const root = path.resolve(arg('root',path.join(__dirname,'..')));
  const engine = path.join(root,'c4-arc-engine.js');
  const policy = args.includes('--no-policy') ? null : path.join(root,'c4-arc-policy.js');
  const budget = Number(arg('budget',3)), jobs = Number(arg('jobs',2));
  const start=Number(arg('start',0)), end=Number(arg('end',400));
  const out=path.resolve(arg('out',path.join(root,'bench-results')));
  const without=arg('without','').split(',').filter(Boolean);
  if (!(budget>0 && Number.isInteger(jobs) && jobs>=1 && jobs<=4)) throw Error('Use positive budget and 1..4 workers');
  fs.mkdirSync(out,{recursive:true});
  const packed=require(path.join(root,'c4-arc-tasks.js')).filter(t=>t[0].startsWith('arc1_')).slice(start,end);
  const ids=arg('ids','').split(',').filter(Boolean);
  const grid=s=>s.split('|').map(r=>[...r].map(Number));
  const pairs=s=>s.split(';').filter(Boolean).map(p=>{const [x,y]=p.split('>'); return {input:grid(x), output:y?grid(y):undefined};});
  const tasks=packed.filter(t=>!ids.length||ids.includes(t[0])).map(t=>({id:t[0],train:pairs(t[1]),test:pairs(t[2])}));
  const config={engine_sha256:hash(fs.readFileSync(engine)),corpus_sha256:hash(fs.readFileSync(path.join(root,'c4-arc-tasks.js'))),policy_sha256:policy?hash(fs.readFileSync(policy)):null,budget,jobs,start,end,without,ids,node:process.version};
  const meta=path.join(out,'config.json');
  if(fs.existsSync(meta)&&JSON.stringify(JSON.parse(fs.readFileSync(meta)))!==JSON.stringify(config)) throw Error('Resume configuration mismatch; use a fresh output directory');
  fs.writeFileSync(meta,JSON.stringify(config,null,2));
  const records=[], queue=[];
  tasks.forEach((t,index)=>{const file=path.join(out,t.id+'.json');if(fs.existsSync(file)) records.push(JSON.parse(fs.readFileSync(file)));else queue.push(index);});
  const started=Date.now();
  function atomic(file,value) {const tmp=file+'.tmp';fs.writeFileSync(tmp,value);fs.renameSync(tmp,file);}
  function save(index,msg) {
    const t=tasks[index];
    // Persist the unscored prediction before any comparison to answers.
    const commit=path.join(out,t.id+'.prediction.json');
    atomic(commit,JSON.stringify(msg));
    const r=msg.result;
    const ranks=t.test.map((p,i)=>r?(r.predictions[i]||[]).findIndex(g=>JSON.stringify(g)===JSON.stringify(p.output))+1:0);
    const top1=ranks.every(n=>n===1), top2=ranks.every(n=>n>0&&n<=2), oracle=ranks.every(n=>n>0);
    const d=r?r.diagnostics:{};
    const failure=top1?'SOLVED':msg.error?'ERROR':oracle?'RIGHT_OUTPUT_OUTRANKED':r.n_fit===0?'NO_CANDIDATE':d.unrun_modules>0?'SCHEDULER_STARVED':'NO_CORRECT_RETAINED_PREDICTION';
    const rec={task_id:t.id,solved_top1:top1,solved_top2:top2,oracle_retained:oracle,runtime:r?r.elapsed:null,candidate_count:r?r.n_hyps:0,fitted_count:r?r.n_fit:0,winning_program:r?r.chosen:null,winning_family:r?r.solver:null,winning_program_cost:null,ranked_hypotheses:r?r.hyps:null,rank_of_correct_if_generated:ranks,failure_class:failure,error:msg.error||null,diagnostics:d};
    atomic(path.join(out,t.id+'.json'),JSON.stringify(rec)); records.push(rec);
    if(records.length%25===0) console.log(`${records.length}/${tasks.length}, top1=${records.filter(r=>r.solved_top1).length}`);
  }
  function finish() {
    const failures={};for(const r of records) failures[r.failure_class]=(failures[r.failure_class]||0)+1;
    const summary={...config,n:records.length,top1:records.filter(r=>r.solved_top1).length,top2:records.filter(r=>r.solved_top2).length,oracle_retained:records.filter(r=>r.oracle_retained).length,task_seconds:records.reduce((a,r)=>a+(r.runtime||0),0),wall_seconds:(Date.now()-started)/1000,failures};
    fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
  }
  let active=0;
  if(!queue.length) finish();
  else for(let i=0;i<Math.min(jobs,queue.length);i++) {
    active++;
    const w=new Worker(__filename,{workerData:{engine,policy,budget,without}});
    let timer, current;
    function next(){if(!queue.length){w.terminate();if(--active===0)finish();return;}current=queue.shift();const t=tasks[current];timer=setTimeout(()=>{throw Error(`Worker watchdog expired on ${t.id}; committed tasks can be resumed`);},Math.max(30000,budget*5000));w.postMessage({index:current,task:{train:t.train,test:t.test.map(p=>({input:p.input}))}});}
    w.on('message',msg=>{clearTimeout(timer);save(msg.index,msg);next();});
    w.on('error',e=>{clearTimeout(timer);console.error(e);process.exitCode=1;});
    next();
  }
}
