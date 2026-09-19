/* ===== src/53-bidirectional.js ===== */
/* Bounded inverse-construction grammar with specialist leaves.
 *
 * Grid -> prefix -> Grid -> specialist -> latent Grid -> decoder -> Grid.
 * Decoders may read the original INPUT as a canvas or color-role environment.
 * Their parameters and every inverse are inferred exclusively from demos.
 * Training states are observationally deduplicated together with test-input
 * prefix states; decoders retain distinct ASTs because their test behavior can
 * differ. This is not an answer cache. Search memory dies with the invocation.
 */
var BIDI = (function () {
  var LEAVES=['geometry','colormap','relpalette','bridge','symmetry','tiling',
    'partition','select','regions','blocks','selfstamp','sequence','extend',
    'objects_map','objproc','relproc','motion','paint','counting','paneltable',
    'delta_stencils','squareholes','satelliterays','fanfill','edgeparity',
    'globalclass','dispersedcolor','symobject','reductions','tally'];
  function safe(fn,g,x){try{var y=fn(g,x);return G.isGrid(y)?y:null;}catch(e){return null;}}
  function key(gs){return gs.map(G.gkey).join('#');}
  function id(g){return g;}
  function period(g,axis){
    var length=axis===0?g.length:g[0].length;
    for(var p=1;p<length&&p<=Math.max(1,length-2);p++){
      var ok=true;
      for(var r=0;r<g.length&&ok;r++)for(var c=0;c<g[0].length;c++)
        if(g[r][c]!==g[axis===0?r%p:r][axis===1?c%p:c]){ok=false;break;}
      if(ok)return axis===0?G.subgrid(g,0,0,p-1,g[0].length-1):G.subgrid(g,0,0,g.length-1,p-1);
    }
    return null;
  }
  function sameShape(a,b){return a.length===b.length&&a[0].length===b[0].length;}
  function ast(op,args,cost){return {type:'Grid',op:op,args:args||[],cost:cost||0};}
  function substitute(node,leaf){return node.op==='latent'?leaf:ast(node.op,node.args.map(function(a){return typeof a==='object'?substitute(a,leaf):a;}),node.cost);}
  function render(a){return a.op+(a.args.length?'('+a.args.map(function(x){return typeof x==='object'?render(x):String(x);}).join(',')+')':'');}
  function roles(ctx){
    var colors=G.csList(ctx.out_palette()), out=[{name:'background',cost:0.3,run:function(g){return G.background(g);}}];
    out.push({name:'foreground',cost:0.4,run:function(g){var bg=G.background(g),p=G.csList(G.palette(g)).filter(function(c){return c!==bg;});return p.length===1?p[0]:null;}});
    colors.forEach(function(c){out.push({name:'literal:'+c,cost:1.0,run:function(){return c;}});});
    return out;
  }
  function wrappers(ctx){
    var out=[];
    function add(name,reduce,expand,cost){out.push({name:name,reduce:reduce,expand:expand,cost:cost});}
    // Shape laws are demonstration constraints, not fitted pixel locations.
    [0,1].forEach(function(axis){
      var inputDim=function(g){return axis===0?g.length:g[0].length;};
      var ys=ctx.outputs().map(inputDim),xs=ctx.inputs().map(inputDim),laws=[];
      if(ys.every(function(v){return v===ys[0];}))laws.push({name:'fixed:'+ys[0],cost:1.2,fn:function(){return ys[0];}});
      for(var a=1;a<=3;a++)for(var b=-4;b<=4;b++)if(xs.every(function(v,i){return a*v+b===ys[i];}))
        (function(aa,bb){laws.push({name:aa+'*input'+(bb>=0?'+':'')+bb,cost:0.7+0.2*Math.abs(bb),fn:function(g){return aa*inputDim(g)+bb;}});})(a,b);
      laws.forEach(function(law){add('periodic:'+axis+':'+law.name,function(g){return period(g,axis);},function(g,x){
        var len=law.fn(x);if(len<1||len>60)return null;
        var h=axis===0?len:g.length,w=axis===1?len:g[0].length,out=[];
        for(var r=0;r<h;r++){var row=[];for(var c=0;c<w;c++)row.push(g[r%g.length][c%g[0].length]);out.push(row);}return out;
      },1.0+law.cost);});
    });
    for(var ky=1;ky<=4;ky++)for(var kx=1;kx<=4;kx++)if(ky*kx>1)(function(y,x){
      add('scale:'+y+'x'+x,function(g){return G.downscale(g,y,x);},function(g){return G.upscale(g,y,x);},1.0+0.1*(x+y));
      add('tile:'+y+'x'+x,function(g){
        if(g.length%y||g[0].length%x)return null;
        var p=G.subgrid(g,0,0,g.length/y-1,g[0].length/x-1);
        return p&&G.gEq(G.tile(p,y,x),g)?p:null;
      },function(g){return G.tile(g,y,x);},1.2+0.1*(x+y));
    })(ky,kx);
    for(var axis=0;axis<4;axis++)(function(a){
      var expand=function(g){return a===0?G.hconcat(g,G.flipH(g)):a===1?G.hconcat(G.flipH(g),g):a===2?G.vconcat(g,G.flipV(g)):G.vconcat(G.flipV(g),g);};
      add('mirror:'+a,function(g){
        if(a<2&&g[0].length%2||a>=2&&g.length%2)return null;
        var p=a<2?G.subgrid(g,0,a===0?0:g[0].length/2,g.length-1,a===0?g[0].length/2-1:g[0].length-1):G.subgrid(g,a===2?0:g.length/2,0,a===2?g.length/2-1:g.length-1,g[0].length-1);
        return p&&G.gEq(expand(p),g)?p:null;
      },expand,1.5);
    })(axis);
    roles(ctx).forEach(function(role){
      add('frame:'+role.name,function(g,x){
        if(g.length<3||g[0].length<3)return null;
        var c=role.run(x);if(c===null)return null;
        for(var r=0;r<g.length;r++)for(var s=0;s<g[0].length;s++)
          if((r===0||s===0||r===g.length-1||s===g[0].length-1)&&g[r][s]!==c)return null;
        return G.trimBorder(g,1);
      },function(g,x){var c=role.run(x);return c===null?null:G.pad(g,1,c);},1.1+role.cost);
      if(ctx.same_shape())add('paintDelta:'+role.name,function(g,x){
        if(!sameShape(g,x))return null;
        var c=role.run(x),changed=false;if(c===null)return null;
        var mask=g.map(function(row,r){return row.map(function(v,s){if(v!==x[r][s])changed=true;return v===x[r][s]?0:1;});});
        for(var r=0;r<g.length;r++)for(var s=0;s<g[r].length;s++)if(mask[r][s]&&g[r][s]!==c)return null;
        return changed?mask:null;
      },function(mask,x){
        if(!sameShape(mask,x))return null;
        var c=role.run(x);if(c===null)return null;
        for(var r=0;r<mask.length;r++)for(var s=0;s<mask[r].length;s++)if(mask[r][s]!==0&&mask[r][s]!==1)return null;
        return mask.map(function(row,r){return row.map(function(v,s){return v?c:x[r][s];});});
      },2.0+role.cost);
    });
    return out;
  }
  function prefixes(ctx,scene){
    var out=[{name:'input',cost:0,run:id}];
    function add(name,cost,run){out.push({name:name,cost:cost,run:run});}
    add('crop',0.8,function(g){return G.cropToContent(g,null);});
    add('dedup',1.0,G.dedup);
    add('periodRows',1.0,function(g){return period(g,0);});
    add('periodColumns',1.0,function(g){return period(g,1);});
    add('transpose',0.8,G.transpose);
    ['m4','m8'].forEach(function(mode){[false,true].forEach(function(erase){
      add('alignSharedMarker:'+mode+':'+erase,1.8,function(g){return SCENE.align(g,mode,null,erase);});
    });});
    ['top','bottom','left','right'].forEach(function(a){add('half:'+a,1.3,function(g){return G.half(g,a);});});
    ['m4','m8','c4','c8'].forEach(function(mode){
      ['size','holes','degree','contains','contained','shapeFrequency','colorFrequency'].forEach(function(k){
        [true,false].forEach(function(max){
          add('select:'+mode+':'+k+':'+(max?'max':'min'),1.6,function(g){
            var s=scene(g,mode,null),n=SCENE.select(s,k,max);return n?O.cropObj(g,n.object):null;
          });
        });
      });
    });
    G.csList(ctx.in_palette()).forEach(function(c){
      add('mask:'+c,1.5,function(g){return g.map(function(row){return row.map(function(v){return v===c?1:0;});});});
    });
    add('foregroundMask',0.9,function(g){var bg=G.background(g);return g.map(function(row){return row.map(function(v){return v===bg?0:1;});});});
    return out;
  }
  function generate(ctx,options){
    options=options||{};
    var end=ctx.deadline===null?nowMs()+1200:ctx.deadline;
    var n=ctx.train.length,inputs=ctx.inputs(),tests=ctx.test_inputs,outputs=ctx.outputs();
    var scene=SCENE.cache(),ps=prefixes(ctx,scene),ws=wrappers(ctx);
    var stats={representations:0,prefixes:0,jobs:0,leaf_calls:0,verified:0,errors:0,pruned:0};
    ctx._bidi_stats=stats;
    var roots=[{ys:outputs,decode:id,node:ast('latent'),cost:0,depth:0}];
    var reps=[],seenR=new Set();
    // Two inverse construction steps, with a strict beam/memory bound.
    for(var depth=0;depth<2;depth++){
      var next=[];
      for(var ri=0;ri<roots.length;ri++)for(var wi=0;wi<ws.length;wi++){
        if(nowMs()>=end)break;
        var base=roots[ri],w=ws[wi],ys=[],ok=true;
        if(base.depth&&w.name.indexOf('paintDelta:')===0)continue;
        for(var t=0;t<n;t++){
          var y=safe(w.reduce,base.ys[t],inputs[t]);
          if(!y||!G.gEq(safe(w.expand,y,inputs[t]),base.ys[t])){ok=false;break;}
          ys.push(y);
        }
        if(!ok||key(ys)===key(base.ys))continue;
        var node=substitute(base.node,ast(w.name,[ast('latent')],base.cost+w.cost)),rk=key(ys)+'|'+render(node);
        if(seenR.has(rk))continue;seenR.add(rk);
        var decode=(function(b,wr){return function(g,x){var y=safe(wr.expand,g,x);return y?safe(b.decode,y,x):null;};})(base,w);
        var rep={ys:ys,decode:decode,node:node,cost:base.cost+w.cost,depth:depth+1};
        reps.push(rep);next.push(rep);
      }
      next.sort(function(a,b){return a.cost-b.cost||key(a.ys).localeCompare(key(b.ys));});
      roots=next.slice(0,6);
    }
    reps.sort(function(a,b){return a.cost-b.cost||render(a.node).localeCompare(render(b.node));});
    reps=reps.slice(0,32);stats.representations=reps.length;
    // Retain unwrapped targets to make relational selections composable too.
    reps.push({ys:outputs,decode:id,node:ast('latent'),cost:0,depth:0});
    var pref=[],seenP=new Set(),all=inputs.concat(tests);
    for(var pi=0;pi<ps.length;pi++){
      if(nowMs()>=end)break;
      var p=ps[pi],xs=all.map(function(g){return safe(p.run,g);});
      if(xs.some(function(x){return !x;}))continue;
      var pk=key(xs);if(seenP.has(pk))continue;seenP.add(pk);
      pref.push({p:p,xs:xs});
    }
    stats.prefixes=pref.length;
    var jobs=[];
    reps.forEach(function(rep){pref.forEach(function(pr){
      if(!rep.depth&&!pr.p.cost)return;
      var match=0,distance=0;
      for(var i=0;i<n;i++){
        var a=pr.xs[i],b=rep.ys[i];
        if(sameShape(a,b))match++;
        distance+=Math.abs(Math.log(G.area(a)/G.area(b)));
      }
      jobs.push({rep:rep,pr:pr,priority:rep.cost+pr.p.cost+distance/n-2*match/n});
    });});
    jobs.sort(function(a,b){return a.priority-b.priority||render(a.rep.node).localeCompare(render(b.rep.node))||a.pr.p.name.localeCompare(b.pr.p.name);});
    jobs=jobs.slice(0,options.maxJobs||64);stats.jobs=jobs.length;
    var found=[],behaviors=new Map();
    function keep(job,h){
      var cost=2.0+job.rep.cost+job.pr.p.cost+h.cost;
      var run=function(g){var x=safe(job.pr.p.run,g);if(!x)return null;var z=h.apply(x);return z?safe(job.rep.decode,z,g):null;};
      var hp=new Hyp('bidi['+render(job.rep.node)+']('+h.solver+':'+h.name+'('+job.pr.p.name+'))',run,cost,'bidirectional');
      if(!hp.fits(ctx.train))return;
      var pred=tests.map(function(g){return hp.apply(g);});
      if(pred.some(function(g){return !g;}))return;
      var k=key(pred),old=behaviors.get(k);
      hp.ast={type:'Grid',op:'decode',args:[job.rep.node,ast(h.solver+':'+h.name,[ast(job.pr.p.name)])],cost:cost};
      if(!old||cost<old.cost)behaviors.set(k,hp);
      stats.verified++;
    }
    // Cheap equality closes all states before specialist work. No test labels.
    jobs.forEach(function(job){if(job.rep.ys.every(function(y,i){return G.gEq(y,job.pr.xs[i]);}))keep(job,new Hyp('id',id,0,'geometry'));});
    // Round robin across representations: one slow leaf cannot consume an
    // entire decomposition's budget before other decompositions get a chance.
    outer:for(var li=0;li<LEAVES.length;li++)for(var ji=0;ji<jobs.length;ji++){
      if(nowMs()>=end||stats.leaf_calls>=(options.maxCalls||640))break outer;
      var job=jobs[ji],mod=moduleByName(LEAVES[li]);if(!mod)continue;
      if(!job.sub){job.sub=new Ctx(job.pr.xs.slice(0,n).map(function(x,i){return [x,job.rep.ys[i]];}),job.pr.xs.slice(n));job.sub.op_prior=ctx.op_prior;}
      job.sub.deadline=Math.min(end,nowMs()+12);
      stats.leaf_calls++;
      var hs;try{hs=mod.generate(job.sub);}catch(e){stats.errors++;continue;}
      hs=hs.slice().sort(function(a,b){return a.cost-b.cost;});
      var accepted=0;
      for(var hi=0;hi<hs.length;hi++){
        if(nowMs()>=end)break outer;
        if(hs[hi].fits(job.sub.train)){keep(job,hs[hi]);if(++accepted>=3)break;}
      }
    }
    behaviors.forEach(function(h){found.push(h);});
    found.sort(function(a,b){return a.cost-b.cost||a.name.localeCompare(b.name);});
    return found.slice(0,24);
  }
  defSolver('bidirectional','bidirectional',generate,1,1.2).ONLY_IF_UNSOLVED = true;
  return {generate:generate,wrappers:wrappers,prefixes:prefixes,render:render};
})();
