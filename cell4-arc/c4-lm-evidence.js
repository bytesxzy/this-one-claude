/* CELL4 evidence layer: query decomposition, fast federation, evidence graph.
 *
 * The old web path started every source it could and waited for a 10-second
 * deadline before answering, so one slow endpoint held a verified answer
 * hostage. This one races the sources that suit the question, scores evidence
 * as it arrives, and STOPS as soon as a quorum of independent sources agrees
 * -- cancelling whatever is still outstanding. A slow source can only ever
 * add information; it can never delay an answer that is already supported.
 *
 * Retrieved text becomes PROPOSITIONS, not sentences to glue together. The
 * answer is built from claims that survived merging and contradiction checks.
 *
 * Keyless public sources only. No model service of any kind.
 */
(function (root) {
  "use strict";

  var C = root.C4LMCore;

  /* ------------------------------------------------------- decomposition */

  /* A research question is turned into the few queries that would actually
     find its answer, derived from the frame's structure. "What causes
     auroras and why are they more common near the poles?" decomposes by its
     own conjunction and relation words, not by a stored example. */
  function decompose(frame) {
    var qs = [], seen = Object.create(null);
    function push(q, kind, weight) {
      q = String(q || "").replace(/\s+/g, " ").trim();
      if (q.length < 2) return;
      var k = C.flatten(q);
      if (seen[k]) return;
      seen[k] = 1;
      qs.push({ text: q, kind: kind, weight: weight });
    }

    /* A comparison has two subjects; asking about the coordinated span as one
       entity finds nothing. The comparands take precedence over the span. */
    if (frame.requiresComparison && frame.comparands.length === 2) {
      push(frame.comparands[0], "identity", 1.0);
      push(frame.comparands[1], "identity", 0.99);
      push(frame.comparands.join(" vs "), "facet", 0.7);
    }
    var subject = frame.subject || (frame.requiresComparison ? "" : frame.entities[0]) ||
                  frame.topic || frame.contentTokens.join(" ");

    /* 1. The identity query: what IS the thing. Highest value, because an
          exact title match is hard evidence rather than a fuzzy hit. */
    if (subject) push(subject, "identity", 1.0);

    /* 2. The relational query, when a relation was parsed. */
    if (frame.relation && subject) {
      push(subject + " " + frame.relationPhrase, "relation", 0.95);
    }

    /* 3. Split coordinated questions into their independent parts. */
    var parts = String(frame.semanticText || frame.body).split(/\?\s*|\band\b(?=\s+(?:why|how|what|when|where|who|which))/i)
      .map(function (p) { return p.trim(); }).filter(function (p) { return p.length > 8; });
    if (parts.length > 1) {
      parts.forEach(function (p) { push(C.stripStem(p), "facet", 0.7); });
    }

    /* 4. Causal/mechanistic facets get the concept plus the relation word,
          which is what a search engine can actually match on. */
    if (frame.requiresExplanation && subject) {
      var head = /\bwhy\b/i.test(frame.lower) ? "cause" : "mechanism";
      push(subject + " " + head, "facet", 0.6);
    }
    if (frame.requiresComparison && frame.comparands.length === 2) {
      push(frame.comparands[0], "identity", 0.9);
      push(frame.comparands[1], "identity", 0.9);
      push(frame.comparands.join(" vs "), "facet", 0.7);
    }

    /* 5. The literal question, last: useful for full-text search, useless for
          structured lookup. */
    push(C.stripStem(frame.semanticText || frame.body), "verbatim", 0.4);

    qs.sort(function (a, b) { return b.weight - a.weight; });
    return qs.slice(0, 5);
  }

  /* --------------------------------------------------------- source model */

  /* Sources are typed by what they are good FOR. A package-version question
     does not go to an encyclopedia and an encyclopedic question does not go
     to a package registry, so neither pays for the other's latency. */
  var DOMAINS = {
    encyclopedic: ["wikipedia-title", "wikidata", "wikipedia-search"],
    software: ["npm", "pypi", "wikipedia-search"],
    finance: ["coindesk", "exchange"],
    scholarly: ["crossref", "wikipedia-search"],
    general: ["wikipedia-title", "wikipedia-search", "wikidata"]
  };

  function domainFor(frame) {
    var low = frame.lower;
    if (/\b(?:npm|node|python|pip|package|library|framework|release|version)\b/.test(low) &&
        frame.requiresFreshInformation) return "software";
    if (/\b(?:price|bitcoin|btc|stock|exchange rate|currency rate|usd)\b/.test(low) &&
        frame.requiresFreshInformation) return "finance";
    if (/\b(?:paper|study|doi|journal|published research)\b/.test(low)) return "scholarly";
    if (frame.subject || frame.entities.length) return "encyclopedic";
    return "general";
  }

  /* ------------------------------------------------------------- caching */

  function Cache() { this.map = Object.create(null); }
  Cache.prototype.get = function (k) {
    var e = this.map[k];
    if (!e) return null;
    if (Date.now() > e.expires) { delete this.map[k]; return null; }
    return e.value;
  };
  Cache.prototype.set = function (k, v, ttlMs) {
    this.map[k] = { value: v, expires: Date.now() + ttlMs };
  };
  /* Freshness is a property of the CLAIM, not of the cache. A capital city
     may be cached for a day; a price may not be cached for a minute. */
  Cache.TTL = { timeless: 24 * 3600 * 1000, slow: 6 * 3600 * 1000, fresh: 60 * 1000, volatile: 15 * 1000 };

  function ttlFor(frame) {
    if (!frame.requiresFreshInformation) return Cache.TTL.timeless;
    if (/\b(?:price|stock|rate|weather|score)\b/.test(frame.lower)) return Cache.TTL.volatile;
    return Cache.TTL.fresh;
  }

  /* --------------------------------------------------- evidence graph */

  function Proposition(fields) {
    this.subject = fields.subject || "";
    this.predicate = fields.predicate || "";
    this.object = fields.object || "";
    this.qualifiers = fields.qualifiers || {};
    this.time = fields.time || "";
    this.source = fields.source || "";
    this.sourceKind = fields.sourceKind || "";
    this.confidence = fields.confidence == null ? 0.5 : fields.confidence;
    this.text = fields.text || "";
  }

  function EvidenceGraph() {
    this.props = [];
    this.bySlot = Object.create(null);
    this.sources = [];
  }
  EvidenceGraph.prototype.add = function (p) {
    if (!(p instanceof Proposition)) p = new Proposition(p);
    var slot = C.flatten(p.subject) + "|" + C.flatten(p.predicate);
    var bucket = this.bySlot[slot] || (this.bySlot[slot] = []);
    /* Merge: the same claim from another source raises confidence rather
       than being repeated in the answer. */
    for (var i = 0; i < bucket.length; i++) {
      if (sameValue(bucket[i].object, p.object)) {
        if (bucket[i].source !== p.source) {
          bucket[i].support = (bucket[i].support || 1) + 1;
          bucket[i].confidence = Math.min(0.99, bucket[i].confidence + 0.2);
          bucket[i].corroboration = (bucket[i].corroboration || []).concat([p.source]);
        }
        return bucket[i];
      }
    }
    p.support = 1;
    bucket.push(p);
    this.props.push(p);
    if (p.source && this.sources.indexOf(p.source) < 0) this.sources.push(p.source);
    return p;
  };
  EvidenceGraph.prototype.best = function (subject, predicate) {
    var bucket = this.bySlot[C.flatten(subject) + "|" + C.flatten(predicate)];
    if (!bucket || !bucket.length) return null;
    var sorted = bucket.slice().sort(function (a, b) {
      return (b.support - a.support) || (b.confidence - a.confidence);
    });
    return sorted[0];
  };
  EvidenceGraph.prototype.conflicts = function (subject, predicate) {
    var bucket = this.bySlot[C.flatten(subject) + "|" + C.flatten(predicate)];
    if (!bucket || bucket.length < 2) return null;
    var vals = bucket.filter(function (p) { return p.confidence > 0.3; });
    return vals.length > 1 ? vals : null;
  };
  EvidenceGraph.prototype.size = function () { return this.props.length; };

  function sameValue(a, b) {
    a = C.flatten(a); b = C.flatten(b);
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.length > 4 && b.length > 4 && (a.indexOf(b) === 0 || b.indexOf(a) === 0)) return true;
    return false;
  }

  /* ------------------------------------------- proposition extraction */

  var META = /\b(?:this article|see also|for other uses|may refer to|disambiguation|citation needed|retrieved|external links|main article|redirects here)\b/i;

  function sentences(text) {
    return String(text).replace(/\s+/g, " ")
      .split(/(?<=[.!?])\s+(?=[A-Z(])/)
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 15 && !META.test(s); });
  }

  /* Turn an article extract into typed propositions. Each keeps its source so
     the answer can cite what actually supports it. */
  function propositionsFrom(title, text, source, sourceKind) {
    var out = [], ss = sentences(text), m;
    for (var i = 0; i < ss.length && i < 14; i++) {
      var s = ss[i];
      if ((m = s.match(/^(?:The\s+|An?\s+)?(.{2,80}?)\s+(is|are|was|were)\s+(.{6,300}?)[.]/))) {
        out.push(new Proposition({
          subject: m[1], predicate: "definition", object: m[3],
          source: source, sourceKind: sourceKind, text: s,
          confidence: i === 0 ? 0.85 : 0.6
        }));
        continue;
      }
      if ((m = s.match(/^(.{2,80}?)\s+(?:causes?|produces?|results? in|leads? to)\s+(.{4,200}?)[.]/i))) {
        out.push(new Proposition({ subject: m[1], predicate: "cause", object: m[2],
          source: source, sourceKind: sourceKind, text: s, confidence: 0.7 }));
        continue;
      }
      if ((m = s.match(/^(.{2,80}?)\s+(?:is used|are used|is applied)\s+(?:for|in|to)\s+(.{4,200}?)[.]/i))) {
        out.push(new Proposition({ subject: m[1], predicate: "purpose", object: m[2],
          source: source, sourceKind: sourceKind, text: s, confidence: 0.7 }));
        continue;
      }
      out.push(new Proposition({ subject: title, predicate: "detail", object: s,
        source: source, sourceKind: sourceKind, text: s, confidence: 0.45 - i * 0.02 }));
    }
    return out;
  }

  /* ------------------------------------------------------ the federation */

  /* Parallel dispatch with an evidence quorum. The deadline is a backstop,
     not the schedule: `onEnough` fires the moment the graph is good enough. */
  function Federation(opts) {
    opts = opts || {};
    /* Early completion can be switched off for ablation: the federation then
       behaves like the old path and waits for the deadline. */
    this.earlyCompletion = opts.earlyCompletion !== false;
    this.fetch = opts.fetch || (typeof fetch !== "undefined" ? fetch : null);
    this.cache = new Cache();
    this.health = Object.create(null);
    this.perSourceTimeout = opts.perSourceTimeout || 2500;
    this.deadline = opts.deadline || 4000;
    this.quorum = opts.quorum || 2;
    this.stats = { requests: 0, hits: 0, aborted: 0, cached: 0 };
  }

  Federation.prototype.healthy = function (id) {
    var h = this.health[id];
    if (!h) return true;
    return !(h.failures >= 2 && Date.now() - h.last < 120000);
  };
  Federation.prototype.note = function (id, ok) {
    var h = this.health[id] || (this.health[id] = { failures: 0, last: 0 });
    if (ok) h.failures = 0; else h.failures++;
    h.last = Date.now();
  };

  Federation.prototype.getJSON = function (url, signal) {
    var self = this;
    if (!self.fetch) return Promise.resolve(null);
    self.stats.requests++;
    return self.fetch(url, { signal: signal, referrerPolicy: "no-referrer" })
      .then(function (r) { return r && r.ok ? r.json() : null; })
      .catch(function () { return null; });
  };

  /* Each provider is a small adapter: build a URL, parse the response into
     propositions. Adding a source does not touch the scheduler. */
  Federation.prototype.providers = function () {
    var self = this;
    return {
      "wikipedia-title": {
        kind: "encyclopedia", authority: 0.9, exact: true,
        run: function (q, signal) {
          var url = "https://en.wikipedia.org/w/api.php?action=query&titles=" + encodeURIComponent(q) +
            "&redirects=1&prop=extracts%7Cpageprops&exintro=1&explaintext=1&format=json&origin=*";
          return self.getJSON(url, signal).then(function (j) {
            var pages = j && j.query && j.query.pages;
            if (!pages) return [];
            for (var k in pages) {
              var p = pages[k];
              if (p && !p.missing && p.extract) {
                var disamb = p.pageprops && Object.prototype.hasOwnProperty.call(p.pageprops, "disambiguation");
                if (disamb) return [];
                return propositionsFrom(p.title, p.extract, "Wikipedia", "encyclopedia")
                  .map(function (pr) { pr.confidence = Math.min(0.95, pr.confidence + 0.15); pr.exactTitle = p.title; return pr; });
              }
            }
            return [];
          });
        }
      },
      "wikipedia-search": {
        kind: "encyclopedia", authority: 0.7,
        run: function (q, signal) {
          var url = "https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=" +
            encodeURIComponent(q) + "&gsrlimit=3&prop=extracts&exintro=1&explaintext=1&format=json&origin=*";
          return self.getJSON(url, signal).then(function (j) {
            var pages = j && j.query && j.query.pages, out = [];
            if (!pages) return out;
            for (var k in pages) {
              var p = pages[k];
              if (p && p.extract) out = out.concat(propositionsFrom(p.title, p.extract, "Wikipedia", "encyclopedia"));
            }
            return out;
          });
        }
      },
      "wikidata": {
        kind: "structured", authority: 0.95, exact: true,
        run: function (q, signal) {
          var url = "https://www.wikidata.org/w/api.php?action=wbsearchentities&search=" +
            encodeURIComponent(q) + "&language=en&format=json&limit=1&origin=*";
          return self.getJSON(url, signal).then(function (j) {
            var hit = j && j.search && j.search[0];
            if (!hit) return [];
            return [new Proposition({
              subject: hit.label, predicate: "definition", object: hit.description || "",
              source: "Wikidata", sourceKind: "structured", confidence: 0.8,
              text: hit.label + " — " + (hit.description || "")
            })];
          });
        }
      },
      "npm": {
        kind: "registry", authority: 0.95, exact: true, fresh: true,
        run: function (q, signal) {
          var pkg = String(q).toLowerCase().replace(/[^a-z0-9@._-]+/g, "-").replace(/^-|-$/g, "");
          var url = "https://registry.npmjs.org/" + encodeURIComponent(pkg) + "/latest";
          return self.getJSON(url, signal).then(function (j) {
            if (!j || !j.version) return [];
            return [new Proposition({
              subject: j.name || pkg, predicate: "version", object: j.version,
              source: "npm registry", sourceKind: "registry", confidence: 0.95,
              text: (j.name || pkg) + " is at version " + j.version + "."
            })];
          });
        }
      },
      "pypi": {
        kind: "registry", authority: 0.95, exact: true, fresh: true,
        run: function (q, signal) {
          var pkg = String(q).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-|-$/g, "");
          return self.getJSON("https://pypi.org/pypi/" + encodeURIComponent(pkg) + "/json", signal)
            .then(function (j) {
              if (!j || !j.info || !j.info.version) return [];
              return [new Proposition({
                subject: j.info.name || pkg, predicate: "version", object: j.info.version,
                source: "PyPI", sourceKind: "registry", confidence: 0.95,
                text: (j.info.name || pkg) + " is at version " + j.info.version + "."
              })];
            });
        }
      },
      "coindesk": {
        kind: "market", authority: 0.8, fresh: true,
        run: function (q, signal) {
          return self.getJSON("https://api.coindesk.com/v1/bpi/currentprice.json", signal).then(function (j) {
            var usd = j && j.bpi && j.bpi.USD;
            if (!usd) return [];
            return [new Proposition({
              subject: "Bitcoin", predicate: "price", object: "US$" + usd.rate,
              time: (j.time && j.time.updated) || "", source: "CoinDesk", sourceKind: "market",
              confidence: 0.85, text: "Bitcoin is trading at US$" + usd.rate + "."
            })];
          });
        }
      },
      "exchange": {
        kind: "market", authority: 0.8, fresh: true,
        run: function (q, signal) {
          return self.getJSON("https://open.er-api.com/v6/latest/USD", signal).then(function (j) {
            if (!j || !j.rates) return [];
            return [new Proposition({
              subject: "US dollar", predicate: "rate", object: "1 USD = " + j.rates.EUR + " EUR",
              source: "open.er-api.com", sourceKind: "market", confidence: 0.8,
              text: "1 US dollar is " + j.rates.EUR + " euro."
            })];
          });
        }
      },
      "crossref": {
        kind: "scholarly", authority: 0.85,
        run: function (q, signal) {
          return self.getJSON("https://api.crossref.org/works?rows=2&query=" + encodeURIComponent(q), signal)
            .then(function (j) {
              var items = j && j.message && j.message.items;
              if (!items) return [];
              return items.map(function (it) {
                return new Proposition({
                  subject: (it.title && it.title[0]) || "", predicate: "detail",
                  object: (it["container-title"] && it["container-title"][0]) || "",
                  source: "Crossref", sourceKind: "scholarly", confidence: 0.6,
                  text: (it.title && it.title[0]) || ""
                });
              });
            });
        }
      }
    };
  };

  /* The scheduler. Every selected provider starts at T=0 against its own
     abort signal. `enough` is consulted on every arrival; the first time it
     is satisfied the remaining requests are aborted and the promise settles.
     Nothing waits for the slowest source. */
  Federation.prototype.gather = function (frame, opts) {
    var self = this;
    opts = opts || {};
    var queries = decompose(frame);
    var domain = opts.domain || domainFor(frame);
    var ids = (DOMAINS[domain] || DOMAINS.general).filter(function (id) { return self.healthy(id); });
    var provs = self.providers();
    var graph = new EvidenceGraph();
    var cacheKey = domain + "::" + C.flatten(frame.semanticText || frame.body);
    var ttl = ttlFor(frame);

    var cached = self.cache.get(cacheKey);
    if (cached) { self.stats.cached++; return Promise.resolve(cached); }

    return new Promise(function (resolve) {
      var settled = false, outstanding = 0, controllers = [];
      var t0 = Date.now();

      function finish(reason) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        controllers.forEach(function (c) {
          try { if (c && !c.done) { c.ctl.abort(); self.stats.aborted++; } } catch (e) {}
        });
        graph.elapsed = Date.now() - t0;
        graph.reason = reason;
        graph.domain = domain;
        graph.queries = queries.map(function (q) { return q.text; });
        if (graph.size()) self.cache.set(cacheKey, graph, ttl);
        resolve(graph);
      }

      function enough() {
        if (!self.earlyCompletion) return false;
        if (!graph.size()) return false;
        /* An exact structured hit for the asked relation is sufficient on its
           own -- a registry saying "the version is X" is not improved by an
           encyclopedia agreeing. Otherwise wait for independent support. */
        var exact = graph.props.filter(function (p) { return p.confidence >= 0.9; });
        if (exact.length) return true;
        var supported = graph.props.filter(function (p) { return (p.support || 1) >= self.quorum; });
        if (supported.length) return true;
        return graph.sources.length >= self.quorum && graph.size() >= 3;
      }

      var timer = setTimeout(function () { finish("deadline"); }, self.deadline);

      ids.forEach(function (id) {
        var prov = provs[id];
        if (!prov) return;
        var q = queries[0];
        /* An exact-lookup provider gets the identity query; a search provider
           gets the richest one. Sending every query to every source is what
           made the old path expensive. */
        if (prov.exact) q = queries.filter(function (x) { return x.kind === "identity"; })[0] || queries[0];
        else q = queries.filter(function (x) { return x.kind !== "identity"; })[0] || queries[0];
        var ctl = null;
        try { ctl = new AbortController(); } catch (e) {}
        var entry = { ctl: ctl, done: false };
        controllers.push(entry);
        outstanding++;
        var localTimer = setTimeout(function () {
          if (!entry.done) { entry.done = true; try { ctl && ctl.abort(); } catch (e) {} arrive(id, []); }
        }, self.perSourceTimeout);

        Promise.resolve(prov.run(q.text, ctl && ctl.signal)).then(function (props) {
          clearTimeout(localTimer);
          if (entry.done) return;
          entry.done = true;
          self.note(id, !!(props && props.length));
          arrive(id, props || []);
        }, function () {
          clearTimeout(localTimer);
          if (entry.done) return;
          entry.done = true;
          self.note(id, false);
          arrive(id, []);
        });
      });

      if (!outstanding) return finish("no-sources");

      function arrive(id, props) {
        if (settled) return;
        self.stats.hits += props.length ? 1 : 0;
        props.forEach(function (p) { graph.add(p); });
        outstanding--;
        if (enough()) return finish("quorum");
        if (outstanding <= 0) return finish("exhausted");
      }
    });
  };

  root.C4LMEvidence = {
    decompose: decompose,
    domainFor: domainFor,
    Federation: Federation,
    EvidenceGraph: EvidenceGraph,
    Proposition: Proposition,
    propositionsFrom: propositionsFrom,
    sentences: sentences,
    Cache: Cache,
    DOMAINS: DOMAINS
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.C4LMEvidence;
})(typeof window !== "undefined" ? window : globalThis);
