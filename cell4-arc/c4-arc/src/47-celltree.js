/* ===== src/47-celltree.js ===== */
/* Port of engine/solvers/celltree.py -- conjunctive cell rules.
 *
 * ``cellwise`` induces exact lookup tables keyed by ONE context family at a
 * time. A rule that needs two of them at once -- "a cell of the largest object
 * that also sits on the border becomes blue" -- is not expressible there at
 * any table size, so it is absent from the hypothesis space rather than merely
 * hard to find. This module learns a decision tree whose tests are equality or
 * threshold checks on individual features; conjunction comes from depth.
 *
 * The capacity guards are the interesting part, and they are three:
 *   - the tree predicts the DIFFERENCE from the input by default, so the vast
 *     majority of cells that keep their colour cost one leaf between them;
 *   - the smallest leaf budget that still explains the demonstrations is the
 *     one used, searched upward from three;
 *   - a held-out demonstration refit must reproduce the omitted output, and a
 *     tree that cannot is charged three extra bits of cost.
 */

var CELLTREE = null;

(function () {
  var OOB = -1;
  var KEEP = -2;                 /* leaf label: this cell keeps its colour */
  var MAX_DEPTH = 6;
  var CAP = 40 * 40 * 6;

  /* ---- feature bank ---------------------------------------------------- */
  var FEATURES = [];
  function feat(name, bits) { FEATURES.push([name, bits]); return FEATURES.length - 1; }

  var F_V = feat("v", 1.0);
  var F_R2 = feat("r%2", 2.0), F_C2 = feat("c%2", 2.0), F_D2 = feat("(r+c)%2", 2.0);
  var F_R3 = feat("r%3", 2.5), F_C3 = feat("c%3", 2.5);
  var F_BORDER = feat("border", 2.0), F_RING = feat("ring", 3.0);
  var F_ROW = feat("row", 4.0), F_COL = feat("col", 4.0);
  var F_ROWB = feat("row_from_end", 4.0), F_COLB = feat("col_from_end", 4.0);
  var F_N4CNT = feat("n4_fg", 2.5), F_N8CNT = feat("n8_fg", 2.5);
  var F_N8SAME = feat("n8_same", 3.0), F_N8MASK = feat("n8_fgmask", 4.0);
  var F_NU = feat("up", 3.0), F_ND = feat("down", 3.0);
  var F_NL = feat("left", 3.0), F_NR = feat("right", 3.0);
  var F_DUL = feat("ul", 3.5), F_DUR = feat("ur", 3.5);
  var F_DDL = feat("dl", 3.5), F_DDR = feat("dr", 3.5);
  var F_RAYU = feat("ray_up", 4.0), F_RAYD = feat("ray_down", 4.0);
  var F_RAYL = feat("ray_left", 4.0), F_RAYR = feat("ray_right", 4.0);
  var F_ENCL = feat("enclosed", 3.0), F_DIST = feat("dist_fg", 3.5);
  var F_NEAR = feat("near_color", 4.0);
  var F_OSIZE = feat("obj_size", 4.0), F_OH = feat("obj_h", 4.0), F_OW = feat("obj_w", 4.0);
  var F_ORECT = feat("obj_rect", 3.5), F_OSQ = feat("obj_square", 3.5);
  var F_OHOLE = feat("obj_holes", 4.0), F_OTOUCH = feat("obj_touch", 3.5);
  var F_ORANK = feat("obj_rank", 4.0), F_OCOUNT = feat("obj_shape_n", 4.5);
  var F_ODR = feat("obj_dr", 4.5), F_ODC = feat("obj_dc", 4.5);
  var F_ROWUNI = feat("row_uniform", 3.0), F_COLUNI = feat("col_uniform", 3.0);
  var F_ROWN = feat("row_fg", 4.0), F_COLN = feat("col_fg", 4.0);
  var F_MH = feat("mirror_h", 4.5), F_MV = feat("mirror_v", 4.5);
  var F_M180 = feat("mirror_180", 4.5), F_MT = feat("mirror_t", 5.0);
  var F_PER = feat("periodic", 5.0);
  var F_CRANK = feat("color_rank", 3.5), F_CCNT = feat("color_count", 4.0);
  var F_RAYUL = feat("ray_ul", 4.5), F_RAYUR = feat("ray_ur", 4.5);
  var F_RAYDL = feat("ray_dl", 4.5), F_RAYDR = feat("ray_dr", 4.5);
  var F_BETW_H = feat("between_h", 3.0), F_BETW_V = feat("between_v", 3.0);
  var F_BETW_HC = feat("between_h_color", 4.0), F_BETW_VC = feat("between_v_color", 4.0);
  var F_ROWMODE = feat("row_mode", 4.5), F_COLMODE = feat("col_mode", 4.5);
  var F_ROWSAME = feat("row_same_color", 4.0), F_COLSAME = feat("col_same_color", 4.0);
  var F_QUAD = feat("quadrant", 3.0);
  var F_BMH = feat("bbox_mirror_h", 5.0), F_BMV = feat("bbox_mirror_v", 5.0);
  var F_OIDX = feat("obj_index", 5.0), F_ONEAR = feat("nearest_obj_color", 4.5);
  var F_OSHAPE = feat("obj_shape", 5.0), F_OCOL = feat("obj_color", 4.0);
  var F_DU = feat("dist_up", 4.0), F_DD = feat("dist_down", 4.0);
  var F_DL = feat("dist_left", 4.0), F_DR = feat("dist_right", 4.0);
  var F_N8SORT = feat("n8_sorted", 5.0);
  /* position relative to the grid's centre: absolute row and column cannot
     express "the middle column" across grids of different widths */
  var F_CROW = feat("row_from_centre", 3.5), F_CCOL = feat("col_from_centre", 3.5);
  var F_CENTRE = feat("is_centre", 3.0);
  /* colour of the most recent mark in each closed quadrant, in scan order --
     the closure of a cascade that paints along a row and then down a column,
     which is invisible to any feature of the input alone */
  var F_ULQ = feat("quad_ul", 4.5), F_URQ = feat("quad_ur", 4.5);
  var F_DLQ = feat("quad_dl", 4.5), F_DRQ = feat("quad_dr", 4.5);
  /* ordinal rank among the marks a row or column implies */
  var F_RUNIDX = feat("row_mark_index", 4.0), F_RUNIDXB = feat("row_mark_index_end", 4.0);
  var F_RUNPAR = feat("row_mark_parity", 3.0), F_RUNN = feat("row_mark_count", 3.5);
  var F_CRUNIDX = feat("col_mark_index", 4.0), F_CRUNIDXB = feat("col_mark_index_end", 4.0);
  var F_CRUNPAR = feat("col_mark_parity", 3.0), F_CRUNN = feat("col_mark_count", 3.5);
  /* reads at a stride, and periodic reads */
  var F_S2U = feat("up2", 4.0), F_S2D = feat("down2", 4.0);
  var F_S2L = feat("left2", 4.0), F_S2R = feat("right2", 4.0);
  var F_S3U = feat("up3", 4.5), F_S3D = feat("down3", 4.5);
  var F_S3L = feat("left3", 4.5), F_S3R = feat("right3", 4.5);
  var F_PERR = feat("row_period_read", 4.5), F_PERC = feat("col_period_read", 4.5);
  var F_PREVR = feat("prev_row_period", 4.5), F_PREVC = feat("prev_col_period", 4.5);
  /* the same object readings under 4-connectivity: diagonal connectivity
     merges shapes that touch only at a corner, and which reading is right is a
     property of the task, not of the grid */
  var F_O4SIZE = feat("obj4_size", 4.5), F_O4RANK = feat("obj4_rank", 4.5);
  var F_O4IDX = feat("obj4_index", 5.0), F_O4HOLE = feat("obj4_holes", 4.5);
  var F_O4TOUCH = feat("obj4_touch", 4.0), F_O4COL = feat("obj4_color", 4.5);
  /* signed offset to the nearest mark, and to the nearest object's box. The
     largest single group of unsolved same-shape tasks is "the input plus
     something drawn on the background", and what those rules say is almost
     always where relative to a mark: a motif stamped around each seed, a box
     one cell outside each shape, a diagonal from each corner. A cell rule
     cannot say any of that from colours and distances alone -- it needs the
     displacement, with its sign. */
  var F_SEEDDR = feat("seed_dr", 4.0), F_SEEDDC = feat("seed_dc", 4.0);
  var F_SEEDD = feat("seed_chebyshev", 3.5);
  var F_BOXIN = feat("in_some_bbox", 3.5);
  var F_BOXDR = feat("bbox_dr", 4.5), F_BOXDC = feat("bbox_dc", 4.5);
  var F_BOXCOL = feat("bbox_color", 4.5);
  /* betweenness along the diagonals, the counterpart of between_h/v */
  var F_BETW_D1 = feat("between_d1_color", 4.5);
  var F_BETW_D2 = feat("between_d2_color", 4.5);
  /* relational readings of the containing object. "Delete every shape that is
     not the odd one out", "recolour the one inside the box", "keep the shapes
     that share a colour with exactly one other" are the erase-only and
     recolour-only families, and each needs a comparison between this object
     and the rest. A rank says where an object sits in an order, not whether
     anything else is like it. */
  var F_ONOBJ = feat("obj_count", 3.5);
  var F_OSAMECOL = feat("objs_same_color", 4.0);
  var F_OSAMESIZE = feat("objs_same_size", 4.0);
  var F_ODENS = feat("obj_density", 3.5);
  var F_OSYM = feat("obj_symmetric", 3.5);
  var F_OINSIDE = feat("obj_inside_another", 3.5);
  var F_OCONTAINS = feat("obj_contains_another", 3.5);
  /* the lattice a separator-ruled grid implies, and the exemplar panel. A
     large share of "draw on the background" tasks are not about cells at all:
     the grid is a lattice of panels, one panel carries a motif, and the answer
     copies it into the empty ones. Per cell that rule is "take the value at my
     own position inside the panel, from the panel my band agrees on" -- a copy
     leaf over one feature, unreachable without it however deep the tree. */
  var F_ISSEP = feat("is_separator", 2.5);
  var F_PANR = feat("panel_row", 4.0), F_PANC = feat("panel_col", 4.0);
  var F_PIR = feat("in_panel_row", 3.5), F_PIC = feat("in_panel_col", 3.5);
  var F_PANEMPTY = feat("panel_empty", 3.0), F_PANFILL = feat("panel_fill", 4.0);
  var F_EXROW = feat("band_exemplar", 4.5), F_EXCOL = feat("stack_exemplar", 4.5);
  var F_EXALL = feat("grid_exemplar", 4.5);
  /* Diagonal coordinates. A tree tests one feature at a time, so "on the
     diagonal through the mark" -- a relation between seed_dr and seed_dc --
     is not reachable by testing either alone. Pre-computing the difference
     turns the family into one equality test against zero. */
  var F_DIAG = feat("r-c", 3.0), F_ADIAG = feat("r+c", 3.0);
  var F_ADIAGE = feat("r+c_from_end", 3.0);
  var F_SEEDD1 = feat("seed_diag", 4.0), F_SEEDD2 = feat("seed_anti", 4.0);
  var NFEAT = FEATURES.length;

  var ORDERED = {};
  [F_RING, F_ROW, F_COL, F_ROWB, F_COLB, F_N4CNT, F_N8CNT, F_N8SAME, F_DIST,
   F_OSIZE, F_OH, F_OW, F_OHOLE, F_ORANK, F_OCOUNT, F_ODR, F_ODC, F_ROWN,
   F_COLN, F_CRANK, F_CCNT, F_ROWSAME, F_COLSAME, F_OIDX, F_DU, F_DD, F_DL,
   F_DR, F_OSHAPE, F_CROW, F_CCOL, F_RUNIDX, F_RUNIDXB, F_CRUNIDX,
   F_CRUNIDXB, F_RUNN, F_CRUNN, F_O4SIZE, F_O4RANK, F_O4IDX,
   F_O4HOLE, F_SEEDDR, F_SEEDDC, F_SEEDD, F_BOXDR,
   F_BOXDC, F_PANR, F_PANC, F_PIR, F_PIC,
   F_PANFILL, F_ONOBJ, F_OSAMECOL, F_OSAMESIZE,
   F_ODENS, F_DIAG, F_ADIAG, F_ADIAGE,
   F_SEEDD1, F_SEEDD2].forEach(function (i) { ORDERED[i] = 1; });

  /* Features whose value IS a colour, so a leaf may copy one instead of naming
     a constant. This is the single largest gap in a constant-leaf tree: "every
     mark paints to the right edge" needs the leaf to emit the colour of the
     mark on this row, which is a different colour in every row and therefore
     not a constant at all. The same applies to symmetry completion, periodic
     fill and cascades. */
  var COPY = {};
  [F_NU, F_ND, F_NL, F_NR, F_DUL, F_DUR, F_DDL, F_DDR,
   F_RAYU, F_RAYD, F_RAYL, F_RAYR, F_RAYUL, F_RAYUR, F_RAYDL, F_RAYDR,
   F_NEAR, F_ONEAR, F_OCOL, F_MH, F_MV, F_M180, F_MT, F_PER,
   F_ROWMODE, F_COLMODE, F_BMH, F_BMV, F_BETW_HC, F_BETW_VC,
   F_ULQ, F_URQ, F_DLQ, F_DRQ,
   F_S2U, F_S2D, F_S2L, F_S2R, F_S3U, F_S3D, F_S3L, F_S3R,
   F_PERR, F_PERC, F_PREVR, F_PREVC, F_O4COL, F_BOXCOL, F_BETW_D1,
   F_BETW_D2, F_EXROW, F_EXCOL, F_EXALL].forEach(function (i) { COPY[i] = 1; });

  var N8D = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

  function at(g, r, c, h, w) { return (r >= 0 && r < h && c >= 0 && c < w) ? g[r][c] : OOB; }

  function zeros(h, w, v) {
    var o = [], r, c, row;
    for (r = 0; r < h; r++) { row = new Array(w); for (c = 0; c < w; c++) row[c] = v; o.push(row); }
    return o;
  }

  function rays(g, bg, h, w) {
    var up = zeros(h, w, OOB), dn = zeros(h, w, OOB);
    var lf = zeros(h, w, OOB), rt = zeros(h, w, OOB), r, c, last;
    for (c = 0; c < w; c++) {
      last = OOB;
      for (r = 0; r < h; r++) { up[r][c] = last; if (g[r][c] !== bg) last = g[r][c]; }
      last = OOB;
      for (r = h - 1; r >= 0; r--) { dn[r][c] = last; if (g[r][c] !== bg) last = g[r][c]; }
    }
    for (r = 0; r < h; r++) {
      last = OOB;
      for (c = 0; c < w; c++) { lf[r][c] = last; if (g[r][c] !== bg) last = g[r][c]; }
      last = OOB;
      for (c = w - 1; c >= 0; c--) { rt[r][c] = last; if (g[r][c] !== bg) last = g[r][c]; }
    }
    return [up, dn, lf, rt];
  }

  function diagRays(g, bg, h, w) {
    var ul = zeros(h, w, OOB), ur = zeros(h, w, OOB);
    var dl = zeros(h, w, OOB), dr = zeros(h, w, OOB), r, c, pr, pc;
    for (r = 0; r < h; r++) for (c = 0; c < w; c++) {
      pr = r - 1; pc = c - 1;
      ul[r][c] = (pr >= 0 && pc >= 0) ? (g[pr][pc] !== bg ? g[pr][pc] : ul[pr][pc]) : OOB;
      pr = r - 1; pc = c + 1;
      ur[r][c] = (pr >= 0 && pc < w) ? (g[pr][pc] !== bg ? g[pr][pc] : ur[pr][pc]) : OOB;
    }
    for (r = h - 1; r >= 0; r--) for (c = 0; c < w; c++) {
      pr = r + 1; pc = c - 1;
      dl[r][c] = (pr < h && pc >= 0) ? (g[pr][pc] !== bg ? g[pr][pc] : dl[pr][pc]) : OOB;
      pr = r + 1; pc = c + 1;
      dr[r][c] = (pr < h && pc < w) ? (g[pr][pc] !== bg ? g[pr][pc] : dr[pr][pc]) : OOB;
    }
    return [ul, ur, dl, dr];
  }

  /* Panels implied by uniform separator rows and columns. A separator is a
     whole row or column of one colour that is not the background; requiring a
     single colour across the line keeps an accidentally uniform background row
     from cutting the grid into nonsense. */
  function lattice(g, bg, h, w) {
    var sepR = {}, sepC = {}, r, c, v, ok, nR = 0, nC = 0;
    for (r = 0; r < h; r++) {
      v = g[r][0]; ok = v !== bg;
      for (c = 0; ok && c < w; c++) if (g[r][c] !== v) ok = false;
      if (ok) { sepR[r] = 1; nR++; }
    }
    for (c = 0; c < w; c++) {
      v = g[0][c]; ok = v !== bg;
      for (r = 0; ok && r < h; r++) if (g[r][c] !== v) ok = false;
      if (ok) { sepC[c] = 1; nC++; }
    }
    if (nR >= h || nC >= w) return [{}, {}, [], []];
    function runs(n, seps) {
      var out = [], start = null, i;
      for (i = 0; i < n; i++) {
        if (seps[i]) { if (start !== null) { out.push([start, i - 1]); start = null; } }
        else if (start === null) start = i;
      }
      if (start !== null) out.push([start, n - 1]);
      return out;
    }
    return [sepR, sepC, runs(h, sepR), runs(w, sepC)];
  }

  function panelFeatures(g, bg, h, w) {
    var L = lattice(g, bg, h, w), sepR = L[0], sepC = L[1], rr = L[2], cc = L[3];
    var r, c, i, j;
    function grid(v) {
      var o = [], k, row;
      for (k = 0; k < h; k++) { row = new Array(w); row.fill(v); o.push(row); }
      return o;
    }
    if (!rr.length || !cc.length || (rr.length < 2 && cc.length < 2))
      return [grid(0), grid(-1), grid(-1), grid(-1), grid(-1), grid(0), grid(-1),
              grid(OOB), grid(OOB), grid(OOB)];
    var panr = grid(-1), panc = grid(-1), pir = grid(-1), pic = grid(-1);
    var fill = grid(-1), issep = grid(0), empty = grid(0);
    for (r = 0; r < h; r++) for (c = 0; c < w; c++)
      if (sepR[r] || sepC[c]) issep[r][c] = 1;
    var counts = {};
    for (i = 0; i < rr.length; i++) for (j = 0; j < cc.length; j++) {
      var n = 0;
      for (r = rr[i][0]; r <= rr[i][1]; r++) for (c = cc[j][0]; c <= cc[j][1]; c++) {
        panr[r][c] = Math.min(i, 15); panc[r][c] = Math.min(j, 15);
        pir[r][c] = Math.min(r - rr[i][0], 15); pic[r][c] = Math.min(c - cc[j][0], 15);
        if (g[r][c] !== bg) n++;
      }
      counts[i + "," + j] = n;
      for (r = rr[i][0]; r <= rr[i][1]; r++) for (c = cc[j][0]; c <= cc[j][1]; c++) {
        fill[r][c] = Math.min(n, 15);
        empty[r][c] = n === 0 ? 1 : 0;
      }
    }
    function content(k) {
      var out = [], r2, c2;
      for (r2 = rr[k[0]][0]; r2 <= rr[k[0]][1]; r2++) {
        var row = [];
        for (c2 = cc[k[1]][0]; c2 <= cc[k[1]][1]; c2++) row.push(g[r2][c2]);
        out.push(row.join(","));
      }
      return out.join("/");
    }
    /* the panel the non-empty ones agree on, or null: requiring a single
       non-empty panel is too strict, since the common shape of these tasks is
       two or three already carrying the motif and the rest to be filled */
    function exemplar(keys) {
      var live = keys.filter(function (k) { return counts[k[0] + "," + k[1]] > 0; });
      if (!live.length) return null;
      var first = content(live[0]), q;
      for (q = 1; q < live.length; q++) if (content(live[q]) !== first) return null;
      return live[0];
    }
    function read(panel, r2, c2) {
      if (panel === null) return OOB;
      var pr = rr[panel[0]][0] + (r2 - rr[panr[r2][c2]][0]);
      var pc = cc[panel[1]][0] + (c2 - cc[panc[r2][c2]][0]);
      if (pr < 0 || pr >= h || pc < 0 || pc >= w) return OOB;
      return g[pr][pc];
    }
    var exrow = grid(OOB), excol = grid(OOB), exall = grid(OOB);
    var band = {}, stack = {}, all = [];
    for (i = 0; i < rr.length; i++) {
      var ks = [];
      for (j = 0; j < cc.length; j++) { ks.push([i, j]); all.push([i, j]); }
      band[i] = exemplar(ks);
    }
    for (j = 0; j < cc.length; j++) {
      var ks2 = [];
      for (i = 0; i < rr.length; i++) ks2.push([i, j]);
      stack[j] = exemplar(ks2);
    }
    var whole = exemplar(all);
    for (r = 0; r < h; r++) for (c = 0; c < w; c++) {
      if (panr[r][c] < 0 || panc[r][c] < 0) continue;
      exrow[r][c] = read(band[panr[r][c]], r, c);
      excol[r][c] = read(stack[panc[r][c]], r, c);
      exall[r][c] = read(whole, r, c);
    }
    return [issep, panr, panc, pir, pic, empty, fill, exrow, excol, exall];
  }

  function quadrantScan(g, bg, h, w) {
    function scan(rowsFwd, colsFwd) {
      var best = [], r, c, i, j, out = [];
      for (i = 0; i < h; i++) { best.push(new Array(w)); for (j = 0; j < w; j++) best[i][j] = null; }
      function later(a, b) {
        var ra = rowsFwd ? a[0] : -a[0], rb = rowsFwd ? b[0] : -b[0];
        var ca = colsFwd ? a[1] : -a[1], cb = colsFwd ? b[1] : -b[1];
        return ra !== rb ? ra > rb : ca > cb;
      }
      for (i = 0; i < h; i++) {
        r = rowsFwd ? i : h - 1 - i;
        for (j = 0; j < w; j++) {
          c = colsFwd ? j : w - 1 - j;
          var cur = g[r][c] !== bg ? [r, c, g[r][c]] : null;
          var prs = [[r, colsFwd ? c - 1 : c + 1], [rowsFwd ? r - 1 : r + 1, c]], k;
          for (k = 0; k < 2; k++) {
            var pr = prs[k][0], pc = prs[k][1];
            if (pr < 0 || pr >= h || pc < 0 || pc >= w) continue;
            var cand = best[pr][pc];
            if (cand !== null && (cur === null || later(cand, cur))) cur = cand;
          }
          best[r][c] = cur;
        }
      }
      for (i = 0; i < h; i++) {
        var row = new Array(w);
        for (j = 0; j < w; j++) row[j] = best[i][j] ? best[i][j][2] : OOB;
        out.push(row);
      }
      return out;
    }
    return [scan(true, true), scan(true, false), scan(false, true), scan(false, false)];
  }

  /* Chebyshev distance to the nearest mark, its colour, and its position. */
  function distMap(g, bg, h, w) {
    var INF = 99, d = zeros(h, w, INF), near = zeros(h, w, OOB), r, c, i, k, rr, cc;
    var src = [];
    for (r = 0; r < h; r++) {
      src.push(new Array(w));
      for (c = 0; c < w; c++) src[r][c] = null;
    }
    for (r = 0; r < h; r++) for (c = 0; c < w; c++)
      if (g[r][c] !== bg) { d[r][c] = 0; near[r][c] = g[r][c]; src[r][c] = [r, c]; }
    for (k = 0; k < 2; k++) {
      for (i = 0; i < h; i++) {
        r = k === 0 ? i : h - 1 - i;
        for (var j = 0; j < w; j++) {
          c = k === 0 ? j : w - 1 - j;
          for (var n = 0; n < 8; n++) {
            rr = r + N8D[n][0]; cc = c + N8D[n][1];
            if (rr >= 0 && rr < h && cc >= 0 && cc < w && d[rr][cc] + 1 < d[r][c]) {
              d[r][c] = d[rr][cc] + 1; near[r][c] = near[rr][cc]; src[r][c] = src[rr][cc];
            }
          }
        }
      }
    }
    var dist = zeros(h, w, 0);
    for (r = 0; r < h; r++) for (c = 0; c < w; c++) dist[r][c] = Math.min(d[r][c], 7);
    return [dist, near, src, d];
  }

  function period(g, h, w) {
    function best(n, get) {
      var p, i, ok;
      for (p = 1; p <= (n >> 1); p++) {
        if (n % p) continue;
        ok = true;
        for (i = 0; i < n && ok; i++) ok = get(i) === get(i % p);
        if (ok) return p;
      }
      return n;
    }
    var ph = best(h, function (i) { return g[i].join(","); });
    var pw = best(w, function (i) {
      var s = [], r; for (r = 0; r < h; r++) s.push(g[r][i]); return s.join(",");
    });
    return [ph, pw];
  }

  var FCACHE = new Map();

  /* Resolve a task-level background, or read one off this grid. */
  function bgOf(g, bg) { return bg === null ? G.background(g) : bg; }

  function features(g, bg) {
    bg = bgOf(g, bg);
    var key = G.gkey(g) + "|" + bg;
    var hit = FCACHE.get(key);
    if (hit) return hit;
    var out = buildFeatures(g, bg);
    if (FCACHE.size > 256) FCACHE.clear();
    FCACHE.set(key, out);
    return out;
  }

  function mode(vals) {
    var m = new Map(), i, bestV = null, bestN = -1;
    for (i = 0; i < vals.length; i++) m.set(vals[i], (m.get(vals[i]) || 0) + 1);
    Array.from(m.keys()).sort(function (a, b) { return a - b; }).forEach(function (v) {
      if (m.get(v) > bestN) { bestN = m.get(v); bestV = v; }
    });
    return bestV;
  }

  function buildFeatures(g, bg) {
    var d = G.dims(g), h = d[0], w = d[1];
    var R = rays(g, bg, h, w), up = R[0], dn = R[1], lf = R[2], rt = R[3];
    var DR = diagRays(g, bg, h, w), dul = DR[0], dur = DR[1], ddl = DR[2], ddr = DR[3];
    var DM = distMap(g, bg, h, w), dist = DM[0], near = DM[1];
    var src = DM[2], rawdist = DM[3];
    var QS = quadrantScan(g, bg, h, w);
    var qul = QS[0], qur = QS[1], qdl = QS[2], qdr = QS[3];
    var PF = panelFeatures(g, bg, h, w);
    var issep = PF[0], panr = PF[1], panc = PF[2], pir = PF[3], pic = PF[4];
    var panempty = PF[5], panfill = PF[6];
    var exrow = PF[7], excol = PF[8], exall = PF[9];
    var P = period(g, h, w), ph = P[0], pw = P[1];
    var hist = G.histogram(g);
    var colors = Object.keys(hist).map(Number).sort(function (a, b) {
      return (hist[b] - hist[a]) || (a - b);
    });
    var ranks = {}, i;
    for (i = 0; i < colors.length; i++) ranks[colors[i]] = i;

    var objs = [];
    try { objs = O.segment(g, "c8", bg) || []; } catch (e) { objs = []; }
    if (objs.length > 200) objs = [];
    var sizes = [], shapeN = new Map(), r, c;
    for (i = 0; i < objs.length; i++) {
      if (sizes.indexOf(objs[i].size()) < 0) sizes.push(objs[i].size());
      var nk = objs[i].norm_key();
      shapeN.set(nk, (shapeN.get(nk) || 0) + 1);
    }
    sizes.sort(function (a, b) { return b - a; });
    var objs4 = [];
    try { objs4 = O.segment(g, "c4", bg) || []; } catch (e) { objs4 = []; }
    if (objs4.length > 200) objs4 = [];
    var sizes4 = Array.from(new Set(objs4.map(function (o) { return o.size(); })))
      .sort(function (a, b) { return b - a; });
    var o4 = new Map();
    objs4.slice().sort(function (a, b) { return (a.r0 - b.r0) || (a.c0 - b.c0); })
      .forEach(function (o, idx) {
        var info4 = [Math.min(o.size(), 30), sizes4.indexOf(o.size()),
                     Math.min(idx, 15), Math.min(o.holes_count(), 4),
                     o.touches_border() ? 1 : 0, o.color];
        var it4 = o.cells.values(), s4 = it4.next();
        while (!s4.done) { o4.set(s4.value, info4); s4 = it4.next(); }
      });

    var byColor = {}, bySize = {}, oi2;
    for (oi2 = 0; oi2 < objs.length; oi2++) {
      byColor[objs[oi2].color] = (byColor[objs[oi2].color] || 0) + 1;
      bySize[objs[oi2].size()] = (bySize[objs[oi2].size()] || 0) + 1;
    }
    var rel = new Map();
    for (oi2 = 0; oi2 < objs.length; oi2++) {
      var oo = objs[oi2], inside = 0, contains = 0, bi2;
      for (bi2 = 0; bi2 < objs.length; bi2++) {
        if (bi2 === oi2) continue;
        var qq = objs[bi2];
        if (qq.r0 <= oo.r0 && qq.c0 <= oo.c0 && oo.r1 <= qq.r1 && oo.c1 <= qq.c1) inside = 1;
        if (oo.r0 <= qq.r0 && oo.c0 <= qq.c0 && qq.r1 <= oo.r1 && qq.c1 <= oo.c1) contains = 1;
      }
      var pt = oo.patch();
      var ptH = pt.map(function (row) { return row.slice().reverse().join(","); }).join("/");
      var ptV = pt.slice().reverse().map(function (row) { return row.join(","); }).join("/");
      var ptS = pt.map(function (row) { return row.join(","); }).join("/");
      var sym = (ptS === ptH || ptS === ptV) ? 1 : 0;
      var dens = Math.min(Math.floor(4.0 * oo.size() / Math.max(1, oo.bbox_area())), 4);
      var info = [Math.min(byColor[oo.color] || 0, 15),
                  Math.min(bySize[oo.size()] || 0, 15), dens, sym, inside, contains];
      var itr = oo.cells.values(), sr = itr.next();
      while (!sr.done) { rel.set(sr.value, info); sr = itr.next(); }
    }
    var nObjs = Math.min(objs.length, 15);

    var shapeRank = new Map();
    Array.from(shapeN.keys()).sort(function (a, b) {
      return (shapeN.get(b) - shapeN.get(a)) || (a < b ? -1 : a > b ? 1 : 0);
    }).forEach(function (k, idx) { shapeRank.set(k, Math.min(idx, 15)); });

    var omap = new Map(), oidx = new Map(), oshape = new Map(), ocol = new Map();
    var byPos = objs.slice().sort(function (a, b) { return (a.r0 - b.r0) || (a.c0 - b.c0); });
    for (i = 0; i < byPos.length; i++) {
      var o = byPos[i];
      var info = [Math.min(o.size(), 30), Math.min(o.height(), 15), Math.min(o.width(), 15),
                  o.is_rect() ? 1 : 0, o.is_square() ? 1 : 0,
                  Math.min(o.holes_count(), 4), o.touches_border() ? 1 : 0,
                  sizes.indexOf(o.size()), shapeN.get(o.norm_key()) || 0, o.r0, o.c0];
      var it = o.cells.values(), s = it.next();
      while (!s.done) {
        omap.set(s.value, info);
        oidx.set(s.value, Math.min(i, 15));
        oshape.set(s.value, shapeRank.has(o.norm_key()) ? shapeRank.get(o.norm_key()) : -1);
        ocol.set(s.value, o.color);
        s = it.next();
      }
    }

    var rowuni = [], coluni = [], rown = [], coln = [], rowmode = [], colmode = [];
    var rowcnt = [], colcnt = [];
    for (r = 0; r < h; r++) {
      var seen = {}, n = 0, cnt = {};
      for (c = 0; c < w; c++) { seen[g[r][c]] = 1; if (g[r][c] !== bg) n++; cnt[g[r][c]] = (cnt[g[r][c]] || 0) + 1; }
      rowuni.push(Object.keys(seen).length === 1 ? 1 : 0);
      rown.push(Math.min(n, 9));
      rowmode.push(mode(g[r]));
      rowcnt.push(cnt);
    }
    for (c = 0; c < w; c++) {
      var col = [], cnt2 = {}, n2 = 0, seen2 = {};
      for (r = 0; r < h; r++) { col.push(g[r][c]); seen2[g[r][c]] = 1; if (g[r][c] !== bg) n2++; cnt2[g[r][c]] = (cnt2[g[r][c]] || 0) + 1; }
      coluni.push(Object.keys(seen2).length === 1 ? 1 : 0);
      coln.push(Math.min(n2, 9));
      colmode.push(mode(col));
      colcnt.push(cnt2);
    }

    var br0 = 1e6, bc0 = 1e6, br1 = -1, bc1 = -1;
    for (r = 0; r < h; r++) for (c = 0; c < w; c++) if (g[r][c] !== bg) {
      if (r < br0) br0 = r; if (c < bc0) bc0 = c;
      if (r > br1) br1 = r; if (c > bc1) bc1 = c;
    }
    if (br1 < 0) { br0 = 0; bc0 = 0; br1 = h - 1; bc1 = w - 1; }

    var dU = zeros(h, w, 15), dD = zeros(h, w, 15), dLm = zeros(h, w, 15), dRm = zeros(h, w, 15), last;
    for (c = 0; c < w; c++) {
      last = -1;
      for (r = 0; r < h; r++) { dU[r][c] = last >= 0 ? Math.min(r - last, 15) : 15; if (g[r][c] !== bg) last = r; }
      last = -1;
      for (r = h - 1; r >= 0; r--) { dD[r][c] = last >= 0 ? Math.min(last - r, 15) : 15; if (g[r][c] !== bg) last = r; }
    }
    for (r = 0; r < h; r++) {
      last = -1;
      for (c = 0; c < w; c++) { dLm[r][c] = last >= 0 ? Math.min(c - last, 15) : 15; if (g[r][c] !== bg) last = c; }
      last = -1;
      for (c = w - 1; c >= 0; c--) { dRm[r][c] = last >= 0 ? Math.min(last - c, 15) : 15; if (g[r][c] !== bg) last = c; }
    }

    var box = new Map();
    objs.slice().sort(function (a, b) { return b.bbox_area() - a.bbox_area(); })
      .forEach(function (o) {
        var rr2, cc2;
        for (rr2 = o.r0; rr2 <= o.r1; rr2++)
          for (cc2 = o.c0; cc2 <= o.c1; cc2++)
            box.set(rr2 * 64 + cc2, [o.r0, o.c0, o.color]);
      });

    var rowidx = [], rowidxb = [], rowmarks = [], colidx = [], colidxb = [], colmarks = [];
    for (r = 0; r < h; r++) {
      rowidx.push(new Array(w)); rowidxb.push(new Array(w));
      colidx.push(new Array(w)); colidxb.push(new Array(w));
      for (c = 0; c < w; c++) { rowidx[r][c] = -1; rowidxb[r][c] = -1; colidx[r][c] = -1; colidxb[r][c] = -1; }
    }
    for (r = 0; r < h; r++) {
      var marks = [];
      for (c = 0; c < w; c++) if (g[r][c] !== bg) marks.push(c);
      rowmarks.push(Math.min(marks.length, 15));
      for (var mi = 0; mi < marks.length; mi++) {
        rowidx[r][marks[mi]] = Math.min(mi, 15);
        rowidxb[r][marks[mi]] = Math.min(marks.length - 1 - mi, 15);
      }
    }
    for (c = 0; c < w; c++) {
      var cmarks = [];
      for (r = 0; r < h; r++) if (g[r][c] !== bg) cmarks.push(r);
      colmarks.push(Math.min(cmarks.length, 15));
      for (var mj = 0; mj < cmarks.length; mj++) {
        colidx[cmarks[mj]][c] = Math.min(mj, 15);
        colidxb[cmarks[mj]][c] = Math.min(cmarks.length - 1 - mj, 15);
      }
    }

    var sq = h === w, out = [];
    for (r = 0; r < h; r++) {
      var orow = [];
      for (c = 0; c < w; c++) {
        var v = g[r][c], n8 = [], fg = [], mask = 0, j;
        for (j = 0; j < 8; j++) {
          var x = at(g, r + N8D[j][0], c + N8D[j][1], h, w);
          n8.push(x);
          if (x !== bg && x !== OOB) { fg.push(x); mask |= 1 << j; }
        }
        var f = new Array(NFEAT), p = r * 64 + c, oi = omap.get(p);
        for (j = 0; j < NFEAT; j++) f[j] = 0;
        f[F_V] = v;
        f[F_R2] = r % 2; f[F_C2] = c % 2; f[F_D2] = (r + c) % 2;
        f[F_R3] = r % 3; f[F_C3] = c % 3;
        f[F_BORDER] = (r === 0 || c === 0 || r === h - 1 || c === w - 1) ? 1 : 0;
        f[F_RING] = Math.min(r, c, h - 1 - r, w - 1 - c, 6);
        f[F_ROW] = Math.min(r, 15); f[F_COL] = Math.min(c, 15);
        f[F_ROWB] = Math.min(h - 1 - r, 15); f[F_COLB] = Math.min(w - 1 - c, 15);
        f[F_N4CNT] = [n8[1], n8[3], n8[4], n8[6]].filter(function (x) {
          return x !== bg && x !== OOB; }).length;
        f[F_N8CNT] = fg.length;
        f[F_N8SAME] = n8.filter(function (x) { return x === v; }).length;
        f[F_N8MASK] = mask;
        f[F_NU] = n8[1]; f[F_ND] = n8[6]; f[F_NL] = n8[3]; f[F_NR] = n8[4];
        f[F_DUL] = n8[0]; f[F_DUR] = n8[2]; f[F_DDL] = n8[5]; f[F_DDR] = n8[7];
        f[F_RAYU] = up[r][c]; f[F_RAYD] = dn[r][c];
        f[F_RAYL] = lf[r][c]; f[F_RAYR] = rt[r][c];
        f[F_ENCL] = (up[r][c] !== OOB && dn[r][c] !== OOB &&
                     lf[r][c] !== OOB && rt[r][c] !== OOB) ? 1 : 0;
        f[F_DIST] = dist[r][c]; f[F_NEAR] = near[r][c];
        if (oi) {
          f[F_OSIZE] = oi[0]; f[F_OH] = oi[1]; f[F_OW] = oi[2];
          f[F_ORECT] = oi[3]; f[F_OSQ] = oi[4]; f[F_OHOLE] = oi[5];
          f[F_OTOUCH] = oi[6]; f[F_ORANK] = oi[7]; f[F_OCOUNT] = oi[8];
          f[F_ODR] = Math.min(r - oi[9], 9); f[F_ODC] = Math.min(c - oi[10], 9);
        } else {
          f[F_OSIZE] = f[F_OH] = f[F_OW] = -1;
          f[F_ORECT] = f[F_OSQ] = f[F_OHOLE] = f[F_OTOUCH] = -1;
          f[F_ORANK] = f[F_OCOUNT] = f[F_ODR] = f[F_ODC] = -1;
        }
        f[F_ROWUNI] = rowuni[r]; f[F_COLUNI] = coluni[c];
        f[F_ROWN] = rown[r]; f[F_COLN] = coln[c];
        f[F_MH] = g[r][w - 1 - c]; f[F_MV] = g[h - 1 - r][c];
        f[F_M180] = g[h - 1 - r][w - 1 - c];
        f[F_MT] = sq ? g[c][r] : OOB;
        f[F_PER] = g[r % ph][c % pw];
        f[F_CRANK] = (v in ranks) ? ranks[v] : -1;
        f[F_CCNT] = Math.min(hist[v] || 0, 30);
        f[F_RAYUL] = dul[r][c]; f[F_RAYUR] = dur[r][c];
        f[F_RAYDL] = ddl[r][c]; f[F_RAYDR] = ddr[r][c];
        f[F_BETW_H] = (lf[r][c] !== OOB && rt[r][c] !== OOB) ? 1 : 0;
        f[F_BETW_V] = (up[r][c] !== OOB && dn[r][c] !== OOB) ? 1 : 0;
        f[F_BETW_HC] = (lf[r][c] !== OOB && lf[r][c] === rt[r][c]) ? lf[r][c] : OOB;
        f[F_BETW_VC] = (up[r][c] !== OOB && up[r][c] === dn[r][c]) ? up[r][c] : OOB;
        f[F_ROWMODE] = rowmode[r]; f[F_COLMODE] = colmode[c];
        f[F_ROWSAME] = Math.min(rowcnt[r][v] || 0, 15);
        f[F_COLSAME] = Math.min(colcnt[c][v] || 0, 15);
        f[F_QUAD] = (r >= ((h + 1) >> 1) ? 2 : 0) + (c >= ((w + 1) >> 1) ? 1 : 0);
        f[F_BMH] = (c >= bc0 && c <= bc1) ? g[r][bc0 + bc1 - c] : OOB;
        f[F_BMV] = (r >= br0 && r <= br1) ? g[br0 + br1 - r][c] : OOB;
        f[F_OIDX] = oidx.has(p) ? oidx.get(p) : -1;
        f[F_ONEAR] = near[r][c];
        f[F_OSHAPE] = oshape.has(p) ? oshape.get(p) : -1;
        f[F_OCOL] = ocol.has(p) ? ocol.get(p) : -1;
        f[F_DU] = dU[r][c]; f[F_DD] = dD[r][c];
        f[F_DL] = dLm[r][c]; f[F_DR] = dRm[r][c];
        var srt = 0;
        fg.slice().sort(function (a, b) { return a - b; }).forEach(function (x) {
          srt = srt * 11 + (x + 1);
        });
        f[F_N8SORT] = srt % 100003;
        f[F_CROW] = Math.max(-9, Math.min(9, r - ((h - 1) >> 1)));
        f[F_CCOL] = Math.max(-9, Math.min(9, c - ((w - 1) >> 1)));
        f[F_CENTRE] = ((2 * r === h - 1 || 2 * r === h) &&
                       (2 * c === w - 1 || 2 * c === w)) ? 1 : 0;
        f[F_ULQ] = qul[r][c]; f[F_URQ] = qur[r][c];
        f[F_DLQ] = qdl[r][c]; f[F_DRQ] = qdr[r][c];
        f[F_RUNIDX] = rowidx[r][c]; f[F_RUNIDXB] = rowidxb[r][c];
        f[F_RUNPAR] = rowidx[r][c] < 0 ? -1 : rowidx[r][c] % 2;
        f[F_RUNN] = rowmarks[r];
        f[F_CRUNIDX] = colidx[r][c]; f[F_CRUNIDXB] = colidxb[r][c];
        f[F_CRUNPAR] = colidx[r][c] < 0 ? -1 : colidx[r][c] % 2;
        f[F_CRUNN] = colmarks[c];
        f[F_S2U] = at(g, r - 2, c, h, w); f[F_S2D] = at(g, r + 2, c, h, w);
        f[F_S2L] = at(g, r, c - 2, h, w); f[F_S2R] = at(g, r, c + 2, h, w);
        f[F_S3U] = at(g, r - 3, c, h, w); f[F_S3D] = at(g, r + 3, c, h, w);
        f[F_S3L] = at(g, r, c - 3, h, w); f[F_S3R] = at(g, r, c + 3, h, w);
        f[F_PERR] = g[r % ph][c]; f[F_PERC] = g[r][c % pw];
        f[F_PREVR] = at(g, r - ph, c, h, w); f[F_PREVC] = at(g, r, c - pw, h, w);
        var oi4 = o4.get(p);
        if (oi4) {
          f[F_O4SIZE] = oi4[0]; f[F_O4RANK] = oi4[1]; f[F_O4IDX] = oi4[2];
          f[F_O4HOLE] = oi4[3]; f[F_O4TOUCH] = oi4[4]; f[F_O4COL] = oi4[5];
        } else {
          f[F_O4SIZE] = f[F_O4RANK] = f[F_O4IDX] = -1;
          f[F_O4HOLE] = f[F_O4TOUCH] = f[F_O4COL] = -1;
        }
        f[F_DIAG] = r - c;
        f[F_ADIAG] = r + c;
        f[F_ADIAGE] = r + c - (h - 1);
        var sp = src[r][c];
        if (sp === null) {
          f[F_SEEDDR] = 0; f[F_SEEDDC] = 0; f[F_SEEDD] = 15;
          f[F_SEEDD1] = 99; f[F_SEEDD2] = 99;
        } else {
          f[F_SEEDDR] = Math.max(-6, Math.min(6, r - sp[0]));
          f[F_SEEDDC] = Math.max(-6, Math.min(6, c - sp[1]));
          f[F_SEEDD] = Math.min(rawdist[r][c], 15);
          /* raw, not the clamped pair: the point is to stay exact far from
             the seed, which is where a clamped offset stops distinguishing
             one diagonal from the next. */
          f[F_SEEDD1] = (r - sp[0]) - (c - sp[1]);
          f[F_SEEDD2] = (r - sp[0]) + (c - sp[1]);
        }
        var bx = box.get(p);
        if (!bx) { f[F_BOXIN] = 0; f[F_BOXDR] = -1; f[F_BOXDC] = -1; f[F_BOXCOL] = OOB; }
        else {
          f[F_BOXIN] = 1;
          f[F_BOXDR] = Math.min(r - bx[0], 9);
          f[F_BOXDC] = Math.min(c - bx[1], 9);
          f[F_BOXCOL] = bx[2];
        }
        f[F_BETW_D1] = (dul[r][c] !== OOB && dul[r][c] === ddr[r][c]) ? dul[r][c] : OOB;
        f[F_BETW_D2] = (dur[r][c] !== OOB && dur[r][c] === ddl[r][c]) ? dur[r][c] : OOB;
        var ri = rel.get(p);
        f[F_ONOBJ] = nObjs;
        if (!ri) {
          f[F_OSAMECOL] = f[F_OSAMESIZE] = f[F_ODENS] = -1;
          f[F_OSYM] = f[F_OINSIDE] = f[F_OCONTAINS] = -1;
        } else {
          f[F_OSAMECOL] = ri[0]; f[F_OSAMESIZE] = ri[1]; f[F_ODENS] = ri[2];
          f[F_OSYM] = ri[3]; f[F_OINSIDE] = ri[4]; f[F_OCONTAINS] = ri[5];
        }
        f[F_ISSEP] = issep[r][c];
        f[F_PANR] = panr[r][c]; f[F_PANC] = panc[r][c];
        f[F_PIR] = pir[r][c]; f[F_PIC] = pic[r][c];
        f[F_PANEMPTY] = panempty[r][c]; f[F_PANFILL] = panfill[r][c];
        f[F_EXROW] = exrow[r][c]; f[F_EXCOL] = excol[r][c]; f[F_EXALL] = exall[r][c];
        orow.push(f);
      }
      out.push(orow);
    }
    return out;
  }

  /* ---- tree induction -------------------------------------------------- */

  function entropy(counts, n) {
    var e = 0.0, k, p;
    for (k in counts) if (counts.hasOwnProperty(k)) { p = counts[k] / n; e -= p * Math.log(p) / Math.LN2; }
    return e;
  }

  /* A feature every row in this node agrees with, cheapest first. */
  function copyLeaf(rows, allowed) {
    var best = null, ai, i;
    for (ai = 0; ai < allowed.length; ai++) {
      var fi = allowed[ai];
      if (!COPY[fi]) continue;
      var ok = true;
      for (i = 0; i < rows.length; i++)
        if (rows[i][0][fi] !== rows[i][1]) { ok = false; break; }
      if (ok && (best === null || FEATURES[fi][1] < FEATURES[best][1])) best = fi;
    }
    return best;
  }

  function grow(rows, allowed, depth, budget, state) {
    var ys = {}, i, n = rows.length, distinct = 0;
    for (i = 0; i < n; i++) {
      ys[rows[i][1]] = (ys[rows[i][1]] || 0) + 1;
    }
    for (var k in ys) if (ys.hasOwnProperty(k)) distinct++;
    /* the leaf carries the label itself, not the object key it was counted
       under: coercing the key back with + works for a colour and gives NaN for
       any label that is not a number, which is every label the panel
       vocabulary uses */
    if (distinct === 1) return { leaf: true, value: rows[0][1], copy: null };
    var fiCopy = copyLeaf(rows, allowed);
    if (fiCopy !== null) return { leaf: true, value: null, copy: fiCopy };
    if (depth >= MAX_DEPTH || state.leaves >= budget || n < 2) return null;
    var base = entropy(ys, n), best = null;

    function consider(fi, val, ycounts, op) {
      var kk = 0, y;
      for (y in ycounts) if (ycounts.hasOwnProperty(y)) kk += ycounts[y];
      if (kk === 0 || kk === n) return null;
      var rest = {}, pure = 0;
      for (y in ys) if (ys.hasOwnProperty(y)) {
        var left = ys[y] - (ycounts[y] || 0);
        if (left) rest[y] = left;
      }
      for (y in ycounts) if (ycounts.hasOwnProperty(y)) pure++;
      var gain = base - (kk / n) * entropy(ycounts, kk) - ((n - kk) / n) * entropy(rest, n - kk);
      if (pure === 1) gain += 0.05;
      return [gain, -FEATURES[fi][1], -fi, op === "eq" ? 0 : 1, -val];
    }

    function better(a, b) {
      var i2;
      for (i2 = 0; i2 < a.length; i2++) if (a[i2] !== b[i2]) return a[i2] > b[i2];
      return false;
    }

    for (var ai = 0; ai < allowed.length; ai++) {
      var fi = allowed[ai], groups = new Map();
      for (i = 0; i < n; i++) {
        var v = rows[i][0][fi], gmap = groups.get(v);
        if (!gmap) { gmap = {}; groups.set(v, gmap); }
        gmap[rows[i][1]] = (gmap[rows[i][1]] || 0) + 1;
      }
      if (groups.size < 2) continue;
      var vals = Array.from(groups.keys()).sort(function (a, b) { return a - b; });
      for (i = 0; i < vals.length; i++) {
        var sc = consider(fi, vals[i], groups.get(vals[i]), "eq");
        if (sc && (best === null || better(sc, best[0]))) best = [sc, fi, vals[i], "eq"];
      }
      if (ORDERED[fi]) {
        var acc = {};
        for (i = 0; i < vals.length - 1; i++) {
          var gm = groups.get(vals[i]), y2;
          for (y2 in gm) if (gm.hasOwnProperty(y2)) acc[y2] = (acc[y2] || 0) + gm[y2];
          var sc2 = consider(fi, vals[i], acc, "le");
          if (sc2 && (best === null || better(sc2, best[0]))) best = [sc2, fi, vals[i], "le"];
        }
      }
    }
    if (best === null || best[0][0] <= 1e-9) return null;
    var FI = best[1], VAL = best[2], OP = best[3];
    var yes = [], no = [];
    for (i = 0; i < n; i++) {
      var hit = OP === "eq" ? (rows[i][0][FI] === VAL) : (rows[i][0][FI] <= VAL);
      (hit ? yes : no).push(rows[i]);
    }
    state.leaves++; state.splits++;
    var a = grow(yes, allowed, depth + 1, budget, state);
    if (a === null) return null;
    var b = grow(no, allowed, depth + 1, budget, state);
    if (b === null) return null;
    return { leaf: false, fi: FI, value: VAL, op: OP, yes: a, no: b };
  }

  function predict(node, f) {
    while (!node.leaf)
      node = (node.op === "eq" ? f[node.fi] === node.value : f[node.fi] <= node.value)
        ? node.yes : node.no;
    return (node.copy === null || node.copy === undefined) ? node.value : f[node.copy];
  }

  function treeBits(node) {
    /* a copy leaf names a feature rather than a colour, and pays for it */
    if (node.leaf)
      return (node.copy === null || node.copy === undefined)
        ? 4.0 : 3.0 + FEATURES[node.copy][1];
    return 2.0 + FEATURES[node.fi][1] + 4.0 + treeBits(node.yes) + treeBits(node.no);
  }

  function rowsFor(pairs, bg, delta) {
    var rows = [], n = 0, i, r, c;
    for (i = 0; i < pairs.length; i++) {
      var a = pairs[i][0], b = pairs[i][1];
      var da = G.dims(a), db = G.dims(b);
      if (da[0] !== db[0] || da[1] !== db[1]) return null;
      n += da[0] * da[1];
      if (n > CAP) return null;
      var fa = features(a, bg);
      for (r = 0; r < da[0]; r++) for (c = 0; c < da[1]; c++) {
        var y = b[r][c];
        if (delta && y === a[r][c]) y = KEEP;
        rows.push([fa[r][c], y]);
      }
    }
    return rows;
  }

  function applyTree(node, g, bg, delta) {
    var d = G.dims(g), h = d[0], w = d[1], fa = features(g, bg), out = [], r, c, row, v;
    for (r = 0; r < h; r++) {
      row = new Array(w);
      for (c = 0; c < w; c++) {
        v = predict(node, fa[r][c]);
        row[c] = (delta && v === KEEP) ? g[r][c] : v;
      }
      out.push(row);
    }
    return out;
  }

  function banks() {
    var local = [F_V, F_NU, F_ND, F_NL, F_NR, F_DUL, F_DUR, F_DDL, F_DDR,
                 F_N4CNT, F_N8CNT, F_N8SAME, F_N8MASK];
    var pos = [F_V, F_R2, F_C2, F_D2, F_R3, F_C3, F_BORDER, F_RING, F_ROW, F_COL,
               F_ROWB, F_COLB, F_ROWUNI, F_COLUNI, F_ROWN, F_COLN, F_QUAD,
               F_CROW, F_CCOL, F_CENTRE, F_DIAG, F_ADIAG, F_ADIAGE];
    var obj = [F_V, F_OSIZE, F_OH, F_OW, F_ORECT, F_OSQ, F_OHOLE, F_OTOUCH,
               F_ORANK, F_OCOUNT, F_ODR, F_ODC, F_ENCL, F_OIDX, F_ONEAR,
               F_OSHAPE, F_OCOL, F_ONOBJ, F_OSAMECOL, F_OSAMESIZE, F_ODENS,
               F_OSYM, F_OINSIDE, F_OCONTAINS];
    var field = [F_V, F_RAYU, F_RAYD, F_RAYL, F_RAYR, F_DIST, F_NEAR, F_ENCL,
                 F_CRANK, F_CCNT, F_BETW_H, F_BETW_V, F_BETW_HC, F_BETW_VC];
    var diag = [F_V, F_RAYUL, F_RAYUR, F_RAYDL, F_RAYDR, F_DIST, F_NEAR,
                F_RAYU, F_RAYD, F_RAYL, F_RAYR, F_DIAG, F_ADIAG, F_ADIAGE,
                F_SEEDD1, F_SEEDD2];
    var gap = [F_V, F_DU, F_DD, F_DL, F_DR, F_RAYU, F_RAYD, F_RAYL, F_RAYR,
               F_BETW_H, F_BETW_V, F_BETW_HC, F_BETW_VC, F_DIST,
               F_BETW_D1, F_BETW_D2];
    var draw = [F_V, F_SEEDDR, F_SEEDDC, F_SEEDD, F_NEAR, F_BOXIN, F_BOXDR,
                F_BOXDC, F_BOXCOL, F_OSHAPE, F_ENCL, F_BETW_D1, F_BETW_D2,
                F_SEEDD1, F_SEEDD2];
    var latticeBank = [F_V, F_ISSEP, F_PANEMPTY, F_PANFILL, F_PIR, F_PIC,
                       F_PANR, F_PANC, F_EXROW, F_EXCOL, F_EXALL];
    var shape = [F_V, F_OSHAPE, F_OCOL, F_OSIZE, F_ODR, F_ODC, F_OCOUNT,
                 F_N8SORT, F_N8MASK];
    var sym = [F_V, F_MH, F_MV, F_M180, F_MT, F_PER, F_ROW, F_COL, F_BMH, F_BMV,
               F_PERR, F_PERC, F_PREVR, F_PREVC,
               F_S2U, F_S2D, F_S2L, F_S2R, F_S3U, F_S3D, F_S3L, F_S3R];
    var raypos = [F_V, F_RAYU, F_RAYD, F_RAYL, F_RAYR, F_BORDER, F_ROW, F_COL,
                  F_ROWB, F_COLB, F_RING, F_CROW, F_CCOL, F_DIST];
    var cascade = [F_V, F_ULQ, F_URQ, F_DLQ, F_DRQ, F_RAYU, F_RAYD, F_RAYL,
                   F_RAYR, F_BORDER, F_ROWB, F_COLB];
    var rank = [F_V, F_RUNIDX, F_RUNIDXB, F_RUNPAR, F_RUNN, F_CRUNIDX,
                F_CRUNIDXB, F_CRUNPAR, F_CRUNN, F_ORANK, F_OIDX, F_OSIZE];
    /* which object this is, relative to the others */
    var odd = [F_V, F_OSAMECOL, F_OSAMESIZE, F_ONOBJ, F_ORANK, F_OCOUNT,
               F_OSHAPE, F_OSYM, F_OINSIDE, F_OCONTAINS, F_ODENS, F_OTOUCH,
               F_OHOLE, F_OCOL];
    var obj4 = [F_V, F_O4SIZE, F_O4RANK, F_O4IDX, F_O4HOLE, F_O4TOUCH, F_O4COL,
                F_ENCL, F_DIST, F_NEAR];
    var line = [F_V, F_ROWMODE, F_COLMODE, F_ROWSAME, F_COLSAME, F_ROWUNI,
                F_COLUNI, F_ROWN, F_COLN, F_BETW_HC, F_BETW_VC];
    function uniq(a) {
      var s = {}, o = [], i;
      for (i = 0; i < a.length; i++) if (!s[a[i]]) { s[a[i]] = 1; o.push(a[i]); }
      return o.sort(function (x, y) { return x - y; });
    }
    var all = [], i;
    for (i = 0; i < NFEAT; i++) all.push(i);
    return [["local", local], ["pos", pos], ["obj", obj], ["field", field],
            ["diag", diag], ["sym", sym], ["line", line], ["gap", gap],
            ["shape", shape], ["ray+pos", raypos], ["cascade", cascade],
            ["rank", rank], ["obj4", obj4], ["odd", odd], ["draw", draw],
            ["lattice", latticeBank],
            ["local+pos", uniq(local.concat(pos))],
            ["obj+field", uniq(obj.concat(field))], ["all", all]];
  }

  function fitPairs(pairs, bg, bankList, delta, deadline) {
    var rows = rowsFor(pairs, bg, delta);
    if (!rows || !rows.length) return [];
    var ceiling = Math.max(4, Math.min(64, Math.floor(rows.length / 12)));
    var ladder = [3, 6, 12, 24, 48, 96].filter(function (b) { return b <= ceiling; });
    if (!ladder.length) ladder = [ceiling];
    if (ladder[ladder.length - 1] < ceiling) ladder.push(ceiling);
    var folds = null, i, b;
    if (pairs.length >= 3) {
      folds = [];
      for (i = 0; i < pairs.length; i++)
        folds.push(rowsFor(pairs.slice(0, i).concat(pairs.slice(i + 1)), bg, delta));
    }
    var out = [], list = bankList || banks();
    for (var bi = 0; bi < list.length; bi++) {
      if (deadline !== null && deadline !== undefined && nowMs() >= deadline) break;
      var label = list[bi][0], allowed = list[bi][1], tree = null;
      var state = { leaves: 0, splits: 0 };
      for (i = 0; i < ladder.length; i++) {
        state = { leaves: 0, splits: 0 };
        tree = grow(rows, allowed, 0, ladder[i], state);
        if (tree !== null) break;
      }
      if (tree === null) continue;
      var ok = true;
      if (folds) {
        for (i = 0; i < folds.length && ok; i++) {
          if (!folds[i] || (deadline !== null && deadline !== undefined
                            && nowMs() >= deadline)) { ok = false; break; }
          var t2 = null;
          for (b = 0; b < ladder.length; b++) {
            t2 = grow(folds[i], allowed, 0, ladder[b], { leaves: 0, splits: 0 });
            if (t2 !== null) break;
          }
          if (t2 === null) { ok = false; break; }
          try {
            if (!G.gEq(applyTree(t2, pairs[i][0], bg, delta), pairs[i][1])) ok = false;
          } catch (e) { ok = false; }
        }
      }
      out.push([label, tree, treeBits(tree), state.splits, ok]);
    }
    return out;
  }

  function generate(ctx) {
    if (!ctx.same_shape()) return [];
    var res = [], di, i, bi;
    var pairs = ctx.train;
    /* bg null resolves the background per grid: when the task draws each
       example on a different coloured field, one task-level background is
       wrong for most of them and every object, ray and distance feature is
       then measured against the wrong thing. */
    var backgrounds = ctx.bg_varies() ? [ctx.bg(), null] : [ctx.bg()];
    for (bi = 0; bi < backgrounds.length; bi++) {
      var bg = backgrounds[bi];
      for (di = 0; di < 2; di++) {
        var delta = di === 0;
        if (ctx.timed_out()) break;
        var fits;
        try { fits = fitPairs(pairs, bg, null, delta, ctx.deadline); } catch (e) { continue; }
        var tag = bg === null ? "~" : "";
        for (i = 0; i < fits.length; i++) {
          var label = fits[i][0], tree = fits[i][1], bits = fits[i][2];
          var splits = fits[i][3], held = fits[i][4];
          var cost = 1.0 + bits / 12.0 + (held ? 0.0 : 3.0) + (delta ? 0.0 : 0.4)
                     + (bg === null ? 0.3 : 0.0);
          res.push(new Hyp("tree" + (delta ? "D" : "") + tag + "[" + label + "," + splits + "]",
                           (function (t, b, d) {
                             return function (g) { return applyTree(t, g, b, d); };
                           })(tree, bg, delta), cost, "cellwise"));
        }
      }
    }
    return res;
  }

  /* The canvas tree runs the same induction over a different feature vector,
     so the bits table has to be swappable.  Python does this by rebinding the
     module-level FEATURES list; the same trick, with the same restore, keeps
     the two ports behaving identically. */
  function withBits(bitsTable, fn) {
    var saved = FEATURES, i;
    FEATURES = [];
    for (i = 0; i < bitsTable.length; i++) FEATURES.push(["f" + i, bitsTable[i]]);
    try { return fn(); } finally { FEATURES = saved; }
  }

  /* The object tree runs the same induction over a different feature vector
     entirely, so pointing it there means rebinding all three tables -- the
     bits, the ordered set and the copy set. Swapping only the bits, as the
     canvas tree does, would leave the threshold tests and the copy leaves
     reading another module's indices. */
  function withTables(featureTable, orderedSet, copySet, fn) {
    var saved = [FEATURES, ORDERED, COPY];
    FEATURES = featureTable; ORDERED = orderedSet; COPY = copySet;
    try { return fn(); } finally {
      FEATURES = saved[0]; ORDERED = saved[1]; COPY = saved[2];
    }
  }

  function growWith(rows, allowed, bitsTable, budget) {
    return withBits(bitsTable, function () {
      var ceiling = budget, ladder = [3, 6, 12, 24, 48, 96].filter(function (b) {
        return b <= ceiling; });
      if (!ladder.length) ladder = [ceiling];
      if (ladder[ladder.length - 1] < ceiling) ladder.push(ceiling);
      var i, tree = null, state = { leaves: 0, splits: 0 };
      for (i = 0; i < ladder.length; i++) {
        state = { leaves: 0, splits: 0 };
        tree = grow(rows, allowed, 0, ladder[i], state);
        if (tree !== null) break;
      }
      return tree === null ? null : [tree, state.splits];
    });
  }

  function bitsWith(tree, bitsTable) {
    return withBits(bitsTable, function () { return treeBits(tree); });
  }

  CELLTREE = { features: features, fitPairs: fitPairs, applyTree: applyTree,
               banks: banks, KEEP: KEEP, predict: predict,
               growWith: growWith, bitsWith: bitsWith,
               /* the iterated-rule family reuses the induction verbatim over
                  rows it builds itself, so it needs these unwrapped */
               grow: grow, treeBits: treeBits, N8D: N8D,
               withTables: withTables,
               lattice: lattice,
               featureNames: function () {
                 return FEATURES.map(function (f) { return f[0]; });
               } };
  defSolver("celltree", "cellwise", generate, 2, 1.5);
})();

