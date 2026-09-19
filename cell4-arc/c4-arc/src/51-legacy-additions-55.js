/* ===== GPT improvement: compact global classifiers/selectors ===== */
(function () {
  var _gc = mkHyp("globalclass");
  var _so = mkHyp("symobject");
  var _dc = mkHyp("dispersedcolor");

  function mc(g) {
    var h={},best=null,bn=-1,r,c,v;
    for(r=0;r<g.length;r++)for(c=0;c<g[r].length;c++){v=g[r][c];h[v]=(h[v]||0)+1;}
    Object.keys(h).forEach(function(k){var v=+k;if(h[k]>bn||(h[k]===bn&&(best===null||v<best))){bn=h[k];best=v;}});
    return best;
  }
  function flipV(g){var o=[],r;for(r=0;r<g.length;r++)o.push(g[r].slice().reverse());return o;}
  function flipH(g){var o=[],r;for(r=g.length-1;r>=0;r--)o.push(g[r].slice());return o;}
  function rot180(g){return flipV(flipH(g));}

  function genGlobalClass(ctx){
    var props=[
      ["mirror_v",function(g){return G.gEq(g,flipV(g));}],
      ["mirror_h",function(g){return G.gEq(g,flipH(g));}],
      ["rot180",function(g){return G.gEq(g,rot180(g));}]
    ], out=[],pi,t,map,k,y,ok,keys;
    for(pi=0;pi<props.length;pi++){
      map={};ok=true;
      for(t=0;t<ctx.train.length;t++){
        y=ctx.train[t][1]; if(y.length!==1||y[0].length!==1){ok=false;break;}
        k=props[pi][1](ctx.train[t][0])?"1":"0";
        if(Object.prototype.hasOwnProperty.call(map,k)&&map[k]!==y[0][0]){ok=false;break;}
        map[k]=y[0][0];
      }
      keys=Object.keys(map);
      if(ok&&keys.length===2){
        out.push(_gc("bool_"+props[pi][0],(function(fn,tb){return function(g){var kk=fn(g)?"1":"0";return Object.prototype.hasOwnProperty.call(tb,kk)?[[tb[kk]]]:null;};})(props[pi][1],map),2.2));
      }
    }
    return out;
  }

  function components(g){
    var h=g.length,w=g[0].length,b=mc(g),seen={},out=[],r,c,kk,col,q,p,pts,drdc=[[1,0],[-1,0],[0,1],[0,-1]],i,nr,nc;
    for(r=0;r<h;r++)for(c=0;c<w;c++){
      kk=r+","+c;if(seen[kk]||g[r][c]===b)continue;col=g[r][c];q=[[r,c]];seen[kk]=1;pts=[];
      while(q.length){p=q.pop();pts.push(p);for(i=0;i<4;i++){nr=p[0]+drdc[i][0];nc=p[1]+drdc[i][1];kk=nr+","+nc;if(nr>=0&&nr<h&&nc>=0&&nc<w&&!seen[kk]&&g[nr][nc]===col){seen[kk]=1;q.push([nr,nc]);}}}
      out.push([col,pts]);
    }
    return [b,out];
  }
  function patchOf(g,obj,b){
    var pts=obj[1],col=obj[0],r0=1e9,r1=-1,c0=1e9,c1=-1,S={},i,r,c,o=[],row;
    for(i=0;i<pts.length;i++){r=pts[i][0];c=pts[i][1];r0=Math.min(r0,r);r1=Math.max(r1,r);c0=Math.min(c0,c);c1=Math.max(c1,c);S[r+","+c]=1;}
    for(r=r0;r<=r1;r++){row=[];for(c=c0;c<=c1;c++)row.push(S[r+","+c]?col:b);o.push(row);}return o;
  }
  function uniqueSymObj(g){
    var z=components(g),b=z[0],cs=z[1],cand=[],i,p;
    for(i=0;i<cs.length;i++){
      if(cs[i][1].length<2)continue;
      p=patchOf(g,cs[i],b);
      if(G.gEq(p,flipV(p)))cand.push(p);
    }
    return cand.length===1?cand[0]:null;
  }
  function genSymObj(ctx){
    var t,p;
    for(t=0;t<ctx.train.length;t++){p=uniqueSymObj(ctx.train[t][0]);if(p===null||!G.gEq(p,ctx.train[t][1]))return [];}
    return [_so("unique_vertical_symmetric_component",uniqueSymObj,2.4)];
  }

  function compCount(g,col){
    var h=g.length,w=g[0].length,S={},r,c,n=0,q,p,dirs=[[1,0],[-1,0],[0,1],[0,-1]],i,nr,nc,kk;
    for(r=0;r<h;r++)for(c=0;c<w;c++)if(g[r][c]===col)S[r+","+c]=1;
    while(true){kk=null;for(var k in S){kk=k;break;}if(kk===null)break;delete S[kk];p=kk.split(',').map(Number);q=[p];n++;
      while(q.length){p=q.pop();for(i=0;i<4;i++){nr=p[0]+dirs[i][0];nc=p[1]+dirs[i][1];kk=nr+","+nc;if(S[kk]){delete S[kk];q.push([nr,nc]);}}}
    }return n;
  }
  function pickDispersed(g){
    var b=mc(g),cnt={},r,c,v,cols=[],best=-1,winners=[],ratio,n;
    for(r=0;r<g.length;r++)for(c=0;c<g[r].length;c++){v=g[r][c];cnt[v]=(cnt[v]||0)+1;}
    Object.keys(cnt).forEach(function(k){if(+k!==b)cols.push(+k);}); if(!cols.length)return null;
    for(var i=0;i<cols.length;i++){v=cols[i];n=compCount(g,v);ratio=n/cnt[v];if(ratio>best+1e-12){best=ratio;winners=[v];}else if(Math.abs(ratio-best)<=1e-12)winners.push(v);}
    return winners.length===1?[[winners[0]]]:null;
  }
  function genDispersed(ctx){var t,p;for(t=0;t<ctx.train.length;t++){p=pickDispersed(ctx.train[t][0]);if(p===null||!G.gEq(p,ctx.train[t][1]))return [];}return [_dc("max_component_density",pickDispersed,0.8)];}

  defSolver("globalclass", "globalclass", genGlobalClass, 1, 0.05);
  defSolver("symobject", "symobject", genSymObj, 1, 0.05);
  defSolver("dispersedcolor", "dispersedcolor", genDispersed, 1, 0.05);
})();



