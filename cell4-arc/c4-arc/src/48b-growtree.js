/* ===== src/48b-growtree.js ===== */
/* Port of engine/solvers/growtree.py -- cell rules iterated to a fixed point.
 *
 * ``celltree`` learns one function from a cell's neighbourhood to its output
 * colour and applies it once. That is the wrong shape for rays, trails,
 * spirals, gravity and flood fill: a single pass has to know the answer at
 * every distance from the source at once, so it enumerates a case per length
 * and the first longer one in the test grid is wrong. Stated as a process the
 * same rule is one leaf -- if my upper-left neighbour is coloured and I am
 * background, take its colour -- and run to quiescence the ray is any length.
 *
 * The rounds are not in the data; they are recovered by layering the
 * difference. A changed cell may go in this round if it touches a settled cell
 * that CARRIES A COLOUR. Requiring a coloured source rather than merely a
 * settled neighbour is the whole trick: on a diagonal every cell touches
 * settled background, so the weaker test paints the ray in one round and
 * recovers nothing.
 *
 * A final round from the output to itself is included on purpose: without it
 * nothing says the process ever stops.
 */

var GROWTREE = null;

(function () {
  var MAX_LAYERS = 40;
  var MAX_STATES = 10;
  var MAX_ROWS = 40000;
  /* cheapest first. The full bank is NOT here: it reaches one more task
     offline and costs more than every other bank put together -- 141 features
     over tens of thousands of rows, at the end of a slice, is where this
     family stopped being affordable. */
  var BANK_NAMES = { "local": 1, "field": 1, "diag": 1, "gap": 1, "shape": 1,
                     "ray+pos": 1, "cascade": 1, "local+pos": 1 };

  function layers(a, b, bg, diag) {
    var h = G.gh(a), w = G.gw(a), r, c, i;
    var field = bg === null || bg === undefined ? G.background(a) : bg;
    var todo = {}, n = 0;
    for (r = 0; r < h; r++) {
      for (c = 0; c < w; c++) {
        if (a[r][c] !== b[r][c]) { todo[r * 100 + c] = [r, c]; n++; }
      }
    }
    if (!n || n === h * w) return null;
    var nb = diag ? CELLTREE.N8D : [[-1, 0], [1, 0], [0, -1], [0, 1]];
    var cur = [], out = [];
    for (r = 0; r < h; r++) cur.push(a[r].slice());
    while (n > 0) {
      var layer = [], k;
      for (k in todo) {
        if (!Object.prototype.hasOwnProperty.call(todo, k)) continue;
        var p = todo[k];
        for (i = 0; i < nb.length; i++) {
          var rr = p[0] + nb[i][0], cc = p[1] + nb[i][1];
          if (rr >= 0 && rr < h && cc >= 0 && cc < w
              && !Object.prototype.hasOwnProperty.call(todo, rr * 100 + cc)
              && cur[rr][cc] !== field) { layer.push(p); break; }
        }
      }
      if (!layer.length) return null;
      out.push(layer);
      if (out.length > MAX_LAYERS) return null;
      for (i = 0; i < layer.length; i++) {
        cur[layer[i][0]][layer[i][1]] = b[layer[i][0]][layer[i][1]];
        delete todo[layer[i][0] * 100 + layer[i][1]];
        n--;
      }
    }
    return out;
  }

  function states(a, b, ls) {
    var cur = [], r, i, j, seq = [];
    for (r = 0; r < G.gh(a); r++) cur.push(a[r].slice());
    seq.push(cur.map(function (x) { return x.slice(); }));
    for (i = 0; i < ls.length; i++) {
      for (j = 0; j < ls[i].length; j++) {
        cur[ls[i][j][0]][ls[i][j][1]] = b[ls[i][j][0]][ls[i][j][1]];
      }
      seq.push(cur.map(function (x) { return x.slice(); }));
    }
    return seq;
  }

  /* the first few rounds, the last, and a spread between: the start and the
     stop are the parts a rule gets wrong */
  function sample(n) {
    if (n <= MAX_STATES) {
      var all = [], i;
      for (i = 0; i < n; i++) all.push(i);
      return all;
    }
    var keep = {}, k;
    [0, 1, 2, n - 1, n - 2].forEach(function (x) { keep[x] = 1; });
    var step = Math.max(1, Math.floor(n / (MAX_STATES - 5)));
    for (k = 0; k < n; k += step) keep[k] = 1;
    var ks = Object.keys(keep).map(Number).sort(function (x, y) { return x - y; });
    return ks.slice(0, MAX_STATES);
  }

  function rowsFor(pairs, bg, diag, deadline) {
    var rows = [], depth = 0, i, ki, r, c;
    for (i = 0; i < pairs.length; i++) {
      var a = pairs[i][0], b = pairs[i][1];
      if (G.gh(a) !== G.gh(b) || G.gw(a) !== G.gw(b)) return null;
      var ls = layers(a, b, bg, diag);
      if (ls === null || ls.length < 2) return null;
      if (ls.length > depth) depth = ls.length;
      var seq = states(a, b, ls), idx = sample(seq.length);
      var h = G.gh(a), w = G.gw(a);
      for (ki = 0; ki < idx.length; ki++) {
        if (deadline && Date.now() / 1000 >= deadline) return null;
        var k = idx[ki], state = seq[k], nxt = (k + 1 < seq.length) ? seq[k + 1] : seq[k];
        var fa = CELLTREE.features(state, bg);
        for (r = 0; r < h; r++) {
          for (c = 0; c < w; c++) {
            var y = nxt[r][c];
            rows.push([fa[r][c], y === state[r][c] ? CELLTREE.KEEP : y]);
          }
        }
        if (rows.length > MAX_ROWS) return null;
      }
    }
    return [rows, depth];
  }

  function runTo(node, g, bg, cap) {
    var cur = g, i;
    for (i = 0; i < cap; i++) {
      var nxt = CELLTREE.applyTree(node, cur, bg, true);
      if (G.gEq(nxt, cur)) return cur;
      cur = nxt;
    }
    return null;
  }

  function capFor(g, depth) {
    return Math.min(120, Math.max(4 * depth + 4, G.gh(g) + G.gw(g)));
  }

  function fitPairs(pairs, bg, deadline, heldOut) {
    var out = [], di, bi, i, b;
    var all = CELLTREE.banks(), useBanks = [];
    for (i = 0; i < all.length; i++) {
      if (BANK_NAMES[all[i][0]]) useBanks.push(all[i]);
    }
    var ladder = [3, 6, 12, 24, 48];
    for (di = 0; di < 2; di++) {
      var diag = di === 0;
      var built = rowsFor(pairs, bg, diag, deadline);
      if (!built) continue;
      var rows = built[0], depth = built[1];
      var folds = null;
      if (heldOut !== false && pairs.length >= 3) {
        folds = [];
        for (i = 0; i < pairs.length; i++) {
          var sub = rowsFor(pairs.slice(0, i).concat(pairs.slice(i + 1)), bg,
                            diag, deadline);
          folds.push(sub ? sub[0] : null);
        }
      }
      for (bi = 0; bi < useBanks.length; bi++) {
        if (deadline && Date.now() / 1000 >= deadline) return out;
        var label = useBanks[bi][0], allowed = useBanks[bi][1];
        var tree = null, state = { leaves: 0, splits: 0 };
        for (i = 0; i < ladder.length; i++) {
          state = { leaves: 0, splits: 0 };
          tree = CELLTREE.grow(rows, allowed, 0, ladder[i], state);
          if (tree !== null) break;
        }
        if (tree === null) continue;
        /* the layered rows are a surrogate; running the process is the thing
           actually claimed, so that is what gets checked */
        var good = true;
        for (i = 0; i < pairs.length; i++) {
          var got = runTo(tree, pairs[i][0], bg, capFor(pairs[i][0], depth));
          if (got === null || !G.gEq(got, pairs[i][1])) { good = false; break; }
        }
        if (!good) continue;
        var held = true;
        if (folds) {
          for (i = 0; i < folds.length; i++) {
            if (!folds[i] || (deadline && Date.now() / 1000 >= deadline)) { held = false; break; }
            var t2 = null;
            for (b = 0; b < ladder.length; b++) {
              t2 = CELLTREE.grow(folds[i], allowed, 0, ladder[b], { leaves: 0, splits: 0 });
              if (t2 !== null) break;
            }
            if (t2 === null) { held = false; break; }
            var g2 = runTo(t2, pairs[i][0], bg, capFor(pairs[i][0], depth));
            if (g2 === null || !G.gEq(g2, pairs[i][1])) { held = false; break; }
          }
        }
        out.push([label + (diag ? "" : "4"), tree, CELLTREE.treeBits(tree),
                  state.splits, depth, held]);
      }
    }
    return out;
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
        var label = fits[i][0], tree = fits[i][1], bits = fits[i][2];
        var splits = fits[i][3], depth = fits[i][4], held = fits[i][5];
        var cost = 1.0 + bits / 12.0 + (held ? 0.0 : 3.0) + (bg === null ? 0.3 : 0.0);
        res.push(new Hyp("grow" + tag + "[" + label + "," + splits + "]",
                         (function (t, b, d) {
                           return function (g) { return runTo(t, g, b, capFor(g, d)); };
                         })(tree, bg, depth), cost, "cellwise"));
      }
    }
    return res;
  }

  GROWTREE = { layers: layers, fitPairs: fitPairs, run: runTo, capFor: capFor,
               generate: generate };
  /* NOT registered, and the measurement is why: probed alone it fits eleven of
     the 162 ARC-AGI-1 tasks the engine misses and is right about two, but
     inside the portfolio it reached six candidate lists and won none, and
     dropping it gained a task and lost nothing. Nine of eleven fits are
     consistent rules that are not the task's rule. Kept, with its exports,
     because the layering recovers a process from two states and that is worth
     having on the record. */
})();

