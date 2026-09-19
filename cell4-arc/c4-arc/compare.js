'use strict';
const fs=require('node:fs'),path=require('node:path');
const [base,newer,output]=process.argv.slice(2);
if(!base||!newer)throw Error('Usage: node c4-arc/compare.js BASE_RESULTS NEW_RESULTS [OUTPUT]');
const read=dir=>new Map(fs.readdirSync(dir).filter(n=>/^arc1_[a-f0-9]+\.json$/.test(n)).map(n=>{const r=JSON.parse(fs.readFileSync(path.join(dir,n)));return [r.task_id,r];}));
const a=read(base),b=read(newer),added=[],lost=[],noncomparable=[],families={},failureCounts={};
let baseline=0,updated=0,top2=0,oracle=0,oldTop2=0,oldOracle=0;
for(const [id,y] of b){const x=a.get(id);if(!x){noncomparable.push(id);continue;}
  baseline+=Number(x.solved_top1);updated+=Number(y.solved_top1);
  top2+=Number(y.solved_top2);oracle+=Number(y.oracle_retained);oldTop2+=Number(x.solved_top2);oldOracle+=Number(x.oracle_retained);
  if(y.solved_top1&&!x.solved_top1)added.push({id,program:y.winning_program});
  if(x.solved_top1&&!y.solved_top1)lost.push({id,before:x.winning_program,after:y.winning_program,failure:y.failure_class});
  if(y.solved_top1)families[y.winning_family]=(families[y.winning_family]||0)+1;
  else failureCounts[y.failure_class]=(failureCounts[y.failure_class]||0)+1;
}
const report={compared:b.size-noncomparable.length,baseline_top1:baseline,updated_top1:updated,net:updated-baseline,baseline_top2:oldTop2,updated_top2:top2,baseline_oracle_retained:oldOracle,updated_oracle_retained:oracle,new_solves:added,regressions:lost,winning_families:families,failures:failureCounts,noncomparable};
if(output)fs.writeFileSync(output,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
