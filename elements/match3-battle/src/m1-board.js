
  /* =================================================================================================
     Board rules (pure: no drawing, no time). Exposed as GameDNA_Match3Battle.rules for checks and bots.
     A board is {cols, rows, cells: [gem | null] (index = row * cols + col, row 0 at the top), nextId}; a gem is
     {id, t (gem id, 'prism' for a Prism), sp (null | 'h' | 'v' | 'bomb' | 'prism')}. */
  var R = {};
  R.make = function (cols, rows) { var b = { cols: cols, rows: rows, cells: [], nextId: 1 }; for (var i = 0; i < cols * rows; i++) b.cells.push(null); return b; };
  R.gem = function (b, t, sp) { return { id: b.nextId++, t: t, sp: sp || null }; };
  R.colour = function (g) { return g && g.sp !== 'prism' ? g.t : null; };
  R.clone = function (b) { return { cols: b.cols, rows: b.rows, nextId: b.nextId, cells: b.cells.map(function (g) { return g ? { id: g.id, t: g.t, sp: g.sp } : null; }) }; };
  R.key = function (b) { return b.cells.map(function (g) { return g ? g.t.charAt(0) + g.t.length + (g.sp ? ':' + g.sp : '') : '.'; }).join(','); };
  /* every straight run of 3+ of one colour: [{dir: 'h' | 'v', t, cells: [idx]}] */
  R.runs = function (b) {
    var out = [], C = b.cols, Rn = b.rows, r, c, k, t;
    for (r = 0; r < Rn; r++) for (c = 0; c < C;) { t = R.colour(b.cells[r * C + c]); k = c + 1; while (t && k < C && R.colour(b.cells[r * C + k]) === t) k++; if (t && k - c >= 3) { var cs = []; for (var q = c; q < k; q++) cs.push(r * C + q); out.push({ dir: 'h', t: t, cells: cs }); } c = k; }
    for (c = 0; c < C; c++) for (r = 0; r < Rn;) { t = R.colour(b.cells[r * C + c]); k = r + 1; while (t && k < Rn && R.colour(b.cells[k * C + c]) === t) k++; if (t && k - r >= 3) { var cv = []; for (var q2 = r; q2 < k; q2++) cv.push(q2 * C + c); out.push({ dir: 'v', t: t, cells: cv }); } r = k; }
    return out;
  };
  R.hasMatch = function (b) { return R.runs(b).length > 0; };
  /* runs that share a cell form one group; each group may leave a special:
     a run of 5+ -> prism; a horizontal and a vertical run (L / T) -> bomb; a run of 4 -> 'h' (horizontal run: clears
     its row) or 'v'. The special appears on a cell the player moved (prefer = [idx, ...]) when it is in the group, else on
     the group's lowest row, middle cell. */
  R.groups = function (b, prefer, specials) {
    var runs = R.runs(b), owner = {}, groups = [];
    runs.forEach(function (run) {
      var hit = []; run.cells.forEach(function (i) { if (owner[i] && hit.indexOf(owner[i]) < 0) hit.push(owner[i]); });
      var gp = hit[0] || { t: run.t, cells: [], runs: [] };
      for (var h = 1; h < hit.length; h++) { hit[h].cells.forEach(function (i) { if (gp.cells.indexOf(i) < 0) gp.cells.push(i); owner[i] = gp; }); gp.runs = gp.runs.concat(hit[h].runs); groups.splice(groups.indexOf(hit[h]), 1); }
      if (!hit[0]) groups.push(gp);
      run.cells.forEach(function (i) { if (gp.cells.indexOf(i) < 0) gp.cells.push(i); owner[i] = gp; });
      gp.runs.push(run);
    });
    groups.forEach(function (gp) {
      gp.make = null; if (specials === false) return;
      var maxLen = 0, dir4 = null, hasH = false, hasV = false;
      gp.runs.forEach(function (run) { if (run.cells.length > maxLen) { maxLen = run.cells.length; dir4 = run.dir; } if (run.dir === 'h') hasH = true; else hasV = true; });
      var sp = maxLen >= 5 ? 'prism' : hasH && hasV ? 'bomb' : maxLen === 4 ? dir4 : null;
      if (!sp) return;
      var at = -1; (prefer || []).forEach(function (p) { if (at < 0 && gp.cells.indexOf(p) >= 0) at = p; });
      if (at < 0) { var low = -1; gp.cells.forEach(function (i) { low = Math.max(low, Math.floor(i / b.cols)); }); var cand = gp.cells.filter(function (i) { return Math.floor(i / b.cols) === low; }).sort(function (x, y) { return x - y; }); at = cand[Math.floor((cand.length - 1) / 2)]; }
      gp.make = { sp: sp, idx: at };
    });
    return groups;
  };
  R.mostCommon = function (b, skip, order) {
    var n = {}; b.cells.forEach(function (g, i) { var t = R.colour(g); if (t && !(skip && skip[i])) n[t] = (n[t] || 0) + 1; });
    var best = null; (order || Object.keys(n)).forEach(function (t) { if (n[t] && (best === null || n[t] > n[best])) best = t; });
    return best;
  };
  /* cells a special clears when it fires at idx */
  R.blast = function (b, idx, sp, skip, order) {
    var C = b.cols, r = Math.floor(idx / C), c = idx % C, out = [], i;
    if (sp === 'h') for (i = 0; i < C; i++) out.push(r * C + i);
    else if (sp === 'v') for (i = 0; i < b.rows; i++) out.push(i * C + c);
    else if (sp === 'bomb') for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) { var rr2 = r + dr, cc = c + dc; if (rr2 >= 0 && rr2 < b.rows && cc >= 0 && cc < C) out.push(rr2 * C + cc); }
    else if (sp === 'prism') { var t = R.mostCommon(b, skip, order); b.cells.forEach(function (g, j) { if (j === idx || (t && R.colour(g) === t)) out.push(j); }); }
    return out;
  };
  /* grows a clear set: every special inside it fires (in index order, then the ones it reaches). Returns the firings. */
  R.expand = function (b, clear, keep, order, spent) {
    var fired = {}, out = [];
    if (spent) for (var sk in spent) fired[sk] = 1;
    var queue = Object.keys(clear).map(Number).sort(function (x, y) { return x - y; });
    while (queue.length) {
      var i = queue.shift(), g = b.cells[i];
      if (!g || !g.sp || fired[i] || (keep && keep[i])) continue;
      fired[i] = 1;
      var cells = R.blast(b, i, g.sp, clear, order);
      out.push({ idx: i, sp: g.sp, t: g.t, cells: cells });
      cells.forEach(function (j) { if (!b.cells[j] || clear[j] || (keep && keep[j])) return; clear[j] = 1; if (b.cells[j].sp) queue.push(j); });
    }
    return out;
  };
  R.adjacent = function (b, i, j) { var C = b.cols; return i >= 0 && j >= 0 && i < b.cells.length && j < b.cells.length && ((Math.abs(i - j) === 1 && Math.floor(i / C) === Math.floor(j / C)) || Math.abs(i - j) === C); };
  function lineAt(b, i) {
    var C = b.cols, t = R.colour(b.cells[i]); if (!t) return false;
    var r = Math.floor(i / C), c = i % C, n = 1, k;
    for (k = c - 1; k >= 0 && R.colour(b.cells[r * C + k]) === t; k--) n++;
    for (k = c + 1; k < C && R.colour(b.cells[r * C + k]) === t; k++) n++;
    if (n >= 3) return true; n = 1;
    for (k = r - 1; k >= 0 && R.colour(b.cells[k * C + c]) === t; k--) n++;
    for (k = r + 1; k < b.rows && R.colour(b.cells[k * C + c]) === t; k++) n++;
    return n >= 3;
  }
  /* is swapping i and j a legal move? (makes a run, or uses a Prism, or swaps two specials) */
  R.valid = function (b, i, j) {
    if (!R.adjacent(b, i, j)) return false;
    var a = b.cells[i], c = b.cells[j]; if (!a || !c) return false;
    if (a.sp === 'prism' || c.sp === 'prism') return true;
    if (a.sp && c.sp) return true;
    b.cells[i] = c; b.cells[j] = a; var ok = lineAt(b, i) || lineAt(b, j); b.cells[i] = a; b.cells[j] = c;
    return ok;
  };
  R.moves = function (b) {
    var out = [], C = b.cols;
    for (var i = 0; i < b.cells.length; i++) {
      if (i % C < C - 1 && R.valid(b, i, i + 1)) out.push({ a: i, b: i + 1 });
      if (i + C < b.cells.length && R.valid(b, i, i + C)) out.push({ a: i, b: i + C });
    }
    return out;
  };
  R.spawnable = function (gems) { return Object.keys(gems).filter(function (k) { return num(gems[k].weight, 1) > 0; }); };
  R.pick = function (rnd, gems, list) {
    var sum = 0, i; for (i = 0; i < list.length; i++) sum += num(gems[list[i]].weight, 1);
    var x = rnd() * sum; for (i = 0; i < list.length; i++) { x -= num(gems[list[i]].weight, 1); if (x < 0) return list[i]; }
    return list[list.length - 1];
  };
  /* a fresh board: no run anywhere, at least one move (retries with the same generator until both hold) */
  R.fill = function (b, rnd, gems) {
    var types = R.spawnable(gems), C = b.cols, tries = 0;
    do {
      for (var i = 0; i < b.cells.length; i++) {
        var r = Math.floor(i / C), c = i % C;
        var ok = types.filter(function (t) {
          if (c >= 2 && R.colour(b.cells[i - 1]) === t && R.colour(b.cells[i - 2]) === t) return false;
          if (r >= 2 && R.colour(b.cells[i - C]) === t && R.colour(b.cells[i - 2 * C]) === t) return false;
          return true;
        });
        b.cells[i] = R.gem(b, R.pick(rnd, gems, ok.length ? ok : types));
      }
      tries++;
    } while ((R.hasMatch(b) || !R.moves(b).length) && tries < 60);
    return tries;
  };
  /* the same gems in a new order, no run, at least one move (falls back to fresh gems after 60 tries) */
  R.reshuffle = function (b, rnd, gems) {
    var list = b.cells.filter(Boolean), tries = 0;
    do {
      for (var i = list.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), x = list[i]; list[i] = list[j]; list[j] = x; }
      var k = 0; for (var q = 0; q < b.cells.length; q++) b.cells[q] = k < list.length ? list[k++] : null;
      tries++;
    } while ((R.hasMatch(b) || !R.moves(b).length) && tries < 60);
    if (R.hasMatch(b) || !R.moves(b).length) {   // no arrangement found: new colours on the same gems (they keep their ids, so they still move, never pop)
      var keepG = b.cells.slice(); R.fill(b, rnd, gems);
      b.cells = b.cells.map(function (ng, q) { var og = keepG[q]; if (!og) return ng; og.t = ng.t; og.sp = ng.sp; og.recolor = 1; return og; });
      return -1;
    }
    return tries;
  };
  /* drops gems into holes, then fills the top of each column with new gems (bottom hole first, columns left to right).
     Returns {falls: [{gem, from, to}], spawns: [{gem, to, above}]} (above = how many rows over the board it starts). */
  R.gravity = function (b, rnd, gems) {
    var C = b.cols, types = R.spawnable(gems), falls = [], spawns = [];
    for (var c = 0; c < C; c++) {
      var w = b.rows - 1;
      for (var r = b.rows - 1; r >= 0; r--) { var g = b.cells[r * C + c]; if (!g) continue; if (r !== w) { b.cells[w * C + c] = g; b.cells[r * C + c] = null; falls.push({ gem: g, from: r * C + c, to: w * C + c }); } w--; }
      var k = w + 1;
      for (var h = w; h >= 0; h--) { var ng = R.gem(b, R.pick(rnd, gems, types)); b.cells[h * C + c] = ng; spawns.push({ gem: ng, to: h * C + c, above: k }); }
    }
    return { falls: falls, spawns: spawns };
  };
  /* what a swap clears with a Prism: prism + colour clears that colour; prism + Row / Column / Blast turns that colour
     into that special and fires them all; prism + prism clears the board. Returns {clear, turn: [{idx, sp}]} */
  R.prismSwap = function (b, i, j) {
    var a = b.cells[i], c = b.cells[j], clear = {}, turn = [], p = a.sp === 'prism' ? i : j, o = p === i ? j : i, other = b.cells[o];
    clear[p] = 1;
    if (other.sp === 'prism') { b.cells.forEach(function (g, k) { if (g) clear[k] = 1; }); return { clear: clear, turn: turn }; }
    var t = other.t, n = 0;
    b.cells.forEach(function (g, k) { if (R.colour(g) === t) { clear[k] = 1; if (other.sp && k !== o && !g.sp) turn.push({ idx: k, sp: other.sp === 'h' || other.sp === 'v' ? (n++ % 2 ? 'v' : 'h') : other.sp }); } });
    return { clear: clear, turn: turn };
  };
