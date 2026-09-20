/* A stand-in for the public data sources, with controlled latency.
 *
 * The real endpoints are not reachable from this evaluation environment, and
 * even where they are, their latency is not repeatable. This server answers
 * the same URL shapes with the same JSON shapes, and lets each source be
 * given a fixed delay, so "does the pipeline finish as soon as the evidence
 * is sufficient" can be measured rather than asserted.
 *
 *   node tools/mock-sources.js [--port 8781]
 */
"use strict";
var http = require("http");
var url = require("url");

function arg(n, d) { var i = process.argv.indexOf("--" + n); return i < 0 ? d : (process.argv[i + 1] || true); }
var PORT = Number(arg("port", 8781));

/* Deliberately uneven: one fast structured source, one mid encyclopedia, one
   very slow straggler -- the shape that used to hold an answer for ten
   seconds. */
var DELAYS = {
  "api.dictionaryapi.dev": 110,
  "en.wiktionary.org": 180,
  "www.wikidata.org": 60,
  "en.wikipedia.org": 220,
  "registry.npmjs.org": 90,
  "pypi.org": 2600,
  "api.coindesk.com": 140,
  "open.er-api.com": 3200,
  "api.crossref.org": 4200
};

/* A stand-in dictionary: the words are ordinary English, chosen to be ones
   the shipped lexicon does NOT hold, so the "learn a word at query time"
   path is what is being exercised. */
var WORDS = {
  retention: [{ pos: "noun", gloss: "the continued possession or keeping of something" }],
  friction: [{ pos: "noun", gloss: "the resistance that one surface meets when moving over another" },
             { pos: "noun", gloss: "conflict or disagreement between people" }],
  cadence: [{ pos: "noun", gloss: "a rhythm or regular repeated pattern of activity" }],
  bottleneck: [{ pos: "noun", gloss: "a point of congestion that limits the rate of a process" }],
  onboarding: [{ pos: "noun", gloss: "the process of integrating a new employee or user" }],
  churn: [{ pos: "noun", gloss: "the rate at which customers stop using a service" }],
  latency: [{ pos: "noun", gloss: "the delay before a transfer of data begins following an instruction" }],
  scaffold: [{ pos: "noun", gloss: "a temporary structure used to support work in progress" },
             { pos: "verb", gloss: "to provide temporary support for something being built" }],
  curve: [{ pos: "noun", gloss: "a line that deviates from being straight, or a graph of a relationship" }],
  bottle: [{ pos: "noun", gloss: "a container with a narrow neck, used for holding liquids" }]
};

var ARTICLES = {
  france: { title: "France", extract: "France is a country in Western Europe. Its capital is Paris. France is a founding member of the European Union." },
  paris: { title: "Paris", extract: "Paris is the capital and most populous city of France. It sits on the river Seine." },
  photosynthesis: { title: "Photosynthesis", extract: "Photosynthesis is the process used by plants to convert light energy into chemical energy. It releases oxygen as a by-product." },
  "node.js": { title: "Node.js", extract: "Node.js is a cross-platform JavaScript runtime environment built on the V8 engine." },
  python: { title: "Python (programming language)", extract: "Python is a high-level general-purpose programming language created by Guido van Rossum." },
  bitcoin: { title: "Bitcoin", extract: "Bitcoin is a decentralized digital currency introduced in 2009." }
};

function articleFor(q) {
  var k = String(q || "").toLowerCase().replace(/[^a-z0-9. ]/g, "").trim();
  if (ARTICLES[k]) return ARTICLES[k];
  for (var name in ARTICLES) if (k.indexOf(name) >= 0 || name.indexOf(k) >= 0) return ARTICLES[name];
  return null;
}

var server = http.createServer(function (req, res) {
  var parsed = url.parse(req.url, true);
  /* The harness rewrites https://HOST/path to http://127.0.0.1:PORT/HOST/path */
  var m = parsed.pathname.match(/^\/([^\/]+)(\/.*)?$/);
  var host = m ? m[1] : "";
  var pathname = (m && m[2]) || "/";
  var delay = DELAYS[host] == null ? 300 : DELAYS[host];
  var q = parsed.query;

  function send(obj) {
    setTimeout(function () {
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify(obj));
    }, delay);
  }

  if (host === "api.dictionaryapi.dev") {
    var dw = decodeURIComponent((pathname.split("/").pop() || "")).toLowerCase();
    var entry = WORDS[dw];
    if (!entry) { return send([]); }
    return send([{ word: dw, meanings: entry.map(function (e) {
      return { partOfSpeech: e.pos, definitions: [{ definition: e.gloss }] };
    }) }]);
  }
  if (host === "en.wiktionary.org") {
    var ww = decodeURIComponent((pathname.split("/").pop() || "")).toLowerCase();
    var we = WORDS[ww];
    if (!we) return send({});
    return send({ en: we.map(function (e) {
      return { partOfSpeech: e.pos === "verb" ? "Verb" : "Noun",
               definitions: [{ definition: "<span>" + e.gloss + "</span>" }] };
    }) });
  }
  if (host === "en.wikipedia.org") {
    var title = q.titles || q.gsrsearch || "";
    var art = articleFor(title);
    if (!art) return send({ query: { pages: { "-1": { missing: "" } } } });
    return send({ query: { pages: { "1": { pageid: 1, title: art.title, extract: art.extract } } } });
  }
  if (host === "www.wikidata.org") {
    var art2 = articleFor(q.search || "");
    if (!art2) return send({ search: [] });
    return send({ search: [{ label: art2.title, description: art2.extract.split(". ")[0].replace(/^[^ ]+ is /, "") }] });
  }
  if (host === "registry.npmjs.org") {
    return send({ name: decodeURIComponent(pathname.split("/")[1] || "node"), version: "22.9.0" });
  }
  if (host === "pypi.org") {
    return send({ info: { name: "python", version: "3.13.1" } });
  }
  if (host === "api.coindesk.com") {
    return send({ bpi: { USD: { rate: "64,215.30" } }, time: { updated: new Date().toUTCString() } });
  }
  if (host === "open.er-api.com") {
    return send({ rates: { EUR: 0.92 } });
  }
  if (host === "api.crossref.org") {
    return send({ message: { items: [{ title: ["A slow scholarly record"], "container-title": ["Journal"] }] } });
  }
  send({});
});

server.listen(PORT, "127.0.0.1", function () {
  console.log("mock sources on http://127.0.0.1:" + PORT);
  console.log("delays: " + JSON.stringify(DELAYS));
});
module.exports = { DELAYS: DELAYS, PORT: PORT };
