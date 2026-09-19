/* LM evaluation harness.
 *
 *   node tools/lm-eval.js --out measurements/lm-baseline.json [--online] [--mock]
 *
 * Boots the shipping page per case (so dialogue state never leaks between
 * unrelated cases), asks the question, and scores the answer on independent
 * axes. Expectations live in tools/lm-tests.js -- never in runtime code.
 */
"use strict";
var fs = require("fs");
var path = require("path");
var rt = require("./lm-runtime.js");
var CASES = require("./lm-tests.js").CASES;

var argv = process.argv.slice(2);
function arg(name, dflt) {
  var i = argv.indexOf("--" + name);
  if (i < 0) return dflt;
  var v = argv[i + 1];
  return (v && v.indexOf("--") !== 0) ? v : true;
}
var OUT = arg("out", "measurements/lm-run.json");
var ONLY = arg("only", "");
var MODULES = String(arg("modules", "")).split(",").filter(Boolean);
var DISABLE = String(arg("disable", "")).split(",").filter(Boolean);
var TIMEOUT = Number(arg("timeout", 30000));
var LABEL = arg("label", path.basename(String(OUT)).replace(/\.json$/, ""));
var NET = arg("net", "off");     /* off | mock | live */
var MOCK_BASE = arg("mockbase", "");

