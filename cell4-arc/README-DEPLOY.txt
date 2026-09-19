
RETRIEVAL: WHY IT USED TO ANSWER THE WRONG QUESTION
---------------------------------------------------
"What is machine reasoning?" came back as ARC engine documentation. The lexical
ranker asks whether a page CONTAINS the question's words; that is true of any
engine document discussing reasoning and machines, so coverage was 1.0 and the
site answered confidently about the wrong subject.

The gate now tests POSITION, not containment. A document that defines a thing
puts it at the head of a sentence, a heading or a list item. "machine
reasoning" never occurs as a contiguous phrase in these documents at all, so
the site declines and the question goes to the research layer.

A second gate stops statements being researched. "you see the issue, it needs
better lookup" has no question mark and no interrogative; it now routes to
conversation instead of returning "I could not find enough relevant evidence".

    node c4-gates-test.js

checks both, lifting the functions out of c4-mini.html so the test cannot drift
from what ships: 8 general questions the site must refuse, 7 site concepts it
must still answer, and 6 routing cases.

Known residual, stated rather than hidden: the documents write "version-space"
hyphenated, so "the version space" does not head a sentence in that exact form
and the site declines it. That errs toward research rather than toward
answering wrongly, which is the right direction to err in.
