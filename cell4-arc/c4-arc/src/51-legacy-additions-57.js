/* ===== GPT improvement: relational growth families ===== */
(function () {
  var _sr = mkHyp("satelliterays");
  var _fan = mkHyp("fanfill");
  function bg(g){var h={},best=null,bn=-1,r,c,v;for(r=0;r<g.length;r++)for(c=0;c<g[r].length;c++){v=g[r][c];h[v]=(h[v]||0)+1;}Object.keys(h).forEach(function(k){var v=+k;if(h[k]>bn||(h[k]===bn&&(best===null||v<best))){best=v;bn=h[k];}});return best;}
  function oneColor(g){var b=bg(g),seen={},r,c;for(r=0;r<g.length;r++)for(c=0;c<g[r].length;c++)if(g[r][c]!==b)seen[g[r][c]]=1;var ks=Object.keys(seen);return ks.length===1?+ks[0]:null;}
  function comps(g,col){var h=g.length,w=g[0].length,S={},r,c,k,out=[],q,p,pts,dirs=[[1,0],[-1,0],[0,1],[0,-1]],i,nr,nc;for(r=0;r<h;r++)for(c=0;c<w;c++)if(g[r][c]===col)S[r+','+c]=1;while(true){k=null;for(var kk in S){k=kk;break;}if(k===null)break;delete S[k];p=k.split(',').map(Number);q=[p];pts=[];while(q.length){p=q.pop();pts.push(p);for(i=0;i<4;i++){nr=p[0]+dirs[i][0];nc=p[1]+dirs[i][1];k=nr+','+nc;if(S[k]){delete S[k];q.push([nr,nc]);}}}out.push(pts);}return out;}
  function satApply(g){
    var b=bg(g),col=oneColor(g);if(col===null)return null;var cs=comps(g,col),anchors=[],i,j,pts,r0,r1,c0,c1,area;
    for(i=0;i<cs.length;i++){pts=cs[i];r0=1e9;r1=-1;c0=1e9;c1=-1;for(j=0;j<pts.length;j++){r0=Math.min(r0,pts[j][0]);r1=Math.max(r1,pts[j][0]);c0=Math.min(c0,pts[j][1]);c1=Math.max(c1,pts[j][1]);}area=(r1-r0+1)*(c1-c0+1);if(pts.length===area&&pts.length>=4)anchors.push([pts.length,pts,[r0,r1,c0,c1]]);}
    if(!anchors.length)return null;anchors.sort(function(a,b){return b[0]-a[0];});if(anchors.length>1&&anchors[0][0]===anchors[1][0])return null;
    var A=anchors[0][1],box=anchors[0][2],aset={},others=[],out=[],r,c,dr,dc,rr,cc,h=g.length,w=g[0].length;for(i=0;i<A.length;i++)aset[A[i][0]+','+A[i][1]]=1;
    for(i=0;i<cs.length;i++)for(j=0;j<cs[i].length;j++)if(!aset[cs[i][j][0]+','+cs[i][j][1]])others.push(cs[i][j]);if(!others.length)return null;for(r=0;r<h;r++)out.push(g[r].slice());
    r0=box[0];r1=box[1];c0=box[2];c1=box[3];for(i=0;i<others.length;i++){r=others[i][0];c=others[i][1];dr=r<r0?-1:r>r1?1:0;dc=c<c0?-1:c>c1?1:0;if(dr===0||dc===0)return null;rr=r+dr;cc=c+dc;while(rr>=0&&rr<h&&cc>=0&&cc<w){if(out[rr][cc]!==b&&out[rr][cc]!==col)return null;out[rr][cc]=col;rr+=dr;cc+=dc;}}
    return out;
  }
  function genSat(ctx){var t,p;for(t=0;t<ctx.train.length;t++){p=satApply(ctx.train[t][0]);if(p===null||!G.gEq(p,ctx.train[t][1]))return [];}return [_sr('diagonal_rays_away_from_anchor',satApply,1.1)];}

  function fanApply(g,paint){
    var b=bg(g),col=oneColor(g);if(col===null)return null;var pts=[],r,c,cols={},rs=[],h=g.length,w=g[0].length,out=[],end,d,cc;
    for(r=0;r<h;r++)for(c=0;c<w;c++)if(g[r][c]===col){pts.push([r,c]);cols[c]=1;rs.push(r);}if(Object.keys(cols).length!==1||!rs.length)return null;c=+Object.keys(cols)[0];rs.sort(function(a,b){return a-b;});for(r=1;r<rs.length;r++)if(rs[r]!==rs[r-1]+1)return null;if(rs[0]!==0)return null;end=rs[rs.length-1];for(r=0;r<h;r++)out.push(g[r].slice());
    for(r=0;r<=end;r++){d=end-r;for(cc=Math.max(0,c-d);cc<=Math.min(w-1,c+d);cc++)out[r][cc]=(Math.abs(cc-c)%2===0)?col:paint;}return out;
  }
  function genFan(ctx){if(!ctx.same_shape())return[];var pals=G.csList(ctx.out_palette()),out=[],i,t,p;for(i=0;i<pals.length;i++){var ok=true;for(t=0;t<ctx.train.length;t++){p=fanApply(ctx.train[t][0],pals[i]);if(p===null||!G.gEq(p,ctx.train[t][1])){ok=false;break;}}if(ok)out.push(_fan('vertical_spine_fan#'+pals[i],(function(c){return function(g){return fanApply(g,c);};})(pals[i]),1.1));}return out;}
  defSolver("satelliterays","satelliterays",genSat,1,0.05);
  defSolver("fanfill","fanfill",genFan,1,0.05);
})();



