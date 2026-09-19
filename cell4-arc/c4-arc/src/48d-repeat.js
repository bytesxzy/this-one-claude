/* ===== src/48d-repeat.js ===== */
/* Port of engine/solvers/repeat.py -- motifs repeated until the edge.
 *
 * A shape that marches across the grid is one of the last large same-shape
 * families the engine cannot state. A cell rule cannot: the n-th copy is at a
 * distance no neighbourhood sees. An iterated cell rule cannot either, because
 * the copies do not touch.
 *
 * What connects them is a STEP VECTOR, and the point is that the step is
 * derived, never searched: a free search over displacements would find a step
 * for almost any pair of grids and explain nothing. Every derivation here is a
 * function of the input alone -- the motif's own bounding box in each of eight
 * directions, the same with a one-cell gap, a single cell, the displacement to
 * its nearest neighbour, and its own extent pointed AT that neighbour, which
 * is how "repeat toward the marker" is said without naming a direction.
  *
 * NOT REGISTERED. Probed on its own it fits two of the 400 public ARC-AGI-1
 * tasks and is right about one, which the engine already solves; against the
 * 162 it still misses, zero fits. Kept for the record, not for the portfolio.
*/

var REPEAT = null;

(function () {
  var MODES = ["c8", "m8", "color"];
  var MAX_OBJS = 24;
  var BASE_COST = 1.4;
  var DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1],
              [-1, -1], [-1, 1], [1, -1], [1, 1]];
  var KINDS = ["bbox", "gap1", "step1"];
  var SELECTORS = ["all", "largest", "unique_shape", "multi"];
  var TINTS = ["own", "marker"];
  /* whether a copy may land on top of something already there: painting only
     the background is a genuinely different rule, not a detail */
  var OVER = ["any", "bg"];

  function cellsOf(o) {
    var out = [], it = o.cells.values(), s = it.next();
    while (!s.done) { out.push([s.value >> 6, s.value & 63]); s = it.next(); }
    return out;
  }

  function nearest(o, objs) {
    var best = null, bd = null, i;
    for (i = 0; i < objs.length; i++) {
      if (objs[i] === o) continue;
      var d = Math.abs(o.r0 - objs[i].r0) + Math.abs(o.c0 - objs[i].c0);
      if (bd === null || d < bd) { bd = d; best = objs[i]; }
    }
    return best;
  }

  function steps(o, objs) {
    var out = {}, di, ki;
    var h = o.height(), w = o.width();
    for (di = 0; di < DIRS.length; di++) {
      var dr = DIRS[di][0], dc = DIRS[di][1];
      for (ki = 0; ki < KINDS.length; ki++) {
        var kind = KINDS[ki], t;
        if (kind === "bbox") t = [dr * h, dc * w];
        else if (kind === "gap1") t = [dr * (h + 1), dc * (w + 1)];
        else t = [dr, dc];
        if (t[0] !== 0 || t[1] !== 0) out[kind + di] = t;
      }
    }
    var nr = nearest(o, objs);
    if (nr !== null) {
      var t2 = [nr.r0 - o.r0, nr.c0 - o.c0];
      if (t2[0] !== 0 || t2[1] !== 0) {
        out.to_near = t2;
        out.from_near = [-t2[0], -t2[1]];
      }
      var sr = (nr.r0 > o.r0 ? 1 : 0) - (nr.r0 < o.r0 ? 1 : 0);
      var sc = (nr.c0 > o.c0 ? 1 : 0) - (nr.c0 < o.c0 ? 1 : 0);
      if (sr !== 0 || sc !== 0) {
        out.toward = [sr * h, sc * w];
        out.toward1 = [sr * (h + 1), sc * (w + 1)];
        out.away = [-sr * h, -sc * w];
      }
    }
    return out;
  }

  function selected(objs, which) {
    var i;
    if (which === "all") return objs;
    if (which === "largest") {
      var top = 0;
      for (i = 0; i < objs.length; i++) top = Math.max(top, objs[i].size());
      return objs.filter(function (o) { return o.size() === top; });
    }
    if (which === "unique_shape") {
      var seen = {};
      for (i = 0; i < objs.length; i++) {
        var k = objs[i].norm_key();
        seen[k] = (seen[k] || 0) + 1;
      }
      return objs.filter(function (o) { return seen[o.norm_key()] === 1; });
    }
    return objs.filter(function (o) { return o.size() > 1; });
  }

  /* Per-object step table and marker colour, computed once per grid. Hoisted
     out of stamp() deliberately: the enumeration tries a few hundred
     candidates against the same segmentation, and re-deriving every step for
     every candidate was most of the module's running time. */
  function planOf(objs) {
    var st = [], mk = [], i;
    for (i = 0; i < objs.length; i++) {
      st.push(steps(objs[i], objs));
      var nr = nearest(objs[i], objs);
      mk.push(nr === null ? null : nr.color);
    }
    return { steps: st, marker: mk, objs: objs };
  }

  function stamp(g, objs, sel, name, tint, over, plan, bg) {
    var h = G.gh(g), w = G.gw(g);
    var out = g.map(function (row) { return row.slice(); });
    var painted = false, i, j;
    for (i = 0; i < sel.length; i++) {
      var o = sel[i], oi = plan.objs.indexOf(o);
      var step = plan.steps[oi][name];
      if (!step) continue;
      var colour = null;
      if (tint === "marker") {
        colour = plan.marker[oi];
        if (colour === null) continue;
      }
      var cells = cellsOf(o), k = 1;
      while (k <= 60) {
        var dr = step[0] * k, dc = step[1] * k, hit = false;
        for (j = 0; j < cells.length; j++) {
          var rr = cells[j][0] + dr, cc = cells[j][1] + dc;
          if (rr >= 0 && rr < h && cc >= 0 && cc < w) {
            hit = true;
            /* a stamp that marches across the markers that placed it destroys
               the evidence it was derived from */
            if (over === "bg" && g[rr][cc] !== bg) continue;
            out[rr][cc] = colour === null ? g[cells[j][0]][cells[j][1]] : colour;
            painted = true;
          }
        }
        if (!hit) break;
        k++;
      }
    }
    return [out, painted];
  }

  function fitPairs(pairs, bg, deadline) {
    var out = [], segs = {}, mi, i, k;
    for (mi = 0; mi < MODES.length; mi++) {
      var mode = MODES[mi];
      if (deadline && Date.now() / 1000 >= deadline) return out;
      var per = [], ok = true;
      for (i = 0; i < pairs.length; i++) {
        var a = pairs[i][0];
        var field = (bg === null || bg === undefined) ? G.background(a) : bg;
        var objs;
        try { objs = O.segment(a, mode, field); } catch (e) { ok = false; break; }
        if (!objs || !objs.length || objs.length > MAX_OBJS) { ok = false; break; }
        per.push([objs, field]);
      }
      if (!ok) continue;
      var key = per.map(function (p) {
        return p[0].map(function (o) {
          return Array.from(o.cells).sort(function (x, y) { return x - y; }).join(",");
        }).sort().join("|");
      }).join(";");
      if (segs[key]) continue;
      segs[key] = 1;
      var names = {};
      for (i = 0; i < per.length; i++) {
        for (k = 0; k < per[i][0].length; k++) {
          var st = steps(per[i][0][k], per[i][0]);
          Object.keys(st).forEach(function (n) { names[n] = 1; });
        }
      }
      var nameList = Object.keys(names).sort();
      var plans = per.map(function (p) { return planOf(p[0]); });
      for (var si = 0; si < SELECTORS.length; si++) {
        var sels = per.map(function (p) { return selected(p[0], SELECTORS[si]); });
        if (!sels.some(function (x) { return x.length; })) continue;
        for (var ni = 0; ni < nameList.length; ni++) {
          for (var ti = 0; ti < TINTS.length; ti++) {
            for (var oi2 = 0; oi2 < OVER.length; oi2++) {
              if (deadline && Date.now() / 1000 >= deadline) return out;
              var good = true, anyPaint = false;
              for (i = 0; i < pairs.length; i++) {
                var got = stamp(pairs[i][0], per[i][0], sels[i], nameList[ni],
                                TINTS[ti], OVER[oi2], plans[i], per[i][1]);
                anyPaint = anyPaint || got[1];
                if (!G.gEq(got[0], pairs[i][1])) { good = false; break; }
              }
              /* a rule that paints nothing "fits" any identity task and says
                 nothing at all */
              if (good && anyPaint) {
                out.push([mode, SELECTORS[si], nameList[ni], TINTS[ti], OVER[oi2]]);
              }
            }
          }
        }
      }
    }
    return out;
  }

  function apply(g, mode, which, name, tint, over, bg) {
    var field = (bg === null || bg === undefined) ? G.background(g) : bg;
    var objs = O.segment(g, mode, field);
    if (!objs || !objs.length || objs.length > MAX_OBJS) return null;
    var sel = selected(objs, which);
    if (!sel.length) return null;
    return stamp(g, objs, sel, name, tint, over, planOf(objs), field)[0];
  }

  function generate(ctx) {
    if (!ctx.same_shape()) return [];
    var res = [], bi, i;
    var pairs = ctx.train;
    var backgrounds = ctx.bg_varies() ? [ctx.bg(), null] : [ctx.bg()];
    for (bi = 0; bi < backgrounds.length; bi++) {
      var bg = backgrounds[bi];
      if (ctx.timed_out()) break;
      var fits;
      try { fits = fitPairs(pairs, bg, ctx.deadline); } catch (e) { continue; }
      var tag = bg === null ? "~" : "";
      for (i = 0; i < fits.length; i++) {
        var f = fits[i];
        res.push(new Hyp("repeat" + tag + "[" + f[0] + "/" + f[1] + "/" + f[2]
                         + "/" + f[3] + "/" + f[4] + "]",
                         (function (m, s, n, t, v, b) {
                           return function (g) { return apply(g, m, s, n, t, v, b); };
                         })(f[0], f[1], f[2], f[3], f[4], bg),
                         BASE_COST + (bg === null ? 0.3 : 0.0), "patterns"));
      }
    }
    return res;
  }

  REPEAT = { steps: steps, fitPairs: fitPairs, apply: apply, stamp: stamp,
             generate: generate };
  /* NOT registered, and the measurement is why: probed on its own this family
     fits two of the 400 public ARC-AGI-1 tasks, is right about one, and that
     one the engine already solves. Against the 162 it still misses: zero fits.
     The Python port carries the full reasoning. Kept, with its exports, so the
     next person to reach for "repeat the motif" can see what a principled
     version of it actually reached. */
})();

