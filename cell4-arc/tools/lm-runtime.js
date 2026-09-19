/* Loads the shipping CELL4 language stack headlessly.
 *
 * The LM lives inline in c4-mini.html (the c4-*.js modules it optionally
 * references are not part of this workspace). Rather than copy that code into
 * a test double -- which is how a suite drifts from what ships -- this loader
 * extracts the page's own <script> blocks and runs them against a DOM shim.
 */
"use strict";
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var makeEnv = require("./dom-shim.js").makeEnv;

var ROOT = path.join(__dirname, "..");

function extractInlineScripts(html) {
  var out = [], re = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g, m;
  while ((m = re.exec(html))) {
    var tag = m[0].slice(0, m[0].indexOf(">"));
    if (/\ssrc\s*=/.test(tag)) continue;
    out.push(m[1]);
  }
  return out;
}

function externalScriptSrcs(html) {
  var out = [], re = /<script[^>]*\ssrc\s*=\s*"([^"]+)"[^>]*>/g, m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

/* Boot the page.
 *   opts.fetch    - fetch implementation for federation (default: offline)
 *   opts.modules  - extra local .js files to load before the page script
 *   opts.config   - overrides merged into window.ROBOTS_CONFIG
 *   opts.arc      - load the ARC modules too (slow; off by default)
 */
function boot(opts) {
  opts = opts || {};
  var html = fs.readFileSync(path.join(ROOT, "c4-mini.html"), "utf8");
  var win = makeEnv({ fetch: opts.fetch });
  var ctx = vm.createContext(win);

  function run(code, name) {
    try {
      vm.runInContext(code, ctx, { filename: name, timeout: opts.timeout || 120000 });
    } catch (e) {
      if (opts.strict) throw e;
      (win.__loadErrors = win.__loadErrors || []).push(name + ": " + e.message);
    }
  }
  function runFile(f) {
    var p = path.isAbsolute(f) ? f : path.join(ROOT, f);
    if (!fs.existsSync(p)) return false;
    run(fs.readFileSync(p, "utf8"), f);
    return true;
  }

  var srcs = externalScriptSrcs(html);
  var arcRe = /c4-arc/;
  srcs.forEach(function (s) {
    if (arcRe.test(s) && !opts.arc) return;       /* ARC is out of scope here */
    runFile(s);
  });
  (opts.modules || []).forEach(runFile);

  var inline = extractInlineScripts(html);
  /* The first inline block is the theme bridge; the page stack is the rest. */
  inline.forEach(function (code, i) { run(code, "c4-mini.html#inline" + i); });

  if (opts.config) {
    for (var k in opts.config) win.ROBOTS_CONFIG[k] = opts.config[k];
  }
  return win;
}

/* Ask one question and resolve with the answer object the page landed on.
 * Resolution is driven by the page's own lastAnswer handoff, so the timing
 * measured is the timing a visitor sees. */
function askOnce(win, text, timeoutMs) {
  return new Promise(function (resolve) {
    var robots = win.robots;
    if (!robots) return resolve({ text: "", error: "robots not booted", latency_ms: 0 });
    var before = robots.last();
    var t0 = Date.now();
    var settled = false;
    var deadline = setTimeout(function () {
      if (settled) return;
      settled = true;
      resolve({ text: "", error: "timeout", latency_ms: Date.now() - t0, timedOut: true });
    }, timeoutMs || 30000);

    function poll() {
      if (settled) return;
      var cur = robots.last();
      if (cur && cur !== before && cur.q === text) {
        settled = true;
        clearTimeout(deadline);
        var a = cur.a || {};
        return resolve({
          text: String(a.text == null ? "" : a.text),
          sources: (a.sources || []).slice(),
          used: (a.used || []).slice(),
          entity: a.entity || "",
          relation: a.relation || "",
          act: a.act || "",
          route: routeOf(a),
          conversational: !!a.conversational,
          insufficient: !!a.insufficientEvidence,
          clarification: !!a.clarification,
          hit: a.hit ? (a.hit.h || "") : "",
          research: a.research ? {
            title: (a.research.row && a.research.row.h) || "",
            source: (a.research.row && a.research.row.x) || ""
          } : null,
          effective: cur.effective || text,
          latency_ms: Date.now() - t0,
          raw: a
        });
      }
      setTimeout(poll, 1);
    }
    try { robots.ask(text); } catch (e) {
      settled = true; clearTimeout(deadline);
      return resolve({ text: "", error: "throw: " + e.message, latency_ms: Date.now() - t0 });
    }
    poll();
  });
}

function routeOf(a) {
  if (!a) return "none";
  if (a.route) return a.route;
  if (a.conversational) return "conversation";
  if (a.reasoned) return a.reasoned.route || "reason";
  if (a.research) return "web";
  if (a.hit) return "site";
  if (a.insufficientEvidence) return "insufficient";
  return "other";
}

module.exports = { boot: boot, askOnce: askOnce, ROOT: ROOT };
