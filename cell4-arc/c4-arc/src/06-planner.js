/* ===== src/06-planner.js ===== */
/* Port of engine/planner.py -- a learned planner over reasoning actions.
 *
 * A sparse multinomial log-linear model over an action vocabulary: run a
 * particular hypothesis family, deepen the enumerator, or stop. The state
 * carries task descriptors, what has already run and produced nothing, how
 * many hypotheses currently fit, how much budget is left, and retrieved
 * memory of which families solved similar previously-solved tasks.
 *
 * It chooses order and budget only. Every program the search returns is still
 * executed against every training pair and discarded unless it reproduces all
 * of them, so a badly trained planner costs time and cannot make the engine
 * accept a wrong answer.
 */

var FAMILIES = ["geometry", "colormap", "partition", "symmetry", "tiling", "blocks",
  "select", "regions", "counting", "cellwise", "objects_map",
  "motion", "substitute", "sequence", "paint", "patterns", "analogy",
  "compose", "panelabs", "panelwise", "objwise", "rewrite", "cascade",
  "enumerate_dsl", "objproc", "assemble", "refine", "conditional", "paneltable",
  "selfstamp", "tally", "extend", "locate", "objchain", "relproc",
  /* families added after the shipped planner was fitted: a saved planner
     carries no weights for them, which leaves their logit at the zero baseline
     -- neutral -- rather than excluding them from the action set entirely,
     which is how a new family silently loses its whole time slice */
  "celltree", "canvastree", "paneltree", "typed"];
var CONTROL = ["deepen", "stop"];
var ACTIONS = FAMILIES.concat(CONTROL);

function _sigFeatures(sigs) {
  var out = [], i;
  for (i = 0; i < sigs.length; i++) out.push("t:" + sigs[i]);
  return out;
}

function _historyFeatures(ran, nFit, fracLeft, step) {
  var f = [], i;
  for (i = 0; i < ran.length; i++) f.push("h:ran:" + ran[i]);
  f.push("h:nran:" + Math.min(ran.length, 12));
  f.push("h:fit:" + (nFit === 0 ? "none" : (nFit < 5 ? "few" : "many")));
  f.push("h:left:" + (fracLeft > 0.66 ? "hi" : (fracLeft > 0.33 ? "mid" : "lo")));
  f.push("h:step:" + Math.min(step, 10));
  return f;
}

/* Signature -> families that solved tasks with that signature. Stores
   reasoning outcomes, never task content and never an answer grid. */
function Memory(data) {
  this.rows = data || [];
}

Memory.prototype.features = function (sigs, k, exclude) {
  if (k === undefined) k = 12;
  if (!this.rows.length) return [];
  var q = new Set(sigs), scored = [], i, j, row, s, fam, tid, inter, uni, jac;
  for (i = 0; i < this.rows.length; i++) {
    row = this.rows[i];
    s = row[0]; fam = row[1]; tid = row.length > 2 ? row[2] : "";
    if (exclude !== undefined && exclude !== null && tid === exclude) continue;
    inter = 0;
    var seen = new Set();
    for (j = 0; j < s.length; j++) {
      if (seen.has(s[j])) continue;
      seen.add(s[j]);
      if (q.has(s[j])) inter++;
    }
    if (!inter) continue;
    uni = q.size + seen.size - inter;
    jac = inter / uni;
    scored.push([jac, fam]);
  }
  if (!scored.length) return [];
  /* Python's sorted(reverse=True) over (jac, family) tuples. */
  scored.sort(function (a, b) {
    if (a[0] !== b[0]) return b[0] - a[0];
    return a[1] < b[1] ? 1 : (a[1] > b[1] ? -1 : 0);
  });
  var top = scored.slice(0, k), agg = new Map(), tot = 0;
  for (i = 0; i < top.length; i++) tot += top[i][0];
  if (!tot) tot = 1.0;
  for (i = 0; i < top.length; i++)
    agg.set(top[i][1], (agg.get(top[i][1]) || 0) + top[i][0] / tot);
  var out = [];
  agg.forEach(function (v, f) {
    var b = v > 0.5 ? "hi" : (v > 0.2 ? "mid" : "lo");
    out.push("m:" + f + ":" + b);
  });
  return out;
};

