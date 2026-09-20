/* The language evaluation battery.
 *
 * Expectations live HERE, in the harness, never in runtime code. A case is a
 * probe of a general mechanism: every mandatory case is paired with unseen
 * paraphrases so that a fix which only satisfies the literal wording shows up
 * as a paraphrase failure rather than as a pass.
 *
 *   expectAny / expectAll : /regex/ or "substring" the answer must contain
 *   reject                : patterns that must NOT appear
 *   route                 : expected route family (compute|local|reason|web|conversation|clarify|code)
 *   web                   : true  -> must consult the network
 *                           false -> must NOT consult the network
 *   maxSentences/maxWords : instruction-following checks
 */
"use strict";

function T(o) { return o; }

var CASES = [
  /* ---------------------------------------------------------- definitions */
  T({ id: 1, cat: "definition", q: "What is generative AI?", route: "knowledge",
      expectAll: [/\bgenerat/i], expectAny: [/model/i, /content/i, /data/i],
      reject: [/insufficient|couldn.t find|could not find/i, /robots\.js/i] }),
  T({ id: 2, cat: "definition", q: "What is a high school?", route: "knowledge",
      expectAny: [/secondary/i, /students?/i, /education/i],
      reject: [/High School High/i, /insufficient|couldn.t find/i] }),
  T({ id: 3, cat: "definition", q: "What is machine reasoning?", route: "knowledge",
      expectAny: [/infer/i, /reason/i, /logic/i, /knowledge/i],
      reject: [/ARC engine documentation/i, /insufficient|couldn.t find/i] }),
  T({ id: 4, cat: "definition", q: "What is quantum computing?", route: "knowledge",
      expectAny: [/qubit/i, /quantum/i, /superposition/i],
      reject: [/insufficient|couldn.t find/i] }),
  T({ id: 5, cat: "fact", q: "What is the capital of France?", route: "knowledge",
      expectAll: [/\bParis\b/], reject: [/insufficient|couldn.t find/i] }),
  T({ id: 6, cat: "fact", q: "What is the capital of the United States?", route: "knowledge",
      expectAll: [/Washington/i], reject: [/capital punishment/i, /death penalty/i, /insufficient/i] }),
  T({ id: 7, cat: "fact", q: "France's capital?", route: "knowledge",
      expectAll: [/\bParis\b/], reject: [/insufficient|couldn.t find/i] }),
  T({ id: 8, cat: "fact", q: "Who wrote Pride and Prejudice?", route: "knowledge",
      expectAll: [/Jane Austen/i], reject: [/insufficient|couldn.t find/i] }),
  T({ id: 9, cat: "fact", q: "What is the chemical symbol for gold?", route: "knowledge",
      expectAll: [/\bAu\b/], reject: [/insufficient|couldn.t find/i] }),
  T({ id: 10, cat: "format", q: "Explain photosynthesis in one sentence.", route: "knowledge",
      expectAny: [/light/i, /sunlight/i], expectAll: [/photosynthesis|plants?/i],
      maxSentences: 1, reject: [/insufficient|couldn.t find/i] }),

  /* ------------------------------------------------------------- why/how */
  T({ id: 11, cat: "explain", q: "Why does Earth have seasons?", route: "knowledge",
      expectAny: [/tilt/i, /axis/i, /axial/i], reject: [/insufficient|couldn.t find/i] }),
  T({ id: 12, cat: "explain", q: "Why is the sky blue?", route: "knowledge",
      expectAny: [/scatter/i, /Rayleigh/i], reject: [/insufficient|couldn.t find/i] }),
  T({ id: 13, cat: "compare", q: "What is the difference between mass and weight?", route: "knowledge",
      expectAll: [/mass/i, /weight/i], expectAny: [/gravit/i, /force/i],
      reject: [/insufficient|couldn.t find/i] }),
  T({ id: 14, cat: "explain", q: "Why does a metal spoon feel colder than a wooden spoon when both are in the same room?",
      route: "knowledge", expectAny: [/conduct/i, /heat/i],
      reject: [/insufficient|couldn.t find/i] }),

  /* --------------------------------------------------------- computation */
  T({ id: 15, cat: "compute", q: "What is 17 * 23?", route: "compute", web: false,
      expectAll: [/\b391\b/] }),
  T({ id: 16, cat: "compute", q: "What is (144 / 12) + 7?", route: "compute", web: false,
      expectAll: [/\b19\b/] }),
  T({ id: 17, cat: "compute", q: "What is 2^10?", route: "compute", web: false,
      expectAll: [/\b1024\b/] }),
  T({ id: 18, cat: "compute", q: "An $80 item is discounted by 25%. What is the new price?",
      route: "compute", web: false, expectAll: [/\b60\b/] }),
  T({ id: 19, cat: "compute", q: "A car travels 60 miles per hour for 2.5 hours. How far does it travel?",
      route: "compute", web: false, expectAll: [/\b150\b/] }),

  /* ------------------------------------------------------------ reasoning */
  T({ id: 20, cat: "reason", q: "If all Bloops are Razzies and all Razzies are Lazzies, are all Bloops Lazzies?",
      route: "reason", web: false, expectAny: [/\byes\b/i], reject: [/\bno\b,/i] }),
  T({ id: 21, cat: "reason", q: "No poets are robots. Some artists are poets. Can all artists be robots?",
      route: "reason", web: false, expectAny: [/\bno\b/i] }),
  T({ id: 22, cat: "reason", q: "What comes next: 2, 4, 8, 16, ?", route: "reason", web: false,
      expectAll: [/\b32\b/] }),
  T({ id: 23, cat: "reason", q: "If A is older than B and B is older than C, who is youngest?",
      route: "reason", web: false, expectAll: [/\bC\b/], reject: [/\bA is youngest\b/i] }),

  /* ----------------------------------------------------------- comparison */
  T({ id: 24, cat: "compare", q: "Compare TCP and UDP.", route: "knowledge",
      expectAll: [/TCP/i, /UDP/i], expectAny: [/reliab/i, /connection/i, /ordered/i],
      reject: [/insufficient|couldn.t find/i] }),
  T({ id: 25, cat: "compare", q: "Compare RAM and SSD storage.", route: "knowledge",
      expectAll: [/RAM/i, /SSD/i], expectAny: [/volatile/i, /persist/i, /memory/i],
      reject: [/insufficient|couldn.t find/i] }),
  T({ id: 26, cat: "compare", q: "What's the difference between supervised and unsupervised learning?",
      route: "knowledge", expectAll: [/supervis/i], expectAny: [/label/i, /cluster/i],
      reject: [/insufficient|couldn.t find/i] }),
  T({ id: 27, cat: "format", q: "Compare mitosis and meiosis in exactly three bullets.",
      route: "knowledge", expectAll: [/mitosis/i, /meiosis/i], bullets: 3,
      reject: [/insufficient|couldn.t find/i] }),

  /* ----------------------------------------------------------------- code */
  T({ id: 28, cat: "code", q: "In JavaScript, write a function that removes duplicate values from an array while preserving order.",
      route: "code", web: false, expectAny: [/function/i, /=>/], expectAll: [/\[/],
      reject: [/insufficient|couldn.t find/i] }),
  T({ id: 29, cat: "code", q: "Explain async and await in JavaScript.", route: "knowledge",
      expectAll: [/async/i, /await/i], expectAny: [/promise/i, /asynchron/i],
      reject: [/insufficient|couldn.t find/i] }),
  T({ id: 30, cat: "code", q: "Why does this Python loop never stop? while x > 0: x += 1",
      route: "reason", web: false, expectAny: [/increas/i, /never/i, /infinite/i, /grow/i],
      reject: [/insufficient|couldn.t find/i] }),
  T({ id: 31, cat: "code", q: "Write a SQL query that counts users grouped by country.",
      route: "code", web: false, expectAll: [/select/i, /group by/i, /count/i],
      reject: [/insufficient|couldn.t find/i] }),

  /* ------------------------------------------------------------- current */
  T({ id: 32, cat: "current", q: "What is the current stable version of Node.js?", route: "web",
      fresh: true, expectAny: [/\d+\.\d+/, /could not reach|offline|no network|unavailable/i] }),
  T({ id: 33, cat: "current", q: "What is the latest stable Python release?", route: "web",
      fresh: true, expectAny: [/3\.\d+/, /could not reach|offline|no network|unavailable/i] }),
  T({ id: 34, cat: "current", q: "What is the current Bitcoin price?", route: "web",
      fresh: true, expectAny: [/\$|\busd\b|\d/i, /could not reach|offline|no network|unavailable/i] }),
  T({ id: 35, cat: "current", q: "What time is it right now?", route: "compute",
      expectAny: [/\d{1,2}:\d{2}/, /\d{4}/] }),

  /* ----------------------------------------------------------- ambiguity */
  T({ id: 36, cat: "ambiguity", q: "What is Mercury?", route: "knowledge",
      expectAny: [/planet/i, /element/i, /metal/i, /which/i, /mean/i],
      reject: [/insufficient|couldn.t find/i] }),
  T({ id: 37, cat: "ambiguity", q: "Tell me about Java.", route: "knowledge",
      expectAny: [/programming/i, /island/i, /coffee/i, /which/i, /mean/i],
      reject: [/insufficient|couldn.t find/i] }),
  T({ id: 38, cat: "ambiguity", q: "Who is Jordan?", route: "clarify",
      expectAny: [/which/i, /mean/i, /country|basketball|river|person|name/i] }),
  T({ id: 39, cat: "ambiguity", q: "What is the Matrix?", route: "knowledge",
      expectAny: [/film|movie/i, /mathemat/i, /array/i, /which/i, /mean/i],
      reject: [/insufficient|couldn.t find/i] }),
  T({ id: 40, cat: "unknown", q: "What is quantum fuzz?", route: "any",
      expectAny: [/not|no (?:widely|standard|established)|unclear|couldn.t find|do not have|don.t have|fluctuat/i] }),

  /* ------------------------------------------------------------ dialogue */
  T({ id: 41, cat: "dialogue", turns: [
      { q: "Tell me about Albert Einstein.", expectAny: [/physic/i, /relativity/i] },
      { q: "When was he born?", expectAll: [/1879/] },
      { q: "What about his education?", expectAny: [/Zurich|Polytechnic|school|university|ETH|educat/i],
        reject: [/photosynthesis/i] }
    ] }),
  T({ id: 42, cat: "dialogue", turns: [
      { q: "What is quantum entanglement?", expectAny: [/correlat/i, /particle/i, /quantum/i] },
      { q: "What is it used for?", expectAny: [/cryptograph/i, /computing/i, /teleport/i, /sensing/i, /communicat/i],
        reject: [/insufficient|couldn.t find/i] }
    ] }),
  T({ id: 43, cat: "dialogue", turns: [
      { q: "Tell me about TCP.", expectAny: [/protocol/i, /reliab/i] },
      { q: "And UDP?", expectAll: [/UDP/i], expectAny: [/datagram/i, /connectionless/i, /no.{0,12}(?:guarantee|reliab)/i],
        reject: [/insufficient|couldn.t find/i] }
    ] }),
  T({ id: 44, cat: "dialogue", turns: [
      { q: "Tell me about Einstein.", expectAny: [/physic/i, /relativity/i] },
      { q: "Anyway, what's photosynthesis?", expectAny: [/light/i, /plants?/i, /sugar|glucose|energy/i],
        reject: [/Einstein/i] }
    ] }),

  /* --------------------------------------------------------- noisy input */
  T({ id: 45, cat: "robust", q: "capital France", route: "knowledge", expectAll: [/\bParis\b/] }),
  T({ id: 46, cat: "robust", q: "what's teh capital of france", route: "knowledge", expectAll: [/\bParis\b/] }),
  T({ id: 47, cat: "robust", q: "explain photosynthsis in 1 sentence", route: "knowledge",
      maxSentences: 1, expectAny: [/light/i, /plants?/i] }),
  T({ id: 48, cat: "remark", q: "kind of self explanatory, but it needs better interpretation",
      route: "conversation", web: false, reject: [/couldn.t find enough relevant evidence/i] }),
  T({ id: 49, cat: "format", q: "Give me only the number: 38 + 47.", route: "compute", web: false,
      expectAll: [/\b85\b/], maxWords: 4 }),
  T({ id: 50, cat: "explain", q: "Explain the difference between correlation and causation using one short example.",
      route: "knowledge", expectAll: [/correlat/i, /caus/i], expectAny: [/example|for instance|such as|ice cream|suppose/i],
      reject: [/insufficient|couldn.t find/i] }),

  /* ============================ EXTENDED SUITE ============================
     Paraphrases of the mandatory cases (overfitting detector), plus new
     categories: negation, multi-hop, units, dates, probability, sets,
     long/short prompts, nested questions, business, history. */

  /* paraphrases of 5/7/45/46 -- capital relation */
  T({ id: 51, cat: "para-fact", q: "Which city is the capital of France?", expectAll: [/\bParis\b/] }),
  T({ id: 52, cat: "para-fact", q: "the capital city of france is?", expectAll: [/\bParis\b/] }),
  T({ id: 53, cat: "para-fact", q: "Tell me France's capital city", expectAll: [/\bParis\b/] }),
  T({ id: 54, cat: "para-fact", q: "what is the capital of japan", expectAll: [/Tokyo/i] }),
  T({ id: 55, cat: "para-fact", q: "Brazil's capital?", expectAll: [/Bras[ií]lia/i] }),
  T({ id: 56, cat: "para-fact", q: "capital of australia", expectAll: [/Canberra/i] }),

  /* other relations over the same entity grammar */
  T({ id: 57, cat: "relation", q: "What is the currency of Japan?", expectAny: [/yen/i] }),
  T({ id: 58, cat: "relation", q: "What language do they speak in Brazil?", expectAny: [/Portuguese/i] }),
  T({ id: 59, cat: "relation", q: "Who wrote Hamlet?", expectAll: [/Shakespeare/i] }),
  T({ id: 60, cat: "relation", q: "Who painted the Mona Lisa?", expectAll: [/Leonardo|Vinci/i] }),
  T({ id: 61, cat: "relation", q: "What is the chemical symbol for iron?", expectAll: [/\bFe\b/] }),
  T({ id: 62, cat: "relation", q: "What's the symbol for sodium?", expectAll: [/\bNa\b/] }),
  T({ id: 63, cat: "relation", q: "How many continents are there?", expectAny: [/seven|\b7\b/i] }),
  T({ id: 64, cat: "relation", q: "What is the largest planet in the solar system?", expectAll: [/Jupiter/i] }),
  T({ id: 65, cat: "relation", q: "Who was the first person on the moon?", expectAll: [/Armstrong/i] }),

  /* compute paraphrases + variants */
  T({ id: 66, cat: "compute", q: "17 times 23", web: false, expectAll: [/\b391\b/] }),
  T({ id: 67, cat: "compute", q: "calculate 144 divided by 12 plus 7", web: false, expectAll: [/\b19\b/] }),
  T({ id: 68, cat: "compute", q: "two to the power of ten", web: false, expectAll: [/\b1024\b/] }),
  T({ id: 69, cat: "compute", q: "What is 15% of 240?", web: false, expectAll: [/\b36\b/] }),
  T({ id: 70, cat: "compute", q: "A shirt costs 120 dollars with 30% off. What do I pay?", web: false, expectAll: [/\b84\b/] }),
  T({ id: 71, cat: "compute", q: "If a train goes 80 km/h for 3 hours how far?", web: false, expectAll: [/\b240\b/] }),
  T({ id: 72, cat: "compute", q: "Convert 100 kilometers to miles.", web: false, expectAny: [/\b62(\.\d+)?\b/] }),
  T({ id: 73, cat: "compute", q: "How many minutes are in 3.5 hours?", web: false, expectAll: [/\b210\b/] }),
  T({ id: 74, cat: "compute", q: "What is the average of 4, 8, 15, 16, 23, 42?", web: false, expectAny: [/\b18(\.\d+)?\b/] }),
  T({ id: 75, cat: "compute", q: "What is 20 degrees Celsius in Fahrenheit?", web: false, expectAll: [/\b68\b/] }),

  /* reasoning paraphrases + variants */
  T({ id: 76, cat: "reason", q: "Every Gleeb is a Florp, and every Florp is a Quon. Is every Gleeb a Quon?",
      web: false, expectAny: [/\byes\b/i] }),
  T({ id: 77, cat: "reason", q: "All squares are rectangles. All rectangles are shapes. Are all squares shapes?",
      web: false, expectAny: [/\byes\b/i] }),
  T({ id: 78, cat: "reason", q: "Some birds are parrots. All parrots are animals. Are some birds animals?",
      web: false, expectAny: [/\byes\b/i] }),
  T({ id: 79, cat: "reason", q: "No cats are dogs. Some pets are cats. Can all pets be dogs?",
      web: false, expectAny: [/\bno\b/i] }),
  T({ id: 80, cat: "reason", q: "What comes next: 3, 6, 12, 24, ?", web: false, expectAll: [/\b48\b/] }),
  T({ id: 81, cat: "reason", q: "Continue the sequence 1, 4, 9, 16, 25", web: false, expectAll: [/\b36\b/] }),
  T({ id: 82, cat: "reason", q: "What number comes next: 5, 10, 15, 20?", web: false, expectAll: [/\b25\b/] }),
  T({ id: 83, cat: "reason", q: "Tom is taller than Sue and Sue is taller than Ann. Who is tallest?",
      web: false, expectAll: [/Tom/i] }),
  T({ id: 84, cat: "reason", q: "If Monday is day 1, what day is day 10?", web: false,
      expectAny: [/wednesday/i] }),
  T({ id: 85, cat: "reason", q: "A bag has 3 red and 7 blue balls. What is the probability of drawing red?",
      web: false, expectAny: [/0\.3|30%|3\/10/] }),

  /* definition paraphrases */
  T({ id: 86, cat: "para-def", q: "define generative ai", expectAll: [/generat/i], reject: [/insufficient|couldn.t find/i] }),
  T({ id: 87, cat: "para-def", q: "what does generative AI mean", expectAll: [/generat/i], reject: [/insufficient|couldn.t find/i] }),
  T({ id: 88, cat: "para-def", q: "meaning of quantum computing", expectAny: [/qubit/i, /quantum/i], reject: [/insufficient|couldn.t find/i] }),
  T({ id: 89, cat: "para-def", q: "explain what a high school is", expectAny: [/secondary/i, /students?/i], reject: [/High School High/i] }),
  T({ id: 90, cat: "para-def", q: "what is photosynthesis", expectAny: [/light/i, /plants?/i], reject: [/insufficient|couldn.t find/i] }),
  T({ id: 91, cat: "para-def", q: "what is an api", expectAny: [/interface/i, /application/i], reject: [/insufficient|couldn.t find/i] }),
  T({ id: 92, cat: "para-def", q: "what is http", expectAny: [/protocol/i, /transfer/i, /web/i], reject: [/insufficient|couldn.t find/i] }),
  T({ id: 93, cat: "para-def", q: "what is dna", expectAny: [/genetic/i, /nucleic/i, /molecul/i], reject: [/insufficient|couldn.t find/i] }),
  T({ id: 94, cat: "para-def", q: "what is inflation", expectAny: [/prices?/i, /purchasing power/i], reject: [/insufficient|couldn.t find/i] }),
  T({ id: 95, cat: "para-def", q: "what is a recession", expectAny: [/econom/i, /decline/i, /GDP/i], reject: [/insufficient|couldn.t find/i] }),

  /* explanation paraphrases */
  T({ id: 96, cat: "para-why", q: "why do we have seasons on earth", expectAny: [/tilt/i, /axis/i] }),
  T({ id: 97, cat: "para-why", q: "what makes the sky appear blue", expectAny: [/scatter/i, /Rayleigh/i] }),
  T({ id: 98, cat: "para-why", q: "why does metal feel cold to touch", expectAny: [/conduct/i, /heat/i] }),
  T({ id: 99, cat: "para-why", q: "how does a vaccine work", expectAny: [/immune/i, /antibod/i] }),
  T({ id: 100, cat: "para-why", q: "why is the ocean salty", expectAny: [/rock|mineral|river|weather|salt/i] }),

  /* comparison paraphrases */
  T({ id: 101, cat: "para-cmp", q: "tcp vs udp", expectAll: [/TCP/i, /UDP/i] }),
  T({ id: 102, cat: "para-cmp", q: "difference between ram and ssd", expectAll: [/RAM/i, /SSD/i] }),
  T({ id: 103, cat: "para-cmp", q: "how do http and https differ", expectAll: [/HTTPS?/i], expectAny: [/encrypt/i, /TLS|SSL/i] }),
  T({ id: 104, cat: "para-cmp", q: "compare sql and nosql databases", expectAny: [/SQL/i], reject: [/insufficient|couldn.t find/i] }),

  /* dialogue: pronouns, ellipsis, reset, the-latter/former */
  T({ id: 105, cat: "dialogue", turns: [
      { q: "Tell me about Marie Curie.", expectAny: [/physic|chemis|radioactiv|Nobel/i] },
      { q: "What did she win?", expectAny: [/Nobel/i] },
      { q: "when was she born?", expectAny: [/1867/] }
    ] }),
  T({ id: 106, cat: "dialogue", turns: [
      { q: "What is Python?", expectAny: [/programming/i, /language/i] },
      { q: "who created it?", expectAny: [/Rossum/i] }
    ] }),
  T({ id: 107, cat: "dialogue", turns: [
      { q: "Compare TCP and UDP.", expectAll: [/TCP/i, /UDP/i] },
      { q: "which one is faster?", expectAny: [/UDP/i] }
    ] }),
  T({ id: 108, cat: "dialogue", turns: [
      { q: "What is the capital of France?", expectAll: [/Paris/i] },
      { q: "and Germany?", expectAll: [/Berlin/i], reject: [/Paris/i] }
    ] }),
  T({ id: 109, cat: "dialogue", turns: [
      { q: "Tell me about the Eiffel Tower.", expectAny: [/Paris|tower|iron/i] },
      { q: "how tall is it?", expectAny: [/\b3(2|3)\d\b|\b1,?0\d\d\b|metre|meter|feet/i] }
    ] }),
  T({ id: 110, cat: "dialogue", turns: [
      { q: "What is machine learning?", expectAny: [/data/i, /learn/i, /algorithm/i] },
      /* NOTE: this assertion originally read /\w{20,}/, which no English word
         can satisfy. Corrected to what the case is actually probing: that a
         bare "why?" produces a reason rather than a repeat of the definition. */
      { q: "why?", expectAny: [/because|so that|in order|purpose|used for|reason|exists/i] },
      { q: "Never mind. What is 12 * 12?", expectAll: [/\b144\b/], reject: [/machine learning/i] }
    ] }),

  /* instruction following / format */
  T({ id: 111, cat: "format", q: "List three primary colors.", expectAny: [/red/i], bulletsAtLeast: 3 }),
  T({ id: 112, cat: "format", q: "In one sentence, what is gravity?", maxSentences: 1, expectAny: [/force|attract|mass/i] }),
  T({ id: 113, cat: "format", q: "Answer with a single word: what is the capital of Italy?",
      maxWords: 2, expectAll: [/Rome/i] }),
  T({ id: 114, cat: "format", q: "Give me only the number: 12 * 12", maxWords: 4, expectAll: [/\b144\b/] }),
  T({ id: 115, cat: "format", q: "Summarize what an operating system does in two sentences.",
      maxSentences: 2, expectAny: [/hardware|resources|software|programs/i] }),

  /* negation / trick */
  T({ id: 116, cat: "negation", q: "Which of these is NOT a programming language: Python, Java, Everest?",
      web: false, expectAll: [/Everest/i] }),
  T({ id: 117, cat: "negation", q: "Is the Moon a planet?", expectAny: [/\bno\b|satellite|not a planet/i] }),
  T({ id: 118, cat: "negation", q: "Do spiders have six legs?", expectAny: [/\bno\b|eight/i] }),

  /* multi-hop */
  T({ id: 119, cat: "multihop", q: "What is the capital of the country where the Eiffel Tower is?",
      expectAll: [/Paris/i] }),
  T({ id: 120, cat: "multihop", q: "Who wrote the play that features the character Hamlet?",
      expectAll: [/Shakespeare/i] }),
  T({ id: 121, cat: "multihop", q: "What language is spoken in the country whose capital is Lisbon?",
      expectAny: [/Portuguese/i] }),

  /* casual / conversational */
  T({ id: 122, cat: "chat", q: "hey", route: "conversation", web: false, reject: [/couldn.t find enough relevant evidence/i] }),
  T({ id: 123, cat: "chat", q: "thanks, that helps", route: "conversation", web: false, reject: [/couldn.t find enough relevant evidence/i] }),
  T({ id: 124, cat: "chat", q: "hmm, that's interesting", route: "conversation", web: false, reject: [/couldn.t find enough relevant evidence/i] }),
  T({ id: 125, cat: "chat", q: "what are you?", route: "conversation", web: false, reject: [/couldn.t find enough relevant evidence/i] }),
  T({ id: 126, cat: "remark", q: "you see the issue, it needs better lookup", route: "conversation", web: false,
      reject: [/couldn.t find enough relevant evidence/i] }),

  /* edge cases */
  T({ id: 127, cat: "edge", q: "", route: "any", expectAny: [/.*/] }),
  T({ id: 128, cat: "edge", q: "?????", route: "any", reject: [/\bundefined\b|\bNaN\b|\[object/i] }),
  T({ id: 129, cat: "edge", q: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", route: "any",
      reject: [/\bundefined\b|\bNaN\b|\[object/i] }),
  T({ id: 130, cat: "edge",
      q: "I have been thinking for a while about how computers represent numbers internally and why floating point arithmetic sometimes produces surprising results such as 0.1 plus 0.2 not being exactly 0.3, and I would like a clear explanation of what is going on under the hood.",
      expectAny: [/binary|floating|precision|represent/i], reject: [/\bundefined\b|\[object/i] }),

  /* CELL4 / site retrieval (must still work) */
  T({ id: 131, cat: "site", q: "What does CELL4 do?", route: "local", web: false,
      expectAny: [/CELL4|ARC|engine|solver|browser/i], reject: [/insufficient|couldn.t find/i] }),
  T({ id: 132, cat: "site", q: "What is robots.js?", route: "local", web: false,
      expectAny: [/robots|page|browser|site/i], reject: [/insufficient|couldn.t find/i] }),
  T({ id: 133, cat: "site", q: "the version space", route: "local", web: false,
      expectAny: [/version.?space|hypothes|program/i], reject: [/couldn.t find enough relevant evidence/i] }),

  /* retrieval precision: must NOT answer from CELL4 docs */
  T({ id: 134, cat: "precision", q: "What is JavaScript?", expectAny: [/language|script|web|browser/i],
      reject: [/robots\.js/i, /CELL4/i] }),
  T({ id: 135, cat: "precision", q: "What is a compiler?", expectAny: [/translat|source code|machine code|compil/i],
      reject: [/CELL4/i] }),
  /* NOTE: the length assertion here originally read /\w{15,}/ -- no ordinary
     English word is 15 letters long, so it could never pass. Corrected to the
     property the case is probing: a substantive answer, not a refusal. */
  T({ id: 136, cat: "precision", q: "What is an engine?", expectAny: [/.{60,}/], reject: [/^I couldn.t find/i, /^I don.t have anything/i] }),

  /* history / business / misc knowledge */
  T({ id: 137, cat: "knowledge", q: "When did World War II end?", expectAll: [/1945/] }),
  T({ id: 138, cat: "knowledge", q: "Who was the first president of the United States?", expectAll: [/Washington/i] }),
  T({ id: 139, cat: "knowledge", q: "What is GDP?", expectAny: [/gross domestic product/i, /goods and services/i] }),
  T({ id: 140, cat: "knowledge", q: "What is supply and demand?", expectAny: [/price/i, /market/i, /quantity/i] }),
  T({ id: 141, cat: "knowledge", q: "What is the speed of light?", expectAny: [/299|300,000|3\s*[x×]\s*10/i] }),
  T({ id: 142, cat: "knowledge", q: "How many bones are in the human body?", expectAny: [/206/] }),
  T({ id: 143, cat: "knowledge", q: "What is the boiling point of water?", expectAny: [/100/] }),
  T({ id: 144, cat: "knowledge", q: "What causes rain?", expectAny: [/condens|evaporat|cloud|water vapou?r/i] }),
  T({ id: 145, cat: "knowledge", q: "What is a black hole?", expectAny: [/gravit|light|escape|collaps/i] }),

  /* code, extended */
  T({ id: 146, cat: "code", q: "Write a Python function to reverse a string.", web: false,
      expectAny: [/def /i, /\[::-1\]/, /reversed/i] }),
  T({ id: 147, cat: "code", q: "Write a JavaScript function that returns the sum of an array.", web: false,
      expectAny: [/reduce|for\s*\(|function/i] }),
  T({ id: 148, cat: "code", q: "What does this do? const x = [1,2,3].map(n => n * 2)", web: false,
      expectAny: [/doubl|multipl|\[2, ?4, ?6\]|each element/i] }),
  T({ id: 149, cat: "code", q: "Explain what a REST API is.", expectAny: [/HTTP|resource|stateless|endpoint/i],
      reject: [/insufficient|couldn.t find/i] }),
  T({ id: 150, cat: "code", q: "Write a SQL query to find the top 5 highest paid employees.", web: false,
      expectAll: [/select/i], expectAny: [/order by/i, /limit|top/i] }),

  /* ===================== LANGUAGE UNDERSTANDING (added after live testing)
     Three defects showed up in live use: an unseen compound was matched to
     the nearest article instead of being read; a name with a type qualifier
     resolved to the wrong sense; and a partial order was reported as a total
     one. These cases cover the general mechanisms built for them. */

  /* word senses -- the system must know what ordinary words mean */
  T({ id: 151, cat: "lexical", q: "What is a pivot?", route: "lexicon", web: false,
      expectAny: [/turn|change of direction|central point/i],
      reject: [/insufficient|couldn.t find|don.t have anything/i] }),
  T({ id: 152, cat: "lexical", q: "what does pivot mean", web: false,
      expectAny: [/turn|change of direction|central point/i],
      reject: [/\bmean is the sum\b/i, /insufficient|couldn.t find/i] }),
  T({ id: 153, cat: "lexical", q: "what is learning", web: false,
      expectAny: [/acquisition|knowledge|skill/i], reject: [/machine learning/i] }),
  T({ id: 154, cat: "lexical", q: "define strategy", web: false,
      expectAny: [/plan|action|aim/i], reject: [/insufficient|couldn.t find/i] }),
  T({ id: 155, cat: "lexical", q: "what does the word threshold mean", web: false,
      expectAny: [/.{20,}/] }),

  /* compositional reading of phrases nothing holds an entry for */
  T({ id: 156, cat: "compose", q: "What is a learning pivot?", route: "compose", web: false,
      expectAll: [/pivot/i, /learning/i],
      expectAny: [/change of direction|change in direction|strategy|approach/i],
      reject: [/television|network|TLC|insufficient|couldn.t find/i] }),
  T({ id: 157, cat: "compose", q: "What is a growth engine?", web: false,
      expectAll: [/growth/i], expectAny: [/machine|component|converts/i],
      reject: [/insufficient|couldn.t find/i] }),
  T({ id: 158, cat: "compose", q: "what is a teaching method", web: false,
      expectAll: [/teaching/i], expectAny: [/procedure|way|method/i],
      reject: [/JavaScript|function that returns/i] }),
  T({ id: 159, cat: "compose", q: "what is a design decision", web: false,
      expectAll: [/design/i], expectAny: [/conclusion|choice|decision/i] }),
  T({ id: 160, cat: "compose", q: "what is a security problem", web: false,
      expectAll: [/security/i], expectAny: [/matter|unwelcome|problem/i] }),
  T({ id: 161, cat: "compose", q: "what is a river bridge", web: false,
      expectAll: [/river/i], expectAny: [/structure|carrying|over/i] }),

  /* a compound the knowledge base DOES hold must not be read compositionally */
  T({ id: 162, cat: "compose", q: "What is machine learning?", web: false,
      expectAny: [/branch of computing|patterns from data/i],
      reject: [/don't hold|from its parts/i] }),
  T({ id: 163, cat: "compose", q: "What is quantum entanglement?", web: false,
      expectAny: [/correlation|particles/i], reject: [/don't hold|from its parts/i] }),

  /* type qualifiers select the sense */
  T({ id: 164, cat: "qualifier", q: "What is the company meta?", web: false,
      expectAny: [/Facebook|Instagram|technology company/i],
      reject: [/Canadian|scientific literature/i] }),
  T({ id: 165, cat: "qualifier", q: "What is the planet Mercury?", web: false,
      expectAny: [/smallest planet|closest to the Sun/i], reject: [/chemical element/i] }),
  T({ id: 166, cat: "qualifier", q: "What is the element mercury?", web: false,
      expectAny: [/chemical element|\bHg\b/i], reject: [/smallest planet/i] }),
  T({ id: 167, cat: "qualifier", q: "what is the fruit orange", web: false,
      expectAny: [/citrus|fruit/i], reject: [/telecommunications/i] }),
  T({ id: 168, cat: "qualifier", q: "what is the company orange", web: false,
      expectAny: [/telecommunications|French/i], reject: [/citrus/i] }),

  /* partial orders must not be reported as total orders */
  T({ id: 169, cat: "reason", q: "If A is older than B, and C is older than B - what is the youngest?",
      web: false, expectAll: [/\bB\b/], reject: [/A > C > B|C > A > B/] }),
  T({ id: 170, cat: "reason", q: "If A is faster than B and C is faster than B, who is fastest?",
      web: false, expectAny: [/don.t settle|not compared|cannot tell|not fixed/i] }),
  T({ id: 171, cat: "reason", q: "If A is older than B and B is older than C, who is youngest?",
      web: false, expectAll: [/\bC\b/] }),

  /* verb-to-relation mapping must not collide */
  T({ id: 172, cat: "relation", q: "Who founded Tesla?", web: false,
      expectAny: [/Eberhard|Tarpenning|Musk/i] }),
  T({ id: 173, cat: "relation", q: "Who invented the telephone?", route: "any",
      expectAny: [/.{15,}/] }),
  T({ id: 174, cat: "relation", q: "Who created Python?", web: false, expectAny: [/Rossum/i] }),

  /* the spell repair must not rewrite ordinary words */
  T({ id: 175, cat: "robust", q: "Why does a metal spoon feel cold?", web: false,
      expectAny: [/conduct|heat/i], reject: [/soon\b/] }),
  T({ id: 176, cat: "robust", q: "In one sentence, what is gravity?", maxSentences: 1,
      expectAny: [/attract|mass|spacetime|force/i] })
];


module.exports = { CASES: CASES };
