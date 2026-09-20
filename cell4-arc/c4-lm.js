/* CELL4 language orchestrator.
 *
 *   RAW TEXT -> shared normalisation -> one QueryFrame
 *            -> parallel System-1 decisions (one feature pass, many verdicts)
 *            -> adaptive depth: the cheapest sufficient resolver runs
 *            -> verification and confidence
 *            -> answer plan -> realiser -> text
 *
 * The System-1 layer is a typed decision head in the spirit of the small
 * structured-decision models: unstructured input becomes structured decisions
 * cheaply and in one pass, and only the branch those decisions select pays
 * for deep work. Free-form language is still produced -- by the realiser,
 * from structured content, at the end.
 *
 * No external model service anywhere in this file. The only network use is
 * the keyless public-data federation, and it runs only when the frame says
 * the answer cannot be known locally.
 */
(function (root) {
  "use strict";

  var C = root.C4LMCore, KB = root.C4LMKB, RS = root.C4LMReason,
      RT = root.C4LMRetrieve, EV = root.C4LMEvidence, RZ = root.C4LMRealize,
      CD = root.C4LMCode;

  var state = {
    ready: false,
    index: null,
    federation: null,
    ablations: Object.create(null),
    profile: [],
    stats: { turns: 0, web: 0, cacheHits: 0 }
  };

  function off(name) { return !!state.ablations[name]; }

  /* ===================================================== discourse state */

  function Discourse() {
    this.activeEntity = "";
    this.activeTopic = "";
    this.currentRelation = "";
    this.questionFamily = "";
    this.recentEntities = [];
    this.recentClaims = [];
    this.answerFacets = [];
    this.lastAnswer = "";
    this.turns = 0;
    this.lastCandidates = [];
  }
  Discourse.prototype.snapshot = function () {
    return {
      subject: this.activeEntity, entity: this.activeEntity, topic: this.activeTopic,
      relation: this.currentRelation, family: this.questionFamily,
      recent: this.recentEntities.slice(0, 5), facets: this.answerFacets.slice(0, 6),
      turn: this.turns, candidates: this.lastCandidates.slice()
    };
  };
  Discourse.prototype.commit = function (frame, result) {
    this.turns++;
    if (frame.topicShift) {
      this.activeEntity = ""; this.activeTopic = ""; this.currentRelation = "";
      this.answerFacets = [];
    }
    var ent = result && (result.entity || result.subject);
    if (!ent && result && result.pendingSenses && result.pendingSenses.length) {
      /* A clarification leaves the reading open but not the topic: a pronoun
         in the next turn still has the dominant candidate to attach to. */
      ent = result.pendingSenses[0].entity;
    }
    if (ent && !result.carriedContext) {
      if (this.activeEntity && C.flatten(this.activeEntity) !== C.flatten(ent)) {
        this.recentEntities.unshift(this.activeEntity);
        this.recentEntities = this.recentEntities.slice(0, 6);
      }
      this.activeEntity = ent;
      this.activeTopic = ent;
    } else if (ent && !this.activeEntity) {
      this.activeEntity = ent; this.activeTopic = ent;
    }
    if (result && result.relation) this.currentRelation = result.relation;
    this.questionFamily = frame.queryForm;
    if (result && result.text) {
      this.lastAnswer = result.text;
      this.recentClaims.unshift({ text: result.text, entity: ent || "", turn: this.turns });
      this.recentClaims = this.recentClaims.slice(0, 5);
    }
    if (result && result.facets) this.answerFacets = result.facets.slice(0, 8);
    if (result && result.candidates) this.lastCandidates = result.candidates.slice(0, 6);
    if (result && result.comparison) this.lastComparison = result.comparison;
    if (result && result.pendingSenses) this.pendingSenses = result.pendingSenses;
  };

  /* Pronoun and ellipsis resolution. A reference is replaced by the active
     entity only when the message cannot stand on its own; a topic shift or a
     self-sufficient question clears the carry instead of dragging it along. */
  var THIRD_PERSON = /^(?:he|she|it|they|them|him|her|his|hers|its|their|theirs|this|that|these|those|one)$/i;

  function resolveContext(frame, disc) {
    if (off("dialogue")) return { frame: frame, carried: false };
    if (!disc || !disc.activeEntity) return { frame: frame, carried: false };
    if (frame.topicShift) return { frame: frame, carried: false };

    var needsCarry = false, reason = "";
    /* 1. a third-person pronoun with no competing entity in the message */
    var hasPronoun = frame.pronouns.some(function (p) { return THIRD_PERSON.test(p); });
    if (hasPronoun && !frame.entities.length) { needsCarry = true; reason = "pronoun"; }
    /* 2. an elliptical fragment: a bare noun phrase, a bare relation, or a
          bare "why"/"how" with nothing to attach to */
    /* A bare entity after a relational question repeats that question about
       a new subject: "capital of France?" then "and Germany?" or just
       "Germany?". This is parallel ellipsis, and it is resolved by reusing
       the previous relation, not by dragging the previous subject in. */
    if (!needsCarry && frame.wordCount <= 4 && disc.currentRelation && KB) {
      var bare = frame.body.replace(/[?.!]+$/, "").trim();
      if (bare && KB.resolve(bare, { strict: true }).length &&
          C.flatten(bare) !== C.flatten(disc.activeEntity)) {
        var parallel = C.parse(questionFor(disc.questionFamily, disc.currentRelation, bare), disc.snapshot());
        parallel.rawText = frame.rawText;
        return { frame: parallel, carried: true, reason: "parallel", newSubject: bare };
      }
    }
    if (!needsCarry && frame.wordCount <= 6) {
      /* A bare noun that names something is a NEW topic, not an ellipsis:
         typing "learning" after a question about Mercury is a change of
         subject. Only an explicit continuation marker, a pronoun or an
         unattached relation carries the previous subject forward. */
      var namesSomething = frame.contentTokens.length >= 1 &&
        ((KB && KB.resolve(frame.body.replace(/[?.!]+$/, "").trim(), { strict: true }).length > 0) ||
         (root.C4LMLexicon && frame.contentTokens.every(function (t) { return root.C4LMLexicon.has(t); })));
      if (frame.leadMarker === "and" || frame.leadMarker === "but" ||
          /^(?:and|what about|how about|why|how|when|where|what else|more|and what of)\b/i.test(frame.body) ||
          (frame.relation && !frame.subject) ||
          (!namesSomething && frame.queryForm === "statement" && !frame.entities.length &&
           frame.contentTokens.length <= 2)) {
        needsCarry = true; reason = "ellipsis";
      }
    }
    /* 3. a relation with no subject at any length */
    if (!needsCarry && frame.relation && !frame.subject) { needsCarry = true; reason = "open-relation"; }
    if (!needsCarry) return { frame: frame, carried: false };

    /* Build the explicit question the fragment stands for, then parse it
       once. Downstream never sees a fragment. */
    var subject = disc.activeEntity;
    var rebuilt = "";
    /* A pronoun is resolved in place: the rest of the message keeps its own
       syntax, so "when was he born" stays a birth-date question rather than
       being rebuilt from the relation label. */
    if (hasPronoun) {
      rebuilt = frame.body.replace(/\b(?:he|she|it|they|them|him|her|his|hers|its|their|theirs)\b/gi, function (m0) {
        return /^(?:his|her|its|their)$/i.test(m0) ? subject + "'s" : subject;
      });
    } else if (frame.relation) rebuilt = "what is the " + (frame.relationPhrase || frame.relation) + " of " + subject;
    else if (/^(?:and|what about|how about)\b/i.test(frame.body) || frame.leadMarker === "and") {
      /* "and UDP?" introduces a NEW subject under the SAME question.
         "what about cost?" introduces a new facet of the SAME subject. */
      var tail = frame.body.replace(/^(?:and|what about|how about)\s*/i, "").replace(/[?.!]+$/, "").trim();
      var tailIsEntity = KB && KB.resolve(tail, { strict: true }).length > 0;
      if (tailIsEntity && disc.questionFamily) {
        rebuilt = questionFor(disc.questionFamily, disc.currentRelation, tail);
        return { frame: C.parse(rebuilt, disc.snapshot()), carried: true, reason: "parallel", newSubject: tail };
      }
      rebuilt = "what is the " + tail + " of " + subject;
    } else if (/^why\b/i.test(frame.body)) rebuilt = "why " + subject;
    else if (/^how\b/i.test(frame.body)) rebuilt = "how does " + subject + " work";
    else rebuilt = frame.body + " of " + subject;

    var carriedFrame = C.parse(rebuilt, disc.snapshot());
    /* Keep the user's own format and length requests: they belong to the
       message, not to the reconstructed question. */
    carriedFrame.requestedFormat = frame.requestedFormat;
    carriedFrame.requestedLength = frame.requestedLength;
    carriedFrame.requestedUnit = frame.requestedUnit;
    carriedFrame.onlyValue = frame.onlyValue;
    carriedFrame.rawText = frame.rawText;
    return { frame: carriedFrame, carried: true, reason: reason };
  }
  function questionFor(family, relation, subject) {
    if (relation) return "what is the " + relation + " of " + subject;
    if (family === "why") return "why " + subject;
    if (family === "howmany") return "how many " + subject;
    return "what is " + subject;
  }

  /* ============================================ System-1 decision head
   * One feature extraction, many decisions. The weights are a small
   * log-linear model per route; they are read once from the shared feature
   * vector rather than from ten independent classifiers over the raw text. */

  var ROUTES = ["compute", "reason", "knowledge", "local", "web", "comparison",
                "explanation", "conversation", "code", "clarify"];

  function features(frame, disc) {
    return {
      isEmpty: frame.empty ? 1 : 0,
      hasNumber: /\d/.test(frame.body) ? 1 : 0,
      arithmetic: frame.requiresComputation ? 1 : 0,
      logical: frame.requiresReasoning ? 1 : 0,
      compare: frame.requiresComparison ? 1 : 0,
      explain: frame.requiresExplanation ? 1 : 0,
      list: frame.requiresList ? 1 : 0,
      code: frame.requiresCode ? 1 : 0,
      fresh: frame.requiresFreshInformation ? 1 : 0,
      question: frame.speechAct === "question" ? 1 : 0,
      command: frame.speechAct === "command" ? 1 : 0,
      social: (frame.speechAct === "greeting" || frame.speechAct === "thanks" ||
               frame.speechAct === "acknowledgement" || frame.metaSelf) ? 1 : 0,
      statement: frame.speechAct === "statement" ? 1 : 0,
      remark: (frame.speechAct === "statement" && !frame.hasQuestionMark &&
               !frame.requiresComputation && !frame.requiresCode && frame.wordCount >= 3) ? 1 : 0,
      hasRelation: frame.relation ? 1 : 0,
      hasSubject: frame.subject || frame.entities.length ? 1 : 0,
      shortMsg: frame.wordCount <= 4 ? 1 : 0,
      longMsg: frame.wordCount >= 25 ? 1 : 0,
      aboutSite: /\b(?:cell4|robots\.js|this site|this page|your (?:engine|solver|code))\b/i.test(frame.lower) ? 1 : 0,
      kbHit: 0, kbRelation: 0, ambiguousName: 0, localHit: 0,
      hasContext: disc && disc.activeEntity ? 1 : 0
    };
  }

  /* Resolve the subject against local knowledge ONCE, and let every decision
     read the result. This is the single most useful feature and the old
     stack recomputed its equivalent per consumer. */
  function groundSubject(frame, f) {
    if (!KB || off("kb")) return null;
    var tries = [];
    if (frame.subject) tries.push(frame.subject);
    frame.entities.forEach(function (e) { tries.push(e); });
    if (frame.topic) tries.push(frame.topic);
    frame.subjectCandidates.forEach(function (c) { if (c.weight >= 0.35) tries.push(c.text); });
    var best = null;
    for (var i = 0; i < tries.length && i < 22; i++) {
      var hits = KB.resolve(tries[i]).filter(genuineMatch);
      if (!hits.length) continue;
      var ent = hits[0].entity;
      var senses = KB.senses(tries[i]);
      /* Grounding is intent-aware. "Why does Earth have seasons?" names two
         known entities; the one that carries a causal account is the one the
         question is about. The same rule picks the entity that holds the
         asked relation over one that merely shares the sentence. */
      var bonus = 0;
      if (frame.requiresExplanation && ((ent.extra && ent.extra.why) || (ent.rel && ent.rel.cause))) bonus += 0.45;
      if (frame.relation && ent.rel && ent.rel[frame.relation]) bonus += 0.5;
      /* Cross-coverage: the candidate whose own record accounts for the rest
         of the question is the one the question is about. "Earth have
         seasons" is about seasons, whose entry mentions Earth -- not about
         Earth, whose entry does not mention seasons. */
      var blob = C.flatten([ent.defn, JSON.stringify(ent.rel || {}), JSON.stringify(ent.extra || {})].join(" "));
      var own = C.flatten(ent.name).split(" ");
      var covered = 0, others = 0;
      for (var q = 0; q < frame.contentTokens.length; q++) {
        var tk = frame.contentTokens[q];
        if (own.indexOf(tk) >= 0) continue;
        others++;
        if (blob.indexOf(C.stem(tk)) >= 0 || blob.indexOf(tk) >= 0) covered++;
      }
      if (others) bonus += 0.35 * (covered / others);
      var cand = { phrase: tries[i], hits: hits, senses: senses, score: hits[0].score - i * 0.03 + bonus };
      if (!best || cand.score > best.score) best = cand;
      if (hits[0].score >= 0.95 && bonus > 0) break;
    }
    if (best) {
      f.kbHit = 1;
      if (frame.relation && KB.attribute(best.hits[0].entity, frame.relation)) f.kbRelation = 1;
      if (best.senses && best.senses.length > 1) f.ambiguousName = 1;
    }
    return best;
  }

  var WEIGHTS = {
    compute:     { arithmetic: 3.0, hasNumber: 0.8, code: -1.2, compare: -1.0, social: -3, explain: -0.6 },
    reason:      { logical: 3.0, arithmetic: 0.4, hasNumber: 0.5, social: -3, kbRelation: -0.8 },
    knowledge:   { kbHit: 2.4, kbRelation: 2.2, question: 0.7, command: 0.3, hasSubject: 0.5,
                   fresh: -3.0, social: -3, aboutSite: -2.5, arithmetic: -1.5, code: -0.8 },
    comparison:  { compare: 3.2, kbHit: 0.5, social: -3 },
    explanation: { explain: 2.4, kbHit: 0.8, question: 0.3, social: -3, arithmetic: -1.5 },
    code:        { code: 2.6, command: 0.6, social: -3, compare: -0.8 },
    local:       { aboutSite: 3.2, localHit: 1.2, question: 0.3, fresh: -2 },
    web:         { fresh: 3.0, question: 0.4, kbHit: -0.6, arithmetic: -2, social: -3 },
    conversation:{ social: 3.4, statement: 1.0, remark: 1.6, shortMsg: 0.5, question: -1.0, kbHit: -1.2,
                   arithmetic: -2, code: -1.5, hasRelation: -1.5 },
    clarify:     { ambiguousName: 2.0, shortMsg: 0.2, hasContext: -1.5, hasRelation: -1.5, explain: -1 }
  };

  function decide(frame, disc) {
    var f = features(frame, disc);
    var grounded = groundSubject(frame, f);
    if (state.index && !off("retrieval")) {
      /* A cheap probe only; full ranking happens on the branch that needs it. */
      var probe = state.index.candidates(frame, 3);
      f.localHit = probe.length && probe[0].bm25 > 3 ? 1 : 0;
    }
    var logits = Object.create(null), i, r;
    for (i = 0; i < ROUTES.length; i++) {
      r = ROUTES[i];
      var w = WEIGHTS[r] || {}, sum = -1.0;
      for (var k in w) sum += w[k] * (f[k] || 0);
      logits[r] = sum;
    }
    /* softmax for calibrated probabilities */
    var peak = -Infinity;
    for (r in logits) if (logits[r] > peak) peak = logits[r];
    var z = 0, dist = Object.create(null);
    for (r in logits) { dist[r] = Math.exp(logits[r] - peak); z += dist[r]; }
    for (r in dist) dist[r] /= z;

    var order = ROUTES.slice().sort(function (a, b) { return dist[b] - dist[a]; });
    /* Adaptive depth. Level 0 is a deterministic operation; level 3 is a
       decomposition. The router predicts it from the same features, so a
       trivial question never pays for deep machinery. */
    var depth = 1;
    if (f.social || (f.arithmetic && !f.logical)) depth = 0;
    else if (f.logical || f.compare || f.explain) depth = 2;
    else if (f.fresh || f.longMsg || (f.explain && f.compare)) depth = 3;
    if (f.code) depth = Math.max(depth, 2);

    return {
      features: f, grounded: grounded, dist: dist, order: order,
      route: order[0], confidence: dist[order[0]], depth: depth,
      margin: dist[order[0]] - dist[order[1]]
    };
  }

  /* A type qualifier is only a qualifier when the word really names a type
     and the other word really names something. The lexicon supplies the
     first test and the knowledge base the second; neither is a list written
     for particular phrases. */
  var TYPE_CLASSES = { GROUP: 1, PLACE: 1, ARTIFACT: 1, PERSON: 1, ORGANISM: 1, FIELD: 1, COMMUNICATION: 1, SUBSTANCE: 1 };
  function validQualifier(frame) {
    if (!frame.typeQualifier || !frame.qualifiedName) return null;
    var LX = root.C4LMLexicon;
    var q = frame.typeQualifier;
    /* Any common noun may name a type. Whether it really does is settled by
       whether a candidate sense matches it -- if none does, the qualifier
       reading is abandoned and nothing is lost. The class test only raises
       confidence, it does not gate. */
    var typeish = false;
    if (LX) {
      var hit = LX.lookup(q);
      if (hit) typeish = hit.senses.some(function (sn) { return sn.pos === "n"; });
    }
    if (!typeish && KB) typeish = KB.byType(q).length > 0;
    if (!typeish) return null;
    /* The qualified word must not itself be an ordinary word being modified
       ("learning pivot" is not a pivot of type learning). */
    if (LX && LX.lookup(frame.qualifiedName) && !/^[A-Z]/.test(frame.qualifiedName)) {
      var known = KB && KB.resolve(frame.qualifiedName, { strict: true }).length;
      if (!known) return null;
    }
    return { type: q, name: frame.qualifiedName };
  }

  /* ================================================= knowledge answering */

  /* A knowledge-base entry reached through a GENERIC alias is a pointer, not
     an identification: "method" points at the programming sense of function,
     "river" points at the Nile. When the matched spelling is an ordinary word
     and the entry is named something else, the match is rejected -- the word
     belongs to the lexicon, and the entry is about a different thing. */
  function genuineMatch(hit) {
    var LX = root.C4LMLexicon;
    if (!LX || !hit || !hit.surface) return true;
    var surface = String(hit.surface).toLowerCase();
    var name = C.flatten(hit.entity.name).replace(/\s*\([^)]*\)\s*$/, "").trim();
    if (C.flatten(surface) === name) return true;          /* matched its own name */
    if (/^[A-Z]/.test(hit.surface)) return true;           /* a proper spelling */
    return !LX.has(surface);                               /* else: ordinary word wins */
  }

  var RELATION_LABEL = {
    capital: "capital", currency: "currency", language: "language", symbol: "chemical symbol",
    author: "author", creator: "creator", artist: "creator", birth: "date of birth",
    death: "date of death", population: "population", location: "location", height: "height",
    length: "length", speed: "speed", count: "number", purpose: "use", cause: "cause",
    part: "components", type: "type", time: "date", price: "price", version: "version",
    distance: "distance", size: "size", mechanism: "mechanism", definition: "definition"
  };

  function answerFromKB(frame, decision) {
    var g = decision.grounded;
    if (!g || !g.hits.length) return null;
    var entity = g.hits[0].entity;

    /* "the company Meta" asks for the sense of Meta that is a company. The
       qualifier filters the candidates before anything else looks at them. */
    var qual = validQualifier(frame);
    if (qual) {
      var wanted = qual.type.replace(/s$/, "");
      for (var qi = 0; qi < g.hits.length; qi++) {
        var cand = g.hits[qi].entity;
        var blob = (cand.type + " " + (cand.rel && cand.rel.type || "") + " " + cand.defn).toLowerCase();
        if (blob.indexOf(wanted) >= 0) { entity = cand; break; }
      }
    }

    /* Ambiguity gate. Several senses AND no disambiguating context means the
       honest answer is a short question, not a confident guess. A dominant
       sense from context or from a qualifier in the message settles it. */
    if (g.senses && g.senses.length > 1 && !off("ambiguity")) {
      var picked = pickSense(frame, g.senses, decision);
      /* A sense that dominates usage is answered, with no question asked.
         Clarification is for names whose readings are genuinely balanced. */
      if (!picked) {
        for (var si = 0; si < g.senses.length; si++) if (g.senses[si].dominant) { picked = g.senses[si]; break; }
      }
      if (picked) entity = (KB.resolve(picked.entity, { strict: true })[0] || {}).entity || entity;
      else if (frame.queryForm === "whois" || frame.queryForm === "whatis" || frame.queryForm === "topic") {
        if (frame.wordCount <= 6) {
          return {
            text: "“" + titleOf(g.phrase) + "” could mean a few different things — " +
              RZ.joinList(g.senses.slice(0, 3).map(function (s) { return s.gloss; }), "or") +
              ". Which did you have in mind?",
            route: "clarify", clarification: true, entity: "", confidence: 0.5,
            senses: g.senses, pendingSenses: g.senses
          };
        }
      }
    }

    /* A "who" question is about a person. If one of the resolved candidates
       IS a person, that is the answer; if none is, the question is still
       answerable -- a name can belong to a place -- but a document that
       merely shares the words is not the place to look, so content retrieval
       gets first refusal. */
    if (frame.wantsPerson && entity.type !== "person" && !frame.relation) {
      var person = null;
      for (var pi = 0; pi < g.hits.length; pi++) {
        if (g.hits[pi].entity.type === "person") { person = g.hits[pi].entity; break; }
      }
      if (person) entity = person;
      else if (!(g.senses && g.senses.length > 1)) return null;
    }

    /* The entry must be about the PHRASE, not about one word inside it. A
       multi-word question whose knowledge-base match covers only the head is
       a compound the base does not hold, and reading it compositionally says
       more than defining its head would. */
    if (!frame.relation && !frame.requiresExplanation && isDefinitional(frame)) {
      var askedPhrase = C.flatten(frame.subject || frame.topic || "");
      var entName = C.flatten(displayName(entity));
      if (askedPhrase && entName && askedPhrase !== entName) {
        var askedWords = askedPhrase.split(" ").filter(function (w) { return !C.STOP[w]; });
        var entWords = entName.split(" ");
        if (askedWords.length >= 2 && entWords.length < askedWords.length &&
            entWords.every(function (w) { return askedWords.indexOf(w) >= 0; })) {
          /* Step aside only if the compositional reader can actually read the
             phrase. If it cannot, defining the head is still the best answer
             available, and silence would be worse. */
          var CPm = root.C4LMCompose;
          if (CPm && CPm.read(askedPhrase)) return null;
        }
      }
    }

    /* A relation question is answered from the attribute, not from prose. */
    if (frame.relation) {
      var val = KB.attribute(entity, frame.relation);
      if (!val && frame.relation === "creator") val = KB.attribute(entity, "artist") || KB.attribute(entity, "author");
      if (!val && frame.relation === "author") val = KB.attribute(entity, "creator");
      if (!val && frame.relation === "artist") val = KB.attribute(entity, "creator");
      if (!val && frame.relation === "time") val = KB.attribute(entity, "birth");
      if (val) {
        var plan = {
          kind: "relation", subject: displayName(entity), relation: frame.relation,
          relationLabel: RELATION_LABEL[frame.relation] || frame.relation, value: val,
          elaboration: frame.requestedTone === "brief" ? "" : shortElaboration(entity, frame.relation),
          format: frame.requestedFormat, tone: frame.requestedTone,
          lengthLimit: frame.requestedLength, lengthUnit: frame.requestedUnit,
          onlyValue: frame.onlyValue, value2: val
        };
        if (frame.onlyValue) { plan.format = "value"; plan.value = String(val).replace(/^the\s+/i, ""); }
        var out = RZ.realize(plan);
        return {
          text: out.text, route: "knowledge", entity: entity.name, relation: frame.relation,
          confidence: 0.9, defects: out.defects, sources: ["local knowledge base"],
          facets: Object.keys(entity.rel || {})
        };
      }
    }

    /* Multi-hop: the relation is not on this entity, but the entity points at
       one that has it. "capital of the country where the Eiffel Tower is". */
    if (frame.relation && !off("reasoning")) {
      var hop = multiHop(entity, frame.relation);
      if (hop) {
        var hopPlan = {
          kind: "relation", subject: displayName(hop.via), relation: frame.relation,
          relationLabel: RELATION_LABEL[frame.relation] || frame.relation, value: hop.value,
          format: frame.requestedFormat, onlyValue: frame.onlyValue
        };
        if (frame.onlyValue) { hopPlan.format = "value"; hopPlan.value = String(hop.value).replace(/^the\s+/i, ""); }
        var hopOut = RZ.realize(hopPlan);
        return {
          text: hopOut.text, route: "knowledge", entity: hop.via.name, relation: frame.relation,
          confidence: 0.82, defects: hopOut.defects, sources: ["local knowledge base"],
          multiHop: [entity.name, hop.via.name]
        };
      }
    }

    /* Facet lookup. A question can name an attribute that is not one of the
       parsed relations -- "his education", "its applications". Any content
       word that matches an attribute name (or a close morphological variant)
       answers from that attribute, which is how a new facet becomes
       answerable without a new branch. */
    var facet = matchFacet(frame, entity);
    if (facet) {
      var isSentence = /^[A-Z]/.test(String(facet.value)) && /[.!?]$/.test(String(facet.value).trim());
      var fPlan = {
        kind: isSentence ? "statement" : "relation",
        statement: facet.value, name: displayName(entity), definition: facet.value,
        subject: displayName(entity), relation: facet.key,
        relationLabel: RELATION_LABEL[facet.key] || facet.key, value: facet.value,
        format: frame.requestedFormat, tone: frame.requestedTone,
        lengthLimit: frame.requestedLength, lengthUnit: frame.requestedUnit,
        onlyValue: frame.onlyValue
      };
      var fOut = RZ.realize(fPlan);
      if (fOut.text) {
        return { text: fOut.text, route: "knowledge", entity: entity.name, relation: facet.key,
                 confidence: 0.82, defects: fOut.defects, sources: ["local knowledge base"] };
      }
    }

    /* Explanation: a phenomenon carries its causal account. */
    if ((frame.requiresExplanation || frame.queryForm === "why") && !off("kb")) {
      var why = (entity.extra && entity.extra.why) || KB.attribute(entity, "cause");
      /* "Why?" about a thing with no causal account is a question about what
         it is FOR. Answering the purpose is the honest reading. */
      if (!why && KB.attribute(entity, "purpose")) {
        why = "It exists because " + KB.attribute(entity, "purpose") +
              " is worth doing, and " + displayName(entity) + " is how that is done.";
      }
      if (why) {
        var ePlan = {
          kind: "explanation", direct: entity.defn, mechanism: why,
          format: frame.requestedFormat, tone: frame.requestedTone,
          lengthLimit: frame.requestedLength, lengthUnit: frame.requestedUnit
        };
        var eOut = RZ.realize(ePlan);
        return { text: eOut.text, route: "explanation", entity: entity.name, confidence: 0.85,
                 defects: eOut.defects, sources: ["local knowledge base"] };
      }
    }

    /* Otherwise: the definition, with one elaboration if there is room. */
    if (!entity.defn) return null;
    var defPlan = {
      kind: "definition", name: displayName(entity),
      definition: (entity.extra && frame.requestedLength === 1 && entity.extra.oneLine) || entity.defn,
      elaboration: frame.requestedTone === "brief" ? "" : shortElaboration(entity, ""),
      format: frame.requestedFormat, tone: frame.requestedTone,
      lengthLimit: frame.requestedLength, lengthUnit: frame.requestedUnit
    };
    var defOut = RZ.realize(defPlan);
    return {
      text: defOut.text, route: "knowledge", entity: entity.name, confidence: 0.85,
      defects: defOut.defects, sources: ["local knowledge base"],
      facets: Object.keys(entity.rel || {}).concat(Object.keys(entity.extra || {}))
    };
  }

  /* Attribute names are themselves vocabulary. A content word that stems to
     an attribute key -- or to one of its synonyms -- selects that attribute. */
  var FACET_SYNONYM = {
    education: "education", educated: "education", school: "education", schooling: "education",
    study: "education", studied: "education", university: "education", degree: "education",
    achievement: "achievement", award: "achievement", awards: "achievement", prize: "achievement",
    won: "achievement", win: "achievement", nobel: "achievement",
    application: "purpose", applications: "purpose", use: "purpose", uses: "purpose",
    used: "purpose", useful: "purpose", point: "purpose", good: "purpose",
    component: "part", components: "part", parts: "part", ingredient: "part",
    made: "part", contains: "part", boiling: "boiling", freezing: "freezing",
    many: "count", much: "count", number: "count", count: "count",
    born: "birth", birthday: "birth", died: "death", tall: "height", high: "height",
    fast: "speed", cost: "price", worth: "price", where: "location", size: "size"
  };
  function matchFacet(frame, entity) {
    var pools = [entity.extra || {}, entity.rel || {}];
    /* Every token, not only the content ones: "how many" carries the facet
       even though both words are function words. */
    for (var t = 0; t < frame.tokens.length; t++) {
      var word = frame.tokens[t], stemmed = frame.stems[t];
      var key = FACET_SYNONYM[word] || FACET_SYNONYM[stemmed] || "";
      var tries = [key, word, stemmed].filter(Boolean);
      for (var i = 0; i < tries.length; i++) {
        for (var p = 0; p < pools.length; p++) {
          if (pools[p][tries[i]]) return { key: tries[i], value: pools[p][tries[i]] };
        }
      }
    }
    return null;
  }

  function displayName(entity) { return String(entity.name).replace(/\s*\([^)]*\)\s*$/, ""); }
  function titleOf(s) { return RZ.capitalize(String(s)); }

  function shortElaboration(entity, usedRelation) {
    var order = ["purpose", "part", "cause", "creator", "location", "time", "count"];
    for (var i = 0; i < order.length; i++) {
      if (order[i] === usedRelation) continue;
      var v = entity.rel && entity.rel[order[i]];
      if (!v) continue;
      switch (order[i]) {
        case "purpose": return "It is used for " + v;
        case "part": return "It is made up of " + v;
        case "cause": return "It is caused by " + v;
        case "creator": return "It was created by " + v;
        case "location": return "It is in " + v;
        case "time": return "It dates to " + String(v)
          .replace(/^(?:founded|published|released|created|written|completed|first released)\s+/i, "")
          .replace(/^in\s+/i, "");
        /* A bare number with no noun ("79") says nothing on its own. */
        case "count": return /\s/.test(String(v)) ? "It has " + v : "";
      }
    }
    return "";
  }

  /* One hop through a relation the entity DOES have, to an entity that has
     the asked relation. Bounded to a single hop on purpose. */
  function multiHop(entity, relation) {
    var links = ["country", "location", "author", "creator", "person"];
    for (var i = 0; i < links.length; i++) {
      var target = entity.rel && entity.rel[links[i]];
      if (!target) continue;
      var hits = KB.resolve(String(target).split(/,|\band\b/)[0], { strict: true });
      if (!hits.length) continue;
      var val = KB.attribute(hits[0].entity, relation);
      if (val) return { via: hits[0].entity, value: val };
    }
    return null;
  }

  /* Sense selection from context: the dialogue's active domain, a qualifier
     in the message, or a domain word elsewhere in the sentence. */
  function pickSense(frame, senses, decision) {
    var text = frame.lower + " " + (frame.knownContext ? C.flatten(frame.knownContext.topic || "") : "");
    var best = null;
    for (var i = 0; i < senses.length; i++) {
      var s = senses[i], score = 0;
      var domainWords = {
        computing: ["code", "program", "language", "software", "run", "compile", "library", "api", "jvm", "script"],
        astronomy: ["planet", "sun", "orbit", "solar", "space", "star"],
        chemistry: ["element", "metal", "symbol", "atomic", "liquid", "chemical"],
        geography: ["country", "island", "river", "capital", "city", "map", "located"],
        sport: ["basketball", "nba", "player", "game", "team", "championship"],
        film: ["film", "movie", "watch", "cinema", "director", "starring"],
        mathematics: ["matrix", "vector", "linear", "algebra", "array", "determinant"],
        business: ["company", "stock", "iphone", "shares", "ceo", "retail"],
        biology: ["snake", "animal", "species", "bird", "reptile"],
        mythology: ["god", "roman", "greek", "myth"],
        everyday: ["coffee", "drink", "fruit", "eat"]
      };
      var words_ = domainWords[s.domain] || [];
      for (var j = 0; j < words_.length; j++) if (text.indexOf(words_[j]) >= 0) score += 1;
      if (!best || score > best.score) best = { sense: s, score: score };
    }
    return best && best.score > 0 ? best.sense : null;
  }

  /* ------------------------------------------------- superlatives / lists */

  var SUPERLATIVE = {
    largest: ["size", 1], biggest: ["size", 1], smallest: ["size", -1],
    tallest: ["height", 1], shortest: ["height", -1], highest: ["height", 1],
    longest: ["length", 1], fastest: ["speed", 1], slowest: ["speed", -1],
    heaviest: ["size", 1], nearest: ["distance", -1], closest: ["distance", -1],
    farthest: ["distance", 1], furthest: ["distance", 1],
    "most populous": ["population", 1]
  };

  function leadingNumber(v) {
    var m = String(v).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    if (!m) return null;
    var n = parseFloat(m[0]);
    if (/\bbillion\b/i.test(v)) n *= 1e9;
    else if (/\bmillion\b/i.test(v)) n *= 1e6;
    else if (/\bthousand\b/i.test(v)) n *= 1e3;
    return n;
  }

  /* "the largest planet in the solar system" is answered by comparing the
     attribute across the entities of that type, not by looking the phrase up. */
  function answerSuperlative(frame) {
    if (!KB || off("kb")) return null;
    var text = frame.lower;
    var adj = "", spec = null;
    for (var k in SUPERLATIVE) {
      if (new RegExp("\\b" + k + "\\b").test(text)) { adj = k; spec = SUPERLATIVE[k]; break; }
    }
    if (!spec) return null;
    var m = text.match(new RegExp("\\b" + adj + "\\s+([a-z][\\w-]*(?:\\s+[a-z][\\w-]*)?)"));
    if (!m) return null;
    var category = m[1].replace(/\b(?:in|of|on|the|a|an)\b.*$/, "").trim();
    /* "largest planet solar system" names the category in its first word;
       try the whole phrase, then shorter heads, before giving up. */
    var pool = KB.byType(category);
    if (pool.length < 2 && /\s/.test(category)) {
      var heads = category.split(/\s+/);
      for (var h = heads.length - 1; h >= 1 && pool.length < 2; h--) {
        var shorter = heads.slice(0, h).join(" ");
        pool = KB.byType(shorter);
        if (pool.length >= 2) category = shorter;
      }
    }
    if (pool.length < 2) return null;
    var attr = spec[0], dir = spec[1], best = null;
    for (var i = 0; i < pool.length; i++) {
      var raw = KB.attribute(pool[i], attr);
      var n = raw ? leadingNumber(raw) : null;
      if (n == null) continue;
      if (!best || (dir > 0 ? n > best.n : n < best.n)) best = { ent: pool[i], n: n, raw: raw };
    }
    if (!best) return null;
    var out = RZ.realize({
      kind: "statement",
      statement: displayName(best.ent) + " is the " + adj + " " + singularize(category) +
                 ", at " + best.raw + ".",
      lengthLimit: frame.requestedLength, lengthUnit: frame.requestedUnit
    });
    return { text: out.text, route: "knowledge", entity: best.ent.name, confidence: 0.8,
             defects: out.defects, sources: ["local knowledge base"] };
  }
  function singularize(w) {
    return /ies$/.test(w) ? w.slice(0, -3) + "y" : /s$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w;
  }

  /* An enumeration question is answered from a list attribute, as a list. */
  function answerListRequest(frame, decision) {
    if (!frame.requiresList || !KB || off("kb")) return null;
    var g = decision.grounded;
    var entity = g && g.hits.length ? g.hits[0].entity : null;
    if (!entity || !entity.extra || !entity.extra.list) return null;
    var items = entity.extra.list.slice(0, frame.requestedLength || entity.extra.list.length);
    var out = RZ.realize({ kind: "list", items: items,
                           format: frame.requestedFormat === "bullets" || items.length > 2 ? "bullets" : "prose",
                           limit: items.length });
    return { text: out.text, route: "knowledge", entity: entity.name, confidence: 0.85,
             defects: out.defects, sources: ["local knowledge base"] };
  }

  /* A comparative follow-up resolves against the pair already on the table:
     "which one is faster?" is scored from what each entry's own record says. */
  var COMPARATIVE_SYNONYM = {
    faster: ["fast", "speed", "latency", "low-latency", "quick", "nanosecond"],
    slower: ["slow", "millisecond"],
    bigger: ["large", "big", "capacity"], larger: ["large", "big", "capacity"],
    smaller: ["small", "compact", "minimal"],
    cheaper: ["cheap", "cheaper", "inexpensive", "low cost"],
    safer: ["safe", "secure", "reliable", "encrypt"],
    simpler: ["simple", "minimal", "no setup"],
    "more reliable": ["reliable", "guarantee", "retransmit", "ordered"]
  };
  function answerComparativeFollowup(frame, disc) {
    if (!disc || !disc.lastComparison || !KB) return null;
    var m = frame.lower.match(/\bwhich\s+(?:one\s+)?(?:is|has|was)\s+(?:the\s+)?([a-z]+(?:er|est)?)\b/);
    if (!m) return null;
    var adj = m[1];
    var cues = (COMPARATIVE_SYNONYM[adj] || [adj.replace(/er$/, ""), adj]).slice();
    var pair = disc.lastComparison;
    function score(name) {
      var hits = KB.resolve(name, { strict: true });
      if (!hits.length) return { n: 0, quote: "" };
      var e = hits[0].entity;
      var blob = [e.defn, JSON.stringify(e.rel || {}), JSON.stringify(e.extra || {})].join(" ").toLowerCase();
      var n = 0, quote = "";
      for (var i = 0; i < cues.length; i++) {
        var idx = blob.indexOf(cues[i]);
        if (idx >= 0) { n++; if (!quote) quote = cues[i]; }
      }
      return { n: n, quote: quote, entity: e };
    }
    var sa = score(pair.a), sb = score(pair.b);
    if (sa.n === sb.n) return null;
    var win = sa.n > sb.n ? pair.a : pair.b;
    var winEnt = sa.n > sb.n ? sa.entity : sb.entity;
    var other = sa.n > sb.n ? pair.b : pair.a;
    var reason = winEnt ? (winEnt.rel && winEnt.rel.purpose ? " — it is built for " + winEnt.rel.purpose : "") : "";
    var out = RZ.realize({ kind: "statement",
      statement: win + " is the " + adj + " of the two" + reason + "." });
    return { text: out.text, route: "comparison", entity: win, confidence: 0.7,
             defects: out.defects, sources: ["local knowledge base"] };
  }

  /* ======================================================== comparison */

  function answerComparison(frame, decision) {
    if (!frame.comparands || frame.comparands.length !== 2 || !KB) return null;
    var a = frame.comparands[0], b = frame.comparands[1];
    /* Coordinated noun phrases elide the shared head: "supervised and
       unsupervised learning" names two kinds of learning, not a thing called
       "supervised". Restore the head before resolving either operand. */
    if (!KB.resolve(a, { strict: true }).length) {
      var bWords = String(b).split(/\s+/);
      for (var t = 1; t < bWords.length && t <= 2; t++) {
        var tail = bWords.slice(bWords.length - t).join(" ");
        if (KB.resolve(a + " " + tail, { strict: true }).length) { a = a + " " + tail; break; }
      }
    }
    if (!KB.resolve(b, { strict: true }).length) {
      var aWords = String(a).split(/\s+/);
      for (var u = 1; u < aWords.length && u <= 2; u++) {
        var head = aWords.slice(aWords.length - u).join(" ");
        if (KB.resolve(b + " " + head, { strict: true }).length) { b = b + " " + head; break; }
      }
    }
    var ca = KB.contrast(a, b);
    var ra = KB.resolve(a), rb = KB.resolve(b);
    var nameA = ra.length ? displayName(ra[0].entity) : RZ.capitalize(a);
    var nameB = rb.length ? displayName(rb[0].entity) : RZ.capitalize(b);
    var dims = ca ? (ca.flipped ? ca.dims.map(function (d) { return [d[0], d[2], d[1]]; }) : ca.dims) : null;

    if (!dims && ra.length && rb.length) {
      /* Generic contrast: the attributes both entities carry, wherever they
         differ. This is what makes an unseen pair comparable at all. */
      dims = [];
      var ea = ra[0].entity, eb = rb[0].entity;
      var keys = Object.keys(ea.rel || {});
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (!eb.rel || !eb.rel[k]) continue;
        if (C.flatten(ea.rel[k]) === C.flatten(eb.rel[k])) continue;
        dims.push([RELATION_LABEL[k] || k, predicateFor(k, ea.rel[k]), predicateFor(k, eb.rel[k])]);
        if (dims.length >= 4) break;
      }
      if (!dims.length) {
        dims = [["what it is", "is " + stripLead(ea.defn, ea.name), "is " + stripLead(eb.defn, eb.name)]];
      }
    }
    if (!dims || !dims.length) return null;

    var limit = frame.requestedLength || (frame.requestedFormat === "bullets" ? 3 : 4);
    var plan = {
      kind: "comparison", a: nameA, b: nameB, dims: dims, limit: limit,
      format: frame.requestedFormat === "bullets" ? "bullets" : "prose",
      tone: frame.requestedTone
    };
    /* An example was asked for, and one of the two entries carries one. */
    if (/\bexample|for instance|illustrat/i.test(frame.lower)) {
      var exa = (ra.length && ra[0].entity.extra && ra[0].entity.extra.example) ||
                (rb.length && rb[0].entity.extra && rb[0].entity.extra.example) || "";
      if (exa) plan.caveat = exa;
    }
    var out = RZ.realize(plan);
    return {
      text: out.text, route: "comparison", entity: nameA + " / " + nameB,
      confidence: ca ? 0.9 : 0.7, defects: out.defects, sources: ["local knowledge base"],
      facets: dims.map(function (d) { return d[0]; }),
      comparison: { a: nameA, b: nameB, dims: dims }
    };
  }
  /* An attribute is a value; a contrast line needs a predicate. One mapping,
     shared with the relation realiser's vocabulary. */
  function predicateFor(rel, value) {
    switch (rel) {
      case "purpose": return "is used for " + value;
      case "part": return "is made up of " + value;
      case "type": return "is " + value;
      case "speed": return "runs at " + value;
      case "cause": return "is caused by " + value;
      case "location": return "is in " + value;
      case "creator": return "was created by " + value;
      case "author": return "was written by " + value;
      case "time": return "dates to " + String(value).replace(/^in\s+/i, "");
      case "count": return "has " + value;
      case "capital": return "has the capital " + value;
      case "currency": return "uses " + value;
      case "language": return "speaks " + value;
      case "population": return "has a population of " + value;
      default: return "is " + value;
    }
  }

  function stripLead(defn, name) {
    var s = String(defn).replace(new RegExp("^(?:the\\s+)?" + String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
      "\\s+(?:is|are|was|were)\\s+", "i"), "");
    return s.replace(/\.$/, "");
  }

  /* Content retrieval into the knowledge base: used when the question does
     not NAME its subject. Gated on the identity tiers, so a document that
     merely shares words still cannot answer. */
  function answerKBByContent(frame, decision) {
    if (!state.index || off("retrieval") || !KB) return null;
    /* Content retrieval needs content. A message of bare digits or symbols
       names nothing, and matching it against a corpus only ever produces a
       confident answer to a question nobody asked. */
    var alpha = frame.contentTokens.filter(function (t) { return /[a-z]{3,}/i.test(t); });
    if (!alpha.length) return null;
    var ranked = state.index.rank(frame, { limit: 4, pool: 30 });
    var pick = null;
    for (var i = 0; i < ranked.length; i++) {
      var r = ranked[i];
      if (r.doc.scope !== "kb") continue;
      if (r.score < 6) continue;
      /* Identity again, for definitional questions: an entry may only define
         the thing asked about. A "who/when/which" question is different --
         there the entry that MENTIONS the asked description is exactly what
         is wanted, as with "the first president of the United States". */
      if (isDefinitional(frame) && r.tier < RT.TIER.DEFINES) continue;
      var ent = r.doc.ref.entity;
      /* An explanation question may only be answered by an entry that
         actually explains something. Otherwise a shared word ("cold") lets
         an unrelated entry answer, which is the failure mode this gate
         exists for. */
      if (frame.requiresExplanation && !(ent && ((ent.extra && ent.extra.why) || (ent.rel && ent.rel.cause)))) continue;
      /* At least two of the question's content terms must be present, so a
         single shared word cannot select an entry. */
      var covered = 0;
      for (var c = 0; c < frame.contentStems.length; c++) if (r.doc.tf[frame.contentStems[c]]) covered++;
      if (frame.contentStems.length >= 2 && covered < 2) continue;
      pick = r;
      break;
    }
    if (!pick) return null;
    var entity = pick.doc.ref.entity;
    if (!entity) return null;
    var why = entity.extra && entity.extra.why;
    if (frame.requiresExplanation && why) {
      var ePlan = { kind: "explanation", direct: entity.defn, mechanism: why,
                    format: frame.requestedFormat, tone: frame.requestedTone,
                    lengthLimit: frame.requestedLength, lengthUnit: frame.requestedUnit };
      var eOut = RZ.realize(ePlan);
      return { text: eOut.text, route: "explanation", entity: entity.name,
               confidence: 0.7, defects: eOut.defects, sources: ["local knowledge base"] };
    }
    var dPlan = { kind: "definition", name: displayName(entity), definition: entity.defn,
                  elaboration: why ? "" : shortElaboration(entity, ""),
                  format: frame.requestedFormat, tone: frame.requestedTone,
                  lengthLimit: frame.requestedLength, lengthUnit: frame.requestedUnit };
    var dOut = RZ.realize(dPlan);
    return { text: dOut.text, route: "knowledge", entity: entity.name, confidence: 0.65,
             defects: dOut.defects, sources: ["local knowledge base"] };
  }

  /* A type qualifier is a disambiguation instruction: "the company Meta"
     says which Meta. Resolve the NAME and keep only the sense of the right
     type, rather than treating "company meta" as a compound to be read. */
  function answerQualified(frame, decision) {
    var qual = validQualifier(frame);
    if (!qual || !KB) return null;
    var hits = KB.resolve(qual.name);
    if (!hits.length) return null;
    var wanted = qual.type.replace(/s$/, "");
    var pick = null;
    for (var i = 0; i < hits.length; i++) {
      var e = hits[i].entity;
      var blob = (e.type + " " + (e.rel && e.rel.type || "") + " " + e.defn).toLowerCase();
      if (blob.indexOf(wanted) >= 0) { pick = e; break; }
    }
    if (!pick) return null;
    if (frame.relation) {
      var val = KB.attribute(pick, frame.relation);
      if (val) {
        var rPlan = { kind: "relation", subject: displayName(pick), relation: frame.relation,
                      relationLabel: RELATION_LABEL[frame.relation] || frame.relation, value: val,
                      format: frame.requestedFormat, onlyValue: frame.onlyValue };
        var rOut = RZ.realize(rPlan);
        return { text: rOut.text, route: "knowledge", entity: pick.name, relation: frame.relation,
                 confidence: 0.9, defects: rOut.defects, sources: ["local knowledge base"] };
      }
    }
    var plan = { kind: "definition", name: displayName(pick), definition: pick.defn,
                 elaboration: frame.requestedTone === "brief" ? "" : shortElaboration(pick, ""),
                 format: frame.requestedFormat, tone: frame.requestedTone,
                 lengthLimit: frame.requestedLength, lengthUnit: frame.requestedUnit };
    var out = RZ.realize(plan);
    return { text: out.text, route: "knowledge", entity: pick.name, confidence: 0.88,
             defects: out.defects, sources: ["local knowledge base"], disambiguatedBy: qual.type };
  }

  /* ------------------------------------------------- words and compounds
   * A definitional question whose subject is not a named thing is a question
   * about LANGUAGE. It is answered from word senses: one word gets its
   * senses, a compound gets read compositionally from its head and modifier.
   * This is what stops an unseen phrase being matched to the nearest article
   * with similar letters in it. */
  function answerLexical(frame, decision) {
    var CP = root.C4LMCompose;
    if (!CP || off("lexical")) return null;
    var asked = (frame.subject || frame.topic || frame.contentTokens.join(" ")).trim();
    if (!asked) return null;
    var words = C.words(asked).filter(function (w) { return !C.STOP[w]; });
    if (!words.length || words.length > 5) return null;

    /* If any span of the question names something the knowledge base holds,
       that is not a phrase to read compositionally -- it is a term with an
       entry, and the entry is the better answer. */
    if (KB) {
      for (var n = words.length; n >= 2; n--) {
        for (var i = 0; i + n <= words.length; i++) {
          var span = words.slice(i, i + n).join(" ");
          var hit = KB.resolve(span, { strict: true })[0];
          if (hit && hit.score >= 0.85) return null;
        }
      }
    }

    if (words.length >= 2) {
      var reading = CP.read(asked);
      if (reading) {
        var text = CP.explain(reading, frame.requestedTone === "brief" ? "brief" : "");
        var out = RZ.realize({ kind: "statement", statement: text,
                               lengthLimit: frame.requestedLength, lengthUnit: frame.requestedUnit });
        return {
          text: out.text || text, route: "compose", entity: reading.phrase,
          confidence: reading.confidence, defects: [], sources: reading.sources,
          composed: true, reading: {
            head: reading.headWord, modifier: reading.modifierWord,
            relation: reading.relation.rel
          }
        };
      }
    }
    var single = CP.defineWord(words[words.length - 1], { limit: frame.requestedLength === 1 ? 1 : 3 });
    if (single) {
      var sOut = RZ.realize({ kind: "statement", statement: single.text,
                              lengthLimit: frame.requestedLength, lengthUnit: frame.requestedUnit });
      return { text: sOut.text || single.text, route: "lexicon", entity: single.word,
               confidence: single.confidence, defects: [], sources: single.sources, defined: true };
    }
    return null;
  }

  /* When a word is not held locally, the dictionaries are asked for it and
     the answer is learned, so the same phrase is read locally next time. */
  function learnWords(frame) {
    var CP = root.C4LMCompose, LX = root.C4LMLexicon;
    if (!CP || !LX || !state.federation || off("web")) return Promise.resolve(false);
    var words = C.words(frame.subject || frame.topic || "")
      .filter(function (w) { return w.length > 2 && !C.STOP[w] && !LX.has(w); });
    if (!words.length) return Promise.resolve(false);
    var jobs = words.slice(0, 3).map(function (w) {
      var sub = C.parse("define " + w);
      sub.lexicalQuestion = true;
      sub.subject = w;
      return state.federation.gather(sub, { domain: "lexical" }).then(function (graph) {
        if (!graph || !graph.size()) return false;
        var senses = graph.props
          .filter(function (pr) { return pr.predicate === "wordSense" && pr.object; })
          .slice(0, 4)
          .map(function (pr) {
            var pos = (pr.qualifiers && pr.qualifiers.pos) || "n";
            return { pos: pos, gloss: String(pr.object).replace(/\s+/g, " ").trim(), cls: CP.classify(pr.object, pos) };
          });
        if (!senses.length) return false;
        LX.learn(w, senses);
        return true;
      }, function () { return false; });
    });
    return Promise.all(jobs).then(function (r) { return r.some(Boolean); });
  }

  /* ========================================================= local site */

  function answerLocal(frame, decision, opts) {
    if (!state.index || off("retrieval")) return null;
    opts = opts || {};
    var definitional = !opts.relaxed && (frame.queryForm === "whatis" || frame.queryForm === "topic");
    var ranked = state.index.rank(frame, { definitional: definitional, limit: 4 });
    ranked = ranked.filter(function (r) { return r.doc.scope !== "kb"; });
    if (!ranked.length) return null;
    var top = ranked[0];
    /* Identity is not overlap. A document may only answer for a concept it
       actually names -- whatever grammatical form the question took. */
    if (top.tier < RT.TIER.DEFINES && !opts.relaxed) return null;
    /* Relaxed still means the document must contain the phrase, not merely
       share words with it. */
    if (opts.relaxed && top.tier < RT.TIER.PHRASE) return null;
    if (top.score < (opts.relaxed ? 3 : 4)) return null;
    var sents = EV.sentences(demarkdown(top.doc.text));
    /* The answering sentence is the one that talks about the asked concept,
       not whichever sentence happens to come first in the document. */
    var askedTokens = frame.contentStems;
    sents = sents.filter(readableSentence);
    if (!sents.length) return null;
    var scored = sents.map(function (sn, i) {
      var flat = C.words(sn).map(C.stem);
      var cover = 0;
      for (var a = 0; a < askedTokens.length; a++) if (flat.indexOf(askedTokens[a]) >= 0) cover++;
      var defines = /\b(?:is|are|means|refers to|provides|does|runs|answers)\b/.test(sn) ? 1 : 0;
      return { text: sn, score: cover * 2 + defines - i * 0.05, cover: cover };
    }).sort(function (x, y) { return y.score - x.score; });
    if (!scored.length || scored[0].cover === 0) return null;
    var lead = scored[0].text;
    var second = scored.length > 1 && scored[1].cover > 0 ? scored[1].text : "";
    var plan = {
      kind: "statement", statement: lead, elaboration: second,
      format: frame.requestedFormat, tone: frame.requestedTone,
      lengthLimit: frame.requestedLength, lengthUnit: frame.requestedUnit
    };
    var out = RZ.realize(plan);
    return {
      text: out.text, route: "local", entity: top.doc.title, confidence: 0.6 + 0.06 * top.tier,
      defects: out.defects, sources: [top.doc.url || top.doc.source].filter(Boolean),
      used: ["this site"], tier: top.tier
    };
  }

  /* "What does CELL4 do?" names the site and nothing else, so there is no
     content term to retrieve on. The answer is what the site is about: its
     overview document's opening claim. General to any corpus -- no page or
     brand name is written into this function. */
  var BRAND = /^(?:cell4|robots|js|site|page|you|your|this|do|does|it)$/i;
  function answerSiteOverview(frame) {
    if (!state.index) return null;
    var specific = frame.contentTokens.filter(function (t) { return !BRAND.test(t); });
    if (specific.length) return null;
    var docs = state.index.docs.filter(function (d) { return d.scope === "site"; });
    if (!docs.length) return null;
    docs.sort(function (a, b) {
      var ar = /readme/i.test(a.title) ? 1 : 0, br = /readme/i.test(b.title) ? 1 : 0;
      return (br - ar) || (b.text.length - a.text.length);
    });
    /* What is this corpus ABOUT? The most frequent proper noun across it is
       its subject; the answer is the best definitional sentence about that
       subject. No page title, product name or path is written into this
       function -- it reads whatever corpus it is given. */
    var freq = Object.create(null);
    for (var d0 = 0; d0 < docs.length; d0++) {
      var caps = String(docs[d0].text).match(/\b[A-Z][A-Za-z0-9]{2,}\b/g) || [];
      for (var c0 = 0; c0 < caps.length; c0++) {
        var w0 = caps[c0];
        if (C.STOP[w0.toLowerCase()]) continue;
        freq[w0] = (freq[w0] || 0) + 1;
      }
    }
    var subjectName = "", topFreq = 0;
    for (var fk in freq) if (freq[fk] > topFreq) { topFreq = freq[fk]; subjectName = fk; }

    var best = null;
    for (var d = 0; d < docs.length && d < 40; d++) {
      var ss = EV.sentences(demarkdown(docs[d].text)).slice(0, 8);
      for (var i = 0; i < ss.length; i++) {
        if (!readableSentence(ss[i])) continue;
        var sc = 1 - i * 0.2 + (/readme/i.test(docs[d].title) ? 0.6 : 0);
        /* A sentence that names the corpus subject and then says what it is. */
        if (subjectName && new RegExp("^(?:the\\s+)?" + subjectName + "\\b[^.]{0,40}\\b(?:is|are)\\b", "i").test(ss[i])) sc += 4;
        else if (subjectName && ss[i].indexOf(subjectName) >= 0) sc += 1.2;
        if (/\b(?:engine|system|solver|browser|runs|answers|project)\b/i.test(ss[i])) sc += 0.8;
        if (!best || sc > best.sc) best = { sc: sc, text: ss[i], doc: docs[d], next: ss[i + 1] || "" };
      }
    }
    if (!best) return null;
    var out = RZ.realize({ kind: "statement", statement: best.text,
                           elaboration: readableSentence(best.next) ? best.next : "",
                           lengthLimit: frame.requestedLength, lengthUnit: frame.requestedUnit });
    return { text: out.text, route: "local", entity: best.doc.title, confidence: 0.6,
             defects: out.defects, sources: [best.doc.url || best.doc.source].filter(Boolean),
             used: ["this site"] };
  }

  /* Documents are written in Markdown; the answer is prose. */
  function demarkdown(text) {
    return String(text || "")
      .replace(/```[\s\S]*?```/g, " ")
      /* Tables survive line-collapsing as pipe runs, so they are removed by
         shape rather than by line position. */
      .replace(/\|[^|\n]{0,80}\|(?:[^|\n]{0,80}\|)*/g, " ")
      .replace(/-{3,}:?|:-{3,}/g, " ")
      .replace(/#{1,6}\s*/g, "")
      .replace(/(^|\s)>\s*/g, "$1")
      .replace(/(^|\s)[-*+]\s+/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/\s+/g, " ");
  }

  /* Prose, not layout residue. A "sentence" that is mostly punctuation or
     digits came out of a table or a command line, not out of an explanation. */
  function readableSentence(sn) {
    var t = String(sn || "").trim();
    if (t.length < 30 || t.length > 400) return false;
    var letters = (t.match(/[A-Za-z]/g) || []).length;
    if (letters / t.length < 0.72) return false;
    if (/[|`{}<>]/.test(t)) return false;
    if (!/\b(?:is|are|was|were|does|do|has|have|can|will|means|runs|solves|provides|uses|answers)\b/.test(t)) return false;
    return true;
  }

  /* ============================================================== web */

  function answerWeb(frame, decision) {
    if (off("web") || !state.federation) return Promise.resolve(null);
    state.stats.web++;
    return state.federation.gather(frame).then(function (graph) {
      if (!graph || !graph.size()) return null;
      var subject = frame.subject || frame.topic || "";
      var claim = frame.relation ? graph.best(subject, frame.relation) : null;
      if (!claim) {
        claim = graph.props.slice().sort(function (x, y) {
          return ((y.support || 1) * y.confidence) - ((x.support || 1) * x.confidence);
        })[0];
      }
      if (!claim) return null;
      /* Identity gate on retrieved evidence. An article may only answer for
         the thing that was asked about; sharing letters with the question is
         not the same as being about it. Without this, an unseen phrase picks
         up whatever article the search engine liked best. */
      if (!frame.relation && subject && !identityMatches(subject, claim)) return null;
      var conflicts = graph.conflicts(claim.subject, claim.predicate);
      var plan;
      if (claim.predicate === "version" || claim.predicate === "price" || claim.predicate === "rate") {
        plan = { kind: "relation", subject: claim.subject, relation: claim.predicate,
                 relationLabel: RELATION_LABEL[claim.predicate] || claim.predicate, value: claim.object,
                 format: frame.requestedFormat, onlyValue: frame.onlyValue,
                 caveat: claim.time ? "" : "" };
      } else {
        plan = { kind: "definition", name: claim.exactTitle || claim.subject,
                 definition: claim.object || claim.text,
                 elaboration: "", format: frame.requestedFormat,
                 lengthLimit: frame.requestedLength, lengthUnit: frame.requestedUnit };
      }
      if (conflicts && conflicts.length > 1) {
        plan.caveat = "Sources disagree on this, so treat it as provisional";
      }
      var out = RZ.realize(plan);
      return {
        text: out.text, route: "web", entity: claim.subject, relation: claim.predicate,
        confidence: Math.min(0.9, claim.confidence + ((claim.support || 1) - 1) * 0.1),
        defects: out.defects, sources: graph.sources.slice(),
        used: graph.sources.slice(), evidence: graph.size(),
        elapsed: graph.elapsed, reason: graph.reason
      };
    }, function () { return null; });
  }

  /* Does this evidence identify the thing that was asked about? The test is
     over the claim's own subject/title, not over the body text. */
  function identityMatches(asked, claim) {
    var a = C.flatten(asked).replace(/^(?:the|a|an) /, "");
    var titles = [claim.exactTitle, claim.subject].filter(Boolean)
      .map(function (t) { return C.flatten(t).replace(/\s*\([^)]*\)\s*$/, "").trim(); });
    if (!a) return true;
    for (var i = 0; i < titles.length; i++) {
      var t = titles[i];
      if (!t) continue;
      if (t === a) return true;
      /* A qualified title is the same concept: "Mercury (planet)" answers
         "Mercury". A title that merely contains the words is not. */
      var at = a.split(" "), tt = t.split(" ");
      if (tt.length >= at.length) {
        var head = true;
        for (var k = 0; k < at.length; k++) if (tt[k] !== at[k]) { head = false; break; }
        var repeats = false;
        for (var r = at.length; r < tt.length; r++) if (at.indexOf(tt[r]) >= 0) repeats = true;
        if (head && !repeats && tt.length - at.length <= 2) return true;
      }
      if (at.length >= tt.length && at.join(" ").indexOf(tt.join(" ")) === 0 && at.length - tt.length <= 1) return true;
    }
    return false;
  }

  /* ==================================================== conversation */

  var SOCIAL = {
    greeting: ["Hi — what would you like to know?", "Hello. What can I look into for you?",
               "Hey. Ask me something."],
    thanks: ["Any time.", "Glad it helped.", "You're welcome."],
    acknowledgement: ["Noted.", "Understood.", "Right."],
    meta: ["I'm CELL4's local language system. I run in your browser: I answer from a local knowledge base and reasoning engine, and I only go to public data sources when a question needs current information."],
    statement: ["Understood — say more and I'll dig in.", "Got it. What would you like me to work out?"]
  };

  function answerConversation(frame, disc) {
    var bucket = SOCIAL[frame.speechAct] || (frame.metaSelf ? SOCIAL.meta : SOCIAL.statement);
    if (frame.metaSelf) bucket = SOCIAL.meta;
    var pick = bucket[(disc ? disc.turns : 0) % bucket.length];
    return { text: pick, route: "conversation", confidence: 0.75, conversational: true, sources: [] };
  }

  /* ========================================================== reasoning */

  function answerReason(frame, decision) {
    if (off("reasoning") || !RS) return null;
    var r = RS.solve(frame);
    if (!r) return null;
    if (r.route === "compute") {
      var lead = "";
      if (r.kind === "arithmetic" && r.expression) lead = r.expression + " = ";
      var plan = {
        kind: "calculation", value: r.text, unit: r.unit || "",
        lead: r.kind === "arithmetic" ? lead : leadFor(r.kind, frame),
        onlyValue: frame.onlyValue, steps: r.steps,
        showWorking: !frame.onlyValue && (frame.requiresExplanation || frame.requestedTone === "steps"),
        format: frame.onlyValue ? "value" : "prose"
      };
      if (frame.onlyValue) return { text: String(r.text), route: "compute", confidence: 0.99, sources: [], defects: [] };
      var out = RZ.realize(plan);
      return { text: out.text, route: "compute", confidence: 0.99, defects: out.defects,
               sources: [], computed: r.value };
    }
    if (r.kind === "clock") {
      return { text: r.text, route: "compute", confidence: 0.95, sources: [], defects: [] };
    }
    var body = r.text;
    if (r.why && !frame.onlyValue && r.text.length < 80) body = RZ.terminate(r.text) + " " + RZ.terminate(RZ.capitalize(r.why));
    var pol = RZ.polish(body);
    return { text: pol, route: "reason", confidence: 0.92, defects: RZ.inspect(pol),
             sources: [], derivation: (r.nodes || []).length };
  }
  function leadFor(kind, frame) {
    switch (kind) {
      case "discount": return "The new price is ";
      case "rate": return "It travels ";
      case "convert": return "That is ";
      case "average": return "The average is ";
      case "probability": return "The probability is ";
      case "percent": return "That is ";
      default: return "";
    }
  }

  /* ============================================================== code */

  function answerCode(frame) {
    if (off("code") || !CD || !CD.isRequest(frame)) return null;
    var built = CD.build(frame);
    if (!built || !built.ok) return null;
    var lang = built.language === "sql" ? "SQL" : RZ.capitalize(built.language);
    var text = "```" + built.language + "\n" + built.code + "\n```\n" +
      (built.explain ? built.explain : "");
    return {
      text: text, route: "code", confidence: 0.9, sources: [],
      code: built.code, language: built.language, verified: built.verified,
      defects: [], entity: built.spec.op
    };
  }

  /* Everything that can answer without the network, in the order that keeps
     each kind of question with the resolver that understands it. One chain,
     used both as the fast path and as the fallback after a web attempt, so
     the two can never drift apart. */
  function localResolvers(frame, decision) {
    return answerQualified(frame, decision) ||
           answerListRequest(frame, decision) ||
           answerSuperlative(frame) ||
           answerFromKB(frame, decision) ||
           /* A definitional question about ordinary language is answered from
              word senses before any document is consulted: "what is learning"
              is about the word, and "machine learning" is a different term
              that merely contains it. */
           (isDefinitional(frame) ? answerLexical(frame, decision) : null) ||
           answerKBByContent(frame, decision) ||
           (isDefinitional(frame) ? null : answerLexical(frame, decision)) ||
           answerLocal(frame, decision);
  }

  function hasUnknownWord(frame) {
    var LX = root.C4LMLexicon;
    if (!LX || !KB) return false;
    var words = frame.contentTokens.filter(function (w) { return w.length > 2; });
    /* A compound is short. A long question is not a phrase to be read from
       its parts, so an unfamiliar word in it is not a reason to stop and
       look the word up. */
    if (!words.length || words.length > 3) return false;
    for (var i = 0; i < words.length; i++) {
      if (LX.has(words[i])) continue;
      if (KB.resolve(words[i], { strict: true }).length) continue;
      return true;
    }
    return false;
  }

  function isDefinitional(frame) {
    if (frame.queryForm === "whatis" || frame.queryForm === "topic") return true;
    if (/\b(?:mean|means|meaning|define|definition)\b/i.test(frame.lower)) return true;
    if (frame.queryForm === "whois" && !frame.wantsPerson) return true;
    /* A bare noun phrase typed into a box is a request for what it is.
       "learning", "growth engine" -- no verb, no question mark, nothing else
       to read it as. */
    if (frame.queryForm === "statement" && !frame.hasQuestionMark &&
        frame.contentTokens.length >= 1 && frame.contentTokens.length <= 3 &&
        !frame.requiresComputation && !frame.requiresCode && !frame.requiresComparison) {
      return true;
    }
    return false;
  }

  /* ========================================================== fallback */

  function fallback(frame, decision) {
    if (decision && decision.features && decision.features.remark) {
      return answerConversation(frame, discourse);
    }
    var subject = frame.subject || frame.entities[0] || frame.topic || "";
    /* Echoing a long question back is not informative; name the thing. */
    if (subject.split(/\s+/).length > 6) {
      subject = frame.entities[0] || frame.contentTokens.slice(0, 3).join(" ");
    }
    if (subject) {
      return {
        text: "I don't have anything reliable on " + subject + ". " +
          (state.federation && !off("web") ?
            "I couldn't confirm it from the public sources I can reach either." :
            "That one is outside what I hold locally.") +
          " If you can point me at a more specific term or a source, I'll work from that.",
        route: "insufficient", confidence: 0.2, insufficient: true, sources: []
      };
    }
    return {
      text: "I'm not sure what to look into there. Give me a topic, a question, or a calculation and I'll take it from the top.",
      route: "insufficient", confidence: 0.2, insufficient: true, sources: []
    };
  }

  /* ============================================================ driver */

  var discourse = new Discourse();

  function timed(label, fn) {
    var t0 = now();
    var v = fn();
    state.profile.push({ label: label, ms: now() - t0 });
    return v;
  }
  function now() {
    if (typeof performance !== "undefined" && performance.now) return performance.now();
    return Date.now();
  }

  function answer(text, opts) {
    opts = opts || {};
    var t0 = now();
    state.profile = [];
    state.stats.turns++;

    var baseFrame = timed("parse", function () { return C.parse(text, discourse.snapshot()); });
    if (baseFrame.empty) {
      var empty = { text: "Ask me anything — a fact, a calculation, an explanation, or something to build.",
                    route: "conversation", confidence: 0.6, conversational: true, sources: [] };
      return Promise.resolve(finish(baseFrame, empty, t0));
    }
    if (baseFrame.safetyClass === "sensitive") {
      return Promise.resolve(finish(baseFrame, {
        text: "I'd rather not go into that one. If you're going through something difficult, talking to someone you trust or a local support line is worth more than anything I can say here.",
        route: "conversation", confidence: 0.9, sources: []
      }, t0));
    }

    var ctx = timed("dialogue", function () { return resolveContext(baseFrame, discourse); });
    var frame = ctx.frame;
    var decision = timed("route", function () { return decide(frame, discourse); });
    decision.carried = ctx.carried;

    /* ---- Level 0: deterministic, no retrieval, no network ---- */
    /* Deterministic resolvers run before the social branch: "what time is it
       right now" is a clock question with a chatty shape, and a computation
       is never small talk. */
    var reasoned = timed("reason", function () { return answerReason(frame, decision); });
    if (reasoned) return Promise.resolve(finish(frame, reasoned, t0, decision));
    if (!off("depth")) {
      /* With adaptive depth off, every resolver is attempted in a fixed order
         whatever the router said -- the shape the pipeline had before the
         decision head chose a branch. */
    }
    if (!off("depth") && decision.route === "conversation" &&
        (decision.features.social || decision.features.remark)) {
      return Promise.resolve(finish(frame, answerConversation(frame, discourse), t0, decision));
    }
    var comparative = timed("comparative", function () { return answerComparativeFollowup(frame, discourse); });
    if (comparative) return Promise.resolve(finish(frame, comparative, t0, decision));

    /* ---- Level 1: local knowledge ---- */
    var coded = timed("code", function () { return answerCode(frame); });
    if (coded) return Promise.resolve(finish(frame, coded, t0, decision));

    if (decision.features.compare || off("depth")) {
      var cmp = timed("compare", function () { return answerComparison(frame, decision); });
      if (cmp) return Promise.resolve(finish(frame, cmp, t0, decision));
    }
    if (off("depth")) {
      /* No routing shortcut: the site index, the knowledge base and content
         retrieval are all consulted before anything is returned. */
      var forced = timed("forced", function () {
        return answerLocal(frame, decision, { relaxed: true }) ||
               answerListRequest(frame, decision) || answerSuperlative(frame) ||
               answerFromKB(frame, decision) || answerKBByContent(frame, decision);
      });
      if (forced) return Promise.resolve(finish(frame, forced, t0, decision));
    }

    /* A question about CELL4 itself is answered from the site, not from
       general knowledge; everything else prefers knowledge over documents. */
    if (decision.features.aboutSite && !off("depth")) {
      var site = timed("local", function () {
        return answerSiteOverview(frame) || answerLocal(frame, decision, { relaxed: true });
      });
      if (site) return Promise.resolve(finish(frame, site, t0, decision));
      /* A question about CELL4 that this site cannot answer is not a question
         about something else that shares a word. General knowledge must not
         speak over it. */
      return Promise.resolve(finish(frame, fallback(frame, decision), t0, decision));
    }

    /* A definitional question containing a word nothing local knows is a
       question for the dictionaries. Answering it from the words that happen
       to be known produces a confident answer to a different question, so
       the local shortcut is skipped until the unknown word has been looked
       up. */
    var unknownWord = isDefinitional(frame) && hasUnknownWord(frame) &&
                      state.federation && !off("web");

    if (!frame.requiresFreshInformation && !unknownWord) {
      var localAnswer = timed("local-chain", function () { return localResolvers(frame, decision); });
      if (localAnswer) return Promise.resolve(finish(frame, localAnswer, t0, decision));
    }

    /* ---- Level 2/3: evidence from the network, only when warranted ---- */
    /* A definitional question containing a word nothing local knows is a
       question the dictionaries can answer. Learning the word is cheaper and
       more accurate than guessing from the words that ARE known. */
    var needWeb = unknownWord || frame.requiresFreshInformation ||
                  (!off("web") && decision.dist.web > 0.15) ||
                  (!decision.features.kbHit && frame.speechAct === "question");
    if (needWeb && state.federation && !off("web")) {
      /* A definitional question asks both kinds of source: the dictionaries
         for the words, the encyclopedias for the thing. Whichever produces an
         answer that actually identifies what was asked wins. */
      var wordsFirst = isDefinitional(frame) && (unknownWord || !decision.features.kbHit) ?
        learnWords(frame) : Promise.resolve(false);
      return wordsFirst.then(function (learned) {
        if (learned) {
          var fromWords = answerQualified(frame, decision) || answerLexical(frame, decision);
          if (fromWords) return finish(frame, fromWords, t0, decision);
        }
        return answerWeb(frame, decision);
      }).then(function (web) {
        if (!web || web.text === undefined) {
          /* answerWeb already resolved above when it returned an answer. */
        }
        if (web && web.text) return finish(frame, web, t0, decision);
        var late = localResolvers(frame, decision);
        if (late) {
          if (frame.requiresFreshInformation) late.caveat = true;
          return finish(frame, late, t0, decision);
        }
        return finish(frame, fallback(frame, decision), t0, decision);
      });
    }
    var last = localResolvers(frame, decision);
    return Promise.resolve(finish(frame, last || fallback(frame, decision), t0, decision));
  }

  /* Confidence is assembled from the parts that produced the answer, and a
     low-confidence answer is softened rather than asserted. */
  function finish(frame, result, t0, decision) {
    result = result || { text: "", route: "none", confidence: 0 };
    result.latency_ms = Math.round((now() - t0) * 100) / 100;
    result.frame = {
      subject: frame.subject, relation: frame.relation, form: frame.queryForm,
      fresh: frame.requiresFreshInformation, act: frame.speechAct
    };
    if (decision) {
      result.decision = { route: decision.route, depth: decision.depth,
                          confidence: Math.round(decision.confidence * 100) / 100,
                          margin: Math.round(decision.margin * 100) / 100 };
      result.confidenceFactors = {
        interpretation: Math.round(frame.confidence * 100) / 100,
        routing: Math.round(decision.confidence * 100) / 100,
        answer: result.confidence || 0
      };
    }
    result.profile = state.profile.slice();
    /* Hallucination brake: an uncertain answer says so instead of asserting. */
    if (result.confidence && result.confidence < 0.45 && result.text && !result.insufficient &&
        !result.conversational && !/^(?:i (?:don't|do not)|i'm not sure)/i.test(result.text)) {
      result.text = "I think " + result.text.charAt(0).toLowerCase() + result.text.slice(1) +
        " — though I'd check that one.";
    }
    if (result.caveat === true) {
      result.text += " I could not reach a live source just now, so that is from local knowledge and may be out of date.";
      result.caveat = "stale";
    }
    discourse.commit(frame, result);
    return result;
  }

  /* ============================================================== setup */

  function init(opts) {
    opts = opts || {};
    if (KB) KB.build();
    if (C && KB) {
      C.setEntityOracle(function (phrase) {
        var hits = KB.resolve(phrase, { strict: true });
        return hits.length > 0 && hits[0].score >= 0.6;
      });
    }
    if (RT && !state.index) {
      state.index = new RT.Index();
      if (opts.documents && opts.documents.length) state.index.add(opts.documents);
      /* Knowledge-base entries are documents too. A question that describes a
         phenomenon without naming it ("why does metal feel colder than wood")
         finds the entry that explains it through ordinary retrieval, rather
         than needing a phrase-to-entity rule written for it. */
      if (KB) {
        state.index.add(KB.entities().map(function (e) {
          return {
            title: e.name, scope: "kb", source: "local knowledge base", authority: 0.8,
            text: [e.defn, e.aliases.join(" "), e.extra && e.extra.why,
                   e.rel && e.rel.cause, e.rel && e.rel.purpose,
                   e.rel && e.rel.part].filter(Boolean).join(" "),
            entity: e
          };
        }));
      }
      state.index.build();
    }
    if (EV && opts.fetch !== false) {
      state.federation = new EV.Federation({
        fetch: opts.fetch, deadline: opts.deadline || 4000,
        perSourceTimeout: opts.perSourceTimeout || 2500, quorum: opts.quorum || 2,
        earlyCompletion: opts.earlyCompletion !== false
      });
    }
    state.ready = true;
    return state;
  }

  root.C4LM = {
    init: init,
    answer: answer,
    parse: function (t) { return C.parse(t, discourse.snapshot()); },
    decide: function (t) { var f = C.parse(t, discourse.snapshot()); return decide(f, discourse); },
    discourse: function () { return discourse; },
    reset: function () { discourse = new Discourse(); if (C) C._clearCache(); },
    /* Documents can arrive after boot (the page reads its own pages
       asynchronously), so the index accepts late additions. */
    addDocuments: function (docs) {
      if (!RT || !docs || !docs.length) return 0;
      if (!state.index) state.index = new RT.Index();
      state.index.add(docs);
      state.index.build();
      return state.index.size();
    },
    ablate: function (list) {
      state.ablations = Object.create(null);
      (list || []).forEach(function (k) { state.ablations[k] = 1; });
      /* "early" is enforced inside the federation, not by a branch here. */
      if (state.federation) state.federation.earlyCompletion = !state.ablations.early;
      if (C && C.setNormalization) C.setNormalization(!state.ablations.normalize);
      return state.ablations;
    },
    stats: function () { return state.stats; },
    profile: function () { return state.profile.slice(); },
    ready: function () { return state.ready; },
    state: state
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.C4LM;
})(typeof window !== "undefined" ? window : globalThis);
