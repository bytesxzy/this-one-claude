/* CELL4 reasoning graph.
 *
 * Questions that can be DERIVED are derived here, from a compact typed graph
 * -- ENTITY, QUANTITY, SET, ORDER, CLAIM, OPERATION, INFERENCE -- rather than
 * from retrieved prose or from a long English "chain of thought". A trace is
 * a handful of nodes, so the whole derivation costs microseconds and the
 * result is checkable.
 *
 * Deterministic, local, no network.
 */
(function (root) {
  "use strict";

  var C = root.C4LMCore;

  function node(type, fields) { var n = { t: type }; for (var k in fields) n[k] = fields[k]; return n; }

  /* ===================================================== arithmetic engine */

  var NUM_WORDS = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
    nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
    sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30,
    forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
    hundred: 100, thousand: 1000, million: 1e6, billion: 1e9
  };

  /* Turn the spoken forms of operators into symbols so one parser handles
     a symbolic form, a spelled-out form and a mixed one all reach the
     same parser. */
  function arithmeticize(s) {
    var t = " " + String(s).toLowerCase() + " ";
    t = t.replace(/[,](?=\d{3}\b)/g, "");
    t = t.replace(/\bto the power of\b/g, " ^ ")
         .replace(/\braised to\b/g, " ^ ")
         .replace(/\bsquared\b/g, " ^ 2 ")
         .replace(/\bcubed\b/g, " ^ 3 ")
         .replace(/\bmultiplied by\b/g, " * ")
         .replace(/\bdivided by\b/g, " / ")
         .replace(/\btimes\b/g, " * ")
         .replace(/\bplus\b/g, " + ")
         .replace(/\badded to\b/g, " + ")
         .replace(/\bminus\b/g, " - ")
         .replace(/\bsubtract(?:ed)?(?: from)?\b/g, " - ")
         .replace(/\bmodulo\b|\bmod\b/g, " % ")
         .replace(/\bover\b/g, " / ")
         .replace(/(\d)\s*x\s*(\d)/g, "$1 * $2")
         .replace(/\bsquare root of\b/g, " sqrt ");
    Object.keys(NUM_WORDS).forEach(function (w) {
      t = t.replace(new RegExp("\\b" + w + "\\b", "g"), " " + NUM_WORDS[w] + " ");
    });
    return t.replace(/\s+/g, " ").trim();
  }

  /* A shunting-yard evaluator. No eval, no Function constructor: the
     expression is tokenised and reduced, so nothing in a user message can
     execute. */
  function evaluateExpression(src) {
    var text = arithmeticize(src);
    var m = text.match(/(?:sqrt\s*)?[-+]?(?:\d+\.?\d*|\.\d+)(?:\s*(?:[-+*\/^%]|sqrt)\s*(?:sqrt\s*)?[-+]?(?:\d+\.?\d*|\.\d+|\())*/);
    /* Extract the longest arithmetic-looking span, brackets included. */
    var span = "", best = "";
    var re = /[-+]?[\d().\s+\-*\/^%]*\d[\d().\s+\-*\/^%]*/g, mm;
    while ((mm = re.exec(text))) { if (mm[0].replace(/\s/g, "").length > best.replace(/\s/g, "").length) best = mm[0]; }
    span = (best || "").trim().replace(/[-+*\/^%.\s]+$/, "").replace(/^[*\/^%\s]+/, "");
    if (!span || !/\d/.test(span)) return null;
    if (!/[-+*\/^%]/.test(span)) return null;         /* a bare number is not a calculation */

    var toks = span.match(/\d+\.?\d*|\.\d+|[-+*\/^%()]/g);
    if (!toks) return null;
    var prec = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2, "^": 3 };
    var out = [], ops = [], prevType = "start";
    for (var i = 0; i < toks.length; i++) {
      var tk = toks[i];
      if (/^[\d.]/.test(tk)) { out.push(parseFloat(tk)); prevType = "num"; continue; }
      if (tk === "(") { ops.push(tk); prevType = "op"; continue; }
      if (tk === ")") {
        while (ops.length && ops[ops.length - 1] !== "(") out.push(ops.pop());
        if (!ops.length) return null;
        ops.pop(); prevType = "num"; continue;
      }
      if ((tk === "-" || tk === "+") && prevType !== "num") {
        /* unary sign */
        if (i + 1 < toks.length && /^[\d.]/.test(toks[i + 1])) {
          out.push((tk === "-" ? -1 : 1) * parseFloat(toks[i + 1]));
          i++; prevType = "num"; continue;
        }
        return null;
      }
      while (ops.length && ops[ops.length - 1] !== "(" &&
             (prec[ops[ops.length - 1]] > prec[tk] ||
              (prec[ops[ops.length - 1]] === prec[tk] && tk !== "^"))) out.push(ops.pop());
      ops.push(tk); prevType = "op";
    }
    while (ops.length) { var o = ops.pop(); if (o === "(") return null; out.push(o); }

    var st = [];
    for (var j = 0; j < out.length; j++) {
      var v = out[j];
      if (typeof v === "number") { st.push(v); continue; }
      if (st.length < 2) return null;
      var b = st.pop(), a = st.pop();
      switch (v) {
        case "+": st.push(a + b); break;
        case "-": st.push(a - b); break;
        case "*": st.push(a * b); break;
        case "/": if (b === 0) return { error: "division by zero" }; st.push(a / b); break;
        case "%": st.push(a % b); break;
        case "^": st.push(Math.pow(a, b)); break;
        default: return null;
      }
    }
    if (st.length !== 1 || !isFinite(st[0])) return null;
    return { value: st[0], expression: span.replace(/\s+/g, " ").trim() };
  }

  function fmtNumber(n) {
    if (!isFinite(n)) return String(n);
    var r = Math.round(n * 1e6) / 1e6;
    if (Math.abs(r) >= 1e15) return String(r);
    /* Digit grouping helps read a large magnitude and gets in the way of a
       small one, where the exact digits are the answer. */
    if (Number.isInteger(r)) return Math.abs(r) >= 100000 ? r.toLocaleString("en-US") : String(r);
    return String(parseFloat(r.toFixed(4)));
  }

  /* ------------------------------------------------------ word problems */

  var UNITS = {
    length: { m: 1, metre: 1, meter: 1, metres: 1, meters: 1, km: 1000, kilometre: 1000, kilometer: 1000,
      kilometres: 1000, kilometers: 1000, cm: 0.01, centimetre: 0.01, centimeter: 0.01, centimetres: 0.01,
      centimeters: 0.01, mm: 0.001, mile: 1609.344, miles: 1609.344, mi: 1609.344,
      foot: 0.3048, feet: 0.3048, ft: 0.3048, inch: 0.0254, inches: 0.0254, in: 0.0254,
      yard: 0.9144, yards: 0.9144 },
    mass: { g: 1, gram: 1, grams: 1, kg: 1000, kilogram: 1000, kilograms: 1000, kilo: 1000,
      pound: 453.592, pounds: 453.592, lb: 453.592, lbs: 453.592, ounce: 28.3495, ounces: 28.3495, oz: 28.3495,
      tonne: 1e6, tonnes: 1e6, ton: 907185 },
    time: { second: 1, seconds: 1, sec: 1, secs: 1, s: 1, minute: 60, minutes: 60, min: 60, mins: 60,
      hour: 3600, hours: 3600, hr: 3600, hrs: 3600, h: 3600, day: 86400, days: 86400,
      week: 604800, weeks: 604800, year: 31557600, years: 31557600 },
    volume: { litre: 1, liter: 1, litres: 1, liters: 1, l: 1, ml: 0.001, millilitre: 0.001, milliliter: 0.001,
      gallon: 3.78541, gallons: 3.78541, pint: 0.473176, pints: 0.473176, cup: 0.236588, cups: 0.236588 }
  };
  /* Unit names are vocabulary. Without registering them, the spell repair
     sees "miles" as an unknown word one edit from "files". */
  (function registerUnits() {
    if (!C || !C.learnWord) return;
    for (var fam in UNITS) for (var u in UNITS[fam]) C.learnWord(u);
    ["celsius", "fahrenheit", "centigrade", "kelvin", "degrees", "degree", "percent",
     "mile", "miles", "kilometre", "kilometres", "kilometer", "kilometers", "metre",
     "metres", "meter", "meters", "litre", "litres", "liter", "liters", "gram", "grams",
     "kilogram", "kilograms", "pound", "pounds", "ounce", "ounces", "gallon", "gallons",
     "minute", "minutes", "second", "seconds", "hour", "hours", "week", "weeks",
     "month", "months", "decade", "century", "dozen"].forEach(C.learnWord);
  })();

  function unitFamily(u) {
    u = String(u).toLowerCase();
    for (var fam in UNITS) if (Object.prototype.hasOwnProperty.call(UNITS[fam], u)) return fam;
    return "";
  }
  function unitFactor(u) {
    u = String(u).toLowerCase();
    for (var fam in UNITS) if (Object.prototype.hasOwnProperty.call(UNITS[fam], u)) return UNITS[fam][u];
    return 0;
  }
  function prettyUnit(u, n) {
    u = String(u).toLowerCase();
    var plural = Math.abs(n) !== 1;
    var canon = { m: "metres", km: "kilometres", cm: "centimetres", mm: "millimetres", mi: "miles",
      ft: "feet", "in": "inches", kg: "kilograms", g: "grams", lb: "pounds", lbs: "pounds",
      oz: "ounces", s: "seconds", min: "minutes", mins: "minutes", hr: "hours", hrs: "hours", h: "hours",
      l: "litres", ml: "millilitres" };
    var name = canon[u] || u;
    if (!plural) name = name.replace(/ies$/, "y").replace(/(?:es|s)$/, "");
    return name;
  }

  function solveWordProblem(frame) {
    var text = String(frame.semanticText || frame.body || frame.rawText || "");
    var low = text.toLowerCase();
    var m, nodes = [];

    /* percentage of a quantity: "15% of 240", "what is 15 percent of 240" */
    if ((m = low.match(/(\d+(?:\.\d+)?)\s*(?:%|percent|per cent)\s+(?:of|off)\s+(?:\$|£|€)?\s*(\d[\d,]*(?:\.\d+)?)/))) {
      var pct = parseFloat(m[1]), base = parseFloat(m[2].replace(/,/g, ""));
      var isOff = /\boff\b/.test(low) || /\bdiscount/.test(low) || /\breduc/.test(low);
      var part = base * pct / 100;
      nodes.push(node("QUANTITY", { name: "base", value: base }));
      nodes.push(node("OPERATION", { op: "percent", args: [pct, base], value: part }));
      if (isOff) {
        nodes.push(node("OPERATION", { op: "subtract", args: [base, part], value: base - part }));
        return { ok: true, value: base - part, kind: "discount",
          text: fmtNumber(base - part), unit: currencyOf(low),
          steps: [pct + "% of " + fmtNumber(base) + " is " + fmtNumber(part),
                  fmtNumber(base) + " − " + fmtNumber(part) + " = " + fmtNumber(base - part)],
          nodes: nodes };
      }
      return { ok: true, value: part, kind: "percent", text: fmtNumber(part), unit: currencyOf(low),
        steps: [pct + "% of " + fmtNumber(base) + " = " + fmtNumber(part)], nodes: nodes };
    }

    /* discount phrased across a clause: "$80 item discounted by 25%" */
    if ((m = low.match(/(?:\$|£|€)?\s*(\d[\d,]*(?:\.\d+)?)\s*(?:dollar|pound|euro)?s?\b[^.]{0,60}?\b(?:discount(?:ed)?|reduc(?:ed|tion)|off|marked down|less)\b[^.]{0,20}?(\d+(?:\.\d+)?)\s*(?:%|percent|per cent)/)) ||
        (m = low.match(/(\d+(?:\.\d+)?)\s*(?:%|percent|per cent)\s*(?:discount|off)[^.]{0,40}?(?:\$|£|€)?\s*(\d[\d,]*(?:\.\d+)?)/)) ) {
      var a1 = parseFloat(m[1].replace(/,/g, "")), a2 = parseFloat(m[2].replace(/,/g, ""));
      var price = a1 > a2 ? a1 : a2, rate = a1 > a2 ? a2 : a1;
      var newPrice = price * (1 - rate / 100);
      return { ok: true, value: newPrice, kind: "discount", text: fmtNumber(newPrice), unit: currencyOf(low),
        steps: [rate + "% of " + fmtNumber(price) + " is " + fmtNumber(price * rate / 100),
                fmtNumber(price) + " − " + fmtNumber(price * rate / 100) + " = " + fmtNumber(newPrice)],
        nodes: [node("OPERATION", { op: "discount", args: [price, rate], value: newPrice })] };
    }

    /* A price and a percentage in the same clause, with any discount marker
       between or after them. One rule replaces a family of phrasings. */
    if (/\b(?:discount(?:ed)?|reduc(?:ed|tion)|off|sale|marked down|less)\b/.test(low) &&
        /\d+(?:\.\d+)?\s*(?:%|percent|per cent)/.test(low)) {
      var pm = low.match(/(\d+(?:\.\d+)?)\s*(?:%|percent|per cent)/);
      var priceM = low.match(/(?:\$|£|€)\s*(\d[\d,]*(?:\.\d+)?)/) ||
                   low.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:dollars?|pounds?|euros?|bucks?)/) ||
                   low.match(/\b(?:costs?|priced at|price of|is)\s+(\d[\d,]*(?:\.\d+)?)/);
      if (pm && priceM) {
        var pRate = parseFloat(pm[1]), pBase = parseFloat(priceM[1].replace(/,/g, ""));
        if (pBase > 0 && pRate > 0 && pRate < 100) {
          var pNew = pBase * (1 - pRate / 100);
          return { ok: true, value: pNew, kind: "discount", text: fmtNumber(pNew), unit: currencyOf(low),
            steps: [pRate + "% of " + fmtNumber(pBase) + " is " + fmtNumber(pBase * pRate / 100),
                    fmtNumber(pBase) + " − " + fmtNumber(pBase * pRate / 100) + " = " + fmtNumber(pNew)],
            nodes: [node("OPERATION", { op: "discount", args: [pBase, pRate], value: pNew })] };
        }
      }
    }

    /* rate x time: "60 miles per hour for 2.5 hours" */
    if ((m = low.match(/(\d[\d,]*(?:\.\d+)?)\s*([a-z]+)\s*(?:per|an|a|\/)\s*([a-z]+)\b[^.]{0,40}?\bfor\s+(\d[\d,]*(?:\.\d+)?)\s*([a-z]+)/))) {
      var rateV = parseFloat(m[1].replace(/,/g, "")), distUnit = m[2], perUnit = m[3];
      var dur = parseFloat(m[4].replace(/,/g, "")), durUnit = m[5];
      var fPer = unitFactor(perUnit), fDur = unitFactor(durUnit);
      if (fPer && fDur && unitFamily(perUnit) === unitFamily(durUnit)) {
        var hours = dur * fDur / fPer;
        var dist = rateV * hours;
        return { ok: true, value: dist, kind: "rate", text: fmtNumber(dist) + " " + prettyUnit(distUnit, dist),
          steps: [fmtNumber(rateV) + " " + distUnit + " per " + perUnit + " × " + fmtNumber(dur) + " " +
                  durUnit + " = " + fmtNumber(dist) + " " + prettyUnit(distUnit, dist)],
          nodes: [node("OPERATION", { op: "multiply", args: [rateV, hours], value: dist })] };
      }
    }
    if ((m = low.match(/(\d[\d,]*(?:\.\d+)?)\s*(km|kilometers?|kilometres?|miles?|m|metres?|meters?)\s*\/\s*(h|hr|hour)\b[^.]{0,40}?\bfor\s+(\d[\d,]*(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?)/))) {
      var rv = parseFloat(m[1].replace(/,/g, "")), du = m[5], dv = parseFloat(m[4].replace(/,/g, ""));
      var hrs = dv * unitFactor(du) / 3600;
      return { ok: true, value: rv * hrs, kind: "rate",
        text: fmtNumber(rv * hrs) + " " + prettyUnit(m[2], rv * hrs),
        steps: [fmtNumber(rv) + " " + m[2] + "/h × " + fmtNumber(hrs) + " h = " + fmtNumber(rv * hrs) + " " + prettyUnit(m[2], rv * hrs)],
        nodes: [] };
    }

    /* temperature conversion */
    if ((m = low.match(/(-?\d+(?:\.\d+)?)\s*(?:degrees?\s*)?(c|celsius|centigrade)\b[^.]{0,30}?\b(?:to|in|into)\b[^.]{0,10}?(f|fahrenheit)/)) ||
        (m = low.match(/convert\s+(-?\d+(?:\.\d+)?)\s*(?:degrees?\s*)?(c|celsius)\b.*?(f|fahrenheit)/))) {
      var cVal = parseFloat(m[1]), fVal = cVal * 9 / 5 + 32;
      return { ok: true, value: fVal, kind: "convert", text: fmtNumber(fVal) + " °F",
        steps: [fmtNumber(cVal) + " °C × 9/5 + 32 = " + fmtNumber(fVal) + " °F"], nodes: [] };
    }
    if ((m = low.match(/(-?\d+(?:\.\d+)?)\s*(?:degrees?\s*)?(f|fahrenheit)\b[^.]{0,30}?\b(?:to|in|into)\b[^.]{0,10}?(c|celsius|centigrade)/))) {
      var f2 = parseFloat(m[1]), c2 = (f2 - 32) * 5 / 9;
      return { ok: true, value: c2, kind: "convert", text: fmtNumber(c2) + " °C",
        steps: ["(" + fmtNumber(f2) + " − 32) × 5/9 = " + fmtNumber(c2) + " °C"], nodes: [] };
    }

    /* general unit conversion: "convert 100 kilometers to miles",
       "how many minutes are in 3.5 hours" */
    if ((m = low.match(/(?:convert\s+)?(\d[\d,]*(?:\.\d+)?)\s*([a-z]+)\s*(?:to|into|in)\s+([a-z]+)/)) &&
        unitFamily(m[2]) && unitFamily(m[2]) === unitFamily(m[3])) {
      var from = parseFloat(m[1].replace(/,/g, ""));
      var v = from * unitFactor(m[2]) / unitFactor(m[3]);
      return { ok: true, value: v, kind: "convert", text: fmtNumber(v) + " " + prettyUnit(m[3], v),
        steps: [fmtNumber(from) + " " + prettyUnit(m[2], from) + " = " + fmtNumber(v) + " " + prettyUnit(m[3], v)],
        nodes: [] };
    }
    if ((m = low.match(/how many\s+([a-z]+)\s+(?:are\s+)?(?:there\s+)?(?:in|does)\s+(\d[\d,]*(?:\.\d+)?)\s*([a-z]+)/))) {
      var toU = m[1], fromV = parseFloat(m[2].replace(/,/g, "")), fromU = m[3];
      if (unitFamily(toU) && unitFamily(toU) === unitFamily(fromU)) {
        var conv = fromV * unitFactor(fromU) / unitFactor(toU);
        return { ok: true, value: conv, kind: "convert", text: fmtNumber(conv) + " " + prettyUnit(toU, conv),
          steps: [fmtNumber(fromV) + " " + prettyUnit(fromU, fromV) + " = " + fmtNumber(conv) + " " + prettyUnit(toU, conv)],
          nodes: [] };
      }
    }

    /* average / mean of a list */
    if (/\b(?:average|mean)\b/.test(low)) {
      var nums = (low.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
      if (nums.length >= 3) {
        var sum = nums.reduce(function (a, b) { return a + b; }, 0);
        var avg = sum / nums.length;
        return { ok: true, value: avg, kind: "average", text: fmtNumber(avg),
          steps: [nums.join(" + ") + " = " + fmtNumber(sum), fmtNumber(sum) + " ÷ " + nums.length + " = " + fmtNumber(avg)],
          nodes: [node("OPERATION", { op: "mean", args: nums, value: avg })] };
      }
    }

    /* simple probability: "3 red and 7 blue, probability of red" */
    if (/\bprobabilit|\bchance\b|\bodds\b/.test(low)) {
      var counts = [], cre = /(\d+)\s+([a-z]+)/g, cm;
      while ((cm = cre.exec(low))) counts.push({ n: parseInt(cm[1], 10), label: cm[2] });
      if (counts.length >= 2) {
        var totalN = counts.reduce(function (a, c) { return a + c.n; }, 0);
        var wanted = null;
        var askRe = /(?:of (?:drawing|picking|getting|choosing) (?:a |an )?)([a-z]+)/;
        var am = low.match(askRe);
        if (am) {
          for (var ci = 0; ci < counts.length; ci++) {
            if (counts[ci].label.indexOf(am[1]) === 0 || am[1].indexOf(counts[ci].label) === 0) wanted = counts[ci];
          }
        }
        if (!wanted) wanted = counts[0];
        var p = wanted.n / totalN;
        return { ok: true, value: p, kind: "probability",
          text: fmtNumber(p) + " (" + wanted.n + "/" + totalN + ", or " + fmtNumber(p * 100) + "%)",
          steps: [wanted.n + " " + wanted.label + " out of " + totalN + " = " + fmtNumber(p)],
          nodes: [node("OPERATION", { op: "probability", args: [wanted.n, totalN], value: p })] };
      }
    }

    return null;
  }

  function currencyOf(low) {
    if (/\$|dollar/.test(low)) return "$";
    if (/£|pound sterling|\bgbp\b/.test(low)) return "£";
    if (/€|\beuro/.test(low)) return "€";
    return "";
  }

  /* ======================================================= set reasoning */

  /* Categorical premises: "All A are B", "No A are B", "Some A are B".
     Stored as typed CLAIM nodes and evaluated by the classical rules, so a
     new surface phrasing needs no new branch. */
  function parseCategorical(text) {
    var claims = [], m;
    /* Premises are found by their own shape, so punctuation is optional:
       spoken and typed-without-punctuation forms segment identically. */
    var clauses = String(text)
      .split(/[.;]|,\s*(?=and\b|but\b)|\band\b(?=\s+(?:all|every|no|some|none)\b)/i)
      .reduce(function (acc, part) {
        return acc.concat(String(part).split(/(?=\b(?:all|every|each|no|some)\s+[a-z][\w-]*\s+(?:are|is|were|was)\b)/i));
      }, []);
    for (var i = 0; i < clauses.length; i++) {
      var c = clauses[i].replace(/^\s*(?:if|then|given that|suppose|assume)\s+/i, "").trim();
      if (!c) continue;
      /* A copula never belongs inside either noun phrase; without that guard
         a greedy match swallows the verb of the next premise. */
      var NP = "((?!(?:is|are|was|were|can|could|do|does)\\b)[a-z][\\w-]*(?:\\s+(?!(?:is|are|was|were|can|could|do|does)\\b)[a-z][\\w-]*)?)";
      var ALL_RE = new RegExp("\\b(?:all|every|each)\\s+" + NP + "\\s+(?:are|is|were|was)\\s+(?:a\\s+|an\\s+)?" + NP, "i");
      var NO_RE = new RegExp("\\bno\\s+" + NP + "\\s+(?:are|is|were|was)\\s+(?:a\\s+|an\\s+)?" + NP, "i");
      var SOME_RE = new RegExp("\\bsome\\s+" + NP + "\\s+(?:are|is|were|was)\\s+(?:a\\s+|an\\s+)?" + NP, "i");
      if ((m = c.match(ALL_RE))) {
        claims.push(node("CLAIM", { q: "all", a: norm(m[1]), b: norm(m[2]) }));
      } else if ((m = c.match(NO_RE))) {
        claims.push(node("CLAIM", { q: "no", a: norm(m[1]), b: norm(m[2]) }));
      } else if ((m = c.match(SOME_RE))) {
        claims.push(node("CLAIM", { q: "some", a: norm(m[1]), b: norm(m[2]) }));
      }
    }
    return claims;
  }
  function norm(s) {
    s = String(s).toLowerCase().replace(/[^a-z0-9 -]/g, "").trim();
    return C ? C.stem(s.split(" ").map(function (w) { return C.stem(w); }).join(" ")) : s;
  }

  function subsetClosure(claims, from) {
    /* Transitive closure over "all" edges: the ENTITY -> SET -> SET chain. */
    var seen = {}, stack = [from], out = {};
    while (stack.length) {
      var cur = stack.pop();
      if (seen[cur]) continue;
      seen[cur] = 1; out[cur] = 1;
      for (var i = 0; i < claims.length; i++) {
        if (claims[i].q === "all" && claims[i].a === cur) stack.push(claims[i].b);
      }
    }
    return out;
  }

  function solveCategorical(frame) {
    var text = String(frame.semanticText || frame.body || "");
    var claims = parseCategorical(text);
    if (claims.length < 2) return null;
    /* The question clause is the last one. Copulas and articles are removed
       before the two nouns are read, so "can all pets be dogs" does not put
       "be" inside the subject. */
    var qClause = (text.match(/[^.?!;]*\?\s*$/) || [text])[0]
      .replace(/\b(?:be|been|being)\b/gi, " ")
      .replace(/\b(?:a|an|the)\b/gi, " ")
      .replace(/\s+/g, " ").trim();
    var m = qClause.match(/^(?:are|is|can|could|does|do|must|would|will)\s+(?:all|every|any|some)?\s*([a-z][\w-]*)\s+([a-z][\w-]*)\s*\??$/i);
    if (!m) m = qClause.match(/(?:are|is|can|could|does|do|must)\s+(?:all|every|any|some)?\s*([a-z][\w-]*)\s+([a-z][\w-]*)\s*\??$/i);
    if (!m) return null;
    var qSome = /\b(?:are|is|can|could|do|does)\s+some\b/i.test(qClause);
    var A = norm(m[1]), B = norm(m[2]);

    var closure = subsetClosure(claims, A);
    if (closure[B]) {
      return { ok: true, verdict: "yes", subject: m[1], predicate: m[2],
        text: "Yes.",
        why: "Every " + singular(m[1]) + " is in a category that is itself contained in " + m[2] +
             ", so the containment carries through.",
        chain: chainFor(claims, A, B),
        nodes: claims.concat([node("INFERENCE", { rule: "transitivity", from: A, to: B, value: true })]) };
    }
    /* Negative premise: "No P are R" blocks "can all Q be R" when some Q are P. */
    for (var i = 0; i < claims.length; i++) {
      if (claims[i].q !== "no") continue;
      var forbidden = claims[i];
      for (var j = 0; j < claims.length; j++) {
        var link = claims[j];
        if (link.q !== "some" && link.q !== "all") continue;
        var bridge = (link.b === forbidden.a && link.a === A) || (link.b === forbidden.a && A === link.a);
        var alsoBridge = (link.a === A && link.b === forbidden.a);
        if ((bridge || alsoBridge) && (forbidden.b === B || norm(forbidden.b) === B)) {
          return { ok: true, verdict: "no", subject: m[1], predicate: m[2],
            text: "No.",
            why: "Some " + plural(link.a) + " are " + plural(link.b) + ", and no " + plural(forbidden.a) +
                 " are " + plural(forbidden.b) + ". Those " + plural(link.a) + " therefore cannot be " +
                 plural(forbidden.b) + ", so not all of them can be.",
            nodes: claims.concat([node("INFERENCE", { rule: "exclusion", from: A, to: B, value: false })]) };
        }
      }
    }
    /* "Are some A B?" via an existential bridge. */
    if (qSome) {
      for (var s = 0; s < claims.length; s++) {
        if (claims[s].q === "some" && claims[s].a === A) {
          var mid = claims[s].b;
          if (subsetClosure(claims, mid)[B]) {
            return { ok: true, verdict: "yes", subject: m[1], predicate: m[2], text: "Yes.",
              why: "Some " + plural(A) + " are " + plural(mid) + ", and every " + singular(mid) +
                   " is " + (/^[aeiou]/i.test(m[2]) ? "an " : "a ") + singular(m[2]) + ".",
              nodes: claims };
          }
        }
      }
    }
    return { ok: true, verdict: "unknown", subject: m[1], predicate: m[2],
      text: "Not necessarily.",
      why: "The premises do not force that conclusion either way.",
      nodes: claims };
  }
  function chainFor(claims, from, to) {
    var path = [], cur = from, guard = 0;
    while (cur !== to && guard++ < 10) {
      var next = "";
      for (var i = 0; i < claims.length; i++) if (claims[i].q === "all" && claims[i].a === cur) { next = claims[i].b; break; }
      if (!next) break;
      path.push(cur + " ⊆ " + next);
      cur = next;
    }
    return path;
  }
  function plural(w) { return /s$/.test(w) ? w : w + "s"; }
  function singular(w) { return /ies$/.test(w) ? w.slice(0, -3) + "y" : /s$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w; }

  /* ================================================== ordering / transitivity */

  var ORDER_ADJ = {
    older: "age", younger: "-age", taller: "height", shorter: "-height",
    bigger: "size", larger: "size", smaller: "-size", heavier: "mass", lighter: "-mass",
    faster: "speed", slower: "-speed", richer: "wealth", poorer: "-wealth",
    longer: "length", "more expensive": "price", cheaper: "-price", higher: "height", lower: "-height",
    stronger: "strength", weaker: "-strength", warmer: "temperature", colder: "-temperature"
  };

  function solveOrdering(frame) {
    var text = String(frame.semanticText || frame.body || "");
    var pairs = [], m;
    var re = /([A-Z][\w']*|\b[a-z][\w']{0,14}\b)\s+(?:is|was|are|were)\s+((?:more\s+\w+|\w+er))\s+than\s+([A-Z][\w']*|\b[a-z][\w']{0,14}\b)/g;
    while ((m = re.exec(text))) {
      var adj = m[2].toLowerCase();
      var dim = ORDER_ADJ[adj] || ORDER_ADJ[adj.replace(/^more /, "")] || adj;
      pairs.push({ hi: m[1], lo: m[3], dim: dim.replace(/^-/, ""), inverted: dim.charAt(0) === "-" });
    }
    if (pairs.length < 2) return null;
    /* Normalise every edge to "greater" on one dimension. */
    var edges = pairs.map(function (p) { return p.inverted ? { hi: p.lo, lo: p.hi, dim: p.dim } : { hi: p.hi, lo: p.lo, dim: p.dim }; });
    var nodesSet = {}, greater = {};
    edges.forEach(function (e) {
      nodesSet[e.hi] = 1; nodesSet[e.lo] = 1;
      (greater[e.hi] || (greater[e.hi] = [])).push(e.lo);
    });
    var names = Object.keys(nodesSet);
    /* Longest-path rank via closure. */
    function reach(n) {
      var seen = {}, st = [n], out = [];
      while (st.length) {
        var c = st.pop();
        (greater[c] || []).forEach(function (x) { if (!seen[x]) { seen[x] = 1; out.push(x); st.push(x); } });
      }
      return out;
    }
    /* A comparison is a PARTIAL order. Two items with the same number of
       things below them may simply be unordered with respect to each other,
       and saying "A > C > B" when the premises only give "A > B" and
       "C > B" states something that was never claimed. */
    var ranked = names.map(function (n) { return { name: n, below: reach(n).length, above: 0 }; });
    ranked.forEach(function (r) {
      names.forEach(function (other) { if (other !== r.name && reach(other).indexOf(r.name) >= 0) r.above++; });
    });
    ranked.sort(function (a, b) { return b.below - a.below; });
    function comparable(a, b) {
      return reach(a).indexOf(b) >= 0 || reach(b).indexOf(a) >= 0;
    }
    var unordered = [];
    for (var ui = 0; ui < names.length; ui++) {
      for (var uj = ui + 1; uj < names.length; uj++) {
        if (!comparable(names[ui], names[uj])) unordered.push([names[ui], names[uj]]);
      }
    }
    var low = String(text).toLowerCase();
    var wantLowest = /\b(?:youngest|smallest|shortest|lightest|slowest|cheapest|lowest|weakest|coldest|least)\b/.test(low);
    var wantHighest = /\b(?:oldest|biggest|largest|tallest|heaviest|fastest|richest|highest|strongest|warmest|most)\b/.test(low);
    if (!wantLowest && !wantHighest) return null;
    var pick = wantLowest ? ranked[ranked.length - 1] : ranked[0];
    /* A single-letter name is a variable; upper-case it so "c" reads as the
       label it stands for rather than as a stray letter. */
    function label(n) { return String(n).length === 1 ? String(n).toUpperCase() : n; }
    ranked = ranked.map(function (r) { return { name: label(r.name), below: r.below }; });
    pick = { name: label(pick.name), below: pick.below };
    var order = ranked.map(function (r) { return r.name; });

    /* The answer is only determined if the chosen item is comparable with
       every other one. Otherwise several could tie for the position asked
       about, and saying one of them would be a guess. */
    var decisive = names.every(function (n) { return n === pick.name || comparable(n, pick.name); });
    var chain = edges.map(function (e) { return label(e.hi) + " > " + label(e.lo); });
    var why;
    if (unordered.length) {
      why = "The premises give " + chain.join(" and ") + ". " +
        unordered.map(function (u) { return label(u[0]) + " and " + label(u[1]); }).join(", ") +
        (unordered.length === 1 ? " are not compared with each other" : " are not compared") +
        ", so the full order is not fixed" +
        (decisive ? " — but " + pick.name + " is below everything either way." : ".");
    } else {
      why = "Ordering the statements gives " + order.join(" > ") + ".";
    }
    if (!decisive) {
      return { ok: true, answer: "", order: order,
        text: "The premises don't settle that.",
        why: why, nodes: edges.map(function (e) { return node("ORDER", { hi: e.hi, lo: e.lo, dim: e.dim }); }) };
    }
    return { ok: true, answer: pick.name, order: order,
      text: pick.name,
      why: why,
      nodes: edges.map(function (e) { return node("ORDER", { hi: e.hi, lo: e.lo, dim: e.dim }); }) };
  }

  /* ========================================================== sequences */

  function solveSequence(frame) {
    var text = String(frame.semanticText || frame.body || "");
    if (!/\b(?:next|continue|following|comes after|sequence|series|pattern)\b/i.test(text)) return null;
    var listPart = text.replace(/^[^:]*:/, "");
    var nums = (listPart.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    if (nums.length < 3) {
      nums = (text.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
      if (nums.length < 3) return null;
    }
    var n = nums.length, last = nums[n - 1];

    var diffs = [], i;
    for (i = 1; i < n; i++) diffs.push(nums[i] - nums[i - 1]);
    var allSame = diffs.every(function (d) { return Math.abs(d - diffs[0]) < 1e-9; });
    if (allSame) {
      return seqResult(last + diffs[0], "arithmetic", "each term adds " + fmtNumber(diffs[0]), nums);
    }
    var ratios = [], ok = true;
    for (i = 1; i < n; i++) { if (nums[i - 1] === 0) { ok = false; break; } ratios.push(nums[i] / nums[i - 1]); }
    if (ok && ratios.length && ratios.every(function (r) { return Math.abs(r - ratios[0]) < 1e-9; })) {
      return seqResult(last * ratios[0], "geometric", "each term multiplies by " + fmtNumber(ratios[0]), nums);
    }
    /* squares / cubes */
    var roots = nums.map(function (v) { return Math.sqrt(v); });
    if (roots.every(function (r, k) { return Math.abs(r - Math.round(r)) < 1e-9 && (k === 0 || Math.round(r) - Math.round(roots[k - 1]) === 1); })) {
      var nextRoot = Math.round(roots[n - 1]) + 1;
      return seqResult(nextRoot * nextRoot, "squares", "the terms are consecutive squares", nums);
    }
    /* Fibonacci-like */
    var fib = true;
    for (i = 2; i < n; i++) if (Math.abs(nums[i] - (nums[i - 1] + nums[i - 2])) > 1e-9) { fib = false; break; }
    if (fib && n >= 3) return seqResult(nums[n - 1] + nums[n - 2], "fibonacci", "each term is the sum of the two before it", nums);
    /* second differences constant */
    var d2 = [];
    for (i = 1; i < diffs.length; i++) d2.push(diffs[i] - diffs[i - 1]);
    if (d2.length && d2.every(function (d) { return Math.abs(d - d2[0]) < 1e-9; })) {
      var nextDiff = diffs[diffs.length - 1] + d2[0];
      return seqResult(last + nextDiff, "quadratic", "the differences grow by " + fmtNumber(d2[0]) + " each step", nums);
    }
    return null;
  }
  function seqResult(value, kind, why, nums) {
    return { ok: true, value: value, text: fmtNumber(value), kind: kind,
      why: "In " + nums.join(", ") + ", " + why + ".",
      nodes: [node("OPERATION", { op: "extrapolate", args: nums, value: value })] };
  }

  /* ============================================================== dates */

  var DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  function solveDayArithmetic(frame) {
    var text = String(frame.semanticText || frame.body || "");
    var m = text.match(/if\s+(\w+day)\s+is\s+day\s+(\d+)[^?]*?\bday\s+(\d+)/i);
    if (m) {
      var start = DAYS.findIndex(function (d) { return d.toLowerCase() === m[1].toLowerCase(); });
      if (start < 0) return null;
      var base = parseInt(m[2], 10), target = parseInt(m[3], 10);
      var idx = (start + (target - base)) % 7;
      if (idx < 0) idx += 7;
      return { ok: true, text: DAYS[idx],
        why: "Day " + target + " is " + (target - base) + " days after day " + base + ", and " +
             (target - base) + " mod 7 is " + ((target - base) % 7) + ".",
        nodes: [node("TEMPORAL", { from: m[1], offset: target - base, value: DAYS[idx] })] };
    }
    m = text.match(/what\s+day\s+(?:of the week\s+)?(?:is|was|will be)\s+(\d+)\s+days?\s+(?:from|after)\s+(\w+day)/i);
    if (m) {
      var s2 = DAYS.findIndex(function (d) { return d.toLowerCase() === m[2].toLowerCase(); });
      if (s2 < 0) return null;
      var i2 = (s2 + parseInt(m[1], 10)) % 7;
      return { ok: true, text: DAYS[i2], why: parseInt(m[1], 10) + " days after " + DAYS[s2] + " is " + DAYS[i2] + ".", nodes: [] };
    }
    return null;
  }

  function solveClock(frame) {
    var low = String(frame.lower || "");
    if (!/\b(?:what(?:'s| is)? (?:the )?(?:time|date)|what time is it|time right now|today'?s date|what day is (?:it|today))\b/.test(low)) return null;
    var now = new Date();
    var wantDate = /\bdate\b|\bday\b/.test(low) && !/\btime\b/.test(low);
    var time = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    var date = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    return { ok: true, kind: "clock",
      text: wantDate ? ("Today is " + date + ".") :
        ("It is " + time + " on " + date + ", by this device's clock."),
      nodes: [node("TEMPORAL", { value: now.toISOString() })] };
  }

  /* ============================================== code tracing / diagnosis */

  function solveCodeTrace(frame) {
    var text = String(frame.rawText || "");
    var low = text.toLowerCase();
    var m;
    /* Non-terminating loop: the guard and the update push the variable the
       same way. Checked structurally, not by matching a known snippet. */
    if (/\b(?:never (?:stop|end|terminat)|infinite loop|loop forever|doesn'?t (?:stop|end|terminate)|hang(?:s|ing)?)\b/.test(low) ||
        (/\bwhy\b/.test(low) && /\bwhile\b/.test(low))) {
      m = text.match(/while\s*\(?\s*([A-Za-z_]\w*)\s*(<=|>=|<|>|!=|==)\s*(-?\w+)\s*\)?\s*[:{]?([\s\S]*)$/);
      if (m) {
        var v = m[1], cmp = m[2], bound = m[3], bodyTxt = m[4] || "";
        var up = new RegExp("\\b" + v + "\\s*(?:\\+=|\\+\\+)|\\b" + v + "\\s*=\\s*" + v + "\\s*\\+").test(bodyTxt);
        var down = new RegExp("\\b" + v + "\\s*(?:-=|--)|\\b" + v + "\\s*=\\s*" + v + "\\s*-").test(bodyTxt);
        var noChange = !up && !down && !new RegExp("\\b" + v + "\\s*=").test(bodyTxt);
        if (noChange) {
          return { ok: true, kind: "code-trace",
            text: "The loop never changes " + v + ", so the condition " + v + " " + cmp + " " + bound +
                  " stays true forever. Update " + v + " inside the loop body.",
            nodes: [node("INFERENCE", { rule: "loop-invariant", value: false })] };
        }
        var movesToward = (cmp === ">" || cmp === ">=") ? down : up;
        if (!movesToward) {
          var dir = up ? "increases" : "decreases";
          var need = (cmp === ">" || cmp === ">=") ? "decrease" : "increase";
          return { ok: true, kind: "code-trace",
            text: "The condition holds while " + v + " " + cmp + " " + bound + ", but the body " + dir +
                  " " + v + " on every pass, so the test never fails — " + v + " only moves further from " +
                  bound + ". For the loop to end, the body has to " + need + " " + v + " toward " + bound + ".",
            why: "guard and update move in opposite directions",
            nodes: [node("INFERENCE", { rule: "loop-divergence", value: false })] };
        }
      }
    }
    /* "What does this do?" over a short expression with a visible transform. */
    if (/\bwhat does (?:this|that|the following)\b/.test(low) || /\bexplain this code\b/.test(low)) {
      m = text.match(/\[([^\]]*)\]\s*\.\s*(map|filter|reduce|forEach|flatMap)\s*\(\s*(?:\(?\s*([A-Za-z_]\w*)\s*\)?)\s*=>\s*([^)]+)\)/);
      if (m) {
        var arr = m[1].split(",").map(function (x) { return x.trim(); }).filter(Boolean);
        var op = m[2], param = m[3], expr = m[4].trim();
        if (op === "map") {
          var mult = expr.match(new RegExp("^" + param + "\\s*\\*\\s*(-?\\d+(?:\\.\\d+)?)$")) ||
                     expr.match(new RegExp("^(-?\\d+(?:\\.\\d+)?)\\s*\\*\\s*" + param + "$"));
          var add = expr.match(new RegExp("^" + param + "\\s*\\+\\s*(-?\\d+(?:\\.\\d+)?)$"));
          var out = null, describe = "applies " + expr.replace(new RegExp(param, "g"), "each element") + " to every element";
          if (mult) { var k = parseFloat(mult[1]); out = arr.map(function (x) { return parseFloat(x) * k; });
            describe = "multiplies every element by " + fmtNumber(k); }
          else if (add) { var k2 = parseFloat(add[1]); out = arr.map(function (x) { return parseFloat(x) + k2; });
            describe = "adds " + fmtNumber(k2) + " to every element"; }
          return { ok: true, kind: "code-trace",
            text: "It " + describe + " and returns a new array" +
              (out && out.every(function (x) { return isFinite(x); }) ? ", so the result is [" + out.join(", ") + "]" : "") +
              ". The original array is not modified.",
            nodes: [node("OPERATION", { op: "map", args: arr, value: out })] };
        }
      }
    }
    return null;
  }

  /* ========================================= odd-one-out over KB types */

  function solveOddOneOut(frame) {
    var text = String(frame.semanticText || frame.body || "");
    if (!/\bnot\b|\bexcept\b|\bodd one out\b|\bdoesn'?t belong\b/i.test(text)) return null;
    var m = text.match(/\b(?:not|except)\s+(?:a|an)?\s*([\w\s-]{3,40}?)\s*[:?]\s*(.+)$/i);
    if (!m) return null;
    var category = m[1].trim().toLowerCase();
    var items = m[2].split(/,|\bor\b|\band\b/).map(function (x) { return x.replace(/[?.!]/g, "").trim(); })
                    .filter(function (x) { return x.length > 1; });
    /* A list can be written without separators. If the coordinators produced
       one blob, the whitespace is the separator. */
    if (items.length === 1 && /\s/.test(items[0])) {
      items = items[0].split(/\s+/).filter(function (x) { return x.length > 1; });
    }
    if (items.length < 2) return null;
    var KB = root.C4LMKB;
    if (!KB) return null;
    var scored = items.map(function (it) {
      var r = KB.resolve(it, { strict: true })[0];
      var ent = r && r.entity;
      var type = ent ? (ent.type + " " + (ent.rel && ent.rel.type ? ent.rel.type : "") + " " + ent.defn) : "";
      var head = category.split(/\s+/).filter(function (w) { return w.length > 3; });
      var match = head.length ? head.every(function (w) { return type.toLowerCase().indexOf(w.replace(/s$/, "")) >= 0; }) : false;
      return { item: it, entity: ent, match: match };
    });
    var misses = scored.filter(function (s) { return !s.match; });
    var hits = scored.filter(function (s) { return s.match; });
    if (misses.length === 1 && hits.length >= 1) {
      var odd = misses[0];
      var shown = String(odd.item).charAt(0).toUpperCase() + String(odd.item).slice(1);
      return { ok: true, kind: "classification", text: shown,
        why: odd.entity ? (shown + " is " + firstClause(odd.entity.defn) + ", not a " + singular(category) + ".")
                        : (shown + " is not a " + singular(category) + "."),
        nodes: [node("CLAIM", { a: odd.item, b: category, value: false })] };
    }
    return null;
  }
  function firstClause(defn) {
    var s = String(defn).replace(/^.{0,40}?\b(?:is|are|was|were)\s+/, "");
    return s.replace(/\.\s.*$/, "").replace(/\.$/, "");
  }

  /* ====================================================== yes/no over KB */

  function solveFactualYesNo(frame) {
    if (frame.queryForm !== "yesno") return null;
    var KB = root.C4LMKB;
    if (!KB) return null;
    var text = String(frame.semanticText || frame.body || "");
    var m = text.match(/^(?:is|are|was|were)\s+(?:the\s+|a\s+|an\s+)?(.{2,40}?)\s+(?:a|an)\s+([\w\s-]{2,30})\s*\??$/i);
    if (m) {
      var subjHits = KB.resolve(m[1], { strict: true });
      if (!subjHits.length) return null;
      var ent = subjHits[0].entity;
      var claimed = m[2].trim().toLowerCase().replace(/s$/, "");
      var known = (ent.type + " " + (ent.rel && ent.rel.type ? ent.rel.type : "") + " " + ent.defn).toLowerCase();
      var isIt = known.indexOf(claimed) >= 0;
      return { ok: true, kind: "verify", verdict: isIt ? "yes" : "no",
        text: (isIt ? "Yes. " : "No. ") + ent.name + " is " + firstClause(ent.defn) + ".",
        nodes: [node("CLAIM", { a: ent.name, b: claimed, value: isIt })] };
    }
    m = text.match(/^(?:do|does)\s+(.{2,40}?)\s+have\s+(\w+)\s+([\w\s-]{2,25})\s*\??$/i);
    if (m) {
      var hits2 = KB.resolve(m[1], { strict: true });
      if (!hits2.length) return null;
      var e2 = hits2[0], countClaim = m[2].toLowerCase();
      var actual = (e2.entity.rel && e2.entity.rel.count) || "";
      if (!actual) return null;
      var claimN = NUM_WORDS[countClaim] != null ? NUM_WORDS[countClaim] : parseInt(countClaim, 10);
      var actualN = parseInt(String(actual).replace(/[^\d]/g, ""), 10);
      if (!isFinite(claimN) || !isFinite(actualN)) return null;
      return { ok: true, kind: "verify", verdict: claimN === actualN ? "yes" : "no",
        text: (claimN === actualN ? "Yes. " : "No — ") + e2.entity.name + " has " + actual + ".",
        nodes: [] };
    }
    return null;
  }

  /* =========================================================== dispatch */

  /* One entry point. Order matters only where two readings are possible, and
     the cheapest check runs first, so a non-reasoning question costs almost
     nothing to reject. */
  function solve(frame) {
    if (!frame || frame.empty) return null;
    var r;

    r = solveClock(frame); if (r) return tag(r, "clock");
    /* A long prose question that happens to contain an arithmetic example is
       asking for an explanation, not for the sum. */
    var proseAboutNumbers = frame.requiresExplanation && frame.wordCount > 15;
    if (frame.requiresComputation && !proseAboutNumbers) {
      r = solveWordProblem(frame); if (r) return tag(r, "compute");
      var expr = evaluateExpression(frame.semanticText || frame.body);
      if (expr && !expr.error) {
        return tag({ ok: true, value: expr.value, text: fmtNumber(expr.value), kind: "arithmetic",
          expression: expr.expression,
          steps: [expr.expression + " = " + fmtNumber(expr.value)],
          nodes: [node("OPERATION", { op: "evaluate", args: [expr.expression], value: expr.value })] }, "compute");
      }
      if (expr && expr.error) {
        return tag({ ok: false, kind: "arithmetic", text: "That expression divides by zero.", nodes: [] }, "compute");
      }
    } else if (!proseAboutNumbers) {
      r = solveWordProblem(frame); if (r) return tag(r, "compute");
    }
    r = solveDayArithmetic(frame); if (r) return tag(r, "reason");
    r = solveSequence(frame); if (r) return tag(r, "reason");
    r = solveCodeTrace(frame); if (r) return tag(r, "reason");
    r = solveOrdering(frame); if (r) return tag(r, "reason");
    r = solveCategorical(frame); if (r) return tag(r, "reason");
    r = solveOddOneOut(frame); if (r) return tag(r, "reason");
    r = solveFactualYesNo(frame); if (r) return tag(r, "reason");
    return null;
  }
  function tag(r, route) { r.route = route; return r; }

  root.C4LMReason = {
    solve: solve,
    evaluateExpression: evaluateExpression,
    fmtNumber: fmtNumber,
    parseCategorical: parseCategorical,
    solveSequence: solveSequence,
    solveOrdering: solveOrdering
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.C4LMReason;
})(typeof window !== "undefined" ? window : globalThis);
