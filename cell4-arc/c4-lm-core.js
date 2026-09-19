/* CELL4 language core: normalization, morphology and the QueryFrame.
 *
 * WHY THIS FILE EXISTS
 * The previous stack re-interpreted the raw prompt in a dozen places
 * (tsRawTokens, tsTokens, tsQueryForm, tsSplit, tsSignatures, analyzeQuestion,
 * grammaticalFamilies, dialogue.resolve, SWE detection, current-query
 * detection). Each pass owned its own regexes, so the passes could disagree
 * about what the user asked, and the cost was paid several times per turn.
 *
 * Here the message is parsed ONCE into an immutable QueryFrame. Everything
 * downstream reads that frame. A new phrasing is handled by teaching the
 * frame a linguistic concept, not by adding another branch to a consumer.
 *
 * No network, no model service. Pure functions over the message text.
 */
(function (root) {
  "use strict";

  /* ------------------------------------------------------------ constants */

  var FUNCTION_WORDS = ("a an the of for to in on at by with from as is are was were be been being am " +
    "do does did doing done have has had having will would shall should can could may might must " +
    "and or but nor so yet if then than that this these those there here it its it's his her their " +
    "our your my me you he she they them we us i him hers theirs ours yours mine what which who whom " +
    "whose when where why how not no nor very just also too only both each any some all most more " +
    "much many few less least about into onto over under between among through during before after " +
    "above below up down out off again further once because while until unless although though " +
    "every everyone everything everybody anyone anything anybody someone something somebody " +
    "none neither either another other others such own per via plus versus whatever whoever " +
    "however whether whenever wherever whichever nothing nobody nowhere therefore thus hence " +
    "meanwhile otherwise instead rather quite almost perhaps maybe indeed besides moreover").split(" ");

  var STOP = Object.create(null);
  FUNCTION_WORDS.forEach(function (w) { STOP[w] = 1; });

  /* Words that carry the question's intent. Kept out of STOP on purpose:
     the frame needs them, retrieval does not. */
  var INTENT_WORDS = Object.create(null);
  ("what which who whom whose when where why how is are was were do does did can could " +
   "should would will explain define describe compare tell show list give write calculate " +
   "compute convert solve").split(" ").forEach(function (w) { INTENT_WORDS[w] = 1; });

  /* A token may contain a dot or hyphen internally ("node.js", "c++",
     "state-of-the-art") but may not END on punctuation -- otherwise sentence
     boundaries are eaten and the repair sees "animals." as an unknown word. */
  var WORD_RE = /[a-z0-9À-ɏ](?:[a-z0-9'’+#._À-ɏ-]*[a-z0-9+#À-ɏ])?/gi;

  /* Common miskeyings. This is a *typing* model (adjacent-key slips and
     transpositions), not a question dictionary: the same table repairs any
     sentence containing these forms. Everything else is repaired by edit
     distance against the live vocabulary, which needs no table at all. */
  var TYPO_FIX = {
    teh: "the", hte: "the", adn: "and", nad: "and", taht: "that", wich: "which",
    waht: "what", whta: "what", wat: "what", wut: "what", hwo: "how", woh: "who",
    yuo: "you", yoru: "your", thier: "their", recieve: "receive", seperate: "separate",
    definately: "definitely", occured: "occurred", accomodate: "accommodate",
    becuase: "because", beacuse: "because", becasue: "because", alot: "a lot",
    dont: "don't", doesnt: "doesn't", cant: "can't", wont: "won't", isnt: "isn't",
    wasnt: "wasn't", couldnt: "couldn't", shouldnt: "shouldn't", wouldnt: "wouldn't",
    im: "i'm", ive: "i've", id: "i'd", ill: "i'll", whats: "what's", thats: "that's",
    hows: "how's", wheres: "where's", whos: "who's", lets: "let's", u: "you",
    ur: "your", pls: "please", plz: "please", thx: "thanks", ty: "thanks",
    goverment: "government", enviroment: "environment", langauge: "language",
    lanugage: "language", proramming: "programming", progamming: "programming",
    javascrip: "javascript", pyton: "python", phyton: "python"
  };

  /* ------------------------------------------------------------ text utils */

  function normalizeUnicode(s) {
    return String(s == null ? "" : s)
      .replace(/[‘’‛′]/g, "'")
      .replace(/[“”„″]/g, '"')
      .replace(/[‐-―−]/g, "-")
      .replace(/[   ]/g, " ")
      .replace(/…/g, "...")
      .replace(/\s+/g, " ")
      .trim();
  }

  /* Punctuation-insensitive key. "version-space", "version space" and
     "version_space" collapse to one form, which is the general answer to the
     hyphenation residual the previous build documented for exactly two
     strings. */
  function flatten(s) {
    return normalizeUnicode(s).toLowerCase()
      .replace(/['’]s\b/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function words(s) {
    var m = normalizeUnicode(s).toLowerCase().match(WORD_RE);
    return m ? m : [];
  }

  /* Indexing tokens. A compound keeps its joined form AND contributes its
     parts, so "version-space" and "version space" reach the same postings.
     This is the general answer to punctuation-variant morphology -- it is not
     a fix for two particular strings. */
  function indexTokens(s) {
    var base = words(s), out = [];
    for (var i = 0; i < base.length; i++) {
      var t = base[i];
      out.push(t);
      if (/[-._]/.test(t)) {
        var parts = t.split(/[-._]+/).filter(function (x) { return x.length > 1; });
        if (parts.length > 1) {
          for (var j = 0; j < parts.length; j++) out.push(parts[j]);
          out.push(parts.join(""));
        }
      }
    }
    return out;
  }

  /* A deliberately small, reversible stemmer. It exists so that "computing",
     "computed" and "computes" reach the same index bucket; it is not a
     linguistic claim. */
  function stem(w) {
    w = String(w).toLowerCase();
    if (w.length <= 3) return w;
    if (/(ss|us|is|as)$/.test(w)) { /* keep */ }
    else if (/ies$/.test(w) && w.length > 4) return w.slice(0, -3) + "y";
    else if (/(ches|shes|xes|zes|ses)$/.test(w)) return w.slice(0, -2);
    else if (/s$/.test(w) && !/ss$/.test(w)) w = w.slice(0, -1);
    if (/ying$/.test(w) && w.length > 5) return w.slice(0, -4) + "y";
    if (/ing$/.test(w) && w.length > 5) {
      var b = w.slice(0, -3);
      if (/([bdfglmnprt])\1$/.test(b)) b = b.slice(0, -1);
      return /[aeiou]/.test(b) ? b : w;
    }
    if (/edly$/.test(w)) return w.slice(0, -4);
    if (/ed$/.test(w) && w.length > 4) {
      var c = w.slice(0, -2);
      if (/([bdfglmnprt])\1$/.test(c)) c = c.slice(0, -1);
      return /[aeiou]/.test(c) ? c : w;
    }
    if (/ally$/.test(w)) return w.slice(0, -4) + "al";
    if (/ly$/.test(w) && w.length > 4) return w.slice(0, -2);
    return w;
  }

  function damerau(a, b, cap) {
    a = String(a); b = String(b);
    if (Math.abs(a.length - b.length) > (cap == null ? 99 : cap)) return 99;
    var i, j, prev2 = [], prev = [], cur = [];
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      var rowMin = i;
      for (j = 1; j <= b.length; j++) {
        var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        var v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (i > 1 && j > 1 && a.charAt(i - 1) === b.charAt(j - 2) && a.charAt(i - 2) === b.charAt(j - 1)) {
          v = Math.min(v, prev2[j - 2] + 1);
        }
        cur[j] = v;
        if (v < rowMin) rowMin = v;
      }
      if (cap != null && rowMin > cap) return 99;
      prev2 = prev; prev = cur;
    }
    return prev[b.length];
  }

  /* A vocabulary the spell repair can aim at. Consumers (the knowledge base,
     the local corpus) register their own terms, so the repair improves as the
     system learns more words rather than as someone adds more fix-ups. */
  var VOCAB = Object.create(null);
  var VOCAB_BY_LEN = Object.create(null);
  function learnWord(w) {
    w = String(w || "").toLowerCase();
    if (w.length < 4 || VOCAB[w]) return;
    VOCAB[w] = 1;
    (VOCAB_BY_LEN[w.length] || (VOCAB_BY_LEN[w.length] = [])).push(w);
  }
  function learnVocabulary(list) {
    if (!list) return;
    for (var i = 0; i < list.length; i++) {
      var ws = words(list[i]);
      for (var j = 0; j < ws.length; j++) learnWord(ws[j]);
    }
  }
  /* A core English vocabulary so the repair has something to be conservative
     against. Without a baseline lexicon every unfamiliar word looks like a
     typo and "three" gets "corrected" to "there". Domain vocabulary arrives
     later from the knowledge base and the local corpus. */
  var CORE_WORDS = ("zero one two three four five six seven eight nine ten eleven twelve thirteen " +
    "fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy " +
    "eighty ninety hundred thousand million billion trillion first second third fourth fifth sixth " +
    "seventh eighth ninth tenth half quarter double triple " +
    "time year month week day hour minute date today tomorrow yesterday morning evening night " +
    "people person man woman child children family friend name world country city town place state " +
    "water food air fire earth sun moon star planet sky sea ocean river mountain tree plant animal " +
    "bird fish dog cat horse body head hand eye heart brain bone blood cell blood skin " +
    "work job money price cost value market business company product service customer market trade " +
    "school student teacher class lesson book page word letter language sentence question answer " +
    "problem solution reason result effect cause example fact idea thought mind knowledge science " +
    "history number math maths mathematics physics chemistry biology geography economics politics " +
    "computer software hardware program code data file system network internet website server " +
    "machine engine model method process function object value type class table list array string " +
    "number index search query record report change level power energy force speed light heat sound " +
    "colour color shape size length width height weight mass volume area distance temperature " +
    "difference comparison between among about above below inside outside before after during " +
    "large small great little long short high low fast slow hot cold new old young good bad best " +
    "worst better worse easy hard simple complex important useful different same similar common rare " +
    "make made made take taken give given get got find found know known think thought say said " +
    "tell told show shown see seen look come came go went use used work worked need needed want " +
    "call called ask asked write written read run running start started stop stopped keep kept " +
    "help helped move moved live lived play played turn turned learn learned build built grow grown " +
    "happen happened change changed create created explain explained describe compare define " +
    "understand understood mean meant produce provide include contain support require allow become " +
    "remain appear seem stay leave bring carry hold open close send receive begin end continue " +
    "please sorry thanks thank hello goodbye yes no maybe true false right wrong sure okay " +
    "very really quite just still even also only more most less least many much few several " +
    "always never often sometimes usually rarely again once twice together alone almost enough " +
    "around across along through against toward within without beyond behind beside near far " +
    "capital currency language population author writer creator inventor founder symbol element " +
    "energy matter atom molecule gravity evolution climate weather season temperature pressure " +
    "government president election law court policy tax budget economy inflation recession " +
    "music art film movie novel poem story painting picture photograph design style culture " +
    "health disease medicine doctor hospital patient treatment vaccine virus bacteria immune " +
    "sentence bullet bullets point points paragraph summary detail step steps list order " +
    "monday tuesday wednesday thursday friday saturday sunday weekday weekend " +
    "january february march april may june july august september october november december " +
    "group grouped groups grouping query queries column columns table tables select insert " +
    "update delete join where limit offset index rows schema database server client request " +
    "response release releases released version versions stable latest current newest build " +
    "artist artists poet poets robot robots painter writer author novelist scientist engineer " +
    "duplicate duplicates unique reverse reversed sorted sorting filter filtered append " +
    "continent continents ocean oceans planet planets element elements symbol symbols " +
    "capital capitals currency currencies language languages population populations " +
    "mitosis meiosis photosynthesis entanglement qubit qubits neuron neurons enzyme enzymes " +
    "protocol protocols compiler compilers interpreter interpreters framework frameworks " +
    "seasons season tilt axis scatter scattering conduction conductor insulator " +
    "supervised unsupervised reinforcement inference deduction induction transitive " +
    "youngest oldest tallest shortest largest smallest fastest slowest cheapest " +
    /* irregular forms: a regular lexicon would call these one edit from a
       present tense and quietly rewrite the user's sentence */
    "wrote written spoke spoken broke broken chose chosen drove driven froze frozen rose risen " +
    "stole stolen woke woken awoke bore born borne wore worn tore torn swore sworn " +
    "began begun drank drunk sang sung rang rung sank sunk swam swum ran run came become " +
    "knew known grew grown threw thrown blew blown flew flown drew drawn " +
    "taught bought brought caught fought sought thought sold told held felt kept slept crept " +
    "left lost meant sent spent built bent lent dealt meet met feed fed lead led read " +
    "gave given took taken saw seen ate eaten fell fallen forgot forgotten got gotten " +
    "hid hidden lay lain laid paid said made went gone done had heard stood understood " +
    "states state united kingdom republic island islands north south east west central").split(" ");
  FUNCTION_WORDS.forEach(learnWord);
  CORE_WORDS.forEach(learnWord);

  /* A word is "known" if the lexicon has it or has the form it inflects from.
     Without this, a regular plural looks one edit away from its own singular
     and the repair silently rewrites "United States" to "United State". */
  function knownWord(w) {
    if (VOCAB[w] || STOP[w]) return true;
    if (VOCAB[stem(w)]) return true;
    var cuts = [/s$/, /es$/, /ed$/, /ing$/, /ly$/, /er$/, /est$/, /ies$/];
    for (var i = 0; i < cuts.length; i++) {
      if (cuts[i].test(w)) {
        var b = w.replace(cuts[i], "");
        if (b.length >= 3 && (VOCAB[b] || VOCAB[b + "e"] || VOCAB[b + "y"])) return true;
      }
    }
    return false;
  }

  var INFLECTION = /^(?:s|es|d|ed|ing|ly|er|est|ies|y)$/;
  function inflectionOf(a, b) {
    var lo = a.length < b.length ? a : b, hi = a.length < b.length ? b : a;
    if (hi.indexOf(lo) !== 0) return false;
    return INFLECTION.test(hi.slice(lo.length));
  }

  /* Names are spelled by their owners, so a capitalised word is normally left
     alone. The exception is a name the system already knows: a weekday, a
     month, or an entity in the knowledge base. Those may be repaired, because
     there is a specific thing being referred to. */
  var PROPER = Object.create(null);
  var PROPER_BY_LEN = Object.create(null);
  function learnProper(w) {
    w = String(w || "").toLowerCase();
    if (w.length < 4 || PROPER[w]) return;
    PROPER[w] = 1;
    (PROPER_BY_LEN[w.length] || (PROPER_BY_LEN[w.length] = [])).push(w);
  }
  ("monday tuesday wednesday thursday friday saturday sunday january february march april " +
   "may june july august september october november december").split(" ").forEach(learnProper);

  function repairProper(w) {
    if (PROPER[w]) return w;
    /* An ordinary word that happens to be capitalised -- sentence-initial, or
       "Some" opening a premise -- is not a misspelled name. */
    if (knownWord(w)) return w;
    /* A digit distinguishes a name: "CELL4" is not "cells". */
    if (/\d/.test(w)) return w;
    var budget = w.length >= 8 ? 2 : 1, best = "", bestD = budget + 1;
    for (var L = w.length - budget; L <= w.length + budget; L++) {
      var bucket = PROPER_BY_LEN[L];
      if (!bucket) continue;
      for (var i = 0; i < bucket.length; i++) {
        var d = damerau(w, bucket[i], budget);
        if (d < bestD) { bestD = d; best = bucket[i]; }
      }
    }
    if (bestD <= budget && best && !inflectionOf(w, best)) return best;
    return w;
  }

  var repairCache = Object.create(null);
  function repairWord(w, proper) {
    w = String(w).toLowerCase();
    if (TYPO_FIX[w]) return TYPO_FIX[w];
    if (proper) return w.length >= 4 ? repairProper(w) : w;
    if (w.length < 5 || knownWord(w) || !/^[a-z]+$/.test(w)) return w;
    if (repairCache[w] !== undefined) return repairCache[w];
    var budget = w.length >= 8 ? 2 : 1, best = "", bestD = budget + 1;
    for (var L = w.length - budget; L <= w.length + budget; L++) {
      var bucket = VOCAB_BY_LEN[L];
      if (!bucket) continue;
      for (var i = 0; i < bucket.length; i++) {
        var cand = bucket[i];
        if (cand.charAt(0) !== w.charAt(0) && damerau(cand.slice(0, 2), w.slice(0, 2), 1) > 1) continue;
        var d = damerau(w, cand, budget);
        if (d < bestD) { bestD = d; best = cand; if (d === 1) break; }
      }
      if (bestD === 1) break;
    }
    /* Never "correct" a word into an inflection of itself. "release" is not a
       misspelling of "releases", and a lexicon that happens to hold only one
       of the two must not rewrite the other. */
    if (best && inflectionOf(w, best)) best = "";
    var out = (best && bestD <= budget) ? best : w;
    repairCache[w] = out;
    return out;
  }

  /* --------------------------------------------------------- relation model
   * ONE place where a relation is described. Every surface form of a relation
   * -- "capital of X", "X's capital", "which city is the capital of X" --
   * resolves to the same id here, which is what stops the four-branch sprawl
   * the brief calls out. */
  var RELATIONS = [
    { id: "capital",   heads: ["capital", "capital city"], answerType: "place" },
    { id: "currency",  heads: ["currency", "money"], answerType: "thing" },
    { id: "language",  heads: ["language", "official language", "languages"], answerType: "thing" },
    { id: "population",heads: ["population", "how many people"], answerType: "quantity" },
    { id: "author",    heads: ["author", "writer"], verbs: ["write", "wrote", "written", "author"], answerType: "person" },
    { id: "creator",   heads: ["creator", "inventor", "founder", "designer", "developer"],
                       verbs: ["create", "invent", "found", "design", "develop", "make", "build"], answerType: "person" },
    { id: "artist",    heads: ["painter", "artist", "composer", "director"],
                       verbs: ["paint", "compose", "direct"], answerType: "person" },
    { id: "symbol",    heads: ["symbol", "chemical symbol", "abbreviation", "sign"], answerType: "thing" },
    { id: "birth",     heads: ["birth", "birthday", "birthdate", "date of birth"],
                       verbs: ["born"], answerType: "time" },
    { id: "death",     heads: ["death", "date of death"], verbs: ["died", "die"], answerType: "time" },
    { id: "location",  heads: ["location", "place"], verbs: ["located", "situated", "found"], answerType: "place" },
    { id: "height",    heads: ["height", "how tall", "tall"], answerType: "quantity" },
    { id: "length",    heads: ["length", "how long"], answerType: "quantity" },
    { id: "distance",  heads: ["distance", "how far"], answerType: "quantity" },
    { id: "speed",     heads: ["speed", "velocity", "how fast"], answerType: "quantity" },
    { id: "size",      heads: ["size", "area", "mass", "weight", "diameter", "radius"], answerType: "quantity" },
    { id: "count",     heads: ["number", "count", "how many"], answerType: "quantity" },
    { id: "cause",     heads: ["cause", "reason"], verbs: ["cause", "causes", "because"], answerType: "explanation" },
    { id: "purpose",   heads: ["purpose", "use", "uses", "application", "applications", "point"],
                       verbs: ["used", "use"], answerType: "explanation" },
    { id: "mechanism", heads: ["mechanism", "process"], verbs: ["work", "works", "operate"], answerType: "explanation" },
    { id: "definition",heads: ["definition", "meaning"], verbs: ["mean", "means", "define"], answerType: "definition" },
    { id: "example",   heads: ["example", "examples", "instance"], answerType: "list" },
    { id: "type",      heads: ["type", "kind", "category", "class"], answerType: "thing" },
    { id: "part",      heads: ["part", "parts", "component", "components", "ingredient"], answerType: "list" },
    { id: "time",      heads: ["time", "date", "year", "when"], answerType: "time" },
    { id: "price",     heads: ["price", "cost", "value", "worth"], answerType: "quantity" },
    { id: "version",   heads: ["version", "release", "build"], answerType: "thing" },
    { id: "capitalOf", heads: [], answerType: "place" }
  ];

  var RELATION_BY_HEAD = Object.create(null);
  var RELATION_BY_VERB = Object.create(null);
  RELATIONS.forEach(function (r) {
    (r.heads || []).forEach(function (h) { RELATION_BY_HEAD[flatten(h)] = r.id; });
    (r.verbs || []).forEach(function (v) { RELATION_BY_VERB[stem(v)] = r.id; });
  });
  function relationForHead(phrase) {
    var f = flatten(phrase);
    if (RELATION_BY_HEAD[f]) return RELATION_BY_HEAD[f];
    var ws = f.split(" ");
    for (var i = 0; i < ws.length; i++) {
      var id = RELATION_BY_HEAD[ws[i]] || RELATION_BY_HEAD[stem(ws[i])];
      if (id) return id;
    }
    return "";
  }
  function relationForVerb(v) { return RELATION_BY_VERB[stem(String(v).toLowerCase())] || ""; }

  /* A syntax-free fragment ("capital France") only reads as a relation when
     the remainder actually names something. Without that test, any sentence
     containing a relational noun -- "the version space" -- would be torn into
     a relation and a subject that is not an entity at all. The oracle is
     supplied by whatever knows about entities; with none, the frame falls
     back to requiring a multi-word or capitalised remainder. */
  var entityOracle = null;
  function setEntityOracle(fn) { entityOracle = typeof fn === "function" ? fn : null; }
  function looksLikeEntity(phrase, raw) {
    if (entityOracle) { try { if (entityOracle(phrase)) return true; } catch (e) {} }
    if (!entityOracle) {
      if (String(phrase).split(" ").length > 1) return true;
      if (raw && new RegExp("\\b" + String(phrase).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(raw) &&
          new RegExp("\\b" + String(phrase).charAt(0).toUpperCase() + String(phrase).slice(1) + "\\b").test(raw)) return true;
    }
    return false;
  }

  /* ------------------------------------------------------------- lexicons */

  var FRESH_MARKERS = ("current currently latest newest today now recent recently " +
    "this year this month right now at the moment nowadays live up to date up-to-date " +
    "so far as of today present").split(" ");
  var FRESH_PHRASES = [/\bcurrent(?:ly)?\b/, /\blatest\b/, /\bnewest\b/, /\bright now\b/,
    /\btoday\b/, /\bthis (?:year|month|week)\b/, /\bas of (?:today|now)\b/, /\bup[ -]?to[ -]?date\b/,
    /\bnow\b/, /\brecent(?:ly)?\b/, /\bstable (?:version|release)\b/, /\bnews\b/, /\bprice\b/,
    /\bstock\b/, /\bweather\b/, /\bscore\b/];
  var VOLATILE_NOUNS = ("price prices cost stock share weather temperature forecast news " +
    "headline release version score result scores standings rate rates exchange population " +
    "trending").split(" ");

  var COMPARE_MARKERS = [/\bcompare\b/, /\bcomparison\b/, /\bdifference(?:s)? between\b/,
    /\bdiffer(?:s|ence)?\b/, /\bversus\b/, /\bvs\.?\b/, /\bcontrast\b/,
    /\bbetter than\b/, /\bwhich (?:one )?is (?:faster|better|bigger|smaller|cheaper|safer)\b/];
  var LIST_MARKERS = [/\blist\b/, /\bname (?:three|four|five|\d+|some|a few)\b/,
    /\bgive me (?:three|four|five|\d+|some|a few)\b/, /\bwhat are (?:the|some)\b/,
    /\bbullets?\b/, /\bexamples? of\b/, /\bthree\b.*\b(?:ways|reasons|colors|colours|types|kinds)\b/];
  var EXPLAIN_MARKERS = [/^why\b/, /\bwhy (?:does|do|is|are|did|would|can)\b/,
    /\bexplain(?:s|ed|ing|ation)?\b/, /\bclear explanation\b/, /\bwhat'?s going on\b/,
    /\bhow (?:does|do|did|can|is|are)\b/, /\bwhat (?:causes|makes)\b/, /\bhow come\b/,
    /\breason (?:for|why)\b/, /\bwalk me through\b/];
  var CODE_MARKERS = [/\bwrite (?:a |an |some )?(?:function|program|script|query|class|method|snippet|code)\b/,
    /\bimplement\b/, /\bcode (?:for|that|to)\b/, /\b(?:sql|regex|css|html) (?:query|statement|selector|rule)\b/,
    /\bfunction that\b/, /\bsnippet\b/, /\bdebug\b/, /\bstack trace\b/, /\bcompil(?:e|er|ation)\b/,
    /\bsyntax error\b/, /\bwhy does this (?:code|loop|function|script)\b/,
    /\bwhat does this (?:code|do|function|line|snippet)\b/];
  var CODE_LANGS = ("javascript typescript python java c c++ cpp csharp c# go golang rust ruby php " +
    "swift kotlin scala perl haskell lua luau sql bash shell html css jsx react node nodejs deno " +
    "regex json yaml").split(" ");
  var GREETING = [/^(?:hi|hey|hello|yo|sup|howdy|heya|hiya)\b/, /^good (?:morning|afternoon|evening)\b/,
    /^how (?:are you|'?s it going|is it going|have you been)\b/, /^what'?s up\b/];
  var THANKS = [/\bthanks?\b/, /\bthank you\b/, /\bcheers\b/, /\bappreciate it\b/, /\bta\b/];
  var ACK = [/^(?:ok(?:ay)?|k|sure|right|yeah|yep|yup|nope|nah|cool|nice|got it|i see|makes sense|fair enough|interesting|wow|huh|hmm+)\b/];
  var META_SELF = [/\bwho (?:are|made) you\b/, /\bwhat are you\b/, /\bare you (?:an? )?(?:ai|bot|robot|human|real|conscious)\b/,
    /\bwhat can you do\b/, /\byour name\b/];

  var PRONOUNS = ("he she it they them him her his hers its their theirs this that these those " +
    "one ones both former latter").split(" ");
  var CONT_MARKERS = ("more continue go on elaborate expand further else also another next " +
    "and what about how about tell me more why then").split(" ");
  var SHIFT_MARKERS = [/^\s*(?:anyway|anyways|actually|never ?mind|forget (?:it|that)|moving on|different (?:topic|question)|new (?:topic|question)|changing (?:the )?(?:topic|subject)|on another note|unrelated)\b/i];

  var SAFETY = [/\b(?:suicide|self[- ]?harm|kill (?:myself|yourself)|how to make a bomb|child (?:porn|abuse))\b/i];

  /* ------------------------------------------------------- format requests */
  var NUM_WORD = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

  function parseFormat(norm) {
    var out = { format: "prose", length: 0, unit: "", tone: "", onlyValue: false };
    var m;
    if ((m = norm.match(/\bin (?:exactly |about |roughly |just |only )?(\d+|one|two|three|four|five|six|seven|eight|nine|ten) (bullet|bullets|bullet points?|points?|items?)\b/i))) {
      out.format = "bullets"; out.length = NUM_WORD[m[1].toLowerCase()] || parseInt(m[1], 10); out.unit = "bullets";
    } else if ((m = norm.match(/\b(?:in|using|with|under|no more than|at most|within) (?:exactly |about |roughly |just |only )?(\d+|one|two|three|four|five|six|seven|eight|nine|ten) (sentences?|lines?|words?|paragraphs?)\b/i))) {
      out.length = NUM_WORD[m[1].toLowerCase()] || parseInt(m[1], 10);
      out.unit = /sentence/.test(m[2]) ? "sentences" : /word/.test(m[2]) ? "words" :
                 /line/.test(m[2]) ? "lines" : "paragraphs";
      out.format = out.unit === "lines" ? "lines" : "prose";
    } else if (/\b(?:as|in) (?:a )?(?:bullet(?:ed)? list|bullets|a list|list form)\b/i.test(norm) ||
               /^\s*list\b/i.test(norm)) {
      out.format = "bullets";
    }
    if ((m = norm.match(/\b(?:list|name|give me|give|show me|show) (?:me )?(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i))) {
      if (!out.length) { out.length = NUM_WORD[m[1].toLowerCase()] || parseInt(m[1], 10); out.unit = out.unit || "items"; }
      if (out.format === "prose" && out.length > 1) out.format = "bullets";
    }
    if (/\b(?:only|just) the (?:number|answer|value|result|name|word)\b/i.test(norm) ||
        /\b(?:answer|respond|reply) (?:with|in) (?:a |one |just )?(?:single word|one word|a number|the number)\b/i.test(norm) ||
        /\bnumber only\b/i.test(norm) || /\bone word\b/i.test(norm)) {
      out.onlyValue = true; out.format = "value";
    }
    if (/\b(?:briefly|in brief|short(?:ly)?|concise(?:ly)?|tl;?dr|quick(?:ly)?)\b/i.test(norm)) out.tone = "brief";
    if (/\b(?:in detail|detailed|thorough(?:ly)?|at length|deep dive)\b/i.test(norm)) out.tone = "detailed";
    if (/\b(?:like i'?m (?:five|5)|simple terms|simply|eli5|for a beginner|layman)\b/i.test(norm)) out.tone = "simple";
    if (/\bstep[ -]by[ -]step\b/i.test(norm)) out.tone = "steps";
    return out;
  }

  /* ------------------------------------------------------ frame extraction */

  function titleSpans(raw) {
    /* Capitalised runs that are not sentence-initial function words, plus
       quoted spans. Generic proper-noun detection, no entity list. */
    var out = [], m;
    var qre = /"([^"]{2,80})"/g;
    while ((m = qre.exec(raw))) out.push(m[1]);
    var tokens = normalizeUnicode(raw).split(/\s+/);
    var run = [];
    for (var i = 0; i < tokens.length; i++) {
      var w = tokens[i].replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
      var isCap = /^[A-Z][a-z'’-]+$|^[A-Z]{2,}$/.test(w);
      var isJoin = run.length && /^(?:of|the|and|de|van|von|da|di|del)$/i.test(w);
      /* A sentence-initial capital is only orthography. "Compare" opening a
         command is not a proper noun, so intent words never seed a span. */
      var lowW = w.toLowerCase();
      if (isCap && !(i === 0 && (STOP[lowW] || INTENT_WORDS[lowW] ||
          /^(?:tell|show|give|make|build|write|find|summar|translate|generate|name|help)/.test(lowW)))) run.push(w);
      else if (isJoin) run.push(w);
      else { if (run.length) { out.push(run.join(" ").replace(/\s+(?:of|the|and)$/i, "")); run = []; } }
    }
    if (run.length) out.push(run.join(" ").replace(/\s+(?:of|the|and)$/i, ""));
    return out.filter(function (s) { return s && s.length > 1; });
  }

  var LEAD_STRIP = [
    /^(?:ok(?:ay)?|so|well|right|alright|anyway|anyways|actually|but|and|hey|hi|hello|yo|um|uh|hmm+|please|pls)\b[\s,.:;-]*/i,
    /^(?:i (?:was )?(?:wonder(?:ing)?|want(?:ed)? to know|would like to know|need to know)|could you (?:please )?|can you (?:please )?|would you (?:please )?|do you know|tell me|let me know)\b[\s,:-]*/i
  ];

  /* Question stems mapped to a query form. Ordered: the first match wins. */
  var FORMS = [
    { f: "compute",  re: /^(?:what (?:is|'s|s)\s*)?[-+(]?\s*\d[\d\s.,]*(?:[-+*\/^%]|\bx\b|\btimes\b|\bplus\b|\bminus\b|\bdivided\b|\bmod\b)/i },
    { f: "compute",  re: /\b(?:calculate|compute|evaluate|solve|convert|how much is|what'?s? \d)\b/i },
    { f: "whatis",   re: /^what(?:'s|’s|s| is| are| was| were)\b/i },
    { f: "whatis",   re: /^(?:define|definition of|meaning of|describe)\b/i },
    { f: "whois",    re: /^who(?:'s|’s|s| is| are| was| were)\b/i },
    { f: "whodid",   re: /^who\b/i },
    { f: "why",      re: /^why\b/i },
    { f: "how",      re: /^how (?:do|does|did|can|could|would|should|to)\b/i },
    { f: "howmany",  re: /^how (?:many|much|long|far|tall|big|old|fast|wide|deep)\b/i },
    { f: "when",     re: /^when\b/i },
    { f: "where",    re: /^where\b/i },
    { f: "which",    re: /^which\b/i },
    { f: "yesno",    re: /^(?:is|are|was|were|do|does|did|can|could|should|would|will|has|have|had|may|might)\b/i },
    { f: "command",  re: /^(?:explain|compare|list|name|show|give|tell|write|make|create|build|summar(?:ise|ize)|translate|find|generate)\b/i },
    { f: "topic",    re: /^(?:tell me about|about|info on|information about)\b/i }
  ];

  function detectForm(norm) {
    for (var i = 0; i < FORMS.length; i++) if (FORMS[i].re.test(norm)) return FORMS[i].f;
    if (/\?\s*$/.test(norm)) return "question";
    return "statement";
  }

  /* The subject/relation extractor. It works on a normalized clause and
     recognises the three productive English shapes for a relational question
     plus the bare-topic shape -- not one branch per phrasing. */
  var STEM_RE = new RegExp("^(?:" + [
    "what(?:'s| is| are| was| were)", "whats", "which", "who(?:'s| is| are| was| were)", "whos",
    "when (?:is|was|were|did|does|do)", "where (?:is|are|was|were)",
    "how (?:many|much|tall|long|far|fast|big|old|wide|deep)",
    "tell me about", "tell me", "talk about", "explain", "define", "describe",
    "definition of", "meaning of", "info on", "information about", "give me", "about",
    "what does", "what do", "what did",
    "show me", "list", "name", "compare", "summar(?:ise|ize)", "what do you know about",
    "do you know"
  ].join("|") + ")\\b\\s*", "i");

  /* A trailing "mean", "means" or "do" belongs to the question frame, not to
     the topic: "what does generative AI mean" is about generative AI. */
  var QUESTION_TAIL = /\s+(?:mean|means|meaning|stand for|do|does|did|refer to|about)\s*[?.!]*\s*$/i;
  function stripStem(s) {
    var out = String(s);
    var prev;
    do { prev = out; out = out.replace(STEM_RE, "").trim(); } while (out !== prev && out);
    out = out.replace(QUESTION_TAIL, "").trim();
    return out.replace(/^(?:the|a|an)\s+/i, "").trim();
  }

  function extractRelational(norm) {
    /* Returns {subject, relation, relationPhrase, shape} or null. */
    var s = normalizeUnicode(norm).replace(/[?!.]+\s*$/, "").trim();
    var m;

    /* SHAPE 1: "<REL> of <SUBJ>"  ("the capital of France", "author of Hamlet") */
    m = s.match(/^(?:what|which|who|whose)?\s*(?:is|are|was|were)?\s*(?:the|a|an)?\s*([a-z][\w' -]{1,40}?)\s+(?:of|for|in|to)\s+(?:the\s+)?(.{2,80})$/i);
    if (m) {
      var rel1 = relationForHead(m[1]);
      if (rel1) return { subject: cleanEntity(m[2]), relation: rel1, relationPhrase: m[1].trim(), shape: "rel-of-subj" };
    }
    /* Same shape but with a leading noun classifier: "which city is the
       capital of France", "what country is Paris in". */
    m = s.match(/^(?:what|which|who)\s+[\w-]+\s+(?:is|are|was|were)\s+(?:the|a|an)?\s*([a-z][\w' -]{1,40}?)\s+(?:of|for|in)\s+(?:the\s+)?(.{2,80})$/i);
    if (m) {
      var rel1b = relationForHead(m[1]);
      if (rel1b) return { subject: cleanEntity(m[2]), relation: rel1b, relationPhrase: m[1].trim(), shape: "class-rel-of-subj" };
    }

    /* SHAPE 2: "<SUBJ>'s <REL>"  ("France's capital", "Einstein's birthday") */
    m = s.match(/(?:^|\b)([\w' .-]{2,60}?)['’]s\s+([a-z][\w -]{1,40}?)\s*(?:\?|$|is|are|was|were)/i);
    if (m) {
      var rel2 = relationForHead(m[2]);
      if (rel2) return { subject: cleanEntity(m[1]), relation: rel2, relationPhrase: m[2].trim(), shape: "subj-poss-rel" };
    }

    /* SHAPE 3: verb-headed relation.  "who wrote Hamlet", "when was X born",
       "who invented the telephone", "what is X used for" */
    m = s.match(/^(?:who|what|which)\s+(?:is|are|was|were)\s+(.{2,70}?)\s+(used for|for|made of|made from|known for)\s*\??$/i);
    if (m) return { subject: cleanEntity(m[1]), relation: /made/.test(m[2]) ? "part" : "purpose",
                    relationPhrase: m[2], shape: "subj-verb-rel" };
    m = s.match(/^(?:who|what)\s+([a-z]+(?:ed|es|s|e)?)\s+(?:the\s+)?(.{2,70})$/i);
    if (m) {
      var rel3 = relationForVerb(m[1]);
      if (rel3) return { subject: cleanEntity(m[2]), relation: rel3, relationPhrase: m[1], shape: "who-verb-subj" };
    }
    m = s.match(/^when\s+(?:was|were|did)\s+(.{2,70}?)\s+(born|die|died|founded|created|invented|published|released|built)\s*\??$/i);
    if (m) {
      var v = m[2].toLowerCase();
      return { subject: cleanEntity(m[1]),
               relation: v === "born" ? "birth" : (v === "die" || v === "died") ? "death" : "time",
               relationPhrase: v, shape: "when-subj-verb" };
    }
    m = s.match(/^where\s+(?:is|are|was|were)\s+(.{2,70}?)\s*(?:located|situated|found)?\s*\??$/i);
    if (m) return { subject: cleanEntity(m[1]), relation: "location", relationPhrase: "location", shape: "where-subj" };
    m = s.match(/^how\s+(tall|long|far|fast|big|old|wide|deep|heavy|many|much)\s+(?:is|are|was|were|does|do)\s+(.{2,70}?)\s*\??$/i);
    if (m) {
      var hm = { tall: "height", long: "length", far: "distance", fast: "speed", big: "size",
                 old: "birth", wide: "size", deep: "size", heavy: "size", many: "count", much: "count" };
      return { subject: cleanEntity(m[2]), relation: hm[m[1].toLowerCase()] || "size",
               relationPhrase: m[1], shape: "how-adj-subj" };
    }
    /* "how many bones are in the human body", "how many continents are there" */
    m = s.match(/^how\s+(?:many|much)\s+([\w\s-]{2,30}?)\s+(?:are|is|does|do|did)\s+(?:there\s+)?(?:in|on|inside|within)\s+(.{2,60})$/i);
    if (m) return { subject: cleanEntity(m[2]), relation: "count", relationPhrase: m[1], shape: "howmany-in-subj" };
    m = s.match(/^how\s+(?:many|much)\s+([\w\s-]{2,30}?)\s+(?:are|is)\s+there\s*\??$/i);
    if (m) return { subject: cleanEntity(m[1]), relation: "count", relationPhrase: m[1], shape: "howmany-there" };

    /* "what language do they speak in Brazil" / "what currency do they use in Japan" */
    m = s.match(/^what\s+([a-z]+)\s+(?:do|does|did)\s+(?:they|you|people|we)?\s*(?:speak|use|call)\s*(?:in|for)?\s*(.{2,60})$/i);
    if (m) {
      var rel4 = relationForHead(m[1]);
      if (rel4) return { subject: cleanEntity(m[2]), relation: rel4, relationPhrase: m[1], shape: "what-rel-verb-subj" };
    }
    /* SHAPE 4: bare relational fragment. "capital France", "France capital",
       "gold chemical symbol" -- a relation head word beside a noun phrase,
       with no syntax at all. Search boxes produce these constantly and they
       are the same proposition, so they resolve the same way. */
    var toks = words(s);
    if (toks.length >= 2 && toks.length <= 6) {
      for (var w = Math.min(3, toks.length - 1); w >= 1; w--) {
        for (var i2 = 0; i2 + w <= toks.length; i2++) {
          var head = toks.slice(i2, i2 + w).join(" ");
          var relB = RELATION_BY_HEAD[flatten(head)];
          if (!relB) continue;
          var rest = toks.slice(0, i2).concat(toks.slice(i2 + w))
            .filter(function (t) { return !STOP[t] && !INTENT_WORDS[t]; }).join(" ");
          if (rest && rest.length > 1 && looksLikeEntity(rest, s)) {
            return { subject: cleanEntity(rest), relation: relB, relationPhrase: head, shape: "bare-rel-subj" };
          }
        }
      }
    }
    return null;
  }

  function cleanEntity(s) {
    return normalizeUnicode(s)
      /* A coordinated second question is not part of the first one's
         subject. Cut at the conjunction that introduces it. */
      .replace(/\s+(?:and|or|but)\s+(?:why|how|what|when|where|which|who|is|are|does|do|did|can)\b[\s\S]*$/i, "")
      .replace(/\s*[,;]\s+(?:why|how|what|when|where|which|who)\b[\s\S]*$/i, "")
      .replace(/[?!.,;:]+\s*$/, "")
      .replace(/^(?:the|a|an)\s+/i, "")
      .replace(/\s+(?:is|are|was|were|do|does|did)\s*$/i, "")
      .trim();
  }

  function ngrams(toks, n) {
    var out = [];
    for (var i = 0; i + n <= toks.length; i++) out.push(toks.slice(i, i + n).join(" "));
    return out;
  }

  /* Preamble removal, not request selection.
   *
   * A message may open with politeness -- "I've been wondering about
   * something and would appreciate your help:" -- and that clause carries no
   * content. Everything else is kept exactly as written, because a premise
   * ("an $80 item is discounted by 25%") looks like preamble to a scorer and
   * is the whole question to a reader. Only clauses that are recognisably
   * about the act of asking are dropped, and never one containing a number.
   */
  var POLITE_CLAUSE = new RegExp("^(?:" + [
    "i(?:'ve| have| am|'m)?\\s+(?:been\\s+)?(?:wonder\\w*|curious|thinking|hoping|meaning to ask)\\b[^0-9]*",
    "(?:i|we)\\s+(?:would|'d|will|'ll)\\s+(?:really\\s+)?(?:appreciate|like|love)\\b[^0-9]*",
    "(?:i|we)\\s+(?:have|'ve|had)\\s+a\\s+(?:quick\\s+)?question\\b[^0-9]*",
    "(?:quick|one|another)\\s+question\\b[^0-9]*",
    "(?:sorry|apologies)\\b[^0-9]*",
    "(?:just|so)\\s+(?:curious|wondering)\\b[^0-9]*",
    "(?:hi|hey|hello|yo|good (?:morning|afternoon|evening))\\b[^0-9]*"
  ].join("|") + ")$", "i");

  function extractRequest(text) {
    var t = String(text).trim();
    if (!t) return t;
    var parts = t.split(/(?<=[.:;?!])\s+|\s*:\s+/).map(function (x) { return x.trim(); })
                 .filter(function (x) { return x.length > 0; });
    if (parts.length < 2) return t;
    var i = 0;
    while (i < parts.length - 1) {
      var clause = parts[i].replace(/[.:;?!,]+$/, "").trim();
      if (/\d/.test(clause)) break;
      if (!POLITE_CLAUSE.test(clause)) break;
      i++;
    }
    if (i === 0) return t;
    return parts.slice(i).join(" ").trim() || t;
  }

  /* ------------------------------------------------------------ the frame */

  var frameCache = Object.create(null);
  var frameCacheKeys = [];

  function build(rawText, context) {
    var raw = String(rawText == null ? "" : rawText);
    var norm = normalizeUnicode(raw);
    var lower = norm.toLowerCase();

    /* Repair before anything reads the tokens, so every consumer sees the
       same repaired sequence. The raw text is kept for echoing back. */
    var rawToks = words(norm);
    var rawSurface = normalizeUnicode(norm).match(WORD_RE) || [];
    var repaired = rawToks.map(function (t, i) {
      var surf = rawSurface[i] || t;
      /* Mid-sentence capitalisation marks a name; names are spelled by their
         owners, not by this lexicon. */
      var proper = /^[A-Z]/.test(surf) && i > 0;
      return repairWord(t, proper);
    });
    var repairedText = norm;
    if (!normalizationOn) repaired = rawToks;
    if (repaired.join(" ") !== rawToks.join(" ")) {
      var k = 0;
      repairedText = norm.replace(WORD_RE, function (w) {
        var r = repaired[k++];
        if (r === undefined) return w;
        if (/^[A-Z]/.test(w)) return r.charAt(0).toUpperCase() + r.slice(1);
        return r;
      });
    }
    var normLower = repairedText.toLowerCase();

    var shiftMatch = SHIFT_MARKERS.some(function (re) { return re.test(norm); });
    var body = repairedText;
    /* The stripped lead is discourse information, not noise: "and Germany?"
       is a continuation of the previous question, and the consumer that
       resolves context needs to know the "and" was there. */
    var leadMarker = "";
    var leadHit = repairedText.match(/^\s*(ok(?:ay)?|so|well|right|alright|anyway|anyways|actually|but|and|hey|hi|hello|yo|um|uh|hmm+|please|pls)\b/i);
    if (leadHit) leadMarker = leadHit[1].toLowerCase();
    LEAD_STRIP.forEach(function (re) { body = body.replace(re, ""); });
    body = body.replace(/^\s*(?:anyway|anyways|actually|never ?mind|forget (?:it|that)|moving on|on another note)\b[\s,.:;-]*/i, "").trim();
    if (!body) body = repairedText;

    var tokens = words(body);
    var stems = tokens.map(stem);
    var content = [], contentStems = [];
    for (var i = 0; i < tokens.length; i++) {
      if (!STOP[tokens[i]] && !INTENT_WORDS[tokens[i]] && tokens[i].length > 1) {
        content.push(tokens[i]); contentStems.push(stems[i]);
      }
    }

    /* The format request is metadata about the answer, not part of the
       subject. Strip it once, here, so no consumer has to know that
       "...in exactly three bullets" is not a topic. */
    var FORMAT_TAIL = /(?:,?\s*(?:and\s+)?(?:please\s+)?(?:in|using|with|as|under|within|no more than|at most)\s+(?:exactly\s+|about\s+|roughly\s+|just\s+|only\s+)?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)?\s*(?:bullet points?|bullets?|sentences?|words?|lines?|paragraphs?|points?|items?|a bulleted list|a list|list form|short example|one short example|simple terms|plain english)\s*[.?!]?\s*$)/i;
    var SHORTNESS_TAIL = /(?:,?\s*(?:please\s+)?(?:briefly|in brief|concisely|in detail|step by step|step-by-step)\s*[.?!]?\s*$)/i;
    /* A message can carry preamble before the actual request: a colon, a
       lead-in sentence, or an aside. The request is the clause that asks for
       something; the rest is politeness. Picking it here means no consumer
       has to know about preambles. */
    if (normalizationOn) body = extractRequest(body);
    var semantic = normalizationOn ?
      (body.replace(FORMAT_TAIL, "").replace(SHORTNESS_TAIL, "").trim() || body) : body;
    semantic = semantic.replace(/^\s*(?:give me |show me |tell me )?only the (?:number|answer|value|name|word)\s*[:,-]?\s*/i, "").trim() || semantic;
    semantic = semantic.replace(/^\s*answer (?:with|in) (?:a |one |just )?(?:single word|one word|a number|the number)\s*[:,-]?\s*/i, "").trim() || semantic;

    var form = detectForm(body);
    var rel = extractRelational(semantic);
    var titles = titleSpans(semantic);
    var fmt = normalizationOn ? parseFormat(normLower) :
      { format: "prose", length: 0, unit: "", tone: "", onlyValue: false };

    var hasQ = /\?\s*$/.test(norm);
    /* A social opener is a greeting only when it IS the message. "hey" is a
       greeting; "hey, could you tell me what the capital of France is" is a
       question with a greeting attached, and the question is the point. The
       test therefore runs against what survives the lead strip, not against
       the raw text. */
    var ASKING_FORMS = { whatis: 1, whois: 1, whodid: 1, why: 1, how: 1, howmany: 1,
                         when: 1, where: 1, which: 1, yesno: 1, command: 1, topic: 1, compute: 1 };
    var socialOnly = content.length <= 2 && !hasQ && !rel && !ASKING_FORMS[form];
    var bodyLower = body.toLowerCase();
    var greeting = GREETING.some(function (re) { return re.test(normLower); }) &&
                   (socialOnly || GREETING.some(function (re) { return re.test(bodyLower); }) && content.length <= 2);
    var thanks = THANKS.some(function (re) { return re.test(normLower); }) && tokens.length <= 8 && socialOnly;
    var ack = ACK.some(function (re) { return re.test(normLower); }) && tokens.length <= 8 && socialOnly;
    var metaSelf = META_SELF.some(function (re) { return re.test(normLower); });

    var pronouns = tokens.filter(function (t) { return PRONOUNS.indexOf(t) >= 0; });
    var contMarker = CONT_MARKERS.some(function (w) {
      return w.indexOf(" ") >= 0 ? normLower.indexOf(w) >= 0 : tokens.indexOf(w) >= 0;
    });

    var requiresComparison = COMPARE_MARKERS.some(function (re) { return re.test(normLower); });
    var requiresList = fmt.format === "bullets" || LIST_MARKERS.some(function (re) { return re.test(normLower); });
    var requiresExplanation = EXPLAIN_MARKERS.some(function (re) { return re.test(normLower); });
    var codeLangHit = tokens.some(function (t) { return CODE_LANGS.indexOf(t) >= 0; });
    var codeAsk = CODE_MARKERS.some(function (re) { return re.test(normLower); });
    var hasCodeBody = /[{};]\s|\bdef \b|\bfunction\b|=>|\bconst \b|\blet \b|\bvar \b|\bselect\b.*\bfrom\b|\bwhile\b.*:|\bfor\b.*\(/i.test(norm);

    var freshHits = FRESH_PHRASES.filter(function (re) { return re.test(normLower); }).length;
    var volatile_ = tokens.some(function (t) { return VOLATILE_NOUNS.indexOf(stem(t)) >= 0; });
    var requiresFresh = (freshHits > 0 && (volatile_ || /\b(?:version|release|news|price|weather|score|rate)\b/.test(normLower))) ||
                        (freshHits > 0 && /\b(?:what|which|how much|how many)\b/.test(normLower) && volatile_);
    if (/\bwhat (?:time|day|date) is it\b/.test(normLower) || /\btoday'?s date\b/.test(normLower)) requiresFresh = false;

    var NUM_WORD_RE = /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand|million)\b/i;
    var arith = (/\d/.test(body) || NUM_WORD_RE.test(body)) &&
      (/[-+*\/^%]|\b(?:plus|minus|times|divided|multiplied|squared|cubed|percent|%|of)\b/i.test(body) ||
       /\bhow (?:much|many)\b/i.test(body) || /\bconvert\b/i.test(body));

    var frame = {
      rawText: raw,
      normalizedText: repairedText,
      body: body,
      lower: normLower,
      flat: flatten(body),
      tokens: tokens,
      stems: stems,
      contentTokens: content,
      contentStems: contentStems,
      phrases: ngrams(tokens, 2).concat(ngrams(tokens, 3)),
      contentPhrases: ngrams(content, 2).concat(ngrams(content, 3)),
      queryForm: form,
      leadMarker: leadMarker,
      hasQuestionMark: hasQ,
      speechAct: greeting ? "greeting" : thanks ? "thanks" : ack ? "acknowledgement" :
                 metaSelf ? "meta" :
                 (form === "command" ? "command" :
                  (hasQ || form !== "statement") ? "question" : "statement"),
      metaSelf: metaSelf,
      subject: rel ? rel.subject : "",
      relation: rel ? rel.relation : "",
      relationPhrase: rel ? rel.relationPhrase : "",
      relationShape: rel ? rel.shape : "",
      topic: stripStem(semantic).replace(/[?!.]+\s*$/, "").trim(),
      semanticText: semantic,
      entities: titles,
      subjectCandidates: [],
      requestedFormat: fmt.format,
      requestedLength: fmt.length,
      requestedUnit: fmt.unit,
      requestedTone: fmt.tone,
      onlyValue: fmt.onlyValue,
      requiresComparison: requiresComparison,
      requiresList: requiresList,
      requiresExplanation: requiresExplanation,
      requiresComputation: arith || form === "compute",
      requiresCode: codeAsk || (codeLangHit && (form === "command" || hasCodeBody)) || hasCodeBody,
      codeLanguageHint: tokens.filter(function (t) { return CODE_LANGS.indexOf(t) >= 0; })[0] || "",
      requiresFreshInformation: requiresFresh,
      temporalScope: requiresFresh ? "current" : (/\b(?:in|during|by) (?:1[0-9]{3}|20[0-9]{2})\b/.test(normLower) ? "historical" : "timeless"),
      /* A "who" anywhere in the message means a person is wanted, whatever
         position the interrogative ended up in after a polite wrapper. */
      wantsPerson: /\bwho(?:'s|se|m)?\b/i.test(normLower) ||
                   /\b(?:person|people|man|woman|author|writer|inventor|founder|creator|president|painter|composer|scientist)\b/i.test(normLower),
      pronouns: pronouns,
      continuationMarkers: contMarker,
      topicShift: shiftMatch,
      requiresDialogueContext: (pronouns.length > 0 && content.length <= 4) || contMarker ||
                               (tokens.length <= 4 && form !== "whatis" && form !== "whois" && !titles.length),
      safetyClass: SAFETY.some(function (re) { return re.test(normLower); }) ? "sensitive" : "ok",
      language: "en",
      empty: tokens.length === 0,
      wordCount: tokens.length
    };

    /* Subject candidates, most specific first. Consumers pick by confidence
       rather than re-deriving a subject of their own. */
    var cands = [];
    function pushCand(v, w, why) {
      v = cleanEntity(v);
      if (!v || v.length < 2) return;
      var f = flatten(v);
      if (!f) return;
      for (var j = 0; j < cands.length; j++) if (cands[j].flat === f) { cands[j].weight = Math.max(cands[j].weight, w); return; }
      cands.push({ text: v, flat: f, weight: w, from: why });
    }
    if (frame.subject) pushCand(frame.subject, 1.0, "relation");
    titles.forEach(function (t) { pushCand(t, 0.8, "proper-noun"); });
    if (frame.topic) pushCand(frame.topic, 0.7, "topic");
    if (content.length) pushCand(content.join(" "), 0.4, "content");
    /* Longest contiguous content n-grams give the KB something to match when
       the topic phrase carries extra words. */
    for (var n = Math.min(4, content.length); n >= 1; n--) {
      ngrams(content, n).forEach(function (g) { pushCand(g, 0.3 + n * 0.05, "ngram" + n); });
    }
    cands.sort(function (a, b) { return b.weight - a.weight; });
    /* Single content words are the likeliest entity names and were being
       truncated away by longer, noisier n-grams. Keep the whole ranked list
       (it is bounded by the message length anyway). */
    frame.subjectCandidates = cands.slice(0, 28);

    /* Comparison operands: "X vs Y", "difference between X and Y",
       "compare X and Y". One extractor, all three shapes. */
    frame.comparands = [];
    if (requiresComparison) {
      var cm = semantic.match(/\b(?:between|compare|comparing)\s+(.{1,60}?)\s+(?:and|with|to|versus|vs\.?)\s+(.{1,60}?)\s*[?.!]?$/i) ||
               semantic.match(/^(.{1,60}?)\s+(?:versus|vs\.?)\s+(.{1,60}?)\s*[?.!]?$/i) ||
               semantic.match(/\bhow (?:do|does)\s+(.{1,60}?)\s+and\s+(.{1,60}?)\s+differ/i) ||
               semantic.match(/\bdifference between\s+(.{1,60}?)\s+and\s+(.{1,60}?)\s*[?.!]?$/i);
      if (!cm) {
        /* "compare TCP UDP", "difference between mass weight": a coordinator
           is normal English but not required to name two things. */
        var after = semantic.replace(/^.*?\b(?:compare|comparing|between|versus|vs\.?)\s+/i, "");
        var ct = words(after).filter(function (w) { return !STOP[w] && !INTENT_WORDS[w]; });
        if (ct.length === 2) cm = [null, ct[0], ct[1]];
      }
      if (cm) frame.comparands = [cleanEntity(cm[1]), cleanEntity(cm[2])];
      if (frame.comparands.length === 2) {
        frame.comparands = frame.comparands.map(function (c) {
          return c.replace(/^(?:the )?difference between /i, "").replace(/\b(?:storage|learning|databases?|protocols?)$/i, function (m0) { return m0; }).trim();
        });
      }
    }

    frame.requiresReasoning = !!(
      /\b(?:if|then|therefore|all|every|some|no|none|each)\b/.test(normLower) &&
      /\b(?:are|is|can|does|do|would|will|who|which|what)\b/.test(normLower) && frame.wordCount >= 6
    ) || /\bcomes? next\b/.test(normLower) || /\bsequence\b/.test(normLower) ||
      /\b(?:older|younger|taller|shorter|bigger|smaller|faster|slower|heavier|lighter)\s+than\b/.test(normLower);

    frame.requiresWeb = requiresFresh;
    frame.requiresExplanation = requiresExplanation;

    /* Ambiguity: a one-word subject with no qualifier and no dialogue anchor
       is where senses collide. Recorded, not acted on -- the router decides. */
    frame.ambiguity = 0;
    if (frame.subjectCandidates.length && !frame.relation) {
      var top = frame.subjectCandidates[0];
      if (top.flat.split(" ").length === 1 && !requiresComparison && !frame.requiresComputation) {
        frame.ambiguity = 0.5;
      }
    }

    frame.confidence = 0.5 +
      (frame.relation ? 0.25 : 0) +
      (titles.length ? 0.1 : 0) +
      (frame.queryForm !== "statement" && frame.queryForm !== "question" ? 0.1 : 0) -
      (frame.empty ? 0.5 : 0) -
      (frame.requiresDialogueContext && !(context && context.subject) ? 0.15 : 0);
    if (frame.confidence > 1) frame.confidence = 1;
    if (frame.confidence < 0) frame.confidence = 0;

    frame.searchQueries = [];      /* filled by the decomposer, not here */
    frame.knownContext = context || null;

    return frame;
  }

  /* Ablation switch: with normalisation off the frame sees the raw text --
     no spell repair, no preamble removal, no format parsing. This measures
     what the shared normalisation layer is worth. */
  var normalizationOn = true;
  function setNormalization(on) { normalizationOn = on !== false; frameCache = Object.create(null); frameCacheKeys = []; }

  function parse(rawText, context) {
    var ctxKey = context ? ((context.subject || "") + "|" + (context.entity || "") + "|" + (context.turn || 0)) : "";
    var key = ctxKey + "\u0000" + String(rawText);
    var hit = frameCache[key];
    if (hit) return hit;
    var f = build(rawText, context);
    frameCache[key] = f;
    frameCacheKeys.push(key);
    if (frameCacheKeys.length > 400) delete frameCache[frameCacheKeys.shift()];
    return f;
  }

  root.C4LMCore = {
    parse: parse,
    normalizeUnicode: normalizeUnicode,
    flatten: flatten,
    words: words,
    indexTokens: indexTokens,
    stem: stem,
    damerau: damerau,
    repairWord: repairWord,
    knownWord: knownWord,
    learnVocabulary: learnVocabulary,
    learnWord: learnWord,
    learnProper: learnProper,
    relationForHead: relationForHead,
    setEntityOracle: setEntityOracle,
    setNormalization: setNormalization,
    relationForVerb: relationForVerb,
    relations: RELATIONS,
    cleanEntity: cleanEntity,
    stripStem: stripStem,
    parseFormat: parseFormat,
    STOP: STOP,
    ngrams: ngrams,
    _clearCache: function () { frameCache = Object.create(null); frameCacheKeys = []; }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.C4LMCore;
})(typeof window !== "undefined" ? window : globalThis);
