/* CELL4 compositional semantics.
 *
 * Most phrases a person asks about are not entries in anything. "Learning
 * pivot", "retention curve", "onboarding friction", "latency budget" -- these
 * are built on the spot out of words whose meanings ARE known, and a reader
 * works out what they must mean. Matching such a phrase against an index of
 * named things is how "learning pivot" came back as a cable television
 * network: the index had no entry, so it returned the nearest string.
 *
 * This module reads instead of matching. It finds the head and its modifiers,
 * takes a sense for each from the lexicon or the knowledge base, infers the
 * relation between them from their SEMANTIC CLASSES, and composes a reading.
 * Nothing about any particular phrase is written here: the relation table is
 * over classes, so a compound nobody anticipated is handled by the same rules
 * as one that was.
 */
(function (root) {
  "use strict";

  var C = root.C4LMCore;

  function lex() { return root.C4LMLexicon; }
  function kb() { return root.C4LMKB; }

  /* --------------------------------------------------- relation inference
   * How a modifier relates to its head, keyed by the pair of semantic
   * classes. `score` is how natural that pairing is, and it is what selects
   * WHICH sense of an ambiguous head the modifier is picking out. */
  var RELATIONS = [
    { mod: ["ACTIVITY", "FIELD", "PROCESS"], head: ["EVENT"], score: 3.0,
      rel: "in", phrase: "occurring in the course of" },
    { mod: ["ACTIVITY", "FIELD", "PROCESS"], head: ["ABSTRACT", "STATE", "PROPERTY", "MEASURE"], score: 2.6,
      rel: "about", phrase: "concerning" },
    { mod: ["ACTIVITY", "FIELD", "PROCESS"], head: ["ARTIFACT", "SUBSTANCE"], score: 2.2,
      rel: "for", phrase: "used for" },
    { mod: ["ACTIVITY", "FIELD", "PROCESS"], head: ["PERSON", "GROUP"], score: 2.4,
      rel: "agent", phrase: "whose work is" },
    { mod: ["ACTIVITY", "FIELD", "PROCESS"], head: ["PROCESS", "ACTIVITY"], score: 2.4,
      rel: "about", phrase: "applied to" },
    { mod: ["ACTIVITY", "FIELD", "PROCESS"], head: ["COMMUNICATION"], score: 2.5,
      rel: "about", phrase: "about" },
    { mod: ["ACTIVITY", "FIELD", "PROCESS"], head: ["PLACE"], score: 2.0,
      rel: "for", phrase: "where people carry out" },

    { mod: ["SUBSTANCE"], head: ["ARTIFACT"], score: 2.8, rel: "of", phrase: "made of" },
    { mod: ["SUBSTANCE"], head: ["PROCESS", "EVENT", "MEASURE", "PROPERTY"], score: 2.2,
      rel: "about", phrase: "of" },

    { mod: ["PLACE"], head: ["ARTIFACT", "PERSON", "GROUP", "EVENT", "ACTIVITY", "PROCESS"], score: 2.4,
      rel: "at", phrase: "belonging to or found in" },
    /* A place modifying an abstract noun is a weaker reading than an abstract
       one: "market risk" is risk in a market as an arena, not risk located at
       a market stall. */
    { mod: ["PLACE"], head: ["ABSTRACT", "STATE", "MEASURE", "PROPERTY"], score: 1.8,
      rel: "at", phrase: "arising in" },

    { mod: ["PERSON", "GROUP"], head: ["ARTIFACT", "ABSTRACT", "COMMUNICATION", "PLACE", "MEASURE"], score: 2.4,
      rel: "poss", phrase: "belonging to or produced by" },
    { mod: ["PERSON", "GROUP"], head: ["ACTIVITY", "EVENT", "PROCESS"], score: 2.3,
      rel: "agent", phrase: "carried out by" },

    { mod: ["TIME"], head: ["EVENT", "ACTIVITY", "PROCESS", "MEASURE", "STATE"], score: 2.5,
      rel: "when", phrase: "occurring over or measured over" },
    { mod: ["TIME"], head: ["ABSTRACT", "COMMUNICATION", "ARTIFACT"], score: 2.3,
      rel: "attr", phrase: "expressed in terms of" },

    { mod: ["PROPERTY", "MEASURE"], head: ["ABSTRACT", "MEASURE", "PROCESS", "EVENT", "ARTIFACT", "STATE"], score: 2.3,
      rel: "attr", phrase: "defined in terms of" },

    { mod: ["ARTIFACT"], head: ["ACTIVITY", "PROCESS", "EVENT"], score: 2.2,
      rel: "instrument", phrase: "carried out with" },
    { mod: ["ARTIFACT", "ORGANISM", "BODY"], head: ["ARTIFACT"], score: 2.4,
      rel: "onfor", phrase: "used on" },
    { mod: ["ARTIFACT"], head: ["PERSON", "ABSTRACT"], score: 2.0,
      rel: "about", phrase: "associated with" },

    { mod: ["ABSTRACT", "COMMUNICATION", "STATE"], head: ["EVENT", "PROCESS", "ACTIVITY"], score: 2.2,
      rel: "about", phrase: "in" },
    { mod: ["ABSTRACT", "COMMUNICATION", "STATE"], head: ["ABSTRACT", "MEASURE", "PROPERTY", "COMMUNICATION", "STATE"], score: 2.1,
      rel: "about", phrase: "concerning" },
    { mod: ["ABSTRACT", "COMMUNICATION", "STATE"], head: ["ARTIFACT", "PERSON", "GROUP", "PLACE"], score: 1.9,
      rel: "about", phrase: "concerned with" },

    { mod: ["ORGANISM", "BODY"], head: ["ABSTRACT", "PROCESS", "MEASURE", "ARTIFACT", "STATE"], score: 2.2,
      rel: "of", phrase: "of" },

    { mod: ["QUALITY"], head: [], score: 2.6, rel: "adj", phrase: "" },
    /* A verb modifying a sign, a message or a control is an instruction:
       a stop sign tells you to stop. Modifying anything else it is a
       purpose: a cutting tool is for cutting. */
    { mod: ["ACTION"], head: ["COMMUNICATION"], score: 2.8, rel: "instruct", phrase: "telling you to" },
    { mod: ["ACTION"], head: ["ARTIFACT", "PLACE"], score: 2.5, rel: "purpose", phrase: "for" },
    { mod: ["ACTION"], head: ["EVENT", "PROCESS", "ACTIVITY", "ABSTRACT", "STATE", "MEASURE"], score: 2.2,
      rel: "purpose", phrase: "for" }
  ];

  /* Gloss-sensitive refinement. The head's own definition often says what
     kind of relation it takes -- a definition containing "container ... for
     holding liquids" tells you that a substance modifying it is the CONTENTS,
     not the material. Reading the definition beats guessing from the class
     pair, and it is general: it applies to any head whose definition says the
     same thing, with no list of head words anywhere. */
  var GLOSS_CUES = [
    /* The cue must describe what the head IS, so it is anchored to the
       opening noun phrase of the definition. An anchor's gloss mentions a
       vessel, but an anchor is not one. */
    { head: /^(?:a |an |the )?(?:\w+ ){0,2}(?:container|vessel|holder|receptacle|bottle|box|bag|jar|tank|can|case)\b/i,
      mod: ["SUBSTANCE", "ORGANISM", "ARTIFACT"], rel: "holds", phrase: "for holding", score: 3.2 },
    { head: /^(?:a |an |the )?(?:\w+ ){0,2}(?:notice|board|sign|display|screen|panel)\b/i,
      mod: ["ACTION"], rel: "instruct", phrase: "telling you to", score: 3.2 },
    { head: /^(?:a |an |the )?(?:\w+ ){0,2}(?:tool|device|implement|instrument|machine|apparatus)\b/i,
      mod: ["ACTION", "ACTIVITY", "PROCESS"], rel: "purpose", phrase: "for", score: 3.1 },
    { head: /^(?:a |an |the )?(?:\w+ ){0,2}(?:device|light|lamp|alarm|bell|horn|indicator)\b/i,
      mod: ["COMMUNICATION", "STATE", "EVENT"], rel: "signals", phrase: "used to give", score: 3.0 },
    { head: /^(?:a |an |the )?(?:\w+ ){0,2}(?:person|someone|worker|official)\b|^one who\b/i,
      mod: ["ACTIVITY", "FIELD", "ARTIFACT", "PROCESS"], rel: "agent", phrase: "whose work is", score: 3.0 }
  ];
  function glossRelation(headGloss, modCls) {
    for (var i = 0; i < GLOSS_CUES.length; i++) {
      var c = GLOSS_CUES[i];
      if (c.mod.indexOf(modCls) < 0) continue;
      if (!c.head.test(String(headGloss || ""))) continue;
      return { rel: c.rel, phrase: c.phrase, score: c.score };
    }
    return null;
  }

  function relationFor(modCls, headCls) {
    var best = null;
    for (var i = 0; i < RELATIONS.length; i++) {
      var r = RELATIONS[i];
      if (r.mod.indexOf(modCls) < 0) continue;
      if (r.head.length && r.head.indexOf(headCls) < 0) continue;
      if (!best || r.score > best.score) best = r;
    }
    return best || { rel: "about", phrase: "relating to", score: 1.0 };
  }

  /* ------------------------------------------------------- sense sources */

  /* Everything the system knows about one word, from whichever source holds
     it. The knowledge base wins for named things; the lexicon holds ordinary
     vocabulary; a dictionary lookup fills the rest at query time. */
  function sensesFor(word) {
    var out = [];
    var L = lex();
    if (L) {
      var hit = L.lookup(word);
      if (hit) {
        hit.senses.forEach(function (s) {
          out.push({ word: hit.word, form: hit.form, pos: s.pos, gloss: s.gloss, cls: s.cls, from: s.learned ? "dictionary" : "lexicon" });
        });
      }
    }
    var K = kb();
    if (K && C) {
      var ents = K.resolve(word, { strict: true });
      /* Only when the word IS the entity's name. A generic alias ("memory"
         for RAM, "method" for function) is a pointer, not a definition, and
         letting it stand in for the ordinary word is how a compound about
         teaching ends up about JavaScript. */
      var asked = C.flatten(word);
      if (ents.length && ents[0].score >= 0.85 &&
          C.flatten(ents[0].entity.name).replace(/\s*\([^)]*\)\s*$/, "") === asked) {
        var e = ents[0].entity;
        out.unshift({
          word: e.name, form: "entity", pos: "n", gloss: stripSubject(e.defn, e.name),
          cls: classOfEntity(e), from: "knowledge", entity: e
        });
      }
    }
    return out;
  }

  function stripSubject(defn, name) {
    var d = String(defn || "");
    var esc = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var m = d.match(new RegExp("^(?:The |An |A )?" + esc + ",?[^,.]{0,40}?,?\\s+(?:is|are|was|were)\\s+(.*)$", "i"));
    if (m) return m[1].replace(/\.$/, "");
    return d.replace(/\.$/, "");
  }

  var ENTITY_CLASS = {
    person: "PERSON", company: "GROUP", country: "PLACE", city: "PLACE", place: "PLACE",
    river: "PLACE", landmark: "ARTIFACT", planet: "PLACE", star: "PLACE", satellite: "PLACE",
    element: "SUBSTANCE", substance: "SUBSTANCE", molecule: "SUBSTANCE",
    animal: "ORGANISM", process: "PROCESS", phenomenon: "PROCESS", event: "EVENT",
    field: "FIELD", concept: "ABSTRACT", constant: "MEASURE", protocol: "ABSTRACT",
    language: "COMMUNICATION", library: "ARTIFACT", platform: "ARTIFACT", tool: "ARTIFACT",
    hardware: "ARTIFACT", institution: "GROUP", book: "COMMUNICATION", play: "COMMUNICATION",
    painting: "ARTIFACT", film: "COMMUNICATION"
  };
  function classOfEntity(e) { return ENTITY_CLASS[e.type] || "ABSTRACT"; }

  /* ---------------------------------------------------------- the reader */

  var DETERMINER = /^(?:the|a|an|this|that|these|those|some|any|my|your|his|her|its|our|their)$/i;

  /* Read a phrase compositionally. Returns null when there is nothing to
     compose -- a single known word, or a phrase whose words are all unknown. */
  function read(phrase, opts) {
    opts = opts || {};
    var L = lex();
    if (!L || !C) return null;
    var words = C.words(phrase).filter(function (w) { return !DETERMINER.test(w); });
    if (words.length < 2 || words.length > 5) return null;

    /* The head of an English noun phrase is its last noun. Everything before
       it modifies it. */
    var headWord = words[words.length - 1];
    var modWords = words.slice(0, -1);

    var headSenses = sensesFor(headWord).filter(function (s) { return s.pos === "n" || s.from === "knowledge"; });
    if (!headSenses.length) return null;

    /* A multi-word modifier may itself be a known thing ("machine learning
       model"). Try the longest modifier span first. */
    var modSpan = "", modSenses = [];
    for (var n = modWords.length; n >= 1 && !modSenses.length; n--) {
      var span = modWords.slice(modWords.length - n).join(" ");
      var cand = sensesFor(span);
      if (cand.length) { modSpan = span; modSenses = cand; }
    }
    if (!modSenses.length) return null;

    /* Choose the sense pair whose classes make the most natural compound.
       This is where "learning pivot" selects the change-of-direction sense of
       pivot over the mechanical one: an activity modifying an event is a far
       more natural compound than an activity modifying a machine part. */
    var best = null;
    for (var h = 0; h < headSenses.length; h++) {
      for (var m = 0; m < modSenses.length; m++) {
        var hs = headSenses[h], ms = modSenses[m];
        var rel = glossRelation(hs.gloss, ms.cls) || relationFor(ms.cls, hs.cls);
        var score = rel.score
          + (hs.from === "knowledge" ? 0.5 : 0)
          + (ms.from === "knowledge" ? 0.3 : 0)
          - h * 0.12 - m * 0.12
          + (ms.pos === "adj" && hs.pos === "n" ? 0.4 : 0)
          - (ms.pos === "v" ? 0.5 : 0);
        if (!best || score > best.score) {
          best = { score: score, head: hs, mod: ms, relation: rel };
        }
      }
    }
    if (!best) return null;

    return {
      phrase: words.join(" "),
      headWord: headWord, modifierWord: modSpan,
      head: best.head, modifier: best.mod, relation: best.relation,
      confidence: Math.min(0.72, 0.34 + best.score * 0.1),
      alternatives: headSenses.length + modSenses.length - 2,
      sources: sourceList(best)
    };
  }
  function sourceList(best) {
    var out = [];
    [best.head, best.mod].forEach(function (s) {
      var label = s.from === "knowledge" ? "local knowledge base" :
                  s.from === "dictionary" ? "dictionary" : "word lexicon";
      if (out.indexOf(label) < 0) out.push(label);
    });
    return out;
  }

  /* Realise the reading as English. The wording says plainly that this is a
     reading built from the parts, not a definition of a fixed term -- which
     is the honest thing to say and also the thing a reader needs to know. */
  /* One sentence. "Would be" carries the fact that this is a reading built
     from the parts rather than a definition of a fixed term -- saying so at
     length was noise, and the reader can already see it. */
  function explain(reading, style) {
    if (!reading) return "";
    var phrase = reading.phrase;
    var body;
    if (reading.relation.rel === "adj") {
      var hg = headCore(reading.head.gloss).replace(/^(?:a|an|the)\s+/i, "");
      body = article(hg) + hg + " that is " + clipGloss(reading.modifier.gloss);
    } else {
      body = composedGloss(reading);
    }
    var out = RZcap(indefinite(phrase)) + " " + phrase + " would be " + lower1(body) + ".";
    /* Only a genuinely weak reading earns a second clause. */
    if (reading.confidence < 0.5 && style !== "brief") {
      out += " Tell me the context and I can be more exact.";
    }
    return out;
  }

  /* The leading clause of a gloss is the definition; what follows it is
     illustration. A composed reading wants the definition. */
  function clipGloss(g) {
    var t = String(g || "").split(/\s+\u2014\s+|;\s+/)[0].trim();
    if (t.length > 96) t = t.split(/,\s+/).slice(0, 2).join(", ");
    return t.replace(/\.$/, "");
  }

  /* A composed sentence carries the head's definition AND the modifier
     clause, so a head gloss with its own relative clause makes the result
     unreadable. Past about sixty characters the defining phrase alone is
     what the reader needs. */
  function headCore(g, replacingPurpose) {
    var t = clipGloss(g);
    /* The composed clause is about to state the purpose, so the head's own
       purpose clause would be said twice. */
    if (replacingPurpose) {
      var p = t.split(/\s+(?:for|used for|used to|designed to|intended to|displaying|giving|that|which|who)\s+/)[0];
      /* The head noun on its own is enough here -- the composed clause
         supplies the purpose that was cut away. */
      if (p.length >= 6) t = p;
    }
    if (t.length <= 60) return t;
    var cut = t.split(/\s+(?:that|which|who|used|designed|intended)\s+/)[0];
    if (cut.length >= 12 && cut.length < t.length) return cut;
    cut = t.split(/,\s+/)[0];
    return cut.length >= 12 ? cut : t;
  }

  /* A modifier clause hung off a long definition needs a breath before it. */
  function join(hg, clause) {
    /* A restrictive "that" clause never takes a comma. */
    var comma = hg.length > 45 && !/^that\b/.test(clause);
    return hg + (comma ? ", " : " ") + clause;
  }

  function composedGloss(reading) {
    var head = reading.head, mod = reading.modifier, rel = reading.relation;
    var statesPurpose = rel.rel === "holds" || rel.rel === "purpose" ||
                        rel.rel === "instruct" || rel.rel === "signals" || rel.rel === "onfor";
    var hg = headCore(head.gloss, statesPurpose).replace(/^(?:a|an|the)\s+/i, "");
    switch (rel.rel) {
      case "in":    return article(hg) + join(hg, "that occurs in the course of " + shortGloss(mod));
      case "about": return article(hg) + join(hg, rel.phrase + " " + shortGloss(mod));
      case "for":   return article(hg) + join(hg, "used for " + shortGloss(mod));
      case "agent": return article(hg) + join(hg, "whose work is " + shortGloss(mod));
      case "of":    return article(hg) + join(hg, "made of " + shortGloss(mod));
      case "at":    return article(hg) + join(hg, "belonging to or found in " + shortGloss(mod));
      case "poss":  return article(hg) + join(hg, "belonging to " + shortGloss(mod));
      case "when":  return article(hg) + join(hg, "measured over " + shortGloss(mod));
      case "attr":  return article(hg) + join(hg, "defined in terms of " + shortGloss(mod));
      case "instrument": return article(hg) + join(hg, "carried out with " + shortGloss(mod));
      case "instruct": return article(hg) + join(hg, "telling you to " + baseVerb(mod));
      case "purpose": return article(hg) + join(hg, "for " + (mod.pos === "v" ? gerund(mod) : shortGloss(mod)));
      case "onfor": return article(hg) + join(hg, "used on " + shortGloss(mod));
      case "holds": return article(hg) + join(hg, "for holding " + shortGloss(mod));
      case "signals": return article(hg) + join(hg, "used to give " + shortGloss(mod));
      default:      return article(hg) + join(hg, "relating to " + shortGloss(mod));
    }
  }

  /* The modifier is named by its word where the word is plain, and by its
     gloss where the word is technical -- a reader needs whichever is
     clearer. */
  /* The modifier is named, not re-defined: repeating its dictionary entry
     inside the composed clause doubled the length and said nothing the
     sentence did not already say. */
  function shortGloss(sense) {
    var w = String(sense.word || "");
    if (/^[A-Z]/.test(w) || sense.from === "knowledge") return w;
    if (MASS.test(w) || /s$/.test(w)) return w;
    return indefinite(w) + " " + w;
  }
  var MASS = /^(?:water|air|fire|earth|time|money|work|energy|information|data|knowledge|learning|teaching|training|research|design|growth|progress|music|art|science|security|privacy|health|weather|news|software|hardware|engineering|marketing|finance|education|history|space|light|heat|power|speed|evidence|advice|help|food|blood|oil|gas|wood|glass|metal|paper|plastic|stone|culture|behaviour|behavior)$/i;

  /* A plural or mass gloss takes no article at all. */
  /* A verb sense is stored in its base form; these put it back into the
     shape the surrounding clause needs. */
  function baseVerb(sense) {
    return String(sense.word || "").replace(/^to\s+/, "");
  }
  function gerund(sense) {
    var w = baseVerb(sense);
    if (/e$/.test(w) && !/ee$/.test(w)) return w.slice(0, -1) + "ing";
    if (/^[a-z]*[aeiou][bdgklmnprt]$/.test(w) && w.length <= 5) return w + w.slice(-1) + "ing";
    return w + "ing";
  }

  function lower1(s) {
    /* Dictionary glosses arrive capitalised; inside a sentence they are not
       at its start. A proper noun keeps its capital. */
    var t = String(s || "");
    if (!t) return t;
    var first = t.split(/\s+/)[0].replace(/[^A-Za-z]/g, "");
    if (first.length > 1 && first === first.toUpperCase()) return t;   /* acronym */
    if (/^[A-Z][a-z]+$/.test(first) && PROPERISH.test(first)) return t;
    return t.charAt(0).toLowerCase() + t.slice(1);
  }
  var PROPERISH = /^(?:[A-Z][a-z]+)$/;

  function article(g) {
    var first = (String(g).trim().split(/\s+/)[0] || "").replace(/[^A-Za-z]/g, "");
    if (/(?:[^s]s|ies|people|data|ideas|customs)$/i.test(first) && !/(?:ss|us|is)$/i.test(first)) return "";
    return /^[aeiou]/i.test(g) ? "an " : "a ";
  }
  function indefinite(word) { return /^[aeiou]/i.test(String(word)) ? "an" : "a"; }
  function RZcap(s) { return String(s).charAt(0).toUpperCase() + String(s).slice(1); }

  /* A single word with no entity behind it is a dictionary question, and is
     answered as one: the senses, in order, each labelled by part of speech. */
  function defineWord(word, opts) {
    opts = opts || {};
    var senses = sensesFor(word);
    if (!senses.length) return null;
    var real = senses.filter(function (s) { return s.from !== "knowledge"; });
    if (!real.length) return null;
    var limit = opts.limit || 3;
    var parts = real.slice(0, limit).map(function (s) {
      var tag = s.pos === "v" ? "as a verb, " : s.pos === "adj" ? "as an adjective, " :
                s.pos === "adv" ? "as an adverb, " : "";
      return tag + s.gloss;
    });
    var body;
    if (parts.length === 1) {
      body = RZcap(word) + " means " + parts[0] + ".";
    } else {
      body = RZcap(word) + " has more than one sense: " + parts.join("; ") + ".";
    }
    return {
      text: body, senses: real.slice(0, limit), word: word,
      confidence: 0.75, sources: [real[0].from === "dictionary" ? "dictionary" : "word lexicon"]
    };
  }

  /* A gloss tells you what class of thing is being defined. Dictionaries do
     not ship semantic classes, so one is inferred from the shape of the
     definition -- "the act of ...", "a person who ...", "a device for ..." --
     which is how a word learned at runtime joins the same relation table as
     one written here. */
  var CLASS_CUES = [
    [/^(?:the )?(?:act|action|process|practice|activity) of\b/i, "ACTIVITY"],
    [/^(?:the )?(?:state|condition|quality|fact) of\b/i, "STATE"],
    [/^(?:a |an )?person\b|\bone who\b|\bsomeone who\b/i, "PERSON"],
    [/^(?:a |an )?(?:group|body|organisation|organization|company|team|association)\b/i, "GROUP"],
    [/^(?:a |an )?(?:place|area|region|location|town|city|country|building|room)\b/i, "PLACE"],
    [/^(?:a |an )?(?:device|machine|tool|instrument|apparatus|container|vehicle|implement|object)\b/i, "ARTIFACT"],
    [/^(?:a |an )?(?:substance|material|liquid|gas|metal|chemical|compound)\b/i, "SUBSTANCE"],
    [/^(?:a |an )?(?:animal|plant|organism|creature|insect|bird|fish|mammal)\b/i, "ORGANISM"],
    [/^(?:a |an )?(?:period|length of time|point in time|moment|era|interval)\b/i, "TIME"],
    [/^(?:a |an )?(?:unit|measure|amount|quantity|degree|rate|number)\b/i, "MEASURE"],
    [/^(?:a |an )?(?:branch|field|study|science|discipline|art) of\b/i, "FIELD"],
    [/^(?:a |an )?(?:event|occurrence|happening|incident|ceremony|meeting)\b/i, "EVENT"],
    [/^(?:a |an )?(?:statement|message|account|report|record|document|word|term|name)\b/i, "COMMUNICATION"],
    [/\bchange\b|\bshift\b|\bmovement\b|\btransition\b/i, "EVENT"],
    [/\bprocess\b|\bgrowth\b|\bdevelopment\b/i, "PROCESS"],
    [/\bability\b|\bcapacity\b|\bproperty\b|\bcharacteristic\b|\battribute\b/i, "PROPERTY"]
  ];
  function classify(gloss, pos) {
    if (pos === "v") return "ACTION";
    if (pos === "adj") return "QUALITY";
    if (pos === "adv") return "MANNER";
    var g = String(gloss || "");
    for (var i = 0; i < CLASS_CUES.length; i++) if (CLASS_CUES[i][0].test(g)) return CLASS_CUES[i][1];
    return "ABSTRACT";
  }

  root.C4LMCompose = {
    classify: classify,
    read: read,
    explain: explain,
    defineWord: defineWord,
    sensesFor: sensesFor,
    relationFor: relationFor,
    composedGloss: composedGloss,
    RELATIONS: RELATIONS
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.C4LMCompose;
})(typeof window !== "undefined" ? window : globalThis);
