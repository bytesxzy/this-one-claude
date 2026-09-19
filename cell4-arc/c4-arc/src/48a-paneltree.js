/* ===== src/48a-paneltree.js ===== */
/* Port of engine/solvers/paneltree.py -- rules learned per *panel*.
 *
 * celltree explains a grid one cell at a time, which is the wrong unit for a
 * recognisable family: the grid is a lattice of panels and the rule is stated
 * about panels -- "copy the one with a motif into the empty ones", "clear
 * every panel that is not the odd one out", "shift the contents one panel
 * right". Expressed per cell those need a conjunction over the whole panel,
 * which is the shape of conjunction that memorises; per panel each is a two-
 * or three-way decision.
 *
 * The label vocabulary is closed -- keep, clear, fill, copy, paint, recolour,
 * flip, over structurally named source panels -- and that is the capacity
 * control: no label in it can encode an arbitrary grid, so a fitted tree
 * cannot memorise one. A panel whose output matches no label means the task is
 * not of this shape, and the module declines rather than inventing one.
 */

var PANELTREE = null;

(function () {
  var OOB = -1;
  var MAX_PANELS = 400;
  var FEATURE_BITS = [2.0, 3.0, 3.0, 3.5, 4.0, 4.0, 4.0, 4.0, 4.0, 3.0, 3.5,
                      3.5, 3.0, 3.0, 2.5, 2.5, 4.0, 4.0, 3.5, 3.0, 3.5, 4.0,
                      3.0, 3.0, 3.0];
  var NFEAT = FEATURE_BITS.length;
  var OFFSETS = [[0, 1], [0, -1], [1, 0], [-1, 0],
                 [1, 1], [-1, -1], [1, -1], [-1, 1]];
  /* most general first: order is what keeps one rule from being written down
     as three labels */
  var SOURCES = ["all_major", "all", "band_major", "stack_major", "band",
                 "stack", "self"].concat(OFFSETS.map(function (o) {
    return "at" + o[0] + "," + o[1];
  }));

  function key(v) {
    return v.map(function (row) { return row.join(","); }).join("/");
  }

  function panels(g, bg) {
    var d = G.dims(g), h = d[0], w = d[1];
    var L = CELLTREE.lattice(g, bg, h, w), rr = L[2], cc = L[3];
    if (!rr.length || !cc.length) return null;
    var n = rr.length * cc.length;
    return (n < 2 || n > MAX_PANELS) ? null : [rr, cc];
  }

  function content(g, rr, cc, i, j) {
    var out = [], r;
    for (r = rr[i][0]; r <= rr[i][1]; r++) out.push(g[r].slice(cc[j][0], cc[j][1] + 1));
    return out;
  }

  function nonEmpty(v, bg) {
    var r, c;
    for (r = 0; r < v.length; r++) for (c = 0; c < v[r].length; c++)
      if (v[r][c] !== bg) return true;
    return false;
  }

  function consensus(list, bg) {
    var live = list.filter(function (v) { return nonEmpty(v, bg); }), i;
    if (!live.length) return null;
    var first = key(live[0]);
    for (i = 1; i < live.length; i++) if (key(live[i]) !== first) return null;
    return live[0];
  }

  /* the content most non-empty panels carry, when one is strictly ahead */
  function majority(list, bg) {
    var live = list.filter(function (v) { return nonEmpty(v, bg); });
    if (!live.length) return null;
    var freq = {}, rep = {}, i;
    for (i = 0; i < live.length; i++) {
      var k = key(live[i]);
      freq[k] = (freq[k] || 0) + 1;
      rep[k] = live[i];
    }
    var best = 0, top = [];
    for (var k2 in freq) if (freq.hasOwnProperty(k2)) {
      if (freq[k2] > best) { best = freq[k2]; top = [k2]; }
      else if (freq[k2] === best) top.push(k2);
    }
    return top.length === 1 ? rep[top[0]] : null;
  }

  function describe(g, bg) {
    var P = panels(g, bg);
    if (!P) return null;
    var rr = P[0], cc = P[1], ni = rr.length, nj = cc.length, i, j;
    var cont = {}, fill = {};
    for (i = 0; i < ni; i++) for (j = 0; j < nj; j++) {
      var v = content(g, rr, cc, i, j);
      cont[i + "," + j] = v;
      var n = 0, r, c;
      for (r = 0; r < v.length; r++) for (c = 0; c < v[r].length; c++)
        if (v[r][c] !== bg) n++;
      fill[i + "," + j] = n;
    }
    var band = {}, stack = {}, bandMaj = {}, stackMaj = {}, all = [];
    for (i = 0; i < ni; i++) {
      var row = [];
      for (j = 0; j < nj; j++) { row.push(cont[i + "," + j]); all.push(cont[i + "," + j]); }
      band[i] = consensus(row, bg);
      bandMaj[i] = majority(row, bg);
    }
    for (j = 0; j < nj; j++) {
      var col = [];
      for (i = 0; i < ni; i++) col.push(cont[i + "," + j]);
      stack[j] = consensus(col, bg);
      stackMaj[j] = majority(col, bg);
    }
    /* hoisted out of the per-panel loop: recomputing these per panel makes the
       module quadratic in panel count */
    var freq = {}, live = [];
    for (i = 0; i < ni; i++) for (j = 0; j < nj; j++) {
      var kk = key(cont[i + "," + j]);
      freq[kk] = (freq[kk] || 0) + 1;
      if (fill[i + "," + j] > 0) live.push([i, j]);
    }
    var ranks = {};
    Object.keys(freq).sort(function (a, b) {
      return (freq[b] - freq[a]) || (a < b ? -1 : a > b ? 1 : 0);
    }).forEach(function (k, idx) { ranks[k] = idx; });
    var bandLive = {}, stackLive = {};
    for (i = 0; i < ni; i++) {
      bandLive[i] = [];
      for (j = 0; j < nj; j++) if (fill[i + "," + j] > 0) bandLive[i].push(j);
    }
    for (j = 0; j < nj; j++) {
      stackLive[j] = [];
      for (i = 0; i < ni; i++) if (fill[i + "," + j] > 0) stackLive[j].push(i);
    }
    return { rr: rr, cc: cc, ni: ni, nj: nj, content: cont, fill: fill,
             band: band, stack: stack, whole: consensus(all, bg),
             band_maj: bandMaj, stack_maj: stackMaj, whole_maj: majority(all, bg),
             freq: freq, ranks: ranks, bandLive: bandLive, stackLive: stackLive,
             live: live, bg: bg };
  }

  function source(d, name, i, j) {
    if (name === "self") return d.content[i + "," + j];
    if (name === "all") return d.whole;
    if (name === "band") return d.band[i];
    if (name === "stack") return d.stack[j];
    if (name === "all_major") return d.whole_maj;
    if (name === "band_major") return d.band_maj[i];
    if (name === "stack_major") return d.stack_maj[j];
    if (name.slice(0, 2) === "at") {
      var p = name.slice(2).split(",");
      var v = d.content[(i + (+p[0])) + "," + (j + (+p[1]))];
      return v === undefined ? null : v;
    }
    return null;
  }

  function paint(d, src, cur, col) {
    return cur.map(function (row, r) {
      return row.map(function (v, c) {
        return (src[r][c] !== d.bg && v === d.bg) ? col : v;
      });
    });
  }

  function recolor(d, src, col) {
    return src.map(function (row) {
      return row.map(function (v) { return v !== d.bg ? col : d.bg; });
    });
  }

  function sameShape(a, b) {
    return a && b && a.length === b.length && a[0].length === b[0].length;
  }

  function label(d, out, i, j, preferKeep) {
    var c = d.content[i + "," + j], bg = d.bg;

    function simple() {
      if (key(out) === key(c)) return "keep";
      var flat = {}, r, k;
      for (r = 0; r < out.length; r++) for (k = 0; k < out[r].length; k++) flat[out[r][k]] = 1;
      var vals = Object.keys(flat);
      if (vals.length === 1) return (+vals[0] === bg) ? "clear" : "fill:" + vals[0];
      return null;
    }

    function structural() {
      var si, r, k;
      for (si = 0; si < SOURCES.length; si++) {
        var name = SOURCES[si], src = source(d, name, i, j);
        if (!sameShape(src, out)) continue;
        if (name !== "self" && key(src) === key(out)) return "copy:" + name;
        var colours = {}, marks = {};
        for (r = 0; r < out.length; r++) for (k = 0; k < out[r].length; k++) {
          if (src[r][k] !== bg && c[r][k] === bg) colours[out[r][k]] = 1;
          if (src[r][k] !== bg) marks[out[r][k]] = 1;
        }
        var cv = Object.keys(colours);
        if (cv.length === 1 && +cv[0] !== bg && key(paint(d, src, c, +cv[0])) === key(out))
          return "paint:" + name + ":" + cv[0];
        var mv = Object.keys(marks);
        if (mv.length === 1 && +mv[0] !== bg && key(recolor(d, src, +mv[0])) === key(out))
          return "recolor:" + name + ":" + mv[0];
      }
      if (key(out) === key(c.map(function (row) { return row.slice().reverse(); })))
        return "flip_h";
      if (key(out) === key(c.slice().reverse())) return "flip_v";
      return null;
    }

    var order = preferKeep ? [simple, structural] : [structural, simple];
    for (var q = 0; q < 2; q++) {
      var got = order[q]();
      if (got !== null) return got;
    }
    return null;
  }

  function realise(d, lab, i, j) {
    var c = d.content[i + "," + j];
    if (lab === "keep") return c;
    if (lab === "clear") return c.map(function (row) { return row.map(function () { return d.bg; }); });
    if (lab.slice(0, 5) === "fill:") {
      var v = +lab.slice(5);
      return c.map(function (row) { return row.map(function () { return v; }); });
    }
    if (lab === "flip_h") return c.map(function (row) { return row.slice().reverse(); });
    if (lab === "flip_v") return c.slice().reverse();
    if (lab.slice(0, 5) === "copy:") {
      var s1 = source(d, lab.slice(5), i, j);
      return sameShape(s1, c) ? s1 : null;
    }
    var kinds = [["paint:", paint], ["recolor:", recolor]], q;
    for (q = 0; q < 2; q++) {
      var pre = kinds[q][0];
      if (lab.slice(0, pre.length) !== pre) continue;
      var body = lab.slice(pre.length);
      var cut = body.lastIndexOf(":");
      var s2 = source(d, body.slice(0, cut), i, j), col = +body.slice(cut + 1);
      if (!sameShape(s2, c)) return null;
      return q === 0 ? paint(d, s2, c, col) : recolor(d, s2, col);
    }
    return null;
  }

  function features(d, i, j) {
    var c = d.content[i + "," + j], bg = d.bg, ni = d.ni, nj = d.nj;
    var colours = {}, counts = {}, r, k;
    for (r = 0; r < c.length; r++) for (k = 0; k < c[r].length; k++) {
      if (c[r][k] !== bg) colours[c[r][k]] = 1;
      counts[c[r][k]] = (counts[c[r][k]] || 0) + 1;
    }
    var cl = Object.keys(colours).map(Number).sort(function (a, b) { return a - b; });
    var kk = key(c);
    var bandLive = d.bandLive[i], stackLive = d.stackLive[j];

    function nearest(here, others) {
      if (!others.length) return 15;
      var best = others[0];
      for (var q = 1; q < others.length; q++)
        if (Math.abs(others[q] - here) < Math.abs(best - here)) best = others[q];
      return Math.max(-9, Math.min(9, best - here));
    }

    var f = new Array(NFEAT);
    f[0] = d.fill[i + "," + j] === 0 ? 1 : 0;
    f[1] = Math.min(d.fill[i + "," + j], 15);
    f[2] = cl.length;
    f[3] = cl.length === 1 ? cl[0] : -1;
    f[4] = Math.min(i, 15);
    f[5] = Math.min(j, 15);
    f[6] = Math.min(ni - 1 - i, 15);
    f[7] = Math.min(nj - 1 - j, 15);
    f[8] = Math.min(d.ranks[kk] === undefined ? 15 : d.ranks[kk], 15);
    f[9] = d.freq[kk] === 1 ? 1 : 0;
    f[10] = Math.min(bandLive.length, 15);
    f[11] = Math.min(stackLive.length, 15);
    f[12] = (d.band[i] && key(d.band[i]) === kk) ? 1 : 0;
    f[13] = (d.whole && key(d.whole) === kk) ? 1 : 0;
    f[14] = i % 2;
    f[15] = j % 2;
    f[16] = nearest(j, bandLive.filter(function (x) { return x !== j; }));
    f[17] = nearest(i, stackLive.filter(function (x) { return x !== i; }));
    f[18] = Math.min(d.live.length, 15);
    f[19] = (d.live.length === 1 && d.fill[i + "," + j] > 0) ? 1 : 0;
    var ch = key(c.map(function (row) { return row.slice().reverse(); }));
    var cv2 = key(c.slice().reverse());
    f[20] = (kk === ch || kk === cv2) ? 1 : 0;
    var bestC = -1, bestN = -1;
    Object.keys(counts).map(Number).sort(function (a, b) { return a - b; })
      .forEach(function (v) { if (counts[v] > bestN) { bestN = counts[v]; bestC = v; } });
    f[21] = bestC;
    f[22] = (d.whole_maj && key(d.whole_maj) === kk) ? 1 : 0;
    f[23] = (d.band_maj[i] && key(d.band_maj[i]) === kk) ? 1 : 0;
    f[24] = (d.stack_maj[j] && key(d.stack_maj[j]) === kk) ? 1 : 0;
    return f;
  }

  function rows(pairs, bg, preferKeep) {
    var out = [], q, i, j, r, c;
    for (q = 0; q < pairs.length; q++) {
      var a = pairs[q][0], b = pairs[q][1];
      var da = G.dims(a), db = G.dims(b);
      if (da[0] !== db[0] || da[1] !== db[1]) return null;
      var d = describe(a, bg);
      if (!d) return null;
      for (i = 0; i < d.ni; i++) for (j = 0; j < d.nj; j++) {
        var lab = label(d, content(b, d.rr, d.cc, i, j), i, j, preferKeep);
        if (lab === null) return null;
        out.push([features(d, i, j), lab]);
      }
      /* the separator cells must survive untouched, or the lattice the rule is
         stated over is not the one in the answer */
      for (r = 0; r < da[0]; r++) for (c = 0; c < da[1]; c++) {
        var inR = d.rr.some(function (x) { return x[0] <= r && r <= x[1]; });
        var inC = d.cc.some(function (x) { return x[0] <= c && c <= x[1]; });
        if (!(inR && inC) && a[r][c] !== b[r][c]) return null;
      }
    }
    return out;
  }

  function applyTree(tree, g, bg) {
    var d = describe(g, bg);
    if (!d) return null;
    var out = G.copyGrid(g), i, j;
    for (i = 0; i < d.ni; i++) for (j = 0; j < d.nj; j++) {
      var lab = CELLTREE.predict(tree, features(d, i, j));
      var patch = realise(d, lab, i, j);
      if (!patch) return null;
      for (var dr = 0; dr < patch.length; dr++)
        for (var dc = 0; dc < patch[dr].length; dc++)
          out[d.rr[i][0] + dr][d.cc[j][0] + dc] = patch[dr][dc];
    }
    return out;
  }

  function generate(ctx) {
    if (!ctx.same_shape()) return [];
    var pairs = ctx.train, res = [], bi, pk;
    var backgrounds = ctx.bg_varies() ? [ctx.bg(), null] : [ctx.bg()];
    for (bi = 0; bi < backgrounds.length; bi++) {
      var bg = backgrounds[bi];
      var resolved = bg === null ? G.background(pairs[0][0]) : bg;
      for (pk = 0; pk < 2; pk++) {
        var preferKeep = pk === 0;
        if (ctx.timed_out()) return res;
        var rws;
        try { rws = rows(pairs, resolved, preferKeep); } catch (e) { rws = null; }
        if (!rws || !rws.length) continue;
        var budget = Math.max(3, Math.min(48, Math.floor(rws.length / 2)));
        var fit = CELLTREE.growWith(rws, FEATURE_BITS.map(function (_v, k) { return k; }),
                                    FEATURE_BITS, budget);
        if (!fit) continue;
        var held = true, q;
        if (pairs.length >= 3) {
          for (q = 0; q < pairs.length && held; q++) {
            var sub = rows(pairs.slice(0, q).concat(pairs.slice(q + 1)), resolved, preferKeep);
            if (!sub) { held = false; break; }
            var f2 = CELLTREE.growWith(sub, FEATURE_BITS.map(function (_v, k) { return k; }),
                                       FEATURE_BITS, budget);
            if (!f2) { held = false; break; }
            try {
              if (!G.gEq(applyTree(f2[0], pairs[q][0], resolved), pairs[q][1])) held = false;
            } catch (e) { held = false; }
          }
        }
        var cost = 1.0 + CELLTREE.bitsWith(fit[0], FEATURE_BITS) / 12.0 + (held ? 0.0 : 3.0);
        res.push(new Hyp("panels" + (preferKeep ? "" : "*") + "[" + fit[1] + "]",
                         (function (t, b) {
                           return function (g) { return applyTree(t, g, b); };
                         })(fit[0], resolved), cost, "partition"));
      }
    }
    return res;
  }

  PANELTREE = { describe: describe, label: label, realise: realise,
                features: features, applyTree: applyTree };
  defSolver("paneltree", "partition", generate, 2, 1.0);
})();

