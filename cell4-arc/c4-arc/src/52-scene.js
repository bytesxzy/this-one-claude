/* ===== src/52-scene.js ===== */
/* Per-search relational scene values. No task identity or persistent memory. */
var SCENE = (function () {
  var transforms = [function(g){return g;}, G.rot90, G.rot180, G.rot270,
    G.flipH, G.flipV, G.transpose, G.antiTranspose];
  function canonical(o, bg) {
    var g=o.filled(bg).map(function(row){return row.map(function(v){return v===bg?0:1;});});
    return transforms.map(function(f){return G.gkey(f(g));}).sort()[0];
  }
  function make(g, mode, bg) {
    bg=G.bgOr(g,bg);
    var objects=O.segment(g,mode||'m4',bg);
    if(objects.length>80) return null;
    var nodes=objects.map(function(o,i){return {type:'Object',index:i,object:o,
      bbox:[o.r0,o.c0,o.r1,o.c1],size:o.size(),height:o.height(),width:o.width(),
      holes:o.holes_count(),color:o.color,shape:canonical(o,bg),
      border:o.touches_border(),degree:0,contains:0,contained:0};});
    var edges=[];
    for(var i=0;i<nodes.length;i++) for(var j=i+1;j<nodes.length;j++) {
      var a=nodes[i],b=nodes[j],aa=a.bbox,bb=b.bbox;
      var dr=Math.max(0,aa[0]-bb[2],bb[0]-aa[2]);
      var dc=Math.max(0,aa[1]-bb[3],bb[1]-aa[3]);
      var ac=aa[0]<=bb[0]&&aa[1]<=bb[1]&&aa[2]>=bb[2]&&aa[3]>=bb[3];
      var bc=bb[0]<=aa[0]&&bb[1]<=aa[1]&&bb[2]>=aa[2]&&bb[3]>=aa[3];
      var edge={type:'Relation',a:i,b:j,distance:dr+dc,
        rowAligned:aa[0]+aa[2]===bb[0]+bb[2],columnAligned:aa[1]+aa[3]===bb[1]+bb[3],
        sameShape:a.shape===b.shape,sameColor:a.color===b.color,
        bboxOverlap:dr===0&&dc===0,aContainsB:ac,bContainsA:bc};
      // Bounding-box containment is explicitly separate from mask containment.
      if(ac){a.contains++;b.contained++;}if(bc){b.contains++;a.contained++;}
      if(edge.rowAligned||edge.columnAligned){a.degree++;b.degree++;}
      edges.push(edge);
    }
    return {type:'Scene',grid:g,bg:bg,nodes:nodes,edges:edges};
  }
  function select(scene,key,max) {
    if(!scene||!scene.nodes.length)return null;
    var vals=scene.nodes.map(function(n){
      if(key==='shapeFrequency') return scene.nodes.filter(function(m){return m.shape===n.shape;}).length;
      if(key==='colorFrequency') return scene.nodes.filter(function(m){return m.color===n.color;}).length;
      return n[key];
    });
    var best=max?Math.max.apply(null,vals):Math.min.apply(null,vals);
    var indices=[];vals.forEach(function(v,i){if(v===best)indices.push(i);});
    return indices.length===1?scene.nodes[indices[0]]:null;
  }
  function cache() {
    var memo=new Map();
    return function(g,mode,bg){var k=G.gkey(g)+'#'+mode+'#'+bg;
      if(!memo.has(k)){if(memo.size>=128)memo.clear();memo.set(k,make(g,mode,bg));}
      return memo.get(k);
    };
  }
  // Align fragments by a shared marker mask, then overlay with explicit
  // conflict rejection. Coordinates remain relative to the marker.
  function align(g,mode,marker,erase) {
    var bg=G.background(g),os=O.segment(g,mode,bg);
    if(os.length<2||os.length>30)return null;
    if(marker===null){
      var common=os.reduce(function(p,o){return p&o.colors();},1023);
      var colors=G.csList(common);if(colors.length!==1)return null;marker=colors[0];
    }
    var writes=new Map(),markerShape=null,r0=Infinity,c0=Infinity,r1=-Infinity,c1=-Infinity;
    for(var i=0;i<os.length;i++){
      var points=Array.from(os[i].cells).map(function(p){return [p>>6,p&63];});
      var marks=points.filter(function(p){return g[p[0]][p[1]]===marker;});
      if(!marks.length)return null;
      var ar=Math.min.apply(null,marks.map(function(p){return p[0];})),ac=Math.min.apply(null,marks.map(function(p){return p[1];}));
      var shape=marks.map(function(p){return (p[0]-ar)+','+(p[1]-ac);}).sort().join(';');
      if(markerShape!==null&&shape!==markerShape)return null;markerShape=shape;
      for(var j=0;j<points.length;j++){
        var p=points[j],r=p[0]-ar,c=p[1]-ac,v=g[p[0]][p[1]],k=r+','+c;
        if(erase&&v===marker)continue;
        if(writes.has(k)&&writes.get(k)!==v)return null;
        writes.set(k,v);r0=Math.min(r0,r);r1=Math.max(r1,r);c0=Math.min(c0,c);c1=Math.max(c1,c);
      }
    }
    if(!writes.size||r1-r0>=60||c1-c0>=60)return null;
    var out=G.constGrid(r1-r0+1,c1-c0+1,bg);
    writes.forEach(function(v,k){var p=k.split(',').map(Number);out[p[0]-r0][p[1]-c0]=v;});
    return out;
  }
  return {make:make,select:select,cache:cache,canonical:canonical,align:align};
})();
