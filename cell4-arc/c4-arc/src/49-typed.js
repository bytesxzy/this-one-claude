/* ===== src/49-typed.js ===== */
/* Port of engine/solvers/typed.py -- typed synthesis as a solver family.
 * Everything this emits carries a PROG.Prog, so the portfolio can apply the
 * version-space predictive ranker to it. Legacy families are untouched. */

(function () {
  function generate(ctx) {
    var progs = SYN.search(ctx, 3, 140, ctx.deadline, 14, ctx.op_prior), out = [], i;
    for (i = 0; i < progs.length; i++) {
      var p = progs[i];
      var h = new Hyp(p.name(), (function (q) {
        return function (g) { return q.run(g); };
      })(p), 2.0 + p.codeLength() / 8.0, "typed");
      h.prog = p;
      out.push(h);
    }
    return out;
  }
  defSolver("typed", "typed", generate, 2, 0.9);
})();

