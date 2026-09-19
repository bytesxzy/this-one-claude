# CELL4 language stack

Local natural-language understanding, reasoning and generation for
`c4-mini.html`. No model service of any kind: no OpenAI, no Anthropic, no
Gemini, no hosted inference. The only network use is a keyless public-data
federation, and it runs only when the question's own frame says the answer
cannot be known locally.

ARC is untouched. None of the files listed here is loaded by, or loads, the
ARC engine.

## Shape

```
RAW USER TEXT
      │
      ▼  shared normalisation (unicode, morphology, spell repair, preamble)
  ONE QueryFrame                                c4-lm-core.js
      │
      ▼  one feature pass → many typed decisions
  SYSTEM-1 DECISION HEAD                        c4-lm.js
      │   route distribution · depth · confidence
      ├────────────┬─────────────┬──────────────┬────────────┐
      ▼            ▼             ▼              ▼            ▼
   COMPUTE      KNOWLEDGE      REASON        RETRIEVAL      WEB
  arithmetic    entity +       typed graph   BM25F +      evidence
  units, dates  relation       deduction,    identity     quorum,
  probability   lookup         sequences,    tiers        early exit
      │            │           ordering         │            │
      └────────────┴─────────────┴──────────────┴────────────┘
                              │
                              ▼  verification · confidence factors
                        ANSWER PLAN                     c4-lm-realize.js
                              │
                              ▼  discourse plan → clauses → agreement → polish
                           OUTPUT
```

## Files

| file | what it owns |
|---|---|
| `c4-lm-core.js` | Normalisation, morphology, typo repair, the relation lexicon, and the immutable **QueryFrame**. The message is parsed once; everything downstream reads the frame. |
| `c4-lm-kb.js` | The local knowledge base: entities with aliases, types, definitions, relational attributes, causal accounts, sense sets and contrast dimensions. Entity resolution is exact → alias → typo-tolerant → token-vote, and identity is never substring overlap. |
| `c4-lm-reason.js` | The reasoning graph. Compact typed nodes (ENTITY, QUANTITY, CLAIM, ORDER, OPERATION, INFERENCE, TEMPORAL) for arithmetic, percentages, rates, unit and temperature conversion, averages, probability, categorical syllogisms, transitive ordering, sequence extrapolation, date arithmetic, loop diagnosis and classification. |
| `c4-lm-retrieve.js` | Two-stage retrieval. A cheap BM25F sweep produces a shortlist; only the shortlist pays for ordered-phrase locks, identity tiers, topical concentration and relation compatibility. |
| `c4-lm-evidence.js` | Query decomposition, the source federation and the evidence graph. Sources are selected by domain, started in parallel, and cancelled the moment a quorum of independent evidence is reached. Retrieved text becomes propositions, which are merged and checked for contradiction. |
| `c4-lm-realize.js` | Answer plans and surface realisation: article selection, subject–verb agreement, connectives, enumeration, length and format constraints, and a well-formedness contract that rejects duplicate copulas, dangling connectives, repeated sentences and pasted snippets. |
| `c4-lm-code.js` | Code construction from a specification. Semantic operations, language backends, and execution of every emitted JavaScript program against its own example before it is offered. |
| `c4-lm.js` | The orchestrator: discourse state, the System-1 decision head, adaptive depth, confidence assembly, ablation switches. |

## The four distinctions the architecture is built on

1. **Identity is not overlap.** A document that contains a phrase is not a
   document about it. `identityTier` scores position, not containment, and a
   definitional question may only be answered from the DEFINES tier or above.
2. **Relation is not topic.** "capital of France", "France's capital",
   "which city is the capital of France" and "capital France" all normalise to
   `subject=France, relation=capital`. One representation, not four branches.
3. **Depth is predicted, not fixed.** `2 + 2` never reaches the reasoning
   graph; "why does a metal spoon feel colder than wood" never gets answered
   by keyword match.
4. **Evidence sufficiency, not a deadline.** The federation finishes when the
   evidence is good enough and aborts the rest. A slow endpoint can add
   information; it can never delay an answer that is already supported.

## Reproducing the measurements

```sh
node tools/lm-eval.js --out measurements/lm-after.json   # the 150-case battery
node tools/lm-paraphrase.js                              # 540 unseen paraphrases
node tools/lm-ablate.js                                  # one component removed per run
node tools/lm-bench.js --n 1200                          # local latency
node tools/mock-sources.js &                             # stand-in sources with fixed delays
node tools/lm-web-bench.js                               # scheduler latency
node tools/lm-robustness.js                              # failure modes
```
