/* ===== src/48c-objtree.js ===== */
/* Port of engine/solvers/objtree.py -- per-object edits learned as a tree.
 *
 * ``objects_map`` learns "which colour does each object become" from one
 * feature, or two, and no more. The guard is right -- with a dozen training
 * objects a rich feature set separates them by accident -- but it is a hard
 * cap rather than a cost, so a rule that genuinely needs three tests is
 * unreachable. This is the celltree induction pointed at objects, with
 * description length as the guard instead of a cap.
 *
 * The action alphabet is an integer code so that COPY LEAVES keep working, and
 * they are the most valuable part: a recolouring is coded as the colour
 * itself, so a leaf naming a colour-valued feature says "recolour each object
 * to the colour of the thing containing it", which no constant leaf can state.
 */

var OBJTREE = null;

(function () {
  var KEEP = -2, DELETE = -3, BOX = 20, HOLES = 30, OUTLINE = 40, SLIDE = 50;
  var DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  var MODES = ["c4", "c8", "m4", "m8", "color"];
  var MAX_OBJS = 48;
  var BASE_COST = 1.0;

  var FEATURES = [
    ["size", 3.0], ["h", 3.0], ["w", 3.0], ["bbox", 3.5],
    ["square", 2.5], ["rect", 2.5], ["holes", 3.0], ["ncolors", 3.0],
    ["border", 2.5], ["size_rank", 3.0], ["is_largest", 2.5],
    ["is_smallest", 2.5], ["shape_freq", 3.5], ["shape_unique", 3.0],
    ["color_freq", 3.5], ["color_unique", 3.0], ["n_objects", 3.5],
    ["r0", 4.0], ["c0", 4.0], ["row_band", 3.5], ["col_band", 3.5],
    ["container", 4.0], ["n_contains", 3.5],
    ["color", 2.5], ["container_color", 4.0], ["near_color", 4.0],
    ["major_color", 4.0], ["minor_color", 4.0], ["bg", 3.0],
    ["touching", 3.5], ["density", 4.0]
  ];
  var NFEAT = FEATURES.length, IX = {};
  FEATURES.forEach(function (f, i) { IX[f[0]] = i; });

  var ORDERED = {};
  ["size", "h", "w", "bbox", "holes", "ncolors", "size_rank", "shape_freq",
   "color_freq", "n_objects", "r0", "c0", "row_band", "col_band",
   "n_contains", "touching", "density"].forEach(function (n) { ORDERED[IX[n]] = 1; });

  var COPY = {};
  ["color", "container_color", "near_color", "major_color", "minor_color",
   "bg"].forEach(function (n) { COPY[IX[n]] = 1; });

  var BANKS = [
    ["size", ["size", "h", "w", "bbox", "square", "rect", "size_rank",
              "is_largest", "is_smallest", "color"]],
    ["shape", ["holes", "ncolors", "square", "rect", "shape_freq",
               "shape_unique", "density", "color"]],
    ["colour", ["color", "color_freq", "color_unique", "container_color",
                "near_color", "major_color", "minor_color", "bg"]],
    ["place", ["r0", "c0", "row_band", "col_band", "border", "n_objects",
               "color"]],
    ["rel", ["container", "n_contains", "touching", "container_color",
             "near_color", "color", "border"]],
    ["all", FEATURES.map(function (f) { return f[0]; })]
  ];

  function cellsOf(o) {
    var out = [], it = o.cells.values(), s = it.next();
    while (!s.done) { out.push([s.value >> 6, s.value & 63]); s = it.next(); }
    return out;
  }

  function holesOf(o, g, bg) {
    var h = o.height(), w = o.width(), r, c;
    var inside = [], seen = [], stack = [];
    for (r = 0; r < h; r++) {
      var ir = [], sr = [];
      for (c = 0; c < w; c++) { ir.push(g[o.r0 + r][o.c0 + c] === bg); sr.push(false); }
      inside.push(ir); seen.push(sr);
    }
    for (r = 0; r < h; r++) {
      [0, w - 1].forEach(function (c) {
        if (inside[r][c] && !seen[r][c]) { seen[r][c] = true; stack.push([r, c]); }
      });
    }
    for (c = 0; c < w; c++) {
      [0, h - 1].forEach(function (r2) {
        if (inside[r2][c] && !seen[r2][c]) { seen[r2][c] = true; stack.push([r2, c]); }
      });
    }
    while (stack.length) {
      var p = stack.pop(), i;
      for (i = 0; i < DIRS.length; i++) {
        var rr = p[0] + DIRS[i][0], cc = p[1] + DIRS[i][1];
        if (rr >= 0 && rr < h && cc >= 0 && cc < w && inside[rr][cc] && !seen[rr][cc]) {
          seen[rr][cc] = true; stack.push([rr, cc]);
        }
      }
    }
    var out = [];
    for (r = 0; r < h; r++) {
      for (c = 0; c < w; c++) if (inside[r][c] && !seen[r][c]) out.push([o.r0 + r, o.c0 + c]);
    }
    return out;
  }

  function halo(o, g, bg) {
    var h = G.gh(g), w = G.gw(g), cells = cellsOf(o), i, k, out = {};
    for (i = 0; i < cells.length; i++) {
      for (k = 0; k < CELLTREE.N8D.length; k++) {
        var rr = cells[i][0] + CELLTREE.N8D[k][0], cc = cells[i][1] + CELLTREE.N8D[k][1];
        if (rr >= 0 && rr < h && cc >= 0 && cc < w && !o.cells.has((rr << 6) | cc)
            && g[rr][cc] === bg) out[rr * 100 + cc] = [rr, cc];
      }
    }
    return Object.keys(out).sort(function (a, b) { return a - b; })
      .map(function (k2) { return out[k2]; });
  }

  function slideOf(o, g, bg) {
    var h = G.gh(g), w = G.gw(g), cells = cellsOf(o), best = {}, d, i;
    for (d = 0; d < 4; d++) {
      var dr = DIRS[d][0], dc = DIRS[d][1], k = 0;
      for (;;) {
        var n = k + 1, ok = true;
        for (i = 0; i < cells.length; i++) {
          var rr = cells[i][0] + dr * n, cc = cells[i][1] + dc * n;
          if (!(rr >= 0 && rr < h && cc >= 0 && cc < w)) { ok = false; break; }
          if (!o.cells.has((rr << 6) | cc) && g[rr][cc] !== bg) { ok = false; break; }
        }
        if (!ok) break;
        k = n;
        if (k > h + w) break;
      }
      best[d] = [dr * k, dc * k];
    }
    return best;
  }

  function slideLabel(o, g, b, bg) {
    var s = slideOf(o, g, bg), cells = cellsOf(o), d, i;
    for (d = 0; d < 4; d++) {
      var dr = s[d][0], dc = s[d][1];
      if (dr === 0 && dc === 0) continue;
      var ok = true;
      for (i = 0; i < cells.length; i++) {
        if (b[cells[i][0] + dr][cells[i][1] + dc] !== g[cells[i][0]][cells[i][1]]) { ok = false; break; }
      }
      if (ok) return SLIDE + d;
    }
    return null;
  }

  function labelOf(o, g, b, bg, preferSlide) {
    var cells = cellsOf(o), i, lab;
    if (preferSlide) {
      lab = slideLabel(o, g, b, bg);
      if (lab !== null) return lab;
    }
    var same = true;
    for (i = 0; i < cells.length; i++) {
      if (b[cells[i][0]][cells[i][1]] !== g[cells[i][0]][cells[i][1]]) { same = false; break; }
    }
    if (same) {
      var hs = holesOf(o, g, bg), vals = {}, n = 0, v;
      if (hs.length) {
        var allBg = true;
        for (i = 0; i < hs.length; i++) {
          if (g[hs[i][0]][hs[i][1]] !== bg) allBg = false;
          v = b[hs[i][0]][hs[i][1]];
          if (!(v in vals)) { vals[v] = 1; n++; }
        }
        if (n === 1 && allBg) {
          v = Number(Object.keys(vals)[0]);
          if (v !== bg) return HOLES + v;
        }
      }
      var hl = halo(o, g, bg);
      if (hl.length) {
        vals = {}; n = 0;
        for (i = 0; i < hl.length; i++) {
          v = b[hl[i][0]][hl[i][1]];
          if (!(v in vals)) { vals[v] = 1; n++; }
        }
        if (n === 1) {
          v = Number(Object.keys(vals)[0]);
          if (v !== bg) return OUTLINE + v;
        }
      }
      return KEEP;
    }
    var allBg2 = true;
    for (i = 0; i < cells.length; i++) {
      if (b[cells[i][0]][cells[i][1]] !== bg) { allBg2 = false; break; }
    }
    if (allBg2) return DELETE;
    var vs = {}, m = 0, vv;
    for (i = 0; i < cells.length; i++) {
      vv = b[cells[i][0]][cells[i][1]];
      if (!(vv in vs)) { vs[vv] = 1; m++; }
    }
    if (m === 1) {
      vv = Number(Object.keys(vs)[0]);
      if (vv !== bg) return vv;
    }
    vs = {}; m = 0;
    var r, c;
    for (r = o.r0; r < o.r0 + o.height(); r++) {
      for (c = o.c0; c < o.c0 + o.width(); c++) {
        vv = b[r][c];
        if (!(vv in vs)) { vs[vv] = 1; m++; }
      }
    }
    if (m === 1) {
      vv = Number(Object.keys(vs)[0]);
      if (vv !== bg) return BOX + vv;
    }
    return slideLabel(o, g, b, bg);
  }

  function paint(out, o, lab, g, bg) {
    var cells = cellsOf(o), i, r, c;
    if (lab === KEEP || lab === DELETE) return true;
    if (lab >= SLIDE && lab < SLIDE + 4) {
      var d = slideOf(o, g, bg)[lab - SLIDE];
      for (i = 0; i < cells.length; i++) {
        out[cells[i][0] + d[0]][cells[i][1] + d[1]] = g[cells[i][0]][cells[i][1]];
      }
      return true;
    }
    if (lab >= 0 && lab <= 9) {
      for (i = 0; i < cells.length; i++) out[cells[i][0]][cells[i][1]] = lab;
      return true;
    }
    if (lab >= BOX && lab < BOX + 10) {
      for (r = o.r0; r < o.r0 + o.height(); r++) {
        for (c = o.c0; c < o.c0 + o.width(); c++) out[r][c] = lab - BOX;
      }
      return true;
    }
    if (lab >= HOLES && lab < HOLES + 10) {
      var hs = holesOf(o, g, bg);
      for (i = 0; i < hs.length; i++) out[hs[i][0]][hs[i][1]] = lab - HOLES;
      return true;
    }
    if (lab >= OUTLINE && lab < OUTLINE + 10) {
      var hl = halo(o, g, bg);
      for (i = 0; i < hl.length; i++) out[hl[i][0]][hl[i][1]] = lab - OUTLINE;
      return true;
    }
    return false;
  }

  function rebuild(g, objs, labels, bg) {
    var out = g.map(function (row) { return row.slice(); }), i, j;
    /* vacating pass first: a shape that lands where another one used to be
       must not then be erased by that one's departure */
    for (i = 0; i < objs.length; i++) {
      if (labels[i] === DELETE || (labels[i] >= SLIDE && labels[i] < SLIDE + 4)) {
        var cs = cellsOf(objs[i]);
        for (j = 0; j < cs.length; j++) out[cs[j][0]][cs[j][1]] = bg;
      }
    }
    for (i = 0; i < objs.length; i++) {
      if (!paint(out, objs[i], labels[i], g, bg)) return null;
    }
    return out;
  }

  function adjacent(a, b) {
    if (a.r0 + a.height() < b.r0 - 1 || b.r0 + b.height() < a.r0 - 1) return false;
    if (a.c0 + a.width() < b.c0 - 1 || b.c0 + b.width() < a.c0 - 1) return false;
    var cells = cellsOf(a), i, k;
    for (i = 0; i < cells.length; i++) {
      for (k = 0; k < CELLTREE.N8D.length; k++) {
        if (b.cells.has(((cells[i][0] + CELLTREE.N8D[k][0]) << 6)
                        | (cells[i][1] + CELLTREE.N8D[k][1]))) return true;
      }
    }
    return false;
  }

  function extraOf(objs) {
    var counts = {}, i, j;
    for (i = 0; i < objs.length; i++) {
      counts[objs[i].color] = (counts[objs[i].color] || 0) + 1;
    }
    var order = Object.keys(counts).map(Number).sort(function (a, b) {
      return counts[b] - counts[a] || a - b; });
    var near = [], touch = [];
    for (i = 0; i < objs.length; i++) {
      var best = -1, bd = null, n = 0;
      for (j = 0; j < objs.length; j++) {
        if (j === i) continue;
        var d = Math.max(Math.abs(objs[i].r0 - objs[j].r0),
                         Math.abs(objs[i].c0 - objs[j].c0));
        if (bd === null || d < bd) { bd = d; best = objs[j].color; }
        if (adjacent(objs[i], objs[j])) n++;
      }
      near.push(best); touch.push(n);
    }
    return { near: near, touch: touch,
             major: order.length ? order[0] : -1,
             minor: order.length ? order[order.length - 1] : -1 };
  }

  function vecOf(o, objs, g, shared, bg, extra, index) {
    var f = O.objectFeatures(o, objs, g, shared, index), v = [], i;
    for (i = 0; i < NFEAT; i++) v.push(0);
    ["size", "h", "w", "bbox", "square", "rect", "holes", "ncolors", "border",
     "size_rank", "is_largest", "is_smallest", "shape_freq", "shape_unique",
     "color_freq", "color_unique", "n_objects", "r0", "c0", "row_band",
     "col_band", "container", "n_contains", "color"].forEach(function (n) {
      v[IX[n]] = f[n];
    });
    var cont = f.container;
    v[IX.container_color] = (cont >= 0 && cont < objs.length) ? objs[cont].color : -1;
    v[IX.near_color] = extra.near[index];
    v[IX.major_color] = extra.major;
    v[IX.minor_color] = extra.minor;
    v[IX.bg] = bg;
    v[IX.touching] = extra.touch[index];
    v[IX.density] = Math.floor(100 * o.size() / Math.max(1, o.bbox_area()));
    return v;
  }

  function read(pairs, mode, bg, preferSlide) {
    var rows = [], segs = [], i, k;
    for (i = 0; i < pairs.length; i++) {
      var a = pairs[i][0], b = pairs[i][1];
      if (G.gh(a) !== G.gh(b) || G.gw(a) !== G.gw(b)) return null;
      var field = (bg === null || bg === undefined) ? G.background(a) : bg;
      var objs;
      try { objs = O.segment(a, mode, field); } catch (e) { return null; }
      if (!objs || !objs.length || objs.length > MAX_OBJS) return null;
      var labels = [];
      for (k = 0; k < objs.length; k++) {
        var lab = labelOf(objs[k], a, b, field, preferSlide);
        if (lab === null) return null;
        labels.push(lab);
      }
      var got = rebuild(a, objs, labels, field);
      if (got === null || !G.gEq(got, b)) return null;
      var shared = O.sharedStats(objs, a), extra = extraOf(objs);
      for (k = 0; k < objs.length; k++) {
        rows.push([vecOf(objs[k], objs, a, shared, field, extra, k), labels[k]]);
      }
      segs.push(objs);
    }
    return { rows: rows, segs: segs };
  }

  function runTree(tree, g, mode, bg) {
    var field = (bg === null || bg === undefined) ? G.background(g) : bg;
    var objs = O.segment(g, mode, field);
    if (!objs || !objs.length || objs.length > MAX_OBJS) return null;
    var shared = O.sharedStats(objs, g), extra = extraOf(objs), labels = [], k;
    for (k = 0; k < objs.length; k++) {
      labels.push(CELLTREE.predict(tree, vecOf(objs[k], objs, g, shared, field, extra, k)));
    }
    return rebuild(g, objs, labels, field);
  }

  function fitPairs(pairs, bg, deadline, heldOut) {
    var out = [], seen = {}, mi, pi, bi, i, b;
    for (mi = 0; mi < MODES.length; mi++) {
      for (pi = 0; pi < 2; pi++) {
        var mode = MODES[mi], prefer = pi === 1;
        if (deadline && Date.now() / 1000 >= deadline) return out;
        var built = read(pairs, mode, bg, prefer);
        if (!built) continue;
        var rows = built.rows, allKeep = true;
        for (i = 0; i < rows.length; i++) if (rows[i][1] !== KEEP) { allKeep = false; break; }
        if (allKeep) continue;
        var key = built.segs.map(function (objs) {
          return objs.map(function (o) {
            return Array.from(o.cells).sort(function (x, y) { return x - y; }).join(",");
          }).sort().join("|");
        }).join(";") + "#" + rows.map(function (r) { return r[1]; }).join(",");
        if (seen[key]) continue;
        seen[key] = 1;
        var folds = null;
        if (heldOut !== false && pairs.length >= 3) {
          folds = [];
          for (i = 0; i < pairs.length; i++) {
            var sub = read(pairs.slice(0, i).concat(pairs.slice(i + 1)), mode, bg, prefer);
            folds.push(sub ? sub.rows : null);
          }
        }
        /* eslint-disable no-loop-func */
        (function (rows2, folds2, mode2) {
          CELLTREE.withTables(FEATURES, ORDERED, COPY, function () {
            for (bi = 0; bi < BANKS.length; bi++) {
              if (deadline && Date.now() / 1000 >= deadline) return;
              var label = BANKS[bi][0];
              var allowed = BANKS[bi][1].map(function (n) { return IX[n]; });
              var tree = null, state = { leaves: 0, splits: 0 };
              var ladder = [2, 4, 8, 16];
              for (i = 0; i < ladder.length; i++) {
                state = { leaves: 0, splits: 0 };
                tree = CELLTREE.grow(rows2, allowed, 0, ladder[i], state);
                if (tree !== null) break;
              }
              if (tree === null) continue;
              var good = true;
              for (i = 0; i < pairs.length; i++) {
                var got = runTree(tree, pairs[i][0], mode2, bg);
                if (got === null || !G.gEq(got, pairs[i][1])) { good = false; break; }
              }
              if (!good) continue;
              var held = true;
              if (folds2) {
                for (i = 0; i < folds2.length; i++) {
                  if (!folds2[i]) { held = false; break; }
                  var t2 = null;
                  for (b = 0; b < ladder.length; b++) {
                    t2 = CELLTREE.grow(folds2[i], allowed, 0, ladder[b], { leaves: 0, splits: 0 });
                    if (t2 !== null) break;
                  }
                  if (t2 === null) { held = false; break; }
                  var g2 = runTree(t2, pairs[i][0], mode2, bg);
                  if (g2 === null || !G.gEq(g2, pairs[i][1])) { held = false; break; }
                }
              }
              out.push([mode2, label, tree, CELLTREE.treeBits(tree), state.splits,
                        held, rows2.length]);
            }
          });
        })(rows, folds, mode);
      }
    }
    return out;
  }

  /* Objects behind each leaf. Reported, NOT charged for. The argument for
     charging was that a cell tree's split is supported by hundreds of cells
     and an object tree's by a dozen objects. It was measured and it is wrong:
     a penalty in leaves is a penalty in DEPTH, description length already
     charges for depth, and on arc1_44d8ac46 -- the task the guard was built
     for -- the correct rule is the deeper one. The four-split tree that gets
     it right was pushed below two three-split trees that do not. */
  function thinEvidence(nRows, splits) {
    return nRows / (splits + 1);
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
        var mode = fits[i][0], label = fits[i][1], tree = fits[i][2];
        var bits = fits[i][3], splits = fits[i][4], held = fits[i][5];
        var nRows = fits[i][6];
        var cost = BASE_COST + bits / 12.0 + (held ? 0.0 : 3.0)
                   + (bg === null ? 0.3 : 0.0);
        res.push(new Hyp("objtree" + tag + "[" + mode + "/" + label + "," + splits + "]",
                         (function (t, m, b2) {
                           return function (g) { return runTree(t, g, m, b2); };
                         })(tree, mode, bg), cost, "objects"));
      }
    }
    return res;
  }

  OBJTREE = { fitPairs: fitPairs, run: runTree, label: labelOf, slide: slideOf,
              thinEvidence: thinEvidence,
              holes: holesOf, FEATURES: FEATURES, BANKS: BANKS, MODES: MODES,
              KEEP: KEEP, DELETE: DELETE, BOX: BOX, HOLES: HOLES,
              OUTLINE: OUTLINE, SLIDE: SLIDE };
  defSolver("objtree", "objects", generate, 2, 0.3);
})();

