/* Web-path latency benchmark.
 *
 *   node tools/mock-sources.js &          # controlled, uneven source delays
 *   node tools/lm-web-bench.js
 *
 * The public endpoints are not reachable from this evaluation environment and
 * their real latency is not repeatable anyway, so the federation is pointed
 * at a local stand-in that answers the same URL and JSON shapes with fixed
 * delays -- including one straggler at 3-4 seconds. What is being measured is
 * the SCHEDULER: does an answer arrive when the evidence is sufficient, or
 * only when the slowest source has replied?
 */
"use strict";
var fs = require("fs");
var path = require("path");
var rt = require("./lm-runtime.js");

function arg(n, d) { var i = process.argv.indexOf("--" + n); return i < 0 ? d : (process.argv[i + 1] || true); }
var BASE = String(arg("base", "http://127.0.0.1:8781"));
var OUT = String(arg("out", "measurements/lm-web-perf.json"));

function proxied() {
  return function (u, o) {
    var m = String(u).match(/^https?:\/\/([^\/]+)(.*)$/);
    if (!m) return globalThis.fetch(u, o);
    return globalThis.fetch(BASE + "/" + m[1] + m[2], o);
  };
}

var QUESTIONS = [
  "What is the current stable version of Node.js?",
  "What is the latest stable Python release?",
  "What is the current Bitcoin price?",
  "What is the current exchange rate for the dollar?",
  "What is the newest release of npm?"
];

async function run(label, opts) {
  var lat = [], sources = [], reasons = [], texts = [];
  for (var i = 0; i < QUESTIONS.length; i++) {
    var win = rt.boot({ fetch: proxied() });
    if (opts.ablate) win.C4LM.ablate(opts.ablate);
    if (opts.federation) {
      for (var k in opts.federation) win.C4LM.state.federation[k] = opts.federation[k];
    }
    var t = process.hrtime.bigint();
    var r = await win.C4LM.answer(QUESTIONS[i]);
    lat.push(Number(process.hrtime.bigint() - t) / 1e6);
    sources.push((r.sources || []).length);
    reasons.push(r.reason || r.route);
    texts.push(String(r.text).slice(0, 80));
  }
  lat.sort(function (a, b) { return a - b; });
  return {
    label: label,
    n: lat.length,
    p50: Math.round(lat[Math.floor(lat.length / 2)] * 10) / 10,
    p95: Math.round(lat[Math.min(lat.length - 1, Math.floor(0.95 * (lat.length - 1)))] * 10) / 10,
    max: Math.round(lat[lat.length - 1] * 10) / 10,
    mean: Math.round((lat.reduce(function (a, b) { return a + b; }, 0) / lat.length) * 10) / 10,
    avg_sources: Math.round((sources.reduce(function (a, b) { return a + b; }, 0) / sources.length) * 100) / 100,
    completion_reasons: reasons,
    samples: texts
  };
}

async function main() {
  var results = [];
  results.push(await run("early-completion (shipping)", {}));
  results.push(await run("early-completion disabled (deadline only)", { ablate: ["early"] }));
  results.push(await run("old-style 7s per-source, 10s deadline",
    { ablate: ["early"], federation: { perSourceTimeout: 7000, deadline: 10000 } }));

  var out = { generated: new Date().toISOString(), base: BASE, questions: QUESTIONS, results: results };
  var p = path.isAbsolute(OUT) ? OUT : path.join(rt.ROOT, OUT);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(out, null, 1));
  results.forEach(function (r) {
    console.log(r.label + ": p50 " + r.p50 + " ms, p95 " + r.p95 + " ms, max " + r.max +
                " ms, mean " + r.mean + " ms, sources " + r.avg_sources +
                ", finished by [" + r.completion_reasons.join(", ") + "]");
  });
  console.log("wrote " + p);
}
main().catch(function (e) { console.error(e); process.exit(1); });
