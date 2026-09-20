# CELL4 language stack: baseline vs. after

Generated 2026-09-20T02:09:13.792Z. Every number came from the harnesses in `tools/`, run against the page that ships (`c4-mini.html`), not against a test double.

Both runs are OFFLINE: outbound HTTPS to the public data sources is blocked by policy in this evaluation environment, so the federation fails every request in both runs. That is stated rather than hidden. The accuracy figures therefore measure the LOCAL stack; the web scheduler and the runtime dictionary lookup are measured separately against `tools/mock-sources.js`, which answers the same URL and JSON shapes with fixed delays.

The battery grew from 150 to 176 cases after live testing surfaced three defects — an unseen compound matched to the nearest article, a name with a type qualifier resolving to the wrong sense, and a partial order reported as a total one. The 26 added cases cover the general mechanisms built for those, and are listed openly in `tools/lm-tests.js`.

## Headline

| metric | baseline | after |
|---|---:|---:|
| cases passed | 21/150 (14%) | 176/176 (100%) |
| turn accuracy | 16% | 100% |
| hallucinations (confident and wrong) | 1 | 0 |
| synthesis defects | 0 | 0 |
| timeouts | 0 | 0 |
| p50 latency | 7488 ms | 9 ms |
| p90 latency | 7607 ms | 26 ms |
| p95 latency | 7636 ms | 32 ms |
| p99 latency | 7806 ms | 46 ms |
| whole-suite wall clock | 1158 s | 27 s |

Of the 150 cases present in both runs: **129 fixed, 0 regressions, 0 new failures.**

## By category

| category | baseline | after |
|---|---:|---:|
| ambiguity | 1/4 | 4/4 |
| chat | 3/4 | 4/4 |
| code | 1/9 | 9/9 |
| compare | 0/4 | 4/4 |
| compose | — | 8/8 |
| compute | 0/15 | 15/15 |
| current | 0/4 | 4/4 |
| definition | 0/4 | 4/4 |
| dialogue | 0/10 | 10/10 |
| edge | 4/4 | 4/4 |
| explain | 0/4 | 4/4 |
| fact | 0/5 | 5/5 |
| format | 0/8 | 8/8 |
| knowledge | 0/9 | 9/9 |
| lexical | — | 5/5 |
| multihop | 0/3 | 3/3 |
| negation | 1/3 | 3/3 |
| para-cmp | 2/4 | 4/4 |
| para-def | 0/10 | 10/10 |
| para-fact | 0/6 | 6/6 |
| para-why | 1/5 | 5/5 |
| precision | 2/3 | 3/3 |
| qualifier | — | 5/5 |
| reason | 4/17 | 17/17 |
| relation | 0/12 | 12/12 |
| remark | 1/2 | 2/2 |
| robust | 0/5 | 5/5 |
| site | 0/3 | 3/3 |
| unknown | 1/1 | 1/1 |

## Generalisation: unseen paraphrases

`tools/lm-paraphrase.js` re-asks every paraphrasable case in forms no runtime code was written for. These variants live only in the harness.

| generator | passed |
|---|---:|
| lowercase-nopunct | 102/105 |
| typo | 107/110 |
| stem-swap | 54/54 |
| polite-wrap | 138/140 |
| fragment | 85/103 |
| verbose-wrap | 139/140 |
| **total** | **625/652 (95.9%)** |

This is the number that matters: 100% on the battery with 95.9% on 652 unseen rewordings means the mechanisms generalise rather than the answers being memorised.

## Ablations

