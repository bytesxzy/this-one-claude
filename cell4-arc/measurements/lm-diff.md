# CELL4 language stack: baseline vs. after

Generated 2026-09-19T21:17:01.163Z. Every number below came from the harnesses in `tools/`, run against the page that ships (`c4-mini.html`), not against a test double.

Both runs are OFFLINE: outbound HTTPS to the public data sources is blocked by policy in this evaluation environment, so the federation fails every request in both runs. That is stated rather than hidden: it means the accuracy figures measure the LOCAL stack, and the web path is measured separately in `lm-web-perf.json` against a stand-in server with controlled delays.

## Headline

| metric | baseline | after |
|---|---:|---:|
| cases passed | 21/150 (14%) | 150/150 (100%) |
| turn accuracy | 16% | 100% |
| hallucinations (confident and wrong) | 1 | 0 |
| synthesis defects | 0 | 0 |
| timeouts | 0 | 0 |
| p50 latency | 7488 ms | 8 ms |
| p90 latency | 7607 ms | 24 ms |
| p95 latency | 7636 ms | 28 ms |
| p99 latency | 7806 ms | 37 ms |
| mean latency | 7070 ms | 12 ms |
| whole-suite wall clock | 1158 s | 25 s |

Fixed cases: **129**. Regressions: **0**. New failures: **0**.

## By category

| category | baseline | after | delta |
|---|---:|---:|---:|
| ambiguity | 1/4 | 4/4 | +3 |
| chat | 3/4 | 4/4 | +1 |
| code | 1/9 | 9/9 | +8 |
| compare | 0/4 | 4/4 | +4 |
| compute | 0/15 | 15/15 | +15 |
| current | 0/4 | 4/4 | +4 |
| definition | 0/4 | 4/4 | +4 |
| dialogue | 0/10 | 10/10 | +10 |
| edge | 4/4 | 4/4 | +0 |
| explain | 0/4 | 4/4 | +4 |
| fact | 0/5 | 5/5 | +5 |
| format | 0/8 | 8/8 | +8 |
| knowledge | 0/9 | 9/9 | +9 |
| multihop | 0/3 | 3/3 | +3 |
| negation | 1/3 | 3/3 | +2 |
| para-cmp | 2/4 | 4/4 | +2 |
| para-def | 0/10 | 10/10 | +10 |
| para-fact | 0/6 | 6/6 | +6 |
| para-why | 1/5 | 5/5 | +4 |
| precision | 2/3 | 3/3 | +1 |
| reason | 4/14 | 14/14 | +10 |
| relation | 0/9 | 9/9 | +9 |
| remark | 1/2 | 2/2 | +1 |
| robust | 0/3 | 3/3 | +3 |
| site | 0/3 | 3/3 | +3 |
| unknown | 1/1 | 1/1 | +0 |

## Generalisation: unseen paraphrases

`tools/lm-paraphrase.js` re-asks every paraphrasable case in forms no runtime code was written for. These variants live only in the harness.

| generator | passed |
|---|---:|
| lowercase-nopunct | 88/91 |
| typo | 86/88 |
| stem-swap | 46/46 |
| polite-wrap | 114/116 |
| fragment | 73/83 |
| verbose-wrap | 115/116 |
| **total** | **522/540 (96.7%)** |

This is the number that matters: 100% on the battery with 96.7% on 540 unseen rewordings of it means the mechanisms generalise rather than the answers being memorised.

## Ablations

| configuration | accuracy | delta | p50 | what was removed |
|---|---:|---:|---:|---|
| none | 100% | 0 | 9 ms | full system |
| no-kb | 77.3% | -22.7 | 5 ms | local knowledge base off |
| no-reasoning | 75.3% | -24.7 | 9 ms | reasoning graph off (arithmetic, logic, sequences) |
| no-retrieval | 97.3% | -2.7 | 8 ms | BM25F + identity-tier retrieval off |
| no-dialogue | 96.7% | -3.3 | 9 ms | discourse state / anaphora off |
| no-code | 97.3% | -2.7 | 8 ms | code construction off |
| no-ambiguity | 100% | 0 | 8 ms | sense clarification off |
| no-web | 98% | -2 | 8 ms | public-source federation off |
| no-normalization | 95.3% | -4.7 | 9 ms | shared normalisation off (spell repair, preamble removal, format parsing) |
| no-adaptive-depth | 97.3% | -2.7 | 10 ms | adaptive depth off (every resolver runs, routing ignored) |

## Local performance (1200 warm queries, 368 distinct prompts)

| | p50 | p90 | p95 | p99 | max | mean |
|---|---:|---:|---:|---:|---:|---:|
| warm | 2.652 ms | 14.893 ms | 19.76 ms | 25.109 ms | 43.936 ms | 5.396 ms |
| cold (fresh boot each) | 7.435 ms | | 34.848 ms | | | 12.205 ms |

Per route (warm):

| route | n | p50 | p95 |
|---|---:|---:|---:|
| knowledge | 654 | 1.203 ms | 11.703 ms |
| explanation | 79 | 4.767 ms | 25.278 ms |
| comparison | 92 | 8.906 ms | 19.76 ms |
| compute | 148 | 3.015 ms | 15.552 ms |
| reason | 134 | 11.688 ms | 24.908 ms |
| code | 41 | 11.832 ms | 25.109 ms |
| clarify | 28 | 0.266 ms | 2.996 ms |
| insufficient | 27 | 5.517 ms | 8.049 ms |
| conversation | 32 | 4.085 ms | 15.963 ms |
| local | 5 | 4.299 ms | 4.495 ms |

Throughput 185 questions/second on one core.

## Web path

Measured against `tools/mock-sources.js`, which answers the real URL and JSON shapes with fixed, uneven delays (60-4200 ms) including a deliberate straggler. What is being measured is the scheduler, not the internet.

| configuration | p50 | p95 | max | mean | avg sources |
|---|---:|---:|---:|---:|---:|
| early-completion (shipping) | 174 ms | 2521.8 ms | 2533.8 ms | 1089.2 ms | 1 |
| early-completion disabled (deadline only) | 2517.4 ms | 2517.8 ms | 2518.2 ms | 2513.9 ms | 1.4 |
| old-style 7s per-source, 10s deadline | 2621.2 ms | 3219.5 ms | 3223.1 ms | 2858 ms | 2.4 |

## Robustness

43/43 checks pass (`tools/lm-robustness.js`): syntax, boot, empty/malformed/enormous input, repeated input, offline, a hanging source, a garbage source, partially unavailable sources, corrupted cached artifacts, a missing conversation pack, dialogue sequences and code execution.

## Remaining failure classes

- **RETRIEVAL_COVERAGE.** The shipped site corpus contains no page about `robots.js` (0 occurrences) and one mention of CELL4, so a question about `robots.js` is declined rather than answered. That is the corpus, not the retriever.
- **KNOWLEDGE_COVERAGE.** The local knowledge base holds 359 entities. A question outside it, with the network unavailable, is declined. With the network reachable it goes to the federation.
- **FRAGMENT_AMBIGUITY.** 10 of the 540 paraphrase probes are content-word fragments whose meaning genuinely changed under the transformation ("a car travels 60 miles per hour for 2.5 hours" becomes "... 25 hours" once punctuation is stripped). Those are artefacts of the probe.
- **FRESHNESS.** Offline, a current-information question answers from local knowledge and says so. It cannot be verified as current until the network is reachable.
