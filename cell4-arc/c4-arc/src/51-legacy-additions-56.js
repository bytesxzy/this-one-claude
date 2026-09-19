/* ===== GPT improvement: fill enclosed square holes ===== */
(function () {
  var _sh = mkHyp("squareholes");
  function bg(g){var h={},best=null,bn=-1,r,c,v;for(r=0;r<g.length;r++)for(c=0;c<g[r].length;c++){v=g[r][c];h[v]=(h[v]||0)+1;}Object.keys(h).forEach(function(k){var v=+k;if(h[k]>bn||(h[k]===bn&&(best===null||v<best))){best=v;bn=h[k];}});return best;}
  function apply(g,paint){
    var h=g.length,w=g[0].length,b=bg(g),out=[],S={},r,c,k,q,p,pts,touch,dirs=[[1,0],[-1,0],[0,1],[0,-1]],i,nr,nc,r0,r1,c0,c1;
    for(r=0;r<h;r++){out.push(g[r].slice());for(c=0;c<w;c++)if(g[r][c]===b)S[r+','+c]=1;}
    while(true){k=null;for(var kk in S){k=kk;break;}if(k===null)break;delete S[k];p=k.split(',').map(Number);q=[p];pts=[];touch=false;
      while(q.length){p=q.pop();pts.push(p);if(p[0]===0||p[0]===h-1||p[1]===0||p[1]===w-1)touch=true;for(i=0;i<4;i++){nr=p[0]+dirs[i][0];nc=p[1]+dirs[i][1];k=nr+','+nc;if(S[k]){delete S[k];q.push([nr,nc]);}}}
      if(touch)continue;r0=1e9;r1=-1;c0=1e9;c1=-1;for(i=0;i<pts.length;i++){r0=Math.min(r0,pts[i][0]);r1=Math.max(r1,pts[i][0]);c0=Math.min(c0,pts[i][1]);c1=Math.max(c1,pts[i][1]);}
      if(r1-r0===c1-c0&&pts.length===(r1-r0+1)*(c1-c0+1))for(i=0;i<pts.length;i++)out[pts[i][0]][pts[i][1]]=paint;
    }return out;
  }
  function gen(ctx){if(!ctx.same_shape())return[];var pals=G.csList(ctx.out_palette()),out=[],i,t,ok;for(i=0;i<pals.length;i++){ok=true;for(t=0;t<ctx.train.length;t++)if(!G.gEq(apply(ctx.train[t][0],pals[i]),ctx.train[t][1])){ok=false;break;}if(ok)out.push(_sh('fill_square_holes#'+pals[i],(function(c){return function(g){return apply(g,c);};})(pals[i]),0.9));}return out;}
  defSolver("squareholes","squareholes",gen,1,0.05);
})();