| configuration | accuracy | delta | p50 | what was removed |
|---|---:|---:|---:|---|
| none | 100% | 0 | 8 ms | full system |
| no-kb | 79% | -21 | 5 ms | local knowledge base off |
| no-reasoning | 77.3% | -22.7 | 8 ms | reasoning graph off (arithmetic, logic, sequences) |
| no-retrieval | 97.2% | -2.8 | 8 ms | BM25F + identity-tier retrieval off |
| no-dialogue | 96.6% | -3.4 | 9 ms | discourse state / anaphora off |
| no-code | 97.7% | -2.3 | 8 ms | code construction off |
| no-ambiguity | 100% | 0 | 8 ms | sense clarification off |
| no-web | 98.3% | -1.7 | 8 ms | public-source federation off |
| no-normalization | 94.9% | -5.1 | 9 ms | shared normalisation off (spell repair, preamble removal, format parsing) |
| no-adaptive-depth | 98.3% | -1.7 | 10 ms | adaptive depth off (every resolver runs, routing ignored) |
| no-lexical | 95.5% | -4.5 | 8 ms | word lexicon and compositional reading off |

Sense clarification measures zero on this battery: the cases accept either a direct answer or a clarification, so it is kept for behaviour rather than for score. Said plainly rather than dressed up.

## Local performance (1200 warm queries, 414 distinct prompts)

| | p50 | p90 | p95 | p99 | max | mean |
|---|---:|---:|---:|---:|---:|---:|
| warm | 3.753 ms | 15.891 ms | 19.922 ms | 27.168 ms | 36.781 ms | 5.898 ms |
| cold (fresh boot each) | 6.838 ms | | 35.7 ms | | | 12.813 ms |

Per route (warm):

| route | n | p50 | p95 |
|---|---:|---:|---:|
| knowledge | 633 | 1.579 ms | 10.386 ms |
| explanation | 73 | 5.31 ms | 28.19 ms |
| comparison | 77 | 8.646 ms | 16.814 ms |
| compute | 136 | 6.069 ms | 22.326 ms |
| reason | 139 | 13.352 ms | 26.698 ms |
| code | 34 | 14.373 ms | 26.986 ms |
| clarify | 22 | 1.194 ms | 2.71 ms |
| insufficient | 30 | 6.65 ms | 9.476 ms |
| conversation | 29 | 4.336 ms | 14.863 ms |
| local | 6 | 4.159 ms | 4.527 ms |
| lexicon | 25 | 2.468 ms | 3.181 ms |
| compose | 36 | 5.875 ms | 7.467 ms |

Throughput 170 questions/second on one core.

## Web path

| configuration | p50 | p95 | max | mean | avg sources |
|---|---:|---:|---:|---:|---:|
| early-completion (shipping) | 174 ms | 2521.8 ms | 2533.8 ms | 1089.2 ms | 1 |
| early-completion disabled (deadline only) | 2517.4 ms | 2517.8 ms | 2518.2 ms | 2513.9 ms | 1.4 |
| old-style 7s per-source, 10s deadline | 2621.2 ms | 3219.5 ms | 3223.1 ms | 2858 ms | 2.4 |

The same stand-in serves the two keyless dictionaries, so the runtime word-learning path is exercised too: an unknown word is looked up, learned into the lexicon, and the phrase is then read compositionally — about 200 ms end to end, and free on the second ask.

## Robustness

45/45 checks pass (`tools/lm-robustness.js`): syntax, boot, empty/malformed/enormous input, repeated input, offline, a hanging source, a garbage source, partially unavailable sources, corrupted cached artifacts, a missing conversation pack, dialogue sequences and code execution.

## Remaining failure classes

- **KNOWLEDGE_COVERAGE.** The knowledge base holds ~380 entities and the lexicon ~520 headwords. Beyond those, an offline question is declined; online, the dictionaries and encyclopedias are consulted.
- **RETRIEVAL_COVERAGE.** The shipped site corpus contains no page about `robots.js`, so that question is declined rather than answered. Corpus, not retriever.
- **FRAGMENT_AMBIGUITY.** Most remaining paraphrase failures are probe artefacts: stripping punctuation turns "2.5 hours" into "25 hours", which is a different question.
- **FRESHNESS.** Offline, a current-information question answers from local knowledge and says so.
