/* Regression test for the two retrieval gates added to c4-mini.html.
 *
 *   node c4-gates-test.js
 *
 * The functions are lifted out of the page itself rather than duplicated, so
 * this cannot drift from what ships: if the page changes, the test reads the
 * change.
 *
 * WHAT IT IS FOR. The lexical ranker asks whether a page CONTAINS the
 * question's words. For "what is machine reasoning" that is true of engine
 * documentation, and the site answered a general question out of its own
 * docs -- confidently, about the wrong subject. Coverage cannot catch it:
 * both words are present, so coverage is 1.0.
 *
 * The gate tests POSITION instead. A document that defines a thing puts it at
 * the head of a sentence, a heading or a list item; one that merely uses the
 * words scatters them mid-clause. "machine reasoning" never occurs as a
 * contiguous phrase in these documents at all.
 */
var fs = require("fs");
var path = require("path");
var here = __dirname;
var html = fs.readFileSync(path.join(here, "c4-mini.html"), "utf8");

function lift(name) {
  var i = html.indexOf("  function " + name + "(");
  if (i < 0) throw new Error("c4-mini.html no longer defines " + name);
  var j = html.indexOf("\n  }\n", i);
  return html.slice(i, j + 5);
}
function constant(name) {
  var m = html.match(new RegExp("  var " + name + " = .*"));
  if (!m) throw new Error("c4-mini.html no longer defines " + name);
  return m[0];
}

var src = constant("QUESTION_OPENER") + "\n" + constant("REMARK_MARKER") + "\n" +
  "function identityEqual(a,b){return String(a||'').trim().toLowerCase()===" +
  "String(b||'').trim().toLowerCase();}\n" +
  lift("definesConcept") + "\n" + lift("looksLikeRemark") + "\n" +
  "module.exports={definesConcept:definesConcept,looksLikeRemark:looksLikeRemark};";
var tmp = path.join(require("os").tmpdir(), "c4-gates-lifted.js");
fs.writeFileSync(tmp, src);
var G = require(tmp);

global.window = {};
require(path.join(here, "c4-site-pages.js"));
var PAGES = global.window.C4_SITE_PAGES;

function siteAnswers(concept) {
  return PAGES.some(function (p) {
    return G.definesConcept({ h: p.name, t: p.text }, concept);
  });
}

var failures = 0;
function check(label, got, want) {
  if (got !== want) { failures++; console.log("  FAIL  " + label); }
  else console.log("  ok    " + label);
}

console.log("the site must NOT answer general questions from its own docs:");
["machine reasoning", "quantum fuzz", "the capital of Nigeria", "photosynthesis",
 "quantum computing", "the French revolution", "neural networks", "transformers"
].forEach(function (c) { check(c, siteAnswers(c), false); });

console.log("the site must STILL answer about itself:");
["GABRIEL", "ASTRA", "the cell tree", "MAX_SLICE", "objtree", "delta_stencils",
 "CELL4"].forEach(function (c) { check(c, siteAnswers(c), true); });

console.log("a non-definitional question is not gated at all:");
check("empty concept passes", G.definesConcept({ h: "x", t: "y" }, ""), true);

console.log("a statement is not a research query:");
[["etc, you see the issue - it needs way WAY better look up", true],
 ["kind of self explanatory, but it needs better interpretation", true],
 ["What is machine reasoning?", false],
 ["What is the capital of Nigeria?", false],
 ["how does the cell tree rank hypotheses", false],
 ["define quantum fuzz", false]
].forEach(function (c) { check(JSON.stringify(c[0].slice(0, 44)),
                               G.looksLikeRemark(c[0]), c[1]); });

/* Known residual, stated rather than hidden: the documents write
   "version-space" hyphenated, so "the version space" does not head a sentence
   in that form and the site declines it. The failure errs toward research
   rather than toward answering wrongly, which is the direction to err in. */
console.log("known residual (not a failure): \"the version space\" -> " +
            siteAnswers("the version space"));

console.log(failures ? failures + " FAILURES" : "all gates correct");
process.exit(failures ? 1 : 0);
