/* ===== src/48-canvastree.js ===== */
/* Port of engine/solvers/canvastree.py -- per-output-cell rules for canvases
 * whose shape is not the input's.
 *
 * ``celltree`` explains grids whose output has the input's shape. A large ARC
 * family instead paints a canvas that is a fixed multiple of the input --
 * fractal stamps, scaled copies, mirrored tilings, block expansions -- or
 * reduces the input by a fixed factor. There the unit of induction is an
 * OUTPUT cell, and the useful features are what the input says at the
 * positions that cell could have come from: the division read (scaling), the
 * modulo read (tiling), both under the four reflections, and where inside the
 * repeating block the cell sits.
 */

var CANVASTREE = null;

(function () {
  var OOB = -1;
  var CAP = 90 * 90 * 5;

  var UP_BITS = [2.0, 2.0, 3.0, 3.0, 3.0, 3.0, 3.0, 3.0, 2.5, 2.5, 3.5, 3.5,
                 2.0, 2.0, 2.5, 2.5, 2.5, 3.0, 4.0, 4.0, 4.0, 3.0];
  var DN_BITS = [2.0, 2.5, 2.5, 3.0, 3.0, 3.5, 3.5, 2.5, 2.5, 3.0, 3.0];

  function ratio(ctx) {
    var rs = {}, i, k = null;
    for (i = 0; i < ctx.train.length; i++) {
      var a = G.dims(ctx.train[i][0]), b = G.dims(ctx.train[i][1]);
      if (b[0] % a[0] || b[1] % a[1]) return null;
      k = [b[0] / a[0], b[1] / a[1]];
      rs[k.join("x")] = k;
    }
    var keys = Object.keys(rs);
    if (keys.length !== 1) return null;
    k = rs[keys[0]];
    if (k[0] === 1 && k[1] === 1) return null;
    return (k[0] <= 8 && k[1] <= 8) ? k : null;
  }

  function invRatio(ctx) {
    var rs = {}, i, k = null;
    for (i = 0; i < ctx.train.length; i++) {
      var a = G.dims(ctx.train[i][0]), b = G.dims(ctx.train[i][1]);
      if (a[0] % b[0] || a[1] % b[1]) return null;
      k = [a[0] / b[0], a[1] / b[1]];
      rs[k.join("x")] = k;
    }
    var keys = Object.keys(rs);
    if (keys.length !== 1) return null;
    k = rs[keys[0]];
    if (k[0] === 1 && k[1] === 1) return null;
    return (k[0] <= 8 && k[1] <= 8) ? k : null;
  }

  function upRows(g, ky, kx, bg, out) {
    var d = G.dims(g), h = d[0], w = d[1], H = h * ky, W = w * kx;
    var fh = g.map(function (row) { return row.slice().reverse(); });
    var fv = g.slice().reverse();
    var f180 = fv.map(function (row) { return row.slice().reverse(); });
    var nfg = 0, rown = [], coln = [], r, c;
    for (r = 0; r < h; r++) {
      var n = 0;
      for (c = 0; c < w; c++) if (g[r][c] !== bg) { n++; nfg++; }
      rown.push(n);
    }
    for (c = 0; c < w; c++) {
      var n2 = 0;
      for (r = 0; r < h; r++) if (g[r][c] !== bg) n2++;
      coln.push(n2);
    }
    var rows = [], R, C;
    for (R = 0; R < H; R++) for (C = 0; C < W; C++) {
      var br = Math.floor(R / ky), bc = Math.floor(C / kx);
      var ir = R % h, ic = C % w;
      var sd = g[br][bc], sm = g[ir][ic];
      var f = [sd, sm, fh[br][bc], fv[br][bc], f180[br][bc],
               fh[ir][ic], fv[ir][ic], f180[ir][ic],
               R % ky, C % kx, Math.min(br, 15), Math.min(bc, 15),
               sd === bg ? 1 : 0, sm === bg ? 1 : 0,
               R % 2, C % 2, (R + C) % 2, sd === sm ? 1 : 0,
               Math.min(rown[br], 9), Math.min(coln[bc], 9), Math.min(nfg, 20),
               ((R % ky === 0 || R % ky === ky - 1 ||
                 C % kx === 0 || C % kx === kx - 1) ? 1 : 0)];
      rows.push([f, out ? out[R][C] : null]);
    }
    return [rows, H, W];
  }

  function dnRows(g, ky, kx, bg, out) {
    var d = G.dims(g), h = d[0], w = d[1], H = Math.floor(h / ky), W = Math.floor(w / kx);
    var rows = [], R, C, i, j;
    for (R = 0; R < H; R++) for (C = 0; C < W; C++) {
      var block = [];
      for (i = 0; i < ky; i++) for (j = 0; j < kx; j++) block.push(g[R * ky + i][C * kx + j]);
      var hist = {}, nz = [];
      for (i = 0; i < block.length; i++) {
        hist[block[i]] = (hist[block[i]] || 0) + 1;
        if (block[i] !== bg) nz.push(block[i]);
      }
      var keys = Object.keys(hist).map(Number).sort(function (a, b) { return a - b; });
      var md = keys[0];
      for (i = 0; i < keys.length; i++) if (hist[keys[i]] > hist[md]) md = keys[i];
      var nzset = Array.from(new Set(nz)).sort(function (a, b) { return a - b; });
      var f = [md, keys.length, nz.length,
               nzset.length ? nzset[0] : OOB, nzset.length ? nzset[nzset.length - 1] : OOB,
               keys.length === 1 ? 1 : 0, nz.length === 0 ? 1 : 0,
               Math.min(R, 15), Math.min(C, 15), R % 2, C % 2];
      rows.push([f, out ? out[R][C] : null]);
    }
    return [rows, H, W];
  }

  function shaped(rows, H, W, tree) {
    var out = [], R, C, row;
    for (R = 0; R < H; R++) {
      row = new Array(W);
      for (C = 0; C < W; C++) row[C] = CELLTREE.predict(tree, rows[R * W + C][0]);
      out.push(row);
    }
    return out;
  }

  function applyUp(tree, g, ky, kx, bg) {
    var r = upRows(g, ky, kx, bg, null);
    return shaped(r[0], r[1], r[2], tree);
  }

  function applyDn(tree, g, ky, kx, bg) {
    var r = dnRows(g, ky, kx, bg, null);
    return shaped(r[0], r[1], r[2], tree);
  }

  function banksUp() {
    return [["scale", [0, 8, 9, 12, 13, 17, 21]],
            ["tile", [1, 5, 6, 7, 8, 9, 10, 11]],
            ["fractal", [0, 1, 12, 13, 17, 8, 9]],
            ["all", UP_BITS.map(function (_v, i) { return i; })]];
  }

  function generate(ctx) {
    var bg = ctx.bg();
    var up = ratio(ctx), dn = up ? null : invRatio(ctx);
    if (!up && !dn) return [];
    var rows = [], total = 0, i, res = [];
    for (i = 0; i < ctx.train.length; i++) {
      var a = ctx.train[i][0], b = ctx.train[i][1], got;
      if (up) got = upRows(a, up[0], up[1], bg, b);
      else {
        var da = G.dims(a);
        if (da[0] % dn[0] || da[1] % dn[1]) return [];
        got = dnRows(a, dn[0], dn[1], bg, b);
      }
      var db = G.dims(b);
      if (got[1] !== db[0] || got[2] !== db[1]) return [];
      total += got[0].length;
      if (total > CAP) return [];
      rows = rows.concat(got[0]);
    }
    if (!rows.length) return [];
    var bits = up ? UP_BITS : DN_BITS;
    var list = up ? banksUp() : [["block", DN_BITS.map(function (_v, i2) { return i2; })]];
    var m = ctx.train.length;
    for (var bi = 0; bi < list.length; bi++) {
      if (ctx.timed_out()) break;
      var label = list[bi][0], allowed = list[bi][1];
      var fit = CELLTREE.growWith(rows, allowed, bits,
        Math.max(4, Math.min(48, Math.floor(rows.length / 16))));
      if (!fit) continue;
      var tree = fit[0], splits = fit[1];
      var held = true;
      if (m >= 3) {
        for (i = 0; i < m && held; i++) {
          var sub = [];
          for (var j = 0; j < m; j++) {
            if (j === i) continue;
            var gg = ctx.train[j][0], bb = ctx.train[j][1];
            var rr = up ? upRows(gg, up[0], up[1], bg, bb) : dnRows(gg, dn[0], dn[1], bg, bb);
            sub = sub.concat(rr[0]);
          }
          var f2 = CELLTREE.growWith(sub, allowed, bits,
            Math.max(4, Math.min(48, Math.floor(sub.length / 16))));
          if (!f2) { held = false; break; }
          try {
            var got2 = up ? applyUp(f2[0], ctx.train[i][0], up[0], up[1], bg)
                          : applyDn(f2[0], ctx.train[i][0], dn[0], dn[1], bg);
            if (!G.gEq(got2, ctx.train[i][1])) held = false;
          } catch (e) { held = false; }
        }
      }
      var cost = 1.0 + CELLTREE.bitsWith(tree, bits) / 12.0 + (held ? 0.0 : 3.0);
      if (up) {
        res.push(new Hyp("canvas_up[" + label + "," + up[0] + "x" + up[1] + "," + splits + "]",
          (function (t, k, b) { return function (g) { return applyUp(t, g, k[0], k[1], b); }; })(tree, up, bg),
          cost, "tiling"));
      } else {
        res.push(new Hyp("canvas_dn[" + label + "," + dn[0] + "x" + dn[1] + "," + splits + "]",
          (function (t, k, b) { return function (g) { return applyDn(t, g, k[0], k[1], b); }; })(tree, dn, bg),
          cost, "tiling"));
      }
    }
    return res;
  }

  CANVASTREE = { ratio: ratio, invRatio: invRatio, upRows: upRows, dnRows: dnRows,
                 applyUp: applyUp, applyDn: applyDn };
  defSolver("canvastree", "tiling", generate, 2, 1.0);
})();

