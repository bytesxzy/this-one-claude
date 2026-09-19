'use strict';
// Synthetic corpus; these fixtures are never included in reported ARC scores.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const dir=path.resolve(process.argv[2]||'work/bench-selftest');
fs.mkdirSync(dir,{recursive:true});
fs.copyFileSync(path.join(__dirname,'../c4-arc-engine.js'),path.join(dir,'c4-arc-engine.js'));
fs.writeFileSync(path.join(dir,'c4-arc-tasks.js'),'module.exports='+JSON.stringify([
  ['arc1_00000001','1>1','1>1'],
  ['arc1_00000002','1>1','1>1;2>9'],
  ['arc1_00000003','','1>1']
])+';\n');
const out=path.join(dir,'results');
const args=[path.join(__dirname,'bench.js'),'--root',dir,'--no-policy','--budget','0.1','--jobs','1','--out',out];
cp.execFileSync(process.execPath,args,{stdio:'pipe'});
const summary=JSON.parse(fs.readFileSync(path.join(out,'summary.json')));
assert.equal(summary.n,3);assert.equal(summary.top1,1);assert.equal(summary.top2,1);
assert.equal(summary.failures.ERROR,1);
const multi=JSON.parse(fs.readFileSync(path.join(out,'arc1_00000002.json')));
assert.deepEqual(multi.rank_of_correct_if_generated,[1,0]);
for(const id of ['00000001','00000002','00000003'])assert.ok(fs.existsSync(path.join(out,'arc1_'+id+'.prediction.json')));
const stamp=fs.statSync(path.join(out,'arc1_00000001.json')).mtimeMs;
cp.execFileSync(process.execPath,args,{stdio:'pipe'});
assert.equal(fs.statSync(path.join(out,'arc1_00000001.json')).mtimeMs,stamp);
const changed=args.slice();changed[changed.indexOf('--budget')+1]='0.2';
assert.throws(()=>cp.execFileSync(process.execPath,changed,{stdio:'pipe'}));
console.log('PASS benchmark exact multi-pair scoring, error retention, commits, resume, and configuration mismatch protection');
