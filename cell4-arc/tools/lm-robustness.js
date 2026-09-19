/* Robustness and failure-mode tests for the language stack.
 *
 *   node tools/lm-robustness.js
 *
 * Covers the conditions a browser actually produces: no network, a source
 * that hangs, a source that returns nonsense, a corrupted cached artifact, a
 * missing conversation pack, empty input, enormous input, and input that is
 * not language at all. Nothing here may throw, and nothing may hang.
 */
"use strict";
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var rt = require("./lm-runtime.js");

var results = [];
function check(name, ok, detail) {
  results.push({ name: name, ok: !!ok, detail: detail || "" });
  console.log((ok ? "  ok   " : "  FAIL ") + name + (detail ? "  (" + detail + ")" : ""));
}

function offlineFetch() { return Promise.reject(new Error("offline")); }
function hangingFetch() { return new Promise(function () {}); }
function garbageFetch() {
  return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ nonsense: true, query: null }); } });
}
function flakyFetch(rateOk) {
  return function (u) {
    if (Math.random() < rateOk) {
      return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ query: { pages: {} } }); } });
    }
    return Promise.reject(new Error("network"));
  };
}

async function main() {
  /* ---------------------------------------------------------- syntax */
  var files = fs.readdirSync(rt.ROOT).filter(function (f) { return /^c4-lm.*\.js$/.test(f); });
  files.forEach(function (f) {
    try {
      new vm.Script(fs.readFileSync(path.join(rt.ROOT, f), "utf8"), { filename: f });
      check("syntax: " + f, true);
    } catch (e) { check("syntax: " + f, false, e.message); }
  });

  /* --------------------------------------------------- boot integrity */
  var win = rt.boot({ fetch: offlineFetch });
  check("page boots with no load errors", !(win.__loadErrors || []).length, (win.__loadErrors || []).join("; "));
  check("robots API present", typeof win.robots === "object" && typeof win.robots.ask === "function");
  check("language stack ready", !!(win.C4LM && win.C4LM.ready()));
  check("knowledge base built", !!(win.C4LMKB && win.C4LMKB.size() > 100), win.C4LMKB ? String(win.C4LMKB.size()) : "none");
  check("no artificial delay in page source",
    !/setTimeout\([^)]*240\s*\+\s*Math\.random/.test(fs.readFileSync(path.join(rt.ROOT, "c4-mini.html"), "utf8")));

  /* in-page self test still passes */
  /* The page ships one assertion that cannot pass in this workspace: it
     checks for the c4-reason/c4-lua/c4-lang/c4-knowledge modules, which are
     referenced by the page but are not part of this repository. It fails on
     the unmodified page too, so the bar is "no NEW failures". */
  var st = null;
  try { st = win.robots.selfTest(); } catch (e) {}
  var stFails = st ? st.results.filter(function (r) { return !r.pass; }).map(function (r) { return r.name; }) : ["threw"];
  var expected = ["reason modules loaded"];
  var unexpected = stFails.filter(function (n) { return expected.indexOf(n) < 0; });
  check("in-page self test (no new failures)", st && !unexpected.length,
    st ? (st.passed + "/" + st.total + (stFails.length ? "; pre-existing: " + stFails.join(", ") : "")) : "threw");

  /* ------------------------------------------------------ input edges */
  var edges = [
    ["empty string", ""],
    ["whitespace only", "     "],
    ["punctuation only", "?!?!?!"],
    ["single character", "x"],
    ["emoji only", "😀😀"],
    ["control characters", "a\u0000b\u0007c"],
    ["html injection", "<script>alert(1)</script> what is the capital of France?"],
    ["sql-ish input", "'; DROP TABLE users; --"],
    ["regex metacharacters", "what is (a|b)*[]{}\\ ?"],
    ["very long input", "why " + "very ".repeat(4000) + "long question about photosynthesis?"],
    ["repeated word", "the the the the the the the"],
    ["non-latin script", "你好，世界"],
    ["mixed script", "what is π and Σ?"],
    ["numbers only", "1 2 3 4 5"],
    ["newlines", "what is\nthe capital\nof France?"]
  ];
  for (var i = 0; i < edges.length; i++) {
    var name = edges[i][0], input = edges[i][1];
    var r = null, threw = "";
    try { r = await rt.askOnce(win, input, 12000); } catch (e) { threw = e.message; }
    var ok = !threw && r && typeof r.text === "string" && !r.timedOut &&
             !/\bundefined\b|\[object Object\]|\bNaN\b/.test(r.text);
    check("edge input: " + name, ok, threw || (r && r.timedOut ? "timed out" : (r ? r.text.slice(0, 40) : "no result")));
  }

  /* ------------------------------------------------------- repeatability */
  var a1 = await rt.askOnce(win, "What is the capital of France?", 10000);
  var a2 = await rt.askOnce(win, "What is the capital of France?", 10000);
  check("repeated question is stable", a1.text === a2.text, a1.text.slice(0, 30) + " / " + a2.text.slice(0, 30));
  check("repeat is not slower", a2.latency_ms <= a1.latency_ms + 30, a1.latency_ms + " -> " + a2.latency_ms);

  /* --------------------------------------------------------- network */
  var w2 = rt.boot({ fetch: offlineFetch });
  var off1 = await rt.askOnce(w2, "What is 17 * 23?", 10000);
  check("offline: local computation unaffected", /391/.test(off1.text), off1.text.slice(0, 40));
  var off2 = await rt.askOnce(w2, "What is the capital of France?", 10000);
  check("offline: local knowledge unaffected", /Paris/.test(off2.text), off2.text.slice(0, 40));
  var off3 = await rt.askOnce(w2, "What is the current Bitcoin price?", 12000);
  check("offline: current question degrades honestly",
    /could not reach|local knowledge|may be out of date|don't have/i.test(off3.text), off3.text.slice(0, 60));

  var w3 = rt.boot({ fetch: hangingFetch });
  var t0 = Date.now();
  var hung = await rt.askOnce(w3, "What is the current Bitcoin price?", 20000);
  var hungMs = Date.now() - t0;
  check("hanging source does not hang the answer", !!hung.text && hungMs < 9000, hungMs + " ms");

  var w4 = rt.boot({ fetch: garbageFetch });
  var garb = await rt.askOnce(w4, "What is the latest stable Python release?", 15000);
  check("garbage source response handled", !!garb.text && !/undefined|\[object/.test(garb.text), garb.text.slice(0, 50));

  var w5 = rt.boot({ fetch: flakyFetch(0.5) });
  var flaky = await rt.askOnce(w5, "What is the current stable version of Node.js?", 15000);
  check("partially unavailable sources handled", !!flaky.text, flaky.text.slice(0, 50));

  /* ------------------------------------------- corrupted local artifacts */
  var w6 = rt.boot({ fetch: offlineFetch });
  try {
    w6.localStorage.setItem("robots.text.model.v1", "{ this is not json");
    w6.localStorage.setItem("robots.conv.pack.v1", "\u0000\u0001garbage");
    w6.localStorage.setItem("robots.lm.v1", "[]");
  } catch (e) {}
  var corrupt = await rt.askOnce(w6, "What is the capital of France?", 10000);
  check("corrupted cached artifacts tolerated", /Paris/.test(corrupt.text), corrupt.text.slice(0, 40));

  var w7 = rt.boot({ fetch: offlineFetch });   /* conversation pack never arrives */
  var noPack = await rt.askOnce(w7, "hey", 10000);
  check("missing conversation pack tolerated", !!noPack.text && noPack.text.length > 2, noPack.text.slice(0, 40));

  /* ------------------------------------------------- dialogue sequences */
  var w8 = rt.boot({ fetch: offlineFetch });
  var seq = [
    ["Tell me about Albert Einstein.", /physic|relativity/i],
    ["When was he born?", /1879/],
    ["What about his education?", /Zurich|Polytechnic|doctorate|univers/i],
    ["Anyway, what's photosynthesis?", /light|plant/i],
    ["why?", /.{20,}/],
    ["What is 6 * 7?", /42/]
  ];
  var seqOk = true, seqDetail = "";
  for (var s = 0; s < seq.length; s++) {
    var sr = await rt.askOnce(w8, seq[s][0], 12000);
    if (!seq[s][1].test(sr.text)) { seqOk = false; seqDetail += "[" + seq[s][0] + " -> " + sr.text.slice(0, 40) + "] "; }
  }
  check("dialogue sequence", seqOk, seqDetail);

  /* ---------------------------------------------- code execution paths */
  var w9 = rt.boot({ fetch: offlineFetch });
  var codeAns = await rt.askOnce(w9, "In JavaScript, write a function that removes duplicate values from an array while preserving order.", 12000);
  check("code construction returns verified code", /function|=>/.test(codeAns.text), codeAns.text.slice(0, 40));
  var verified = codeAns.raw && codeAns.raw.codeBlock;
  check("emitted program was executed against its example", !!(verified && verified.ran), verified ? String(verified.ran) : "no block");

  var sqlAns = await rt.askOnce(w9, "Write a SQL query that counts users grouped by country.", 12000);
  check("SQL construction", /select/i.test(sqlAns.text) && /group by/i.test(sqlAns.text), sqlAns.text.slice(0, 50));

  /* ---------------------------------------------------------- summary */
  var failed = results.filter(function (r) { return !r.ok; });
  console.log("\n" + (results.length - failed.length) + "/" + results.length + " checks passed");
  fs.writeFileSync(path.join(rt.ROOT, "measurements/lm-robustness.json"),
    JSON.stringify({ generated: new Date().toISOString(), passed: results.length - failed.length,
                     total: results.length, results: results }, null, 1));
  if (failed.length) process.exitCode = 1;
}
main().catch(function (e) { console.error(e); process.exit(1); });
