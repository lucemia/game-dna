/* ---------- pixel strip cast: authored at native size (24 x 36 cells, foot line at the bottom), not derived from the paintings ----------
   Each character is painted cell by cell (head / body / legs clusters, 1 x 2 px eyes, 8-12 colours) and gets a 1 px ink outline around
   its silhouette. Walkers have a 4-step cycle (idle, left step, idle, right step); jellies have a rest and a squash frame. All face right. */
const PIXEL_CAST = (function () {
  const W = 24, H = 36, INK = '#2a1a1e', SKIN = '#f2c8a0', SKIN_D = '#d39a74', BOOT = '#6e4426', BOOT_D = '#4a2c18';
  function sheet(paint) {
    const G = []; for (let y = 0; y < H; y++) G.push(new Array(W).fill(null));
    const P = (x, y, w, h, c) => { for (let j = y; j < y + (h || 1); j++) for (let i = x; i < x + (w || 1); i++) if (i >= 0 && j >= 0 && i < W && j < H) G[j][i] = c; };
    paint(P);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (G[y][x]) { g.fillStyle = G[y][x]; g.fillRect(x, y, 1, 1); continue; }
      const n = (i, j) => i >= 0 && j >= 0 && i < W && j < H && G[j][i];
      if (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1)) { g.fillStyle = INK; g.fillRect(x, y, 1, 1); }
    }
    return c;
  }
  // shared clusters. Head: 12 x 11 at x 6..17, y 8..18; body 10 x 9 at x 7..16, y 19..27; legs to y 33 (the foot line is y 34)
  function head(P, o) {
    P(7, 8, 10, 1, SKIN); P(6, 9, 12, 9, SKIN); P(7, 18, 10, 1, SKIN_D); P(17, 10, 1, 8, SKIN_D);
    P(10, 13, 1, 2, INK); P(15, 13, 1, 2, INK);                                  // eyes: 1 x 2, looking right
    if (!o || !o.noBlush) { P(8, 16, 2, 1, '#eaa08c'); P(16, 16, 1, 1, '#eaa08c'); }
  }
  function torso(P, c, cd, belt) { P(7, 19, 10, 9, c); P(16, 19, 1, 9, cd); P(7, 27, 10, 1, cd); if (belt) P(7, 25, 10, 1, belt); }
  function arms(P, c, cd) { P(5, 20, 2, 5, c); P(17, 20, 2, 5, cd); P(5, 25, 2, 1, SKIN); P(17, 25, 2, 1, SKIN); }
  function legs(P, f, c, cd) {   // f: 0 stand, 1 left foot forward (right lifted), 2 right foot forward (left lifted)
    const L = (x, lift, fwd) => { P(x + fwd, 28, 3, 4 - lift, c); P(x + fwd + 2, 28, 1, 4 - lift, cd); P(x + fwd - (fwd < 0 ? 1 : 0), 32 - lift, 4, 2, BOOT); P(x + fwd - (fwd < 0 ? 1 : 0), 33 - lift, 4, 1, BOOT_D); };
    L(8, f === 2 ? 2 : 0, f === 1 ? 1 : f === 2 ? -1 : 0); L(13, f === 1 ? 2 : 0, f === 2 ? 1 : f === 1 ? -1 : 0);
  }
  function skirt(P, f, c, cd, hem) {   // long dress or coat: only the feet step
    P(6, 26, 12, 6, c); P(17, 26, 1, 6, cd); P(6, 31, 12, 1, hem || cd);
    const F = (x, lift, fwd) => { P(x + fwd, 32 - lift, 3, 2, BOOT); P(x + fwd, 33 - lift, 3, 1, BOOT_D); };
    F(8, f === 2 ? 2 : 0, f === 1 ? 2 : f === 2 ? -1 : 0); F(13, f === 1 ? 2 : 0, f === 2 ? 2 : f === 1 ? -1 : 0);
  }
  const hero = f => sheet(P => {
    const HD = '#3f6e72', HL = '#63989a', HK = '#2a4a50', CL = '#4d7358', CK = '#35523e';
    legs(P, f, '#5d5546', '#453e32'); torso(P, CL, CK, '#7a4a2a'); P(10, 19, 4, 6, '#ece0c2'); P(11, 21, 2, 1, '#c9b98e'); arms(P, CL, CK);
    head(P);
    P(9, 3, 4, 1, HD); P(8, 4, 7, 1, HD); P(7, 5, 10, 3, HD); P(5, 8, 14, 3, HD); P(5, 11, 2, 8, HD); P(17, 11, 2, 8, HK); P(8, 5, 4, 1, HL); P(6, 8, 3, 1, HL); P(16, 5, 1, 6, HK);   // pointed hood
    P(7, 10, 10, 1, '#2c3a44'); P(7, 11, 2, 1, '#2c3a44');                                                                                     // dark fringe
    P(5, 19, 14, 1, HD); P(6, 20, 1, 2, HD);                                                                                               // hood collar
    P(19, 22, 1, 3, '#4a3420'); P(18, 25, 3, 1, '#4a3420'); P(18, 26, 3, 3, '#ffc24a'); P(19, 27, 1, 1, '#fff2b0'); P(18, 29, 3, 1, '#4a3420');   // lantern in the leading hand
  });
  const herbalist = f => sheet(P => {
    const ST = '#dcb86c', SD = '#b08c46', SH = '#5f7c4c', SK = '#44603a', DR = '#7d8c9c', DK = '#5c6a7a';
    skirt(P, f, DR, DK, '#e9dfc6'); P(9, 24, 6, 7, '#ece2c8'); torso(P, SH, SK); P(7, 23, 10, 1, SK); arms(P, SH, SK);
    head(P); P(6, 9, 1, 8, '#d2ccc0'); P(17, 9, 1, 7, '#b8b2a6'); P(7, 9, 10, 2, '#d8d2c6');                                                   // grey hair
    P(8, 3, 8, 1, ST); P(7, 4, 10, 4, ST); P(16, 4, 1, 4, SD); P(7, 7, 10, 1, '#6c8a4c'); P(2, 8, 20, 1, ST); P(3, 9, 18, 1, SD); P(9, 7, 1, 1, '#fff'); P(13, 7, 1, 1, '#f0a0b0');   // straw hat, band, flowers
    P(1, 24, 5, 1, '#8a5e2c'); P(1, 25, 5, 3, '#c08a48'); P(2, 26, 1, 1, '#8a5e2c'); P(4, 26, 1, 1, '#8a5e2c'); P(2, 23, 3, 1, '#7aa85a');     // herb basket
    P(19, 21, 1, 13, '#8a5a34');                                                                                                           // walking stick
  });
  const guard = f => sheet(P => {
    const GB = '#4c688c', GD = '#36506e', ST = '#a2acb6', SD = '#6e7882';
    legs(P, f, '#3c4456', '#2c3242'); torso(P, GB, GD, '#e2a432'); P(9, 20, 1, 4, GD); P(12, 20, 1, 4, GD); P(14, 26, 2, 3, '#e2a432'); arms(P, GB, GD);
    head(P, { noBlush: true }); P(9, 16, 7, 1, '#6c4628'); P(9, 17, 2, 1, '#6c4628'); P(14, 17, 2, 1, '#6c4628');                               // moustache
    P(8, 3, 8, 1, ST); P(7, 4, 10, 2, ST); P(6, 6, 12, 3, ST); P(16, 4, 2, 5, SD); P(8, 4, 3, 1, '#dce4ea'); P(4, 9, 16, 1, SD); P(5, 10, 14, 1, '#58626c');   // kettle helmet
    P(20, 3, 1, 31, '#8a5a34'); P(20, 0, 1, 3, '#dfe6ec'); P(19, 2, 1, 1, '#aab4be'); P(21, 2, 1, 1, '#aab4be'); P(19, 5, 3, 1, '#e2a432');         // spear with a pennant tie
  });
  const elder = f => sheet(P => {
    const CT = '#7c5438', CD = '#5a3a26', CP = '#6c8c4c', CK = '#4c683a', BE = '#f2eee2', BD = '#cbc5b4';
    skirt(P, f, CT, CD); torso(P, CT, CD); P(8, 24, 2, 2, '#a07a52'); arms(P, CT, CD);
    head(P, { noBlush: true }); P(9, 12, 3, 1, BE); P(14, 12, 3, 1, BE);                                                                       // brows
    P(7, 16, 10, 2, BE); P(8, 18, 9, 4, BE); P(9, 22, 7, 2, BE); P(11, 24, 3, 1, BE); P(16, 17, 1, 5, BD); P(15, 22, 1, 2, BD); P(12, 16, 2, 1, SKIN_D);   // long beard
    P(10, 2, 3, 2, '#e8e0c8'); P(8, 4, 8, 1, CP); P(7, 5, 10, 3, CP); P(6, 8, 12, 2, CK); P(16, 5, 1, 3, CK); P(8, 5, 3, 1, '#8cac68');             // knitted cap with a bobble
    P(20, 20, 1, 14, '#8a5a34'); P(18, 19, 3, 1, '#8a5a34');                                                                                 // cane
  });
  const girl = f => sheet(P => {
    const DR = '#4f709c', DK = '#3a5478', AP = '#f0e8d2', HR = '#b85a2c', HK = '#8e421e';
    skirt(P, f, DR, DK, '#f0e8d2'); P(9, 22, 6, 9, AP); torso(P, DR, DK); P(9, 21, 6, 7, AP); arms(P, DR, DK);
    head(P); P(6, 9, 12, 2, HR); P(6, 11, 1, 3, HR); P(17, 11, 1, 2, HK);                                                                      // auburn fringe
    P(4, 11, 2, 9, HR); P(18, 11, 2, 9, HK); P(4, 17, 2, 1, '#f0e8d2'); P(18, 17, 2, 1, '#f0e8d2');                                               // two braids with ties
    P(8, 4, 8, 1, AP); P(7, 5, 10, 2, AP); P(6, 7, 12, 2, AP); P(16, 5, 1, 4, '#d6ccb0'); P(5, 8, 1, 2, AP);                                       // kerchief
    P(8, 25, 8, 1, '#8a5e2c'); P(8, 26, 8, 3, '#c08a48'); P(10, 27, 1, 1, '#8a5e2c'); P(13, 27, 1, 1, '#8a5e2c'); P(7, 24, 1, 2, SKIN); P(16, 24, 1, 2, SKIN);   // basket held in front
  });
  const jelly = (f, A, AL, AD, top) => sheet(P => {
    const sq = f ? 1 : 0, y0 = 22 + sq, rows = [[8, 8], [6, 12], [5, 14], [4, 16], [4, 16], [3, 18], [3, 18], [3, 18], [2, 20], [2, 20], [3, 18]];
    rows.slice(sq).forEach((r, i) => { const x = r[0] - sq, w = r[1] + 2 * sq; P(x, y0 + i, w, 1, A); P(x + w - 2, y0 + i, 2, 1, AD); });
    P(3 - sq, 33, 18 + 2 * sq, 1, AD); P(6, 33, 2, 1, A); P(13, 33, 3, 1, A);
    P(6, y0 + 2, 3, 2, AL); P(6, y0 + 4, 1, 2, AL);                                           // gloss
    P(9, y0 + 5 - sq, 1, 2, INK); P(14, y0 + 5 - sq, 1, 2, INK); P(10, y0 + 5 - sq, 1, 1, '#fff');      // eyes
    if (top === 'sprout') { P(11, y0 - 3, 1, 3, '#4c7a34'); P(8, y0 - 5, 3, 2, '#7ab04c'); P(12, y0 - 6, 4, 2, '#5c9440'); P(9, y0 - 5, 1, 1, '#a4d470'); }
    else { P(11, y0 - 3, 2, 3, '#e8dcc0'); P(8, y0 - 6, 8, 2, '#c89a64'); P(9, y0 - 7, 6, 1, '#c89a64'); P(14, y0 - 6, 2, 2, '#a07a48'); P(10, y0 - 6, 1, 1, '#f0d8a8'); }
  });
  const walk = fn => [fn(0), fn(1), fn(0), fn(2)];
  return {
    W, H,
    build: () => ({ hero: walk(hero), merchant: [herbalist(0)], guard: [guard(0)], bram: [elder(0)], tamsin: walk(girl),
      'slime-1': [jelly(0, '#f0a832', '#ffd98a', '#c0741c', 'sprout'), jelly(1, '#f0a832', '#ffd98a', '#c0741c', 'sprout')],
      'slime-2': [jelly(0, '#52b89c', '#a8ecd4', '#2c806c', 'cap'), jelly(1, '#52b89c', '#a8ecd4', '#2c806c', 'cap')] })
  };
})();
