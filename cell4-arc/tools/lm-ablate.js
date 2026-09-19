/* Ablations.
 *
 *   node tools/lm-ablate.js [--out measurements/lm-ablation.json]
 *
 * Each run disables one component and re-scores the whole battery, so the
 * contribution of each part of the architecture is measured rather than
 * assumed. A component that costs nothing when removed is complexity.
 */
"use strict";
var fs = require("fs");
var path = require("path");
var cp = require("child_process");
var rt = require("./lm-runtime.js");

function arg(n, d) { var i = process.argv.indexOf("--" + n); return i < 0 ? d : (process.argv[i + 1] || true); }
var OUT = String(arg("out", "measurements/lm-ablation.json"));

var ABLATIONS = [
  { id: "none", disable: "", note: "full system" },
  { id: "no-kb", disable: "kb", note: "local knowledge base off" },
  { id: "no-reasoning", disable: "reasoning", note: "reasoning graph off (arithmetic, logic, sequences)" },
  { id: "no-retrieval", disable: "retrieval", note: "BM25F + identity-tier retrieval off" },
  { id: "no-dialogue", disable: "dialogue", note: "discourse state / anaphora off" },
  { id: "no-code", disable: "code", note: "code construction off" },
  { id: "no-ambiguity", disable: "ambiguity", note: "sense clarification off" },
  { id: "no-web", disable: "web", note: "public-source federation off" },
  { id: "no-normalization", disable: "normalize", note: "shared normalisation off (spell repair, preamble removal, format parsing)" },
  { id: "no-adaptive-depth", disable: "depth", note: "adaptive depth off (every resolver runs, routing ignored)" }
];

function runOne(a) {
  var out = path.join("/tmp", "lm-ablate-" + a.id + ".json");
  var args = ["tools/lm-eval.js", "--out", out, "--label", a.id];
  if (a.disable) args.push("--disable", a.disable);
  cp.execFileSync(process.execPath, args, { cwd: rt.ROOT, stdio: ["ignore", "pipe", "pipe"], timeout: 1800000 });
  var j = JSON.parse(fs.readFileSync(out, "utf8"));
  return j.summary;
}

var rows = [];
for (var i = 0; i < ABLATIONS.length; i++) {
  var a = ABLATIONS[i];
  process.stdout.write("running " + a.id + " ... ");
  var s;
  try { s = runOne(a); } catch (e) { console.log("FAILED: " + e.message); continue; }
  rows.push({
    id: a.id, note: a.note, accuracy_pct: s.accuracy_pct,
    turn_accuracy_pct: s.turn_accuracy_pct, hallucinations: s.hallucinations,
    p50_ms: s.latency.p50, p95_ms: s.latency.p95, defects: s.synthesis_defects
  });
  console.log(s.accuracy_pct + "%  p50 " + s.latency.p50 + " ms");
}
var base = rows.filter(function (r) { return r.id === "none"; })[0];
rows.forEach(function (r) {
  r.accuracy_delta = base ? Math.round((r.accuracy_pct - base.accuracy_pct) * 10) / 10 : null;
});
var p = path.isAbsolute(OUT) ? OUT : path.join(rt.ROOT, OUT);
fs.mkdirSync(path.dirname(p), { recursive: true });
fs.writeFileSync(p, JSON.stringify({ generated: new Date().toISOString(), rows: rows }, null, 1));
console.log("\n" + rows.map(function (r) {
  return r.id.padEnd(16) + String(r.accuracy_pct).padStart(6) + "%  delta " +
         String(r.accuracy_delta).padStart(6) + "  p50 " + String(r.p50_ms).padStart(6) + " ms  " + r.note;
}).join("\n"));
console.log("wrote " + p);
