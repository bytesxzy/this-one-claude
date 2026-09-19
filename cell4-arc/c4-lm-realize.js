/* CELL4 answer planning and surface realization.
 *
 * The old path picked sentences and concatenated them, which is where "is is",
 * dangling conjunctions, duplicated subjects and pasted search snippets came
 * from. Here an ANSWER PLAN is chosen from the question type, filled with
 * propositions, and only then realised as English -- with article selection,
 * subject agreement, connectives, and a final well-formedness pass that
 * rejects the defects rather than hoping they do not occur.
 *
 * No model service. Grammar and templates, driven by structured content.
 */
(function (root) {
  "use strict";

  var C = root.C4LMCore;

  /* ------------------------------------------------------------ grammar */

  var VOWEL_SOUND = /^(?:[aeiou]|hour|honest|heir|x-|f-|m-|n-|s-|l-|r-)/i;
  var CONSONANT_ACRONYM = /^(?:u[bnkrs]|eu|one|once|uni)/i;
  function article(word) {
    var w = String(word || "").trim();
    if (!w) return "a";
    if (CONSONANT_ACRONYM.test(w)) return "a";
    return VOWEL_SOUND.test(w) ? "an" : "a";
  }
  function capitalize(s) {
    s = String(s || "").trim();
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function terminate(s) {
    s = String(s || "").trim();
    if (!s) return s;
    return /[.!?:;]$/.test(s) ? s : s + ".";
  }
  /* Plural agreement for a bare noun phrase used as a subject. */
  function isPlural(np) {
    var head = String(np).trim().split(/\s+/).pop() || "";
    return /(?:[^s]s|ies|men|people|data|children)$/i.test(head) && !/(?:ss|us|is)$/i.test(head);
  }
  function copula(np) { return isPlural(np) ? "are" : "is"; }

  var DANGLING = /\b(?:and|or|but|nor|so|yet|of|the|a|an|to|for|in|on|at|by|with|from|as|that|which|who|whose|when|where|because|since|while|if|than|then|into|onto|over|under|between|among|is|are|was|were|be|been|being|has|have|had|do|does|did)\s*$/i;
  function trimDangling(s) {
    s = String(s || "").replace(/[\s,;:–—-]+$/, "");
    var prev;
    do { prev = s; s = s.replace(DANGLING, "").replace(/[\s,;:–—-]+$/, ""); } while (s && s !== prev);
    return s;
  }

  /* Remove a restated subject: "Photosynthesis is Photosynthesis is the
     process..." collapses to one clause. Also kills doubled copulas. */
  function deduplicate(s) {
    s = String(s || "");
    s = s.replace(/\b(is|are|was|were|has|have|had)\s+\1\b/gi, "$1");
    s = s.replace(/\b([A-Za-z][\w-]{2,})\s+\1\b/g, "$1");
    s = s.replace(/\b(a|an|the|of|to|in|on|for|and|or)\s+\1\b/gi, "$1");
    /* "X is X is Y" -> "X is Y" */
    s = s.replace(/\b(.{2,50}?)\s+(is|are)\s+\1\s+\2\b/gi, "$1 $2");
    return s.replace(/\s{2,}/g, " ").replace(/\s+([,.;:!?])/g, "$1");
  }

  /* A source sentence is evidence, not prose to paste. Strip the encyclopedic
     furniture and the parenthetical pronunciation clutter, and make the
     clause stand on its own. */
  function cleanClause(s) {
    return String(s || "")
      .replace(/\([^)]{0,120}?(?:listen|pronounced|IPA|\/[^\/]+\/)[^)]*\)/gi, "")
      .replace(/\[\d+\]/g, "")
      .replace(/\s*\([^)]{0,6}\)\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /* A common noun used as a subject takes a definite article; a proper name
     does not. Capitalisation in the knowledge base marks the difference. */
  function definite(np) {
    var s = String(np || "").trim();
    if (!s) return s;
    if (/^[A-Z0-9]/.test(s)) return s;
    return "The " + s;
  }
  function pluralize(w) {
    w = String(w || "").trim();
    if (!w) return w;
    if (/(?:s|x|z|ch|sh)$/i.test(w)) return w + "es";
    if (/[^aeiou]y$/i.test(w)) return w.slice(0, -1) + "ies";
    return w + "s";
  }

  function joinList(items, conj) {
    items = items.filter(Boolean);
    if (!items.length) return "";
    if (items.length === 1) return items[0];
    if (items.length === 2) return items[0] + " " + (conj || "and") + " " + items[1];
    return items.slice(0, -1).join(", ") + ", " + (conj || "and") + " " + items[items.length - 1];
  }

  function clipSentences(text, n) {
    if (!n) return text;
    var parts = String(text).match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) || [text];
    var kept = parts.filter(function (p) { return /\w/.test(p); }).slice(0, n).join(" ").trim();
    return terminate(trimDangling(kept.replace(/[.!?]+$/, "")));
  }

  /* --------------------------------------------------------- answer plans
   * A plan is a sequence of slots. Which slots exist depends on the question
   * type and on what the user asked for, not on which module produced the
   * content. */
  var PLANS = {
    definition: ["direct", "elaboration", "detail"],
    identity:   ["direct", "elaboration"],
    statement:  ["direct"],
    relation:   ["direct", "elaboration"],
    explanation:["direct", "mechanism", "detail"],
    comparison: ["direct", "contrast", "summary"],
    list:       ["direct", "items"],
    calculation:["direct", "working"],
    code:       ["direct", "code", "detail"],
    verdict:    ["direct", "justification"],
    current:    ["direct", "provenance"],
    uncertain:  ["direct", "suggestion"],
    conversation: ["direct"]
  };

  /* --------------------------------------------------------- realization */

  function realizeDefinition(plan) {
    var name = plan.name, defn = cleanClause(plan.definition || "");
    if (!defn) return "";
    var out;
    /* The definition text may already be a full sentence about the subject.
       Re-stating the subject in front of it is what produced "X is X is Y". */
    var flatName = C.flatten(name);
    var flatDefn = C.flatten(defn).replace(/^(?:the|a|an) /, "");
    /* The stored definition is usually already a sentence about the subject.
       Prefixing the subject again is what produced "X is X is Y". */
    /* A definition that is already a well-formed sentence about something is
       stated, not embedded: prefixing the entry's name produces "Day of the
       week is There are seven days in a week." */
    var completeSentence = /^[A-Z]/.test(defn.trim()) &&
      /\b(?:is|are|was|were|has|have|means|refers|exists|comes|makes|produces)\b/.test(defn.slice(0, 90));
    var selfContained = completeSentence || flatDefn.indexOf(flatName) === 0 ||
      new RegExp("^[a-z0-9 ]{0,30}\\b" + flatName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
                 "\\b[a-z0-9 ]{0,20}\\b(?:is|are|was|were|refers|means)\\b").test(flatDefn);
    if (selfContained) {
      out = capitalize(defn);
    } else {
      out = capitalize(name) + " " + copula(name) + " " + defn;
    }
    return terminate(deduplicate(trimDangling(out)));
  }

  function realizeRelation(plan) {
    var subj = plan.subject, rel = plan.relationLabel || plan.relation, val = cleanClause(plan.value || "");
    if (!val) return "";
    var TEMPLATES = {
      capital: function () { return "The capital of " + subj + " is " + val + "."; },
      currency: function () { return "The currency of " + subj + " is " + val + "."; },
      language: function () { return val.indexOf(" and ") >= 0 || /^[A-Z]/.test(val) ?
        ("The language of " + subj + " is " + val + ".") : ("People in " + subj + " speak " + val + "."); },
      author: function () { return val + " wrote " + subj + "."; },
      artist: function () { return val + " created " + subj + "."; },
      creator: function () { return subj + " was created by " + val + "."; },
      symbol: function () { return "The chemical symbol for " + subj + " is " + val + "."; },
      birth: function () { return capitalize(subj) + " was born on " + val + "."; },
      death: function () { return capitalize(subj) + " died on " + val + "."; },
      population: function () { return "The population of " + subj + " is " + val + "."; },
      height: function () { return capitalize(subj) + " is " + val + " tall."; },
      length: function () { return capitalize(subj) + " is " + val + " long."; },
      distance: function () { return capitalize(subj) + " is " + val + "."; },
      speed: function () { return "The speed of " + subj + " is " + val + "."; },
      location: function () { return capitalize(subj) + " " + copula(subj) + " in " + val + "."; },
      count: function () {
        /* A bare number answers "how many X are there"; a counted noun
           answers "how many X does Y have". Different sentences. */
        if (/^[\d,.]+$|^(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)$/i.test(val.trim())) {
          return "There are " + val + " " + pluralize(subj.toLowerCase()) + ".";
        }
        return definite(subj) + " has " + val + ".";
      },
      purpose: function () { return capitalize(subj) + " " + copula(subj) + " used for " + val + "."; },
      cause: function () { return capitalize(subj) + " " + copula(subj) + " caused by " + val + "."; },
      time: function () { return capitalize(subj) + " " + (/^\d/.test(val) ? "dates to " : "was ") + val + "."; },
      version: function () { return "The current version of " + subj + " is " + val + "."; },
      price: function () { return capitalize(subj) + " " + copula(subj) + " trading at " + val + "."; },
      part: function () { return capitalize(subj) + " " + copula(subj) + " made of " + val + "."; },
      type: function () { return capitalize(subj) + " " + copula(subj) + " " + article(val) + " " + val + "."; },
      capitalOf: function () { return capitalize(subj) + " is the capital of " + val + "."; }
    };
    var fn = TEMPLATES[plan.relation];
    var out = fn ? fn() : (capitalize(subj) + "'s " + (plan.relationLabel || plan.relation) + " is " + val + ".");
    /* A value that is already a sentence is used as-is rather than embedded. */
    if (/[.!?]\s+\w/.test(val) || val.split(" ").length > 25) out = capitalize(val);
    return terminate(deduplicate(trimDangling(out)));
  }

  function realizeComparison(plan) {
    var a = plan.a, b = plan.b, dims = plan.dims || [];
    if (!dims.length) return "";
    if (plan.format === "bullets") {
      var n = plan.limit || dims.length;
      var lines = dims.slice(0, n).map(function (d) {
        return "- " + capitalize(d[0]) + ": " +
          [a, verbFor(a, d[1]), d[1]].filter(Boolean).join(" ") + ", while " +
          [b, verbFor(b, d[2]), d[2]].filter(Boolean).join(" ") + ".";
      });
      return lines.join("\n").replace(/\s+—\.$/gm, ".");
    }
    var head = capitalize(a) + " and " + b + " differ in " +
      (dims.length === 1 ? "one respect" : dims.length + " main respects") + ". ";
    var body = dims.slice(0, plan.limit || 4).map(function (d) {
      return [capitalize(a), verbFor(a, d[1]), d[1]].filter(Boolean).join(" ") + ", while " +
             [b, verbFor(b, d[2]), d[2]].filter(Boolean).join(" ") + ".";
    }).join(" ");
    return deduplicate(head + body).replace(/\s*,?\s*while\s+\w+\s+—\./g, ".");
  }
  /* A contrast fragment is either a predicate ("sets up a connection") or a
     noun phrase ("the amount of matter"). A noun phrase needs a copula, in
     agreement with its subject; a predicate already has its verb. */
  var AUX_HEAD = /^(?:is|are|was|were|has|have|had|does|do|did|can|may|might|must|will|would|should|only|never|always|usually|often)\b/i;
  var KNOWN_VERB = /^(?:keeps?|loses?|uses?|sends?|sets?|delivers?|makes?|produces?|retransmits?|guarantees?|supports?|provides?|requires?|allows?|runs?|works?|stores?|holds?|handles?|changes?|finds?|learns?|maps?|measures?|needs?|takes?|gives?|comes?|goes?|sits?|reads?|writes?|adds?|removes?|creates?|returns?|shows?|starts?|stops?|grows?|falls?|rises?|moves?|covers?|carries?|wraps?|sorts?|counts?|filters?|splits?|joins?|descends?|presents?|says?|means?|drops?|tracks?|records?|applies)\b/i;
  function verbFor(subject, phrase) {
    var p = String(phrase || "").trim();
    if (!p || p === "—") return "";
    if (KNOWN_VERB.test(p) || AUX_HEAD.test(p)) return "";
    return copula(subject);
  }

  function realizeExplanation(plan) {
    var head = cleanClause(plan.direct || "");
    var mech = cleanClause(plan.mechanism || "");
    var parts = [];
    if (head) parts.push(terminate(capitalize(head)));
    if (mech && C.flatten(mech) !== C.flatten(head)) parts.push(terminate(capitalize(mech)));
    return deduplicate(parts.join(" "));
  }

  function realizeList(plan) {
    var items = (plan.items || []).filter(Boolean);
    if (!items.length) return "";
    if (plan.format === "bullets" || items.length > 3) {
      return items.slice(0, plan.limit || items.length).map(function (i) { return "- " + capitalize(terminate(i)); }).join("\n");
    }
    return terminate(capitalize(joinList(items)));
  }

  function realizeCalculation(plan) {
    if (plan.onlyValue) return String(plan.value);
    var unit = plan.unit || "";
    var head = unit === "$" || unit === "£" || unit === "€" ?
      (unit + String(plan.value)) : (String(plan.value) + (unit ? " " + unit : ""));
    var lead = String(plan.lead || "");
    var out = lead ? (capitalize(lead.trim()) + " " + head) : capitalize(head);
    if (plan.showWorking && plan.steps && plan.steps.length) {
      out += ". " + plan.steps.join("; ") + ".";
      return deduplicate(out.replace(/\.\s*\./g, "."));
    }
    return terminate(out);
  }

  /* --------------------------------------------- well-formedness contract */

  var DEFECTS = [
    { id: "duplicate_copula", re: /\b(is|are|was|were|has|have)\s+\1\b/i },
    { id: "duplicate_word", re: /\b([a-z]{4,})\s+\1\b/i },
    /* "that" and "which" can legitimately end a sentence as demonstratives
       ("I'll work from that."), so they are not treated as dangling. */
    { id: "dangling", re: /\b(?:and|or|but|because|of|the|to|with|from|than)\s*[.!?]\s*$/i },
    { id: "empty", re: /^\s*$/ },
    { id: "raw_html", re: /<\/?(?:div|span|p|br|script|a|img)\b/i },
    { id: "undefined_token", re: /\b(?:undefined|NaN|\[object Object\])\b/ },
    { id: "snippet_start", re: /^\s*(?:\.\.\.|…|,|;)/ },
    { id: "double_punct", re: /\s+[,.;:]|[,.;:]{2,}(?!\.)/ },
    { id: "orphan_dash", re: /\s—\s*[.!?]/ }
  ];

  function inspect(text) {
    var found = [];
    for (var i = 0; i < DEFECTS.length; i++) if (DEFECTS[i].re.test(text)) found.push(DEFECTS[i].id);
    /* repeated whole sentence */
    var seen = Object.create(null);
    var parts = String(text).split(/(?<=[.!?])\s+/);
    for (var j = 0; j < parts.length; j++) {
      var k = C.flatten(parts[j]);
      if (k.length > 12) { if (seen[k]) { found.push("repeated_sentence"); break; } seen[k] = 1; }
    }
    return found;
  }

  /* Best-effort repair, then a verdict. A defect that cannot be repaired is
     reported so the caller can fall back rather than ship broken prose. */
  function polish(text) {
    var out = String(text || "");
    out = out.replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1");
    out = deduplicate(out);
    out = out.replace(/([,.;:])\1+/g, "$1");
    out = out.replace(/\s—\s*([.!?])/g, "$1");
    /* de-duplicate identical adjacent sentences */
    var parts = out.split(/(?<=[.!?])\s+/), kept = [], seen = Object.create(null);
    for (var i = 0; i < parts.length; i++) {
      var k = C.flatten(parts[i]);
      if (k.length > 12 && seen[k]) continue;
      seen[k] = 1;
      kept.push(parts[i]);
    }
    out = kept.join(" ").trim();
    out = trimDangling(out.replace(/[.!?]+$/, "")) + (/[.!?]$/.test(out) ? out.slice(-1) : ".");
    out = out.replace(/\.\.$/, ".").replace(/([!?])\.$/, "$1");
    return out.trim();
  }

  /* ------------------------------------------------------------ assembly */

  function realize(plan) {
    var body = "";
    switch (plan.kind) {
      case "definition": body = realizeDefinition(plan); break;
      case "relation":   body = realizeRelation(plan); break;
      case "comparison": body = realizeComparison(plan); break;
      case "explanation":body = realizeExplanation(plan); break;
      case "list":       body = realizeList(plan); break;
      case "calculation":body = realizeCalculation(plan); break;
      case "statement":  body = terminate(capitalize(cleanClause(plan.statement || ""))); break;
      default:           body = String(plan.text || "");
    }
    if (!body) return { text: "", defects: ["empty"] };

    /* Elaboration is optional and only added when it says something new and
       the user did not ask for brevity. */
    if (plan.elaboration && plan.format !== "value" && plan.tone !== "brief" &&
        !plan.lengthLimit && plan.kind !== "comparison") {
      var extra = cleanClause(plan.elaboration);
      if (extra && C.flatten(extra).indexOf(C.flatten(body).slice(0, 30)) < 0 &&
          C.flatten(body).indexOf(C.flatten(extra).slice(0, 30)) < 0) {
        body += " " + terminate(capitalize(extra));
      }
    }
    if (plan.caveat) body += " " + terminate(capitalize(cleanClause(plan.caveat)));

    if (plan.format === "value") {
      var v = plan.value != null ? String(plan.value) : body.replace(/[.]$/, "");
      return { text: v, defects: [] };
    }

    var text = plan.format === "bullets" ? body : polish(body);
    if (plan.lengthLimit && plan.lengthUnit === "sentences") text = clipSentences(text, plan.lengthLimit);
    if (plan.lengthLimit && plan.lengthUnit === "words") {
      var w = text.split(/\s+/);
      if (w.length > plan.lengthLimit) text = terminate(trimDangling(w.slice(0, plan.lengthLimit).join(" ")));
    }
    return { text: text, defects: inspect(text) };
  }

  root.C4LMRealize = {
    realize: realize,
    polish: polish,
    inspect: inspect,
    article: article,
    capitalize: capitalize,
    terminate: terminate,
    copula: copula,
    isPlural: isPlural,
    joinList: joinList,
    definite: definite,
    pluralize: pluralize,
    cleanClause: cleanClause,
    clipSentences: clipSentences,
    trimDangling: trimDangling,
    PLANS: PLANS
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.C4LMRealize;
})(typeof window !== "undefined" ? window : globalThis);
