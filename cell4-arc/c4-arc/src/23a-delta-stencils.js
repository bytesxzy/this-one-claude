/* ===== src/23a-delta-stencils.js ===== */
/* Port of engine/solvers/delta_stencils.py -- sparse reusable object stamps.
 *
 * No output segmentation is needed: touching stamps may be one component, and
 * a stamp may be disconnected from its seed. Each offset must agree at EVERY
 * training instance of its seed key and explain at least two observed changes.
 * A deterministic set cover keeps only the offsets needed to reconstruct the
 * training pairs. Foreground is an occluder, clipping is allowed, and
 * conflicting stamps on a new input cause abstention rather than an
 * order-dependent answer.
 *
 * That discipline is the whole difference between this and a lookup table from
 * object key to output patch, which was tried and measured: realisable on 51
 * of 119 unsolved tasks, surviving a held-out refit on 9, and solving 0. A
 * table memorises a patch; this learns offsets that have to hold everywhere.
 */

var DELTA_STENCILS = null;

(function () {
  var KEYS = ["mask", "patch", "color", "size", "dims", "holes", "size_rank",
              "shape_rank"];
  var SEED_COLOR = -1;
  var MAX_CANDIDATES = 8192;
  var MAX_CHECKS = 250000;
  var MAX_STENCIL = 128;
  var MAX_OBJECTS = 60;

  function keyOf(o, kind, shared) {
    if (kind === "size_rank") return String(shared.sizes.indexOf(o.size()));
    if (kind === "shape_rank") return String(shared.shapeRank[keyMask(o)]);
    if (kind === "holes") return String(o.holes_count());
    if (kind === "dims") return o.height() + "x" + o.width();
    if (kind === "color") return String(o.color);
    if (kind === "size") return String(o.size());
    if (kind === "mask") return keyMask(o);
    if (kind === "patch") return JSON.stringify(o.patch());
    throw new Error("unknown stencil key: " + kind);
  }

  function keyMask(o) { return JSON.stringify(o.mask()); }

  function sharedOf(objs) {
    var sizes = objs.map(function (o) { return o.size(); })
                    .sort(function (a, b) { return b - a; });
    var counts = {}, i;
    for (i = 0; i < objs.length; i++) {
      var m = keyMask(objs[i]);
      counts[m] = (counts[m] || 0) + 1;
    }
    var order = Object.keys(counts).sort(function (a, b) {
      return counts[b] - counts[a] || (a < b ? -1 : a > b ? 1 : 0); });
    var rank = {};
    for (i = 0; i < order.length; i++) rank[order[i]] = i;
    return { sizes: sizes, shapeRank: rank };
  }

  /* Every changed cell must have been background before: this family explains
     DRAWING, and a change that overwrote foreground is a different rule. */
  function scenes(train, seg, bg) {
    var out = [], universe = {}, nUniverse = 0, i, r, c;
    for (i = 0; i < train.length; i++) {
      var a = train[i][0], b = train[i][1];
      if (G.gh(a) !== G.gh(b) || G.gw(a) !== G.gw(b)) return null;
      var localBg = G.bgOr(a, bg), h = G.gh(a), w = G.gw(a), changes = [];
      for (r = 0; r < h; r++) {
        for (c = 0; c < w; c++) {
          if (a[r][c] !== b[r][c]) {
            if (a[r][c] !== localBg) return null;
            changes.push([r, c, b[r][c]]);
            var k = i + "|" + r + "|" + c;
            if (!(k in universe)) { universe[k] = 1; nUniverse++; }
          }
        }
      }
      var objs;
      try { objs = O.segment(a, seg, localBg); } catch (e) { return null; }
      if (!objs || !objs.length || objs.length > MAX_OBJECTS) return null;
      out.push({ a: a, b: b, bg: localBg, objs: objs, changes: changes });
    }
    if (nUniverse < 2) return null;
    return { scenes: out, universe: universe, nUniverse: nUniverse };
  }

  function fitPairs(train, seg, kind, bg, timedOut) {
    timedOut = timedOut || function () { return false; };
    var prepared = scenes(train, seg, bg);
    if (prepared === null || timedOut()) return null;
    var sc = prepared.scenes, universe = prepared.universe;
    var groups = {}, order = [], i, j;
    for (i = 0; i < sc.length; i++) {
      var shared = sharedOf(sc[i].objs);
      for (j = 0; j < sc[i].objs.length; j++) {
        var key = keyOf(sc[i].objs[j], kind, shared);
        if (!(key in groups)) { groups[key] = []; order.push(key); }
        groups[key].push([i, sc[i].objs[j]]);
      }
    }
    var total = 0;
    for (i = 0; i < order.length; i++) total += groups[order[i]].length;
    /* every object in its own group learns nothing reusable */
    if (order.length >= total) return null;

    var candidates = [], checks = 0, rawCount = 0, ki;
    for (ki = 0; ki < order.length; ki++) {
      if (timedOut()) return null;
      var instances = groups[order[ki]], raw = {};
      for (i = 0; i < instances.length; i++) {
        var o = instances[i][1], ch = sc[instances[i][0]].changes;
        for (j = 0; j < ch.length; j++) {
          raw[(ch[j][0] - o.r0) + "," + (ch[j][1] - o.c0) + "," + ch[j][2]] = 1;
          if (ch[j][2] === o.color) {
            raw[(ch[j][0] - o.r0) + "," + (ch[j][1] - o.c0) + "," + SEED_COLOR] = 1;
          }
        }
      }
      var rawKeys = Object.keys(raw).map(function (s) {
        var p = s.split(","); return [+p[0], +p[1], +p[2]];
      }).sort(function (x, y) {
        return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; });
      rawCount += rawKeys.length;
      if (rawCount > MAX_CANDIDATES) return null;
      for (var q = 0; q < rawKeys.length; q++) {
        var dr = rawKeys[q][0], dc = rawKeys[q][1], colour = rawKeys[q][2];
        var covered = {}, nCovered = 0, support = 0, valid = true;
        for (i = 0; i < instances.length; i++) {
          checks++;
          if (checks > MAX_CHECKS) return null;
          var si = instances[i][0], ob = instances[i][1], s = sc[si];
          var rr = ob.r0 + dr, cc = ob.c0 + dc;
          if (!(rr >= 0 && rr < G.gh(s.a) && cc >= 0 && cc < G.gw(s.a))) continue;
          /* drawing acts only on the original background, so another seed can
             hide part of the learned motif */
          if (s.a[rr][cc] !== s.bg) continue;
          var v = colour === SEED_COLOR ? ob.color : colour;
          if (s.b[rr][cc] !== v) { valid = false; break; }
          if (s.a[rr][cc] !== s.b[rr][cc]) {
            var uk = si + "|" + rr + "|" + cc;
            if (!(uk in covered)) { covered[uk] = 1; nCovered++; }
            support++;
          }
        }
        if (valid && support >= 2 && nCovered >= 2) {
          /* stable ties: a nearby offset first, and copying the seed colour
             before introducing a literal one */
          candidates.push({
            key: order[ki], stamp: [dr, dc, colour], covered: covered,
            n: nCovered,
            order: [Math.abs(dr) + Math.abs(dc), colour === SEED_COLOR ? 0 : 1,
                    dr, dc, colour, ki]
          });
        }
      }
    }
    if (!candidates.length) return null;

    function cmp(a, b) {
      for (var i2 = 0; i2 < a.length; i2++) {
        if (a[i2] !== b[i2]) return a[i2] - b[i2];
      }
      return 0;
    }

    var uncovered = {}, nLeft = 0, k2;
    for (k2 in universe) {
      if (Object.prototype.hasOwnProperty.call(universe, k2)) {
        uncovered[k2] = 1; nLeft++;
      }
    }
    var selected = [];
    while (nLeft > 0) {
      if (timedOut() || selected.length >= MAX_STENCIL) return null;
      var best = null, bestScore = null;
      for (i = 0; i < candidates.length; i++) {
        var gain = 0;
        for (k2 in candidates[i].covered) {
          if (k2 in uncovered) gain++;
        }
        if (!gain) continue;
        var score = [-gain].concat(candidates[i].order);
        if (bestScore === null || cmp(score, bestScore) < 0) {
          best = candidates[i]; bestScore = score;
        }
      }
      if (best === null) return null;
      selected.push(best);
      for (k2 in best.covered) {
        if (k2 in uncovered) { delete uncovered[k2]; nLeft--; }
      }
    }

    /* greedy cover can make an earlier choice redundant; drop it rather than
       keep paint that explains nothing the others do not */
    for (i = selected.length - 1; i >= 0; i--) {
      var others = {};
      for (j = 0; j < selected.length; j++) {
        if (j === i) continue;
        for (k2 in selected[j].covered) others[k2] = 1;
      }
      var complete = true;
      for (k2 in universe) {
        if (!(k2 in others)) { complete = false; break; }
      }
      if (complete) selected.splice(i, 1);
    }
    if (selected.length >= prepared.nUniverse) return null;

    var table = {};
    for (i = 0; i < order.length; i++) table[order[i]] = [];
    for (i = 0; i < selected.length; i++) {
      table[selected[i].key].push(selected[i].stamp);
    }
    for (i = 0; i < order.length; i++) {
      table[order[i]].sort(function (x, y) {
        return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; });
    }
    for (i = 0; i < train.length; i++) {
      var got = applyTable(train[i][0], seg, kind, table, bg);
      if (got === null || !G.gEq(got, train[i][1])) return null;
    }
    return table;
  }

  function applyTable(g, seg, kind, table, bg) {
    var localBg = G.bgOr(g, bg), objs;
    try { objs = O.segment(g, seg, localBg); } catch (e) { return null; }
    if (!objs || !objs.length || objs.length > MAX_OBJECTS) return null;
    var h = G.gh(g), w = G.gw(g), shared = sharedOf(objs);
    var paint = {}, i, j;
    for (i = 0; i < objs.length; i++) {
      var key = keyOf(objs[i], kind, shared);
      if (!Object.prototype.hasOwnProperty.call(table, key)) return null;
      var stamps = table[key];
      for (j = 0; j < stamps.length; j++) {
        var r = objs[i].r0 + stamps[j][0], c = objs[i].c0 + stamps[j][1];
        if (!(r >= 0 && r < h && c >= 0 && c < w) || g[r][c] !== localBg) continue;
        var v = stamps[j][2] === SEED_COLOR ? objs[i].color : stamps[j][2];
        var pk = r + "|" + c;
        /* two seeds disagreeing about one cell is an abstention, not a race */
        if (pk in paint && paint[pk] !== v) return null;
        paint[pk] = v;
      }
    }
    var out = g.map(function (row) { return row.slice(); });
    for (var p in paint) {
      var xy = p.split("|");
      out[+xy[0]][+xy[1]] = paint[p];
    }
    return out;
  }

  function nStamps(table) {
    var n = 0;
    for (var k in table) n += table[k].length;
    return n;
  }

  function generate(ctx) {
    if (!ctx.same_shape()) return [];
    var res = [], bgs = ctx.bg_varies() ? [ctx.bg(), null] : [ctx.bg()];
    var segs = ["c8", "m8", "c4", "cells"], bi, si, ki;
    for (bi = 0; bi < bgs.length; bi++) {
      for (si = 0; si < segs.length; si++) {
        if (ctx.timed_out()) return res;
        var seen = {};
        for (ki = 0; ki < KEYS.length; ki++) {
          if (ctx.timed_out()) return res;
          var table;
          try {
            table = fitPairs(ctx.train, segs[si], KEYS[ki], bgs[bi],
                             function () { return ctx.timed_out(); });
          } catch (e) { table = null; }
          if (table === null) continue;
          var sig = KEYS[ki] + JSON.stringify(table);
          if (seen[sig]) continue;
          seen[sig] = 1;
          var nk = Object.keys(table).length;
          res.push(new Hyp(
            "subst_delta_" + segs[si] + "_" + KEYS[ki],
            (function (sg, kd, tb, b) {
              return function (g) { return applyTable(g, sg, kd, tb, b); };
            })(segs[si], KEYS[ki], table, bgs[bi]),
            4.2 + 0.1 * nk + 0.02 * nStamps(table), "objects"));
        }
      }
    }
    return res;
  }

  DELTA_STENCILS = { KEYS: KEYS, fitPairs: fitPairs, apply: applyTable,
                     SEED_COLOR: SEED_COLOR };
  defSolver("delta_stencils", "objects", generate, 2);
})();