function Planner(data) {
  var d = data || {}, feat;
  this.w = {};
  var src = d.w || {};
  for (feat in src) if (Object.prototype.hasOwnProperty.call(src, feat)) this.w[feat] = src[feat];
  this.memory = new Memory(d.memory || []);
  this.meta = d.meta || {};
  this.trained = Object.keys(this.w).length > 0;
}

Planner.prototype.features = function (sigs, ran, nFit, fracLeft, step, exclude) {
  return _sigFeatures(sigs)
    .concat(_historyFeatures(ran || [], nFit || 0,
                             fracLeft === undefined ? 1.0 : fracLeft, step || 0))
    .concat(this.memory.features(sigs, 12, exclude))
    .concat(["bias"]);
};

Planner.prototype.logits = function (feats) {
  var z = {}, i, a, f, row, hasRel = false;
  for (i = 0; i < ACTIONS.length; i++) z[ACTIONS[i]] = 0.0;
  for (i = 0; i < feats.length; i++) {
    row = this.w[feats[i]];
    if (!row) continue;
    for (a in row) if (Object.prototype.hasOwnProperty.call(row, a)) {
      if (z[a] !== undefined) {
        z[a] += row[a];
        if (a === "relproc") hasRel = true;
      }
    }
  }
  /* Policies predating the peer-parameterised object algebra carry no
     relproc weights; transfer the object-induction prior until trained. */
  if (!hasRel) z.relproc = z.objproc;
  return z;
};

Planner.prototype.distribution = function (sigs, ran, nFit, fracLeft, step, available) {
  var feats = this.features(sigs, ran, nFit, fracLeft, step);
  var z = this.logits(feats), keys = [], i, a;
  for (i = 0; i < ACTIONS.length; i++) {
    a = ACTIONS[i];
    if (!available || available.has(a)) keys.push(a);
  }
  if (!keys.length) return {};
  var peak = -Infinity;
  for (i = 0; i < keys.length; i++) if (z[keys[i]] > peak) peak = z[keys[i]];
  var ex = {}, tot = 0;
  for (i = 0; i < keys.length; i++) { ex[keys[i]] = Math.exp(z[keys[i]] - peak); tot += ex[keys[i]]; }
  if (!tot) tot = 1.0;
  var out = {};
  for (i = 0; i < keys.length; i++) out[keys[i]] = ex[keys[i]] / tot;
  return out;
};

var _ACTIVE_PLANNER = null;
function activatePlanner(p) { _ACTIVE_PLANNER = p; }
function activePlanner() { return _ACTIVE_PLANNER; }

/* Exploration floor. A proposal policy that trains on its own successes can
   quietly stop proposing a family, after which it never sees evidence that the
   family works, which is a loop the search cannot escape on its own. Mixing a
   uniform distribution over the VALID actions in with a fixed weight bounds how
   far any single round can narrow the search:

       pi~ = (1 - eps) * pi + eps * u                                        */
var PLANNER_EPSILON = 0.10;

function explore(dist, epsilon, available) {
  var eps = (epsilon === undefined || epsilon === null) ? PLANNER_EPSILON : epsilon;
  eps = Math.min(Math.max(eps, 0.0), 1.0);
  var keys = {}, a;
  for (a in dist) if (dist.hasOwnProperty(a)) keys[a] = 1;
  if (available) available.forEach(function (x) { keys[x] = 1; });
  var names = Object.keys(keys).sort();
  if (!names.length) return {};
  var u = 1.0 / names.length, out = {}, total = 0, i;
  for (i = 0; i < names.length; i++) {
    out[names[i]] = (1.0 - eps) * (dist[names[i]] || 0.0) + eps * u;
    total += out[names[i]];
  }
  if (!total) total = 1.0;
  for (i = 0; i < names.length; i++) out[names[i]] /= total;
  return out;
}

var PLANNER = {
  FAMILIES: FAMILIES, ACTIONS: ACTIONS, Planner: Planner, Memory: Memory,
  activate: activatePlanner, active: activePlanner,
  explore: explore, EPSILON: PLANNER_EPSILON
};

