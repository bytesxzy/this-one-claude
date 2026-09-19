/* Local latency benchmark.
 *
 *   node tools/lm-bench.js [--n 1200] [--out measurements/lm-perf.json]
 *
 * Measures the language stack alone: one boot, then N routed questions with
 * no network involved. Cold (first call) and warm are reported separately,
 * because the first call pays for index construction and the caches.
 */
"use strict";
var fs = require("fs");
var path = require("path");
var rt = require("./lm-runtime.js");
var CASES = require("./lm-tests.js").CASES;

function arg(n, d) { var i = process.argv.indexOf("--" + n); return i < 0 ? d : (process.argv[i + 1] || true); }
var N = Number(arg("n", 1200));
var OUT = String(arg("out", "measurements/lm-perf.json"));

function quantile(sorted, p) {
  if (!sorted.length) return 0;
  var i = Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)));
  return Math.round(sorted[i] * 1000) / 1000;
}

async function main() {
  var win = rt.boot({ fetch: function () { return Promise.reject(new Error("offline")); } });
  var LM = win.C4LM;
  if (!LM || !LM.ready()) { console.error("language stack not ready"); process.exit(1); }

  /* Local questions only: anything needing the network would measure the
     network, not the model. */
  var pool = [];
  CASES.forEach(function (c) {
    if (c.turns) { c.turns.forEach(function (t) { pool.push(t.q); }); return; }
    if (c.cat === "current") return;
    if (c.q) pool.push(c.q);
  });
  /* Plus systematic variations so the benchmark is not one hot cache line. */
  var extra = [];
  pool.forEach(function (q) {
    extra.push(q.toLowerCase());
    extra.push(q.replace(/\?/g, ""));
  });
  pool = pool.concat(extra);

  var cold = [], warm = [], byRoute = {};
  function record(ms, route, arr) {
    arr.push(ms);
    var b = byRoute[route] || (byRoute[route] = []);
    b.push(ms);
  }

  /* Cold: a fresh boot per question for the first 40, to measure the real
     first-call cost including index construction. */
  for (var c = 0; c < 40; c++) {
    var w2 = rt.boot({ fetch: function () { return Promise.reject(new Error("offline")); } });
    var q0 = pool[c % pool.length];
    var t0 = process.hrtime.bigint();
    var r0 = await w2.C4LM.answer(q0);
    var ms0 = Number(process.hrtime.bigint() - t0) / 1e6;
    record(ms0, r0.route, cold);
  }

  /* Warm: one process, N questions. */
  for (var i = 0; i < N; i++) {
    var q = pool[i % pool.length];
    if (i % 17 === 0) LM.reset();
    var t = process.hrtime.bigint();
    var r = await LM.answer(q);
    var ms = Number(process.hrtime.bigint() - t) / 1e6;
    record(ms, r.route, warm);
  }

  warm.sort(function (a, b) { return a - b; });
  cold.sort(function (a, b) { return a - b; });
  var routes = {};
  Object.keys(byRoute).forEach(function (k) {
    var a = byRoute[k].slice().sort(function (x, y) { return x - y; });
    routes[k] = { n: a.length, p50: quantile(a, 0.5), p95: quantile(a, 0.95) };
  });

  var cpu = process.cpuUsage();
  var out = {
    generated: new Date().toISOString(),
    node: process.version,
    warm_queries: warm.length,
    cold_queries: cold.length,
    distinct_prompts: new Set(pool).size,
    warm: { p50: quantile(warm, 0.5), p90: quantile(warm, 0.9), p95: quantile(warm, 0.95),
            p99: quantile(warm, 0.99), max: quantile(warm, 1),
            mean: Math.round((warm.reduce(function (a, b) { return a + b; }, 0) / warm.length) * 1000) / 1000 },
    cold: { p50: quantile(cold, 0.5), p95: quantile(cold, 0.95),
            mean: Math.round((cold.reduce(function (a, b) { return a + b; }, 0) / cold.length) * 1000) / 1000 },
    by_route: routes,
    cpu_user_ms: Math.round(cpu.user / 1000),
    cpu_system_ms: Math.round(cpu.system / 1000),
    throughput_qps: Math.round(1000 / (warm.reduce(function (a, b) { return a + b; }, 0) / warm.length))
  };
  var p = path.isAbsolute(OUT) ? OUT : path.join(rt.ROOT, OUT);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
}
main().catch(function (e) { console.error(e); process.exit(1); });
