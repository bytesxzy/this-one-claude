/* ===== src/09-program.js ===== */
/* Port of engine/program.py -- typed programs as a canonical structure ``c``
 * plus explicit parameters ``theta``.
 *
 * A Hyp stores an opaque closure, which is enough to CHECK a rule and nothing
 * else. The version-space ranker needs a different question answered -- how
 * many different parameterisations of this same abstraction also explain the
 * demonstrations, and do they agree about the test grid -- and that question
 * is unanswerable about a closure. So a program here is split in two: a
 * structure with typed holes where literals belong, and the literals that fill
 * them. Operator code lengths are derived from a weight table and normalised
 * so the Kraft sum over the operator alphabet is exactly one, which is what
 * makes the MDL weighting realisable by a prefix code rather than asserted.
 */

var PROG = null;

(function () {
  var T_GRID = "G", T_COLOR = "C", T_INT = "I", T_DIR = "D", T_SEL = "S",
      T_SEG = "K", T_AXIS = "A", T_CMAP = "M", T_KEY = "Y";
  var VAR = ["in"];

  function hole(kind) { return ["?", kind]; }
  function isHole(x) { return Array.isArray(x) && x.length === 2 && x[0] === "?"; }

  var OPS = {}, OP_BITS = null;

  function register(name, fn, kinds, weight) {
    OPS[name] = { name: name, fn: fn, kinds: kinds || [T_GRID],
                  weight: weight === undefined ? 1.0 : weight };
    OP_BITS = null;
    return OPS[name];
  }

  function opBits(name) {
    if (OP_BITS === null) {
      OP_BITS = {};
      var total = 0, k;
      for (k in OPS) if (OPS.hasOwnProperty(k)) total += OPS[k].weight;
      if (!total) total = 1.0;
      for (k in OPS) if (OPS.hasOwnProperty(k))
        OP_BITS[k] = -Math.log(Math.max(OPS[k].weight, 1e-9) / total) / Math.LN2;
      OP_BITS["in"] = -Math.log(1.0 / (total + 1.0)) / Math.LN2;
    }
    return OP_BITS.hasOwnProperty(name) ? OP_BITS[name] : 12.0;
  }

  var D4 = [[1, 0], [-1, 0], [0, -1], [0, 1]];

  function r(name, fn, kinds, w) { register(name, fn, kinds, w); }

  function compress(g, bg) {
    var rows = g.filter(function (row) {
      return row.some(function (v) { return v !== bg; }); });
    if (!rows.length) return null;
    var t = G.transpose(rows);
    var cols = t.filter(function (row) {
      return row.some(function (v) { return v !== bg; }); });
    return cols.length ? G.transpose(cols) : null;
  }

  function mirrorCat(g, a) {
    a = ((a % 4) + 4) % 4;
    if (a === 0) return G.vconcat(g, G.flipV(g));
    if (a === 1) return G.vconcat(G.flipV(g), g);
    if (a === 2) return G.hconcat(g, G.flipH(g));
    return G.hconcat(G.flipH(g), g);
  }

  r("id", function (e, g) { return g; }, [T_GRID], 0.5);
  var DIH = [["rot90", G.rot90], ["rot180", G.rot180], ["rot270", G.rot270],
             ["flip_h", G.flipH], ["flip_v", G.flipV],
             ["transpose", G.transpose], ["anti_transpose", G.antiTranspose]];
  DIH.forEach(function (p) {
    r(p[0], (function (f) { return function (e, g) { return f(g); }; })(p[1]), [T_GRID], 1.0);
  });
  r("crop", function (e, g) { return G.cropToContent(g, e.bg); }, [T_GRID], 0.9);
  r("cropc", function (e, g, c) { return G.cropToContent(g, c); }, [T_GRID, T_COLOR], 0.5);
  r("dedup", function (e, g) { return G.dedup(g); }, [T_GRID], 0.6);
  r("dedup_r", function (e, g) { return G.dedupRows(g); }, [T_GRID], 0.4);
  r("dedup_c", function (e, g) { return G.dedupCols(g); }, [T_GRID], 0.4);
  r("trim", function (e, g) { return G.trimBorder(g, 1); }, [T_GRID], 0.5);
  r("compress", function (e, g) { return compress(g, e.bg); }, [T_GRID], 0.7);
  r("half", function (e, g, a) {
    return G.half(g, ["top", "bottom", "left", "right"][((a % 4) + 4) % 4]);
  }, [T_GRID, T_AXIS], 0.5);
  r("quad", function (e, g, i) { return G.quadrant(g, ((i % 4) + 4) % 4); }, [T_GRID, T_INT], 0.4);
  r("grav", function (e, g, d) {
    return G.gravity(g, e.bg, ["down", "up", "left", "right"][((d % 4) + 4) % 4]);
  }, [T_GRID, T_DIR], 0.6);
  r("upscale", function (e, g, k) { return (k >= 2 && k <= 5) ? G.upscale(g, k, k) : null; },
    [T_GRID, T_INT], 0.6);
  r("downscale", function (e, g, k) { return (k >= 2 && k <= 5) ? G.downscale(g, k, k) : null; },
    [T_GRID, T_INT], 0.5);
  r("tile", function (e, g, k) { return (k >= 2 && k <= 5) ? G.tile(g, k, k) : null; },
    [T_GRID, T_INT], 0.5);
  r("tile_yx", function (e, g, y, x) {
    return (y >= 1 && y <= 5 && x >= 1 && x <= 5) ? G.tile(g, y, x) : null; },
    [T_GRID, T_INT, T_INT], 0.35);
  r("pad", function (e, g, c) { return G.pad(g, 1, c); }, [T_GRID, T_COLOR], 0.4);
  r("replace", function (e, g, a, b) { return a === b ? null : G.replaceColor(g, a, b); },
    [T_GRID, T_COLOR, T_COLOR], 0.8);
  r("keepc", function (e, g, c) {
    return g.map(function (row) {
      return row.map(function (v) { return v === c ? v : e.bg; }); });
  }, [T_GRID, T_COLOR], 0.5);
  r("fillholes", function (e, g, c) { return G.fillHoles(g, c, e.bg); }, [T_GRID, T_COLOR], 0.5);
  r("cmap", function (e, g, m) { return G.applyCmap(g, m); }, [T_GRID, T_CMAP], 1.0);
  r("shift", function (e, g, d) {
    var v = D4[((d % 4) + 4) % 4]; return G.translate(g, v[0], v[1], e.bg); },
    [T_GRID, T_DIR], 0.4);
  r("wrap", function (e, g, d) {
    var v = D4[((d % 4) + 4) % 4]; return G.wrapTranslate(g, v[0], v[1]); },
    [T_GRID, T_DIR], 0.4);
  r("mirror_cat", function (e, g, a) { return mirrorCat(g, a); }, [T_GRID, T_AXIS], 0.6);
  r("mode_cell", function (e, g) { return [[G.mostCommonColor(g)]]; }, [T_GRID], 0.3);
  r("nzblock", function (e, g, k) {
    return (k >= 2 && k <= 5) ? G.blockReduceNonbg(g, k, k, e.bg) : null; },
    [T_GRID, T_INT], 0.4);
  r("modeblock", function (e, g, k) {
    return (k >= 2 && k <= 5) ? G.blockReduceMode(g, k, k) : null; },
    [T_GRID, T_INT], 0.3);

  /* -- object primitives ------------------------------------------------ */
  var SELECTORS = ["largest", "smallest", "uniq_color", "uniq_shape", "most_holes",
                   "widest", "tallest", "densest", "first", "last"];
  var SEGMODES = ["c8", "c4", "color", "c8m", "c4m"];
  var KEYS = ["size", "height", "width", "holes", "ncolor", "rank_size", "bbox",
              "color", "is_square", "touches"];

  function objsOf(g, seg, bg) {
    var objs;
    try { objs = O.segment(g, seg, bg); } catch (e) { return null; }
    return (objs && objs.length && objs.length <= 220) ? objs : null;
  }

  function pick(objs, sel) {
    if (!objs || !objs.length) return null;
    if (sel === "largest") return O.selectExtreme(objs, "size", true);
    if (sel === "smallest") return O.selectExtreme(objs, "size", false);
    if (sel === "widest") return O.selectExtreme(objs, "width", true);
    if (sel === "tallest") return O.selectExtreme(objs, "height", true);
    if (sel === "densest") return O.selectExtreme(objs, "density", true);
    if (sel === "most_holes") return O.selectExtreme(objs, "holes", true);
    if (sel === "uniq_color") return O.selectUniqueColor(objs);
    if (sel === "uniq_shape") return O.selectUniqueShape(objs);
    if (sel === "first" || sel === "last") {
      var s = objs.slice().sort(function (a, b) { return (a.r0 - b.r0) || (a.c0 - b.c0); });
      return sel === "first" ? s[0] : s[s.length - 1];
    }
    return null;
  }

  function cellsOf(o) {
    var out = [], it = o.cells.values(), s = it.next();
    while (!s.done) { out.push([s.value >> 6, s.value & 63]); s = it.next(); }
    return out;
  }

  function feature(o, key, objs) {
    if (key === "size") return o.size();
    if (key === "height") return o.height();
    if (key === "width") return o.width();
    if (key === "holes") return o.holes_count();
    if (key === "ncolor") return G.csSize(o.colors());
    if (key === "bbox") return o.bbox_area();
    if (key === "color") return o.color;
    if (key === "is_square") return o.is_square() ? 1 : 0;
    if (key === "touches") return o.touches_border() ? 1 : 0;
    if (key === "rank_size") {
      var sizes = Array.from(new Set(objs.map(function (x) { return x.size(); })))
        .sort(function (a, b) { return b - a; });
      return sizes.indexOf(o.size());
    }
    return null;
  }

  r("pick_crop", function (e, g, seg, sel) {
    var objs = objsOf(g, SEGMODES[((seg % 5) + 5) % 5], e.bg);
    var o = objs ? pick(objs, SELECTORS[((sel % 10) + 10) % 10]) : null;
    return o ? O.cropObj(g, o) : null;
  }, [T_GRID, T_SEG, T_SEL], 1.1);
  r("pick_patch", function (e, g, seg, sel) {
    var objs = objsOf(g, SEGMODES[((seg % 5) + 5) % 5], e.bg);
    var o = objs ? pick(objs, SELECTORS[((sel % 10) + 10) % 10]) : null;
    return o ? o.filled(e.bg) : null;
  }, [T_GRID, T_SEG, T_SEL], 0.8);
  r("keep_only", function (e, g, seg, sel) {
    var objs = objsOf(g, SEGMODES[((seg % 5) + 5) % 5], e.bg);
    var o = objs ? pick(objs, SELECTORS[((sel % 10) + 10) % 10]) : null;
    if (!o) return null;
    var d = G.dims(g), out = G.constGrid(d[0], d[1], e.bg), cs = cellsOf(o), i;
    for (i = 0; i < cs.length; i++) out[cs[i][0]][cs[i][1]] = g[cs[i][0]][cs[i][1]];
    return out;
  }, [T_GRID, T_SEG, T_SEL], 0.8);
  r("drop_one", function (e, g, seg, sel) {
    var objs = objsOf(g, SEGMODES[((seg % 5) + 5) % 5], e.bg);
    var o = objs ? pick(objs, SELECTORS[((sel % 10) + 10) % 10]) : null;
    if (!o) return null;
    var out = G.copyGrid(g), cs = cellsOf(o), i;
    for (i = 0; i < cs.length; i++) out[cs[i][0]][cs[i][1]] = e.bg;
    return out;
  }, [T_GRID, T_SEG, T_SEL], 0.7);

  r("recolor_by", function (e, g, seg, key, table) {
    var objs = objsOf(g, SEGMODES[((seg % 5) + 5) % 5], e.bg);
    if (!objs) return null;
    var k = KEYS[((key % 10) + 10) % 10], out = G.copyGrid(g), i, j;
    for (i = 0; i < objs.length; i++) {
      var v = feature(objs[i], k, objs);
      if (!table || !table.hasOwnProperty(v)) return null;
      var cs = cellsOf(objs[i]);
      for (j = 0; j < cs.length; j++) out[cs[j][0]][cs[j][1]] = table[v];
    }
    return out;
  }, [T_GRID, T_SEG, T_KEY, T_CMAP], 1.4);
  r("select_by", function (e, g, seg, key, want) {
    var objs = objsOf(g, SEGMODES[((seg % 5) + 5) % 5], e.bg);
    if (!objs) return null;
    var k = KEYS[((key % 10) + 10) % 10], d = G.dims(g);
    var out = G.constGrid(d[0], d[1], e.bg), hit = false, i, j;
    for (i = 0; i < objs.length; i++) {
      if (feature(objs[i], k, objs) !== want) continue;
      hit = true;
      var cs = cellsOf(objs[i]);
      for (j = 0; j < cs.length; j++) out[cs[j][0]][cs[j][1]] = g[cs[j][0]][cs[j][1]];
    }
    return hit ? out : null;
  }, [T_GRID, T_SEG, T_KEY, T_INT], 1.2);

  /* -- procedural primitives borrowed from the specialist library --------
   *
   * These are the operators the legacy enumerator can only apply once, to the
   * raw input, because they are too expensive to run at every node. With the
   * typed search they become ordinary composable steps whose literals are
   * fitted rather than enumerated, which is what makes "repair the symmetry,
   * then crop to the marker colour" reachable as a two-step program instead
   * of as two separate specialists that never meet. */

  function safe(fn) {
    var args = Array.prototype.slice.call(arguments, 1);
    try {
      var out = fn.apply(null, args);
      return (out === null || out === undefined) ? null : out;
    } catch (e) { return null; }
  }

  r("connect", function (e, g) { return safe(SEQ.connect, g, e.bg, null, false, null); },
    [T_GRID], 0.8);
  r("connect_c", function (e, g, c) { return safe(SEQ.connect, g, e.bg, c, false, null); },
    [T_GRID, T_COLOR], 0.5);
  r("outline", function (e, g) { return safe(SEQ.halo, g, e.bg, null, false, false); },
    [T_GRID], 0.7);
  r("outline_c", function (e, g, c) { return safe(SEQ.halo, g, e.bg, c, false, false); },
    [T_GRID, T_COLOR], 0.5);
  r("repair", function (e, g) { return safe(SYMM.repair, g, e.bg, true, 0.30, 6); },
    [T_GRID], 0.9);
  r("complete", function (e, g) { return safe(SYMM.repairBounded, g, e.bg, false, 0.0, 2, 0); },
    [T_GRID], 0.8);
  r("frame_in", function (e, g) { return safe(REGIONS.frameInterior, g, e.bg, "largest"); },
    [T_GRID], 0.7);
  r("frame_all", function (e, g) { return safe(REGIONS.frameContent, g, e.bg, "largest"); },
    [T_GRID], 0.6);
  r("marked", function (e, g, c) { return safe(REGIONS.markedRect, g, e.bg, c, false, 0, 0); },
    [T_GRID, T_COLOR], 0.5);

  function denoise(e, g) {
    var objs = objsOf(g, "c8", e.bg);
    if (!objs) return null;
    var out = G.copyGrid(g), hit = false, i, j;
    for (i = 0; i < objs.length; i++) {
      if (objs[i].size() !== 1) continue;
      hit = true;
      var cs = cellsOf(objs[i]);
      for (j = 0; j < cs.length; j++) out[cs[j][0]][cs[j][1]] = e.bg;
    }
    return hit ? out : null;
  }

  function bboxFill(e, g) {
    var objs = objsOf(g, "c8", e.bg);
    if (!objs || objs.length > 120) return null;
    var out = G.copyGrid(g), i, rr, cc;
    for (i = 0; i < objs.length; i++)
      for (rr = objs[i].r0; rr <= objs[i].r1; rr++)
        for (cc = objs[i].c0; cc <= objs[i].c1; cc++) out[rr][cc] = objs[i].color;
    return out;
  }

  function fillEnclosed(e, g, color) {
    var bg = e.bg, d = G.dims(g), h = d[0], w = d[1];
    var seen = [], out = G.copyGrid(g), hit = false, r, c, i;
    for (r = 0; r < h; r++) { seen.push(new Array(w)); for (c = 0; c < w; c++) seen[r][c] = false; }
    for (r = 0; r < h; r++) for (c = 0; c < w; c++) {
      if (seen[r][c] || g[r][c] !== bg) continue;
      var stack = [[r, c]], cells = [], edge = false;
      seen[r][c] = true;
      while (stack.length) {
        var p = stack.pop();
        cells.push(p);
        if (p[0] === 0 || p[0] === h - 1 || p[1] === 0 || p[1] === w - 1) edge = true;
        var D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (i = 0; i < 4; i++) {
          var rr = p[0] + D[i][0], cc = p[1] + D[i][1];
          if (rr >= 0 && rr < h && cc >= 0 && cc < w && !seen[rr][cc] && g[rr][cc] === bg) {
            seen[rr][cc] = true;
            stack.push([rr, cc]);
          }
        }
      }
      if (!edge) {
        hit = true;
        for (i = 0; i < cells.length; i++) out[cells[i][0]][cells[i][1]] = color;
      }
    }
    return hit ? out : null;
  }

  function border(e, g, color) {
    var d = G.dims(g), h = d[0], w = d[1];
    if (h < 2 || w < 2) return null;
    var out = G.copyGrid(g), i;
    for (i = 0; i < w; i++) { out[0][i] = color; out[h - 1][i] = color; }
    for (i = 0; i < h; i++) { out[i][0] = color; out[i][w - 1] = color; }
    return out;
  }

  function moveObjs(e, g, dir) {
    var bg = e.bg, objs = objsOf(g, "c8", bg);
    if (!objs || objs.length > 80) return null;
    var d = G.dims(g), h = d[0], w = d[1], v = D4[((dir % 4) + 4) % 4];
    var dr = v[0], dc = v[1], out = G.constGrid(h, w, bg), i, j;
    var order = objs.slice().sort(function (a, b) {
      return (b.r0 * dr + b.c0 * dc) - (a.r0 * dr + a.c0 * dc); });
    for (i = 0; i < order.length; i++) {
      var cs = cellsOf(order[i]), k = 0;
      for (;;) {
        var nk = k + 1, ok = true;
        for (j = 0; j < cs.length; j++) {
          var rr = cs[j][0] + dr * nk, cc = cs[j][1] + dc * nk;
          if (rr < 0 || rr >= h || cc < 0 || cc >= w || out[rr][cc] !== bg) { ok = false; break; }
        }
        if (!ok) break;
        k = nk;
        if (k > h + w) break;
      }
      for (j = 0; j < cs.length; j++)
        out[cs[j][0] + dr * k][cs[j][1] + dc * k] = g[cs[j][0]][cs[j][1]];
    }
    return out;
  }

  r("denoise", denoise, [T_GRID], 0.7);
  r("bbox_fill", bboxFill, [T_GRID], 0.6);
  r("fill_enclosed", fillEnclosed, [T_GRID, T_COLOR], 0.9);
  r("border", border, [T_GRID, T_COLOR], 0.4);
  r("move_objs", moveObjs, [T_GRID, T_DIR], 0.8);

  /* -- structures ------------------------------------------------------- */

  function structOf(op) {
    var o = OPS[op], out = [op], args = Array.prototype.slice.call(arguments, 1);
    var ai = 0, i;
    for (i = 0; i < o.kinds.length; i++) {
      if (o.kinds[i] === T_GRID) out.push(args[ai++]);
      else out.push(hole(o.kinds[i]));
    }
    return out;
  }

  function isVar(n) { return Array.isArray(n) && n.length === 1 && n[0] === "in"; }

  function holesOf(node) {
    var acc = [];
    (function walk(n) {
      if (!n || isVar(n)) return;
      if (n[0] === "hcat" || n[0] === "vcat") { walk(n[1]); walk(n[2]); return; }
      var i;
      for (i = 1; i < n.length; i++) {
        if (isHole(n[i])) acc.push(n[i][1]); else walk(n[i]);
      }
    })(node);
    return acc;
  }

  function structBits(node) {
    if (isVar(node)) return opBits("in");
    if (node[0] === "hcat" || node[0] === "vcat")
      return 2.0 + structBits(node[1]) + structBits(node[2]);
    var total = opBits(node[0]), i;
    for (i = 1; i < node.length; i++)
      total += isHole(node[i]) ? 1.0 : structBits(node[i]);
    return total;
  }

  var DOMAIN_BITS = {};
  DOMAIN_BITS[T_COLOR] = Math.log(10) / Math.LN2;
  DOMAIN_BITS[T_INT] = 3.0;
  DOMAIN_BITS[T_DIR] = 2.0;
  DOMAIN_BITS[T_AXIS] = 2.0;
  DOMAIN_BITS[T_SEL] = Math.log(10) / Math.LN2;
  DOMAIN_BITS[T_SEG] = Math.log(5) / Math.LN2;
  DOMAIN_BITS[T_KEY] = Math.log(10) / Math.LN2;

  function thetaBits(node, theta) {
    var kinds = holesOf(node), total = 0.0, i;
    for (i = 0; i < kinds.length && i < theta.length; i++) {
      if (kinds[i] === T_CMAP) {
        var n = theta[i] ? Object.keys(theta[i]).length : 1;
        total += 2.0 + n * (Math.log(10) / Math.LN2 + 3.0);
      } else total += DOMAIN_BITS.hasOwnProperty(kinds[i]) ? DOMAIN_BITS[kinds[i]] : 4.0;
    }
    return total;
  }

  function evalNode(node, it, g, env) {
    if (isVar(node)) return g;
    if (node[0] === "hcat" || node[0] === "vcat") {
      var l = evalNode(node[1], it, g, env), rr = evalNode(node[2], it, g, env);
      if (l === null || rr === null) return null;
      return node[0] === "hcat" ? G.hconcat(l, rr) : G.vconcat(l, rr);
    }
    var op = OPS[node[0]];
    if (!op) return null;
    var args = [env], i, v;
    for (i = 1; i < node.length; i++) {
      if (isHole(node[i])) args.push(it.next());
      else {
        v = evalNode(node[i], it, g, env);
        if (v === null) return null;
        args.push(v);
      }
    }
    return op.fn.apply(null, args);
  }

  function iterOf(theta) {
    var i = 0;
    return { next: function () { return theta[i++]; } };
  }

  function lit(v, kind) {
    if (kind === T_CMAP && v && typeof v === "object")
      return "{" + Object.keys(v).sort(function (a, b) { return a - b; })
        .map(function (k) { return k + ">" + v[k]; }).join(",") + "}";
    if (kind === T_SEL) return SELECTORS[((v % 10) + 10) % 10];
    if (kind === T_SEG) return SEGMODES[((v % 5) + 5) % 5];
    if (kind === T_KEY) return KEYS[((v % 10) + 10) % 10];
    return "" + v;
  }

  function render(node, theta) {
    var it = theta ? iterOf(theta) : null;
    return (function walk(n) {
      if (isVar(n)) return "$";
      if (n[0] === "hcat" || n[0] === "vcat")
        return n[0] + "(" + walk(n[1]) + "," + walk(n[2]) + ")";
      var parts = [], i;
      for (i = 1; i < n.length; i++) {
        if (isHole(n[i])) parts.push(it ? lit(it.next(), n[i][1]) : "?" + n[i][1]);
        else parts.push(walk(n[i]));
      }
      return n[0] + "(" + parts.join(",") + ")";
    })(node);
  }

  function Prog(struct, theta, env) {
    this.struct = struct;
    this.theta = theta;
    this.env = env;
  }
  Prog.prototype.name = function () { return render(this.struct, this.theta); };
  Prog.prototype.structKey = function () { return render(this.struct); };
  Prog.prototype.structBits = function () { return structBits(this.struct); };
  Prog.prototype.thetaBits = function () { return thetaBits(this.struct, this.theta); };
  Prog.prototype.codeLength = function () { return this.structBits() + this.thetaBits(); };
  Prog.prototype.run = function (g) {
    var out;
    try { out = evalNode(this.struct, iterOf(this.theta), g, this.env); }
    catch (e) { return null; }
    return (out === null || out === undefined || !G.valid(out)) ? null : out;
  };

  function makeEnv(ctx) { return { bg: ctx.bg() }; }

  function domains(ctx) {
    var pal = G.csList(G.csUnion(ctx.in_palette(), ctx.out_palette()));
    var d = {};
    d[T_COLOR] = pal;
    d[T_INT] = [0, 1, 2, 3, 4, 5];
    d[T_DIR] = [0, 1, 2, 3];
    d[T_AXIS] = [0, 1, 2, 3];
    d[T_SEL] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    d[T_SEG] = [0, 1, 2, 3, 4];
    d[T_KEY] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    return d;
  }

  function product(spaces) {
    var out = [[]], i, j, k, next;
    for (i = 0; i < spaces.length; i++) {
      next = [];
      for (j = 0; j < out.length; j++)
        for (k = 0; k < spaces[i].length; k++) next.push(out[j].concat([spaces[i][k]]));
      out = next;
    }
    return out;
  }

  function cmapSlot(node) {
    var ks = holesOf(node), idx = [], i;
    for (i = 0; i < ks.length; i++) if (ks[i] === T_CMAP) idx.push(i);
    return idx.length === 1 ? idx[0] : null;
  }

  function fitTable(op, combo, pairs, env) {
    var table = {}, i, r, c;
    if (op === "cmap") {
      for (i = 0; i < pairs.length; i++) {
        var a = pairs[i][0], b = pairs[i][1];
        var da = G.dims(a), db = G.dims(b);
        if (da[0] !== db[0] || da[1] !== db[1]) return null;
        for (r = 0; r < da[0]; r++) for (c = 0; c < da[1]; c++) {
          if (!table.hasOwnProperty(a[r][c])) table[a[r][c]] = b[r][c];
          else if (table[a[r][c]] !== b[r][c]) return null;
        }
      }
      var changed = {}, any = false, k;
      for (k in table) if (table.hasOwnProperty(k) && +k !== table[k]) { changed[k] = table[k]; any = true; }
      return any ? changed : null;
    }
    if (op === "recolor_by") {
      var seg = SEGMODES[((combo[0] % 5) + 5) % 5], key = KEYS[((combo[1] % 10) + 10) % 10];
      for (i = 0; i < pairs.length; i++) {
        var aa = pairs[i][0], bb = pairs[i][1];
        var d1 = G.dims(aa), d2 = G.dims(bb);
        if (d1[0] !== d2[0] || d1[1] !== d2[1]) return null;
        var objs = objsOf(aa, seg, env.bg);
        if (!objs) return null;
        for (var oi = 0; oi < objs.length; oi++) {
          var v = feature(objs[oi], key, objs), cs = cellsOf(objs[oi]), set = new Set();
          for (var ci = 0; ci < cs.length; ci++) set.add(bb[cs[ci][0]][cs[ci][1]]);
          if (set.size !== 1) return null;
          var col = Array.from(set)[0];
          if (!table.hasOwnProperty(v)) table[v] = col;
          else if (table[v] !== col) return null;
        }
      }
      return Object.keys(table).length ? table : null;
    }
    return null;
  }

  function refit(struct, pairs, ctx, cap, workCap) {
    cap = cap || 24; workCap = workCap || 4000;
    var env = makeEnv(ctx), kinds = holesOf(struct), i, j;
    if (!kinds.length) {
      var p0 = new Prog(struct, [], env), ok0 = true;
      for (i = 0; i < pairs.length; i++)
        if (!G.gEq(p0.run(pairs[i][0]) || [], pairs[i][1])) { ok0 = false; break; }
      return ok0 ? [[]] : [];
    }
    var dom = domains(ctx), slot = cmapSlot(struct);
    var enumKinds = kinds.filter(function (k) { return k !== T_CMAP; });
    var spaces = enumKinds.map(function (k) { return dom[k] || [0]; });
    var total = 1;
    for (i = 0; i < spaces.length; i++) total *= Math.max(1, spaces[i].length);
    if (total > workCap) return [];
    var out = [], combos = product(spaces);
    for (i = 0; i < combos.length && out.length < cap; i++) {
      var theta;
      if (slot === null) theta = combos[i];
      else {
        var table = fitTable(struct[0], combos[i], pairs, env);
        if (!table) continue;
        theta = combos[i].slice();
        theta.splice(slot, 0, table);
      }
      var p = new Prog(struct, theta, env), ok = true;
      for (j = 0; j < pairs.length; j++) {
        var got = p.run(pairs[j][0]);
        if (got === null || !G.gEq(got, pairs[j][1])) { ok = false; break; }
      }
      if (ok) out.push(theta);
    }
    out.sort(function (a, b) { return thetaBits(struct, a) - thetaBits(struct, b); });
    return out.slice(0, cap);
  }

  PROG = {
    T_GRID: T_GRID, T_COLOR: T_COLOR, T_INT: T_INT, T_DIR: T_DIR, T_SEL: T_SEL,
    T_SEG: T_SEG, T_AXIS: T_AXIS, T_CMAP: T_CMAP, T_KEY: T_KEY,
    VAR: VAR, hole: hole, isHole: isHole, isVar: isVar, OPS: OPS,
    register: register, opBits: opBits, structOf: structOf, holesOf: holesOf,
    structBits: structBits, thetaBits: thetaBits, render: render, Prog: Prog,
    makeEnv: makeEnv, domains: domains, product: product, refit: refit,
    fitTable: fitTable, cmapSlot: cmapSlot, evalNode: evalNode, iterOf: iterOf,
    SELECTORS: SELECTORS, SEGMODES: SEGMODES, KEYS: KEYS, objsOf: objsOf,
    feature: feature
  };
})();