/* ---------------------------------------------------------------- quality */
var SYNTH_DEFECTS = [
  { id: "duplicate_copula", re: /\b(is|are|was|were|has|have)\s+\1\b/i },
  { id: "duplicate_word", re: /\b([a-z]{4,})\s+\1\b/i },
  /* Particles of phrasal verbs ("dig in", "move on") end sentences legitimately. */
  { id: "dangling_connective", re: /\b(?:and|or|but|because|of|the|to|with|from|than)\s*[.!?]\s*$/i },
  { id: "empty", re: /^\s*$/ },
  { id: "raw_html", re: /<\/?(?:div|span|p|br|script|a)\b/i },
  { id: "undefined_token", re: /\b(?:undefined|NaN|\[object Object\])\b/ },
  { id: "unclosed_quote", re: /^[^"]*"[^"]*$/ },
  { id: "snippet_ellipsis_start", re: /^\s*(?:\.\.\.|…)/ },
  { id: "double_space_punct", re: /\s+[,.;:]/ }
];

function sentenceCount(s) {
  var m = String(s).replace(/\b(?:e\.g|i\.e|etc|vs|Mr|Mrs|Dr|St)\./gi, "$1")
    .match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g);
  return m ? m.filter(function (x) { return /\w/.test(x); }).length : 0;
}
function wordCount(s) { var m = String(s).trim().match(/\S+/g); return m ? m.length : 0; }
function bulletCount(s) {
  var m = String(s).match(/^\s*(?:[-*•]|\d+[.)])\s+/gm);
  return m ? m.length : 0;
}
function repeatedSentence(s) {
  var parts = String(s).split(/(?<=[.!?])\s+/).map(function (x) {
    return x.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  }).filter(function (x) { return x.length > 12; });
  var seen = {};
  for (var i = 0; i < parts.length; i++) {
    if (seen[parts[i]]) return true;
    seen[parts[i]] = 1;
  }
  return false;
}

function matchOne(text, pat) {
  if (pat instanceof RegExp) return pat.test(text);
  return String(text).toLowerCase().indexOf(String(pat).toLowerCase()) >= 0;
}

function scoreTurn(spec, res) {
  var text = res.text || "";
  var issues = [];
  var pass = true;

  if (spec.expectAll) spec.expectAll.forEach(function (p) {
    if (!matchOne(text, p)) { pass = false; issues.push("missing:" + p); }
  });
  if (spec.expectAny && spec.expectAny.length) {
    var any = spec.expectAny.some(function (p) { return matchOne(text, p); });
    if (!any) { pass = false; issues.push("none-of:" + spec.expectAny.join("|")); }
  }
  if (spec.reject) spec.reject.forEach(function (p) {
    if (matchOne(text, p)) { pass = false; issues.push("rejected:" + p); }
  });
  if (spec.maxSentences && sentenceCount(text) > spec.maxSentences) {
    pass = false; issues.push("sentences>" + spec.maxSentences + " (" + sentenceCount(text) + ")");
  }
  if (spec.maxWords && wordCount(text) > spec.maxWords) {
    pass = false; issues.push("words>" + spec.maxWords + " (" + wordCount(text) + ")");
  }
  if (spec.bullets && bulletCount(text) !== spec.bullets) {
    pass = false; issues.push("bullets!=" + spec.bullets + " (" + bulletCount(text) + ")");
  }
  if (spec.bulletsAtLeast && bulletCount(text) < spec.bulletsAtLeast) {
    pass = false; issues.push("bullets<" + spec.bulletsAtLeast + " (" + bulletCount(text) + ")");
  }

  /* Code is scanned for structure, not for prose defects: a program may
     legitimately contain the word "undefined" or an unbalanced quote. */
  var hasCode = /```/.test(text);
  var prose = text.replace(/```[\s\S]*?```/g, " ");
  var defects = SYNTH_DEFECTS.filter(function (d) {
    /* "undefined" and "NaN" are real words when the subject is code. */
    if (hasCode && d.id === "undefined_token") return false;
    return d.re.test(prose);
  }).map(function (d) { return d.id; });
  if (repeatedSentence(prose)) defects.push("repeated_sentence");

  var hallucination = false;
  if (spec.expectAll && spec.expectAll.length && !pass &&
      !/couldn.t find|could not find|not sure|do not have|don.t have|unclear/i.test(text) &&
      text.length > 25) hallucination = true;

  /* "Used the web" means an external host was contacted. A same-origin site
     path and a local-engine label are not network use. */
  var LOCAL_LABEL = /^(?:local knowledge base|this site|computed|reference library|local ARC engine)/i;
  var webish = (res.sources || []).concat(res.used || []).filter(function (u) {
    u = String(u || "");
    if (!u || LOCAL_LABEL.test(u)) return false;
    return /^https?:\/\//i.test(u) || /wikipedia|wikidata|registry|api\./i.test(u);
  });
  var usedWeb = !!(res.usedWeb || webish.length);
  if (spec.web === false && usedWeb) { pass = false; issues.push("unnecessary_web"); }
  if (spec.web === true && !usedWeb && !/couldn.t|could not|offline/i.test(text)) {
    issues.push("no_web_for_fresh");
  }

  return {
    pass: pass, issues: issues, defects: defects, hallucination: hallucination,
    usedWeb: usedWeb, sentences: sentenceCount(text), words: wordCount(text)
  };
}

/* ------------------------------------------------------------------- mock */
function makeFetch() {
  if (NET === "live") return globalThis.fetch;
  if (NET === "mock") {
    var base = MOCK_BASE || "http://127.0.0.1:8781";
    return function (url, o) {
      var u = String(url);
      var m = u.match(/^https?:\/\/([^\/]+)(.*)$/);
      if (!m) return globalThis.fetch(url, o);
      return globalThis.fetch(base + "/" + m[1] + m[2], o);
    };
  }
  return function () { return Promise.reject(new Error("offline")); };
}

/* ------------------------------------------------------------------- main */
function pct(n, d) { return d ? Math.round((n / d) * 1000) / 10 : 0; }
function quantile(sorted, p) {
  if (!sorted.length) return 0;
  var i = Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)));
  return sorted[i];
}

async function main() {
  var fetchImpl = makeFetch();
  var cases = CASES;
  if (ONLY) {
    var ids = String(ONLY).split(",").map(Number);
    cases = cases.filter(function (c) { return ids.indexOf(c.id) >= 0; });
  }
  var records = [];
  var t0 = Date.now();

  for (var ci = 0; ci < cases.length; ci++) {
    var c = cases[ci];
    var win;
    try {
      win = rt.boot({ fetch: fetchImpl, modules: MODULES });
      if (DISABLE.length && win.C4LM && win.C4LM.ablate) win.C4LM.ablate(DISABLE);
    } catch (e) {
      records.push({ id: c.id, cat: c.cat, question: c.q || "(dialogue)", error: "boot: " + e.message, pass: false });
      continue;
    }
    var turns = c.turns || [{ q: c.q, expectAll: c.expectAll, expectAny: c.expectAny,
                              reject: c.reject, maxSentences: c.maxSentences, maxWords: c.maxWords,
                              bullets: c.bullets, bulletsAtLeast: c.bulletsAtLeast, web: c.web }];
    var turnRecs = [], allPass = true;
    for (var ti = 0; ti < turns.length; ti++) {
      var spec = turns[ti];
      var res;
      try {
        res = await rt.askOnce(win, spec.q, TIMEOUT);
      } catch (e) {
        res = { text: "", error: e.message, latency_ms: 0 };
      }
      var sc = scoreTurn(spec, res);
      if (!sc.pass) allPass = false;
      turnRecs.push({
        question: spec.q,
        output: res.text,
        route: res.route,
        subject: res.entity || "",
        relation: res.relation || "",
        web_used: sc.usedWeb,
        sources: res.sources || [],
        used: res.used || [],
        latency_ms: res.latency_ms,
        correct: sc.pass,
        issues: sc.issues,
        synthesis_defects: sc.defects,
        hallucination: sc.hallucination,
        timed_out: !!res.timedOut,
        error: res.error || ""
      });
      process.stdout.write(sc.pass ? "." : "F");
    }
    records.push({
      id: c.id, cat: c.cat, question: c.q || turns.map(function (t) { return t.q; }).join(" || "),
      dialogue: !!c.turns, pass: allPass, turns: turnRecs,
      latency_ms: turnRecs.reduce(function (a, t) { return a + t.latency_ms; }, 0)
    });
  }
  process.stdout.write("\n");

  var allTurns = records.reduce(function (a, r) { return a.concat(r.turns || []); }, []);
  var lat = allTurns.map(function (t) { return t.latency_ms; }).sort(function (a, b) { return a - b; });
  var localTurns = allTurns.filter(function (t) { return !t.web_used; });
  var webTurns = allTurns.filter(function (t) { return t.web_used; });
  var localLat = localTurns.map(function (t) { return t.latency_ms; }).sort(function (a, b) { return a - b; });
  var webLat = webTurns.map(function (t) { return t.latency_ms; }).sort(function (a, b) { return a - b; });

  var byCat = {};
  records.forEach(function (r) {
    var b = byCat[r.cat] || (byCat[r.cat] = { total: 0, pass: 0 });
    b.total++; if (r.pass) b.pass++;
  });

  var summary = {
    label: LABEL,
    generated: new Date().toISOString(),
    net: NET,
    modules: MODULES,
    disabled: DISABLE,
    cases: records.length,
    turns: allTurns.length,
    passed: records.filter(function (r) { return r.pass; }).length,
    accuracy_pct: pct(records.filter(function (r) { return r.pass; }).length, records.length),
    turn_accuracy_pct: pct(allTurns.filter(function (t) { return t.correct; }).length, allTurns.length),
    hallucinations: allTurns.filter(function (t) { return t.hallucination; }).length,
    synthesis_defects: allTurns.reduce(function (a, t) { return a + t.synthesis_defects.length; }, 0),
    timeouts: allTurns.filter(function (t) { return t.timed_out; }).length,
    web_turns: webTurns.length,
    latency: {
      p50: quantile(lat, 0.5), p90: quantile(lat, 0.9),
      p95: quantile(lat, 0.95), p99: quantile(lat, 0.99),
      mean: Math.round(lat.reduce(function (a, b) { return a + b; }, 0) / Math.max(1, lat.length))
    },
    local_latency: { n: localLat.length, p50: quantile(localLat, 0.5), p95: quantile(localLat, 0.95) },
    web_latency: { n: webLat.length, p50: quantile(webLat, 0.5), p95: quantile(webLat, 0.95) },
    by_category: byCat,
    wall_ms: Date.now() - t0
  };

  var outPath = path.isAbsolute(String(OUT)) ? String(OUT) : path.join(rt.ROOT, String(OUT));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ summary: summary, records: records }, null, 1));
  console.log(JSON.stringify(summary, null, 1));
  console.log("\nwrote " + outPath);
}

main().catch(function (e) { console.error(e); process.exit(1); });
