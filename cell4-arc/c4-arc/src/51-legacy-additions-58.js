/* ===== GPT improvement: edge-relative alternating recolour ===== */
(function () {
  var _ep = mkHyp("edgeparity");
  function apply(g,src,dst,edge,par){
    var h=g.length,w=g[0].length,o=[],r,c,d;for(r=0;r<h;r++)o.push(g[r].slice());
    for(r=0;r<h;r++)for(c=0;c<w;c++){
      d=edge==='right'?(w-1-c):edge==='left'?c:edge==='bottom'?(h-1-r):r;
      if(g[r][c]===src&&(d%2)===par)o[r][c]=dst;
    }return o;
  }
  function gen(ctx){
    if(!ctx.same_shape())return[];var pal=G.csList(G.csUnion(ctx.in_palette(),ctx.out_palette())),edges=['right','left','top','bottom'],out=[],i,j,e,par,t,ok;
    for(i=0;i<pal.length;i++)for(j=0;j<pal.length;j++)if(i!==j)for(e=0;e<edges.length;e++)for(par=0;par<2;par++){
      ok=true;for(t=0;t<ctx.train.length;t++)if(!G.gEq(apply(ctx.train[t][0],pal[i],pal[j],edges[e],par),ctx.train[t][1])){ok=false;break;}
      if(ok)out.push(_ep('recolor_'+pal[i]+'_'+pal[j]+'_'+edges[e]+'_p'+par,(function(a,b,ed,p){return function(g){return apply(g,a,b,ed,p);};})(pal[i],pal[j],edges[e],par),1.0));
    }return out;
  }
  defSolver("edgeparity","edgeparity",gen,1,0.05);
})();

