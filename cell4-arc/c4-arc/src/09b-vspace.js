/* ===== src/09b-vspace.js ===== */
/* Port of engine/vspace.py -- version-space predictive evidence.
 *
 *   Support_j(y) = sum_c 2^-l(c) * 2^-lambda*R_B(c;D) * p_B(y | x*_j, c, D)
 *
 * The hat on the version space is real: refit searches a declared, bounded
 * parameter budget, and nothing here claims the numbers are posteriors over
 * all fitting programs. Structure search never reruns -- c is frozen and only
 * its literals are refitted against a subset, because refitting the whole
 * portfolio per subset would measure whether the solver can find SOME
 * explanation, which is a different and much weaker question. Test outputs are
 * unreachable: only ctx.train pairs reach the refitter.
 */

var VSPACE = null;

(function () {
  var B_MAX = 6.0, LAMBDA = 1.0, K_THETA = 24, MAX_SUBSETS = 12;

  function combos(items, k) {
    if (k === 0) return [[]];
    if (k > items.length) return [];
    var out = [], i, j, rest;
    for (i = 0; i <= items.length - k; i++) {
      rest = combos(items.slice(i + 1), k - 1);
      for (j = 0; j < rest.length; j++) out.push([items[i]].concat(rest[j]));
    }
    return out;
  }

  function subsets(m) {
    if (m < 2) return [];
    var all = [], i, sizes = [m - 1], out = [];
    if (Math.max(1, m - 2) !== m - 1) sizes.push(Math.max(1, m - 2));
    for (i = 0; i < m; i++) all.push(i);
    sizes.forEach(function (s) {
      if (s >= 1 && s < m) out = out.concat(combos(all, s));
    });
    return out.slice(0, MAX_SUBSETS);
  }

  function Space(ctx) {
    this.ctx = ctx;
    this.cache = new Map();
    this.stats = { refits: 0, truncated: 0, empty: 0, structures: 0 };
  }

  Space.prototype.thetas = function (struct, mask) {
    var key = PROG.render(struct) + "|" + mask.join(",");
    if (this.cache.has(key)) return this.cache.get(key);
    var pairs = mask.map(function (i) { return this.ctx.train[i]; }, this), out;
    try { out = PROG.refit(struct, pairs, this.ctx, K_THETA); } catch (e) { out = []; }
    this.stats.refits++;
    if (out.length >= K_THETA) this.stats.truncated++;
    if (!out.length) this.stats.empty++;
    this.cache.set(key, out);
    return out;
  };

  Space.prototype.predictive = function (struct, thetas, grid) {
    if (!thetas.length) return new Map();
    var env = PROG.makeEnv(this.ctx), masses = new Map(), total = 0.0, i;
    for (i = 0; i < thetas.length; i++) {
      var w = Math.pow(2.0, -PROG.thetaBits(struct, thetas[i]));
      total += w;
      var y = new PROG.Prog(struct, thetas[i], env).run(grid);
      if (y === null) continue;
      var k = G.gkey(y);
      var rec = masses.get(k);
      if (rec) rec[1] += w; else masses.set(k, [y, w]);
    }
    if (total <= 0) return new Map();
    masses.forEach(function (rec) { rec[1] /= total; });
    return masses;
  };

  Space.prototype.regret = function (struct) {
    var m = this.ctx.train.length;
    if (m < 2) return 0.0;
    var subs = subsets(m), num = 0.0, den = 0.0, si, i;
    for (si = 0; si < subs.length; si++) {
      var mask = subs[si], omitted = [];
      for (i = 0; i < m; i++) if (mask.indexOf(i) < 0) omitted.push(i);
      if (!omitted.length) continue;
      var thetas = this.thetas(struct, mask), acc = 0.0;
      for (i = 0; i < omitted.length; i++) {
        var pair = this.ctx.train[omitted[i]];
        var pred = this.predictive(struct, thetas, pair[0]);
        var rec = pred.get(G.gkey(pair[1]));
        var p = rec ? rec[1] : 0.0;
        acc += p <= 0 ? B_MAX : Math.min(B_MAX, -Math.log(p) / Math.LN2);
      }
      var w = mask.length;
      num += w * acc / omitted.length;
      den += w;
    }
    return den ? num / den : 0.0;
  };

  function structuralSupport(progs, ctx, mode, space) {
    mode = mode || "version_space_predictive";
    space = space || new Space(ctx);
    var byStruct = new Map(), i;
    for (i = 0; i < progs.length; i++) {
      var k = PROG.render(progs[i].struct);
      if (!byStruct.has(k)) byStruct.set(k, [progs[i].struct, []]);
      byStruct.get(k)[1].push(progs[i]);
    }
    space.stats.structures = byStruct.size;
    var full = [];
    for (i = 0; i < ctx.train.length; i++) full.push(i);
    var out = ctx.test_inputs.map(function () { return new Map(); });
    var detail = [];
    byStruct.forEach(function (rec) {
      var struct = rec[0], members = rec[1];
      var sbits = PROG.structBits(struct), j;
      if (mode === "canonical_mdl") {
        var weight = Math.pow(2.0, -sbits);
        var best = members.slice().sort(function (a, b) {
          return a.thetaBits() - b.thetaBits(); })[0];
        for (j = 0; j < ctx.test_inputs.length; j++) {
          var y = best.run(ctx.test_inputs[j]);
          if (y === null) continue;
          var kk = G.gkey(y), cur = out[j].get(kk);
          if (cur) cur[1] += weight; else out[j].set(kk, [y, weight]);
        }
        detail.push({ struct: PROG.render(struct), bits: sbits, regret: null, fits: 1 });
        return;
      }
      var thetas = space.thetas(struct, full);
      if (!thetas.length) thetas = members.map(function (p) { return p.theta; });
      var regret = mode === "version_space_predictive" ? space.regret(struct) : 0.0;
      var w2 = Math.pow(2.0, -sbits - LAMBDA * regret);
      for (j = 0; j < ctx.test_inputs.length; j++) {
        space.predictive(struct, thetas, ctx.test_inputs[j]).forEach(function (r2, kk) {
          var cur = out[j].get(kk);
          if (cur) cur[1] += w2 * r2[1]; else out[j].set(kk, [r2[0], w2 * r2[1]]);
        });
      }
      detail.push({ struct: PROG.render(struct), bits: sbits,
                    regret: regret, fits: thetas.length });
    });
    return { support: out, detail: detail, stats: space.stats };
  }

  VSPACE = { B_MAX: B_MAX, LAMBDA: LAMBDA, K_THETA: K_THETA,
             subsets: subsets, Space: Space, structuralSupport: structuralSupport };
})();

