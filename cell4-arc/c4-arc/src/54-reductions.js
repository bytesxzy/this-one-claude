/* ===== src/54-reductions.js ===== */
/* Typed ObjectSet -> filter -> Integer -> Grid programs. The same reductions
 * serve as composable scalar primitives, not per-puzzle counting templates. */
var REDUCE = (function () {
  function atoms(ctx){
    var p=[{name:'all',cost:0,fn:function(){return true;}},
      {name:'nontrivial',cost:0.4,fn:function(o){return o.size()>1;}},
      {name:'singleton',cost:0.4,fn:function(o){return o.size()===1;}},
      {name:'solid',cost:0.5,fn:function(o){return o.size()===o.bbox_area();}},
      {name:'square',cost:0.5,fn:function(o){return o.height()===o.width();}},
      {name:'solidSquare',cost:0.7,fn:function(o){return o.size()>1&&o.height()===o.width()&&o.size()===o.bbox_area();}},
      {name:'line',cost:0.6,fn:function(o){return o.size()>1&&(o.height()===1||o.width()===1);}},
      {name:'hole',cost:0.6,fn:function(o){return o.holes_count()>0;}},
      {name:'border',cost:0.5,fn:function(o){return o.touches_border();}},
      {name:'interior',cost:0.5,fn:function(o){return !o.touches_border();}}];
    var base=p.slice(1);
    G.csList(ctx.in_palette()).forEach(function(c){
      var color={name:'color:'+c,cost:1,fn:function(o){return o.color===c;}};
      p.push(color);
      base.forEach(function(a){p.push({name:a.name+'&'+color.name,cost:a.cost+1.2,fn:function(o){return a.fn(o)&&color.fn(o);}});});
    });
    return p;
  }
  var measures=[
    {name:'count',cost:0,run:function(os){return os.length;}},
    {name:'sumArea',cost:0.5,run:function(os){return os.reduce(function(n,o){return n+o.size();},0);}},
    {name:'sumHoles',cost:0.6,run:function(os){return os.reduce(function(n,o){return n+o.holes_count();},0);}},
    {name:'distinctShapes',cost:0.7,run:function(os){return new Set(os.map(function(o){return o.norm_key();})).size;}}
  ];
  function execute(g,seg,bg,pred,measure){
    var os=O.segment(g,seg,G.bgOr(g,bg));if(os.length>120)return null;
    return measure.run(os.filter(pred.fn));
  }
  function render(n,h,w,on,off,order){
    if(!Number.isInteger(n)||n<0||n>h*w||h<1||w<1||h>60||w>60)return null;
    var out=G.constGrid(h,w,off),cells=[],r,c;
    if(order==='column')for(c=0;c<w;c++)for(r=0;r<h;r++)cells.push([r,c]);
    else for(r=0;r<h;r++)for(c=0;c<w;c++)cells.push([r,c]);
    if(order==='reverse')cells.reverse();
    if(order==='snake')cells=cells.map(function(p){return [p[0],p[0]%2?w-1-p[1]:p[1]];});
    for(var i=0;i<n;i++)out[cells[i][0]][cells[i][1]]=on;
    return out;
  }
  function generate(ctx){
    var shape=ctx.const_out_shape();
    if(!shape||shape[0]*shape[1]>100||G.csSize(ctx.out_palette())>4)return [];
    var palettes=ctx.outputs().map(function(g){return G.csSize(G.palette(g));});
    if(palettes.some(function(n){return n>2;}))return [];
    var predicates=atoms(ctx),colors=G.csList(ctx.out_palette()),segs=['c4','c8','m4','m8'];
    var bgs=[null];if(ctx.bg()!==null)bgs.push(ctx.bg());
    var out=[],seen=new Map(),all=ctx.all_inputs(),n=ctx.train.length;
    for(var bi=0;bi<bgs.length;bi++)for(var si=0;si<segs.length;si++){
      if(ctx.timed_out())return out;
      var bg=bgs[bi],seg=segs[si],sets=all.map(function(g){return O.segment(g,seg,G.bgOr(g,bg));});
      if(sets.some(function(s){return s.length>120;}))continue;
      for(var pi=0;pi<predicates.length;pi++){
        if(ctx.timed_out())return out;
        var p=predicates[pi],selected=sets.map(function(s){return s.filter(p.fn);});
        for(var mi=0;mi<measures.length;mi++){
          var measure=measures[mi],ns=selected.map(measure.run);
          if(ns.some(function(v){return v<0||v>shape[0]*shape[1];}))continue;
          var signature=ns.join(','),cost=1.8+p.cost+measure.cost;
          if(new Set(ns.slice(0,n)).size<2)cost+=4;
          if(seen.has(signature)&&seen.get(signature)<=cost)continue;seen.set(signature,cost);
          for(var ci=0;ci<colors.length;ci++)for(var cj=0;cj<colors.length;cj++)if(ci!==cj)
            for(var oi=0;oi<4;oi++){
              var on=colors[ci],off=colors[cj],order=['row','column','reverse','snake'][oi],ok=true;
              for(var t=0;t<n;t++)if(!G.gEq(render(ns[t],shape[0],shape[1],on,off,order),ctx.train[t][1])){ok=false;break;}
              if(!ok)continue;
              var fn=(function(s,b,pr,m,h,w,c,d,o){return function(g){var value=execute(g,s,b,pr,m);return value===null?null:render(value,h,w,c,d,o);};})(seg,bg,p,measure,shape[0],shape[1],on,off,order);
              var hp=new Hyp('render('+order+','+measure.name+'(filter('+p.name+','+seg+')),'+on+','+off+')',fn,cost,'reductions');
              hp.ast={type:'Grid',op:'render',shape:shape.slice(),order:order,colors:[on,off],
                value:{type:'Integer',op:measure.name,input:{type:'ObjectSet',op:'filter',predicate:p.name,seg:seg,bg:bg}}};
              if(hp.fits(ctx.train))out.push(hp);
            }
        }
      }
    }
    return out;
  }
  defSolver('reductions','reductions',generate,1,0.25);
  return {atoms:atoms,measures:measures,execute:execute,render:render,generate:generate};
})();

