/* CELL4 retrieval 2.0.
 *
 * Two stages. A cheap BM25F sweep produces a shortlist; only the shortlist
 * pays for the expensive features (ordered phrase locks, identity tier,
 * relation compatibility, topical concentration, heading intent). Scoring the
 * whole corpus with the expensive features is what made the old path slow and
 * -- because every signal was lexical -- what let a document about machines
 * and reasoning answer "what is machine reasoning".
 *
 * The distinction this module is built around: IDENTITY is not OVERLAP.
 * A document that mentions a phrase is not a document about it.
 */
(function (root) {
  "use strict";

  var C = root.C4LMCore;

  function Index(opts) {
    this.docs = [];
    this.df = Object.create(null);
    this.avgLen = 1;
    this.postings = Object.create(null);
    this.opts = opts || {};
    this.dirty = true;
  }

  /* A document is {id, title, text, source, scope, url}. Fields are weighted:
     a term in the title says more about what the document is ABOUT than the
     same term buried in the body. */
  Index.prototype.add = function (docs) {
    for (var i = 0; i < docs.length; i++) {
      var d = docs[i];
      if (!d) continue;
      this.docs.push({
        id: this.docs.length,
        title: String(d.title || d.h || ""),
        text: String(d.text || d.t || ""),
        source: d.source || d.s || "",
        scope: d.scope || "",
        url: d.url || d.s || "",
        kind: d.kind || "",
        authority: d.authority == null ? 0.5 : d.authority,
        ref: d
      });
    }
    this.dirty = true;
    return this.docs.length;
  };

  Index.prototype.build = function () {
    if (!this.dirty) return;
    this.dirty = false;
    this.df = Object.create(null);
    this.postings = Object.create(null);
    var total = 0;
    for (var i = 0; i < this.docs.length; i++) {
      var d = this.docs[i];
      var tTok = C.indexTokens(d.title).map(C.stem);
      var bTok = C.indexTokens(d.text).map(C.stem);
      d.titleTokens = tTok;
      d.bodyTokens = bTok;
      d.len = tTok.length + bTok.length;
      d.flatTitle = C.flatten(d.title);
      d.flatText = C.flatten(d.text);
      total += d.len;
      var tf = Object.create(null), j;
      for (j = 0; j < tTok.length; j++) tf[tTok[j]] = (tf[tTok[j]] || 0) + 3;   /* title weight */
      for (j = 0; j < bTok.length; j++) tf[bTok[j]] = (tf[bTok[j]] || 0) + 1;
      d.tf = tf;
      for (var t in tf) {
        this.df[t] = (this.df[t] || 0) + 1;
        (this.postings[t] || (this.postings[t] = [])).push(i);
      }
    }
    this.avgLen = total / Math.max(1, this.docs.length);
    if (C) C.learnVocabulary(this.docs.map(function (d) { return d.title + " " + d.text; }));
  };

  /* Stage 1: BM25F over the posting lists only. Documents that share no
     content term with the query are never visited. */
  Index.prototype.candidates = function (frame, limit) {
    this.build();
    var k1 = 1.4, b = 0.72;
    var N = this.docs.length;
    var terms = frame.contentStems.length ? frame.contentStems : frame.stems;
    terms = terms.concat(C.indexTokens(frame.contentTokens.join(" ")).map(C.stem))
      .filter(function (t, i, a) { return a.indexOf(t) === i; });
    var scores = Object.create(null);
    for (var i = 0; i < terms.length; i++) {
      var t = terms[i];
      var post = this.postings[t];
      if (!post) continue;
      var idf = Math.log(1 + (N - this.df[t] + 0.5) / (this.df[t] + 0.5));
      for (var j = 0; j < post.length; j++) {
        var d = this.docs[post[j]];
        var f = d.tf[t] || 0;
        var s = idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / this.avgLen));
        scores[post[j]] = (scores[post[j]] || 0) + s;
      }
    }
    var out = [];
    for (var id in scores) out.push({ doc: this.docs[id], bm25: scores[id] });
    out.sort(function (x, y) { return y.bm25 - x.bm25; });
    return out.slice(0, limit || 24);
  };

  /* ------------------------------------------------------ identity tiers */

  var TIER = { TITLE_EQUAL: 5, TITLE_HEAD: 4, DEFINES: 3, PHRASE: 2, OVERLAP: 1, NONE: 0 };

  /* Does this document DEFINE the asked concept, or merely contain its words?
     A definition puts the concept at the head of a sentence, a heading or a
     list item, followed by a copula. Position, not containment. */
  function definesConcept(doc, conceptFlat) {
    if (!conceptFlat) return true;               /* nothing specific was asked */
    if (doc.flatTitle === conceptFlat) return true;
    var esc = conceptFlat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "[^a-z0-9]+");
    var re = new RegExp("(?:^|[.!?:;]\\s+|\\n\\s*[-*\\u2022]?\\s*)(?:the\\s+|a\\s+|an\\s+)?" + esc +
                        "\\b[^.!?]{0,40}?\\b(?:is|are|was|were|means|refers to|describes|denotes)\\b", "i");
    return re.test(doc.title + ". " + doc.text);
  }

  function identityTier(frame, doc) {
    var asked = frame.subject ? C.flatten(frame.subject) :
                (frame.topic ? C.flatten(frame.topic) : C.flatten(frame.contentTokens.join(" ")));
    if (!asked) return TIER.NONE;
    var title = doc.flatTitle;
    if (title === asked) return TIER.TITLE_EQUAL;
    var at = asked.split(" "), tt = title.split(" ");
    /* Head containment: the asked phrase leads the title in order. A title
       that merely contains the words in some other arrangement ("High School
       High" for "high school") is not the same concept. */
    if (tt.length >= at.length) {
      var head = true;
      for (var i = 0; i < at.length; i++) if (tt[i] !== at[i]) { head = false; break; }
      /* A title that REPEATS one of the asked words in its remainder is a
         different construction, not a narrower sense of the same one:
         "High School High" is a film title, not a kind of high school. */
      var repeats = false;
      for (var k = at.length; k < tt.length; k++) if (at.indexOf(tt[k]) >= 0) repeats = true;
      if (head && !repeats && tt.length - at.length <= 2) return TIER.TITLE_HEAD;
      if (head && repeats) return TIER.OVERLAP;
    }
    if (definesConcept(doc, asked)) return TIER.DEFINES;
    if ((" " + doc.flatText + " ").indexOf(" " + asked + " ") >= 0) return TIER.PHRASE;
    return TIER.OVERLAP;
  }

  /* Ordered phrase lock: the query's content words appear in the document in
     the same order, within a small window. Distinguishes "machine reasoning"
     from "reasoning about machines". */
  function orderedPhrase(words_, text, gap) {
    if (words_.length < 2) return 0;
    var pos = 0, hits = 0, maxGap = gap || 4;
    var toks = text.split(" ");
    var idx = toks.indexOf(words_[0], 0);
    while (idx >= 0) {
      var cur = idx, ok = true;
      for (var i = 1; i < words_.length; i++) {
        var nxt = toks.indexOf(words_[i], cur + 1);
        if (nxt < 0 || nxt - cur > maxGap) { ok = false; break; }
        cur = nxt;
      }
      if (ok) { hits++; break; }
      idx = toks.indexOf(words_[0], idx + 1);
      if (++pos > 40) break;
    }
    return hits ? 1 : 0;
  }

  function charTrigramSim(a, b) {
    function tri(s) {
      s = " " + String(s) + " ";
      var out = Object.create(null), n = 0;
      for (var i = 0; i + 3 <= s.length; i++) { var g = s.substr(i, 3); if (!out[g]) { out[g] = 1; n++; } }
      return { set: out, n: n };
    }
    var A = tri(a), B = tri(b), shared = 0;
    for (var g in A.set) if (B.set[g]) shared++;
    return (2 * shared) / Math.max(1, A.n + B.n);
  }

  /* Query-term concentration: how much of the document is about the query.
     A long document that mentions the phrase once is less "about" it than a
     short one that mentions it repeatedly. */
  function concentration(frame, doc) {
    var hits = 0;
    for (var i = 0; i < frame.contentStems.length; i++) hits += (doc.tf[frame.contentStems[i]] || 0);
    return hits / Math.sqrt(Math.max(20, doc.len));
  }

  /* Stage 2: rerank the shortlist only. */
  Index.prototype.rank = function (frame, opts) {
    opts = opts || {};
    var shortlist = this.candidates(frame, opts.pool || 24);
    var askedFlat = frame.subject ? C.flatten(frame.subject) : C.flatten(frame.topic || "");
    var askedWords = askedFlat ? askedFlat.split(" ").map(C.stem) : [];
    var relation = frame.relation;
    var out = [];
    for (var i = 0; i < shortlist.length; i++) {
      var doc = shortlist[i].doc;
      var tier = identityTier(frame, doc);
      var phrase = askedWords.length > 1 ?
        orderedPhrase(askedWords, (doc.flatTitle + " " + doc.flatText).split(" ").map(C.stem).join(" ")) : 0;
      var conc = concentration(frame, doc);
      var titleSim = askedFlat ? charTrigramSim(askedFlat, doc.flatTitle) : 0;

      /* Relation compatibility: when the question asks for a relation, a
         document that states that relation outranks one that merely shares
         the subject's name. */
      var relBonus = 0;
      if (relation) {
        var relRe = new RegExp("\\b" + relation + "|\\b" + (C.relations.filter(function (r) { return r.id === relation; })[0] || { heads: [] })
          .heads.map(function (h) { return h.replace(/ /g, "[^a-z]+"); }).join("|\\b"), "i");
        if (relRe.test(doc.title + " " + doc.text)) relBonus = 0.6;
      }

      /* An intent mismatch in the heading is a penalty, not a filter: a
         "Troubleshooting" page is rarely the answer to "what is X". */
      var headPenalty = 0;
      if (frame.queryForm === "whatis" && /\b(?:troubleshoot|changelog|release notes|faq|errata|index of|list of)\b/i.test(doc.title)) headPenalty = 0.8;

      var score =
        0.55 * shortlist[i].bm25 +
        1.60 * tier +
        1.10 * phrase +
        0.80 * conc +
        1.20 * titleSim +
        relBonus +
        0.40 * (doc.authority || 0) -
        headPenalty;

      out.push({
        doc: doc, score: score, tier: tier, bm25: shortlist[i].bm25,
        phrase: phrase, concentration: conc, titleSim: titleSim, relation: relBonus > 0
      });
    }
    out.sort(function (a, b) { return b.score - a.score; });

    /* Identity gate. A definitional question may only be answered by a
       document that reaches the DEFINES tier; overlap alone is refused. This
       is the general form of the fix that used to be one regex per failure. */
    if (opts.definitional) {
      out = out.filter(function (r) { return r.tier >= TIER.DEFINES; });
    }
    return out.slice(0, opts.limit || 6);
  };

  Index.prototype.size = function () { return this.docs.length; };

  root.C4LMRetrieve = {
    Index: Index,
    TIER: TIER,
    definesConcept: definesConcept,
    orderedPhrase: orderedPhrase,
    charTrigramSim: charTrigramSim
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.C4LMRetrieve;
})(typeof window !== "undefined" ? window : globalThis);
