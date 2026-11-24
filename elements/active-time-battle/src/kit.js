/* Pixel art kit for 16-bit side-view battle screens. Original procedural art (heroes, monsters, windows,
   gauges, bitmap 5x7 font, effects, parallax scene builder). Exposed as the global RK. */
var RK = (function () {
"use strict";
function hash(s) { var x = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function mkCanvas(w, hh) { var c = document.createElement('canvas'); c.width = w; c.height = hh; return c; }
var OUT = '#140c1c';
var SPR = {};

/* ---------------- colour ---------------- */
function h2r(hx) { var n = parseInt(hx.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function cl8(v) { return v < 0 ? 0 : v > 255 ? 255 : Math.round(v); }
function r2h(c) { return '#' + ((1 << 24) | (cl8(c[0]) << 16) | (cl8(c[1]) << 8) | cl8(c[2])).toString(16).slice(1); }
function mixc(a, b, f) { return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; }
function mixh(a, b, f) { return r2h(mixc(h2r(a), h2r(b), f)); }
function toHsl(c) {
  var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, hh = 0, s = 0;
  if (mx !== mn) {
    var d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hh /= 6;
  }
  return [hh, s, l];
}
function fromHsl(hh, s, l) {
  function f(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }
  if (!s) return [l * 255, l * 255, l * 255];
  var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return [f(p, q, hh + 1 / 3) * 255, f(p, q, hh) * 255, f(p, q, hh - 1 / 3) * 255];
}
// 5-step ramp: deep, shadow, base, light, highlight. Shadows drift toward violet, lights toward warm yellow.
var RAMPC = {};
function ramp(hx) {
  if (RAMPC[hx]) return RAMPC[hx];
  var c = toHsl(h2r(hx)), out = [];
  var spec = [[-0.30, 0.06, 0.22, 0.72], [-0.15, 0.04, 0.12, 0.72], [0, 0, 0, 0], [0.13, -0.04, 0.10, 0.13], [0.27, -0.12, 0.18, 0.14]];
  spec.forEach(function (sp) {
    var dh = ((sp[3] - c[0] + 1.5) % 1) - 0.5;
    var hh = (c[0] + dh * sp[2] + 1) % 1;
    out.push(r2h(fromHsl(hh, clamp(c[1] + sp[1], 0, 1), clamp(c[2] + sp[0], 0.05, 0.96))));
  });
  RAMPC[hx] = out; return out;
}
function shade(hex, f) {
  var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (f > 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; } else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
}
var BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function bay(x, y) { return (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16; }

function h1s(i, seed) { var x = Math.imul((i | 0) ^ Math.imul(seed | 0, 0x9e3779b1), 0x85ebca6b) >>> 0; x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35) >>> 0; x ^= x >>> 16; return x / 4294967296; }
function h2s(x, y, seed) { return h1s(Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663), seed); }
function vns(x, seed) { var i = Math.floor(x), f = x - i; f = f * f * (3 - 2 * f); var a = h1s(i, seed), b = h1s(i + 1, seed); return a + (b - a) * f; }
function h1(i, seed) { var x = Math.imul((i | 0) ^ Math.imul(seed | 0, 0x9e3779b1), 0x85ebca6b) >>> 0; x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35) >>> 0; x ^= x >>> 16; return (x >>> 0) / 4294967296; }
function h2(x, y, seed) { return h1(Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663), seed); }
function vn(x, seed) { var i = Math.floor(x), f = x - i; f = f * f * (3 - 2 * f); var a = h1(i, seed), b = h1(i + 1, seed); return a + (b - a) * f; }
function rng(seed) { var s = (seed >>> 0) || 1; return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
function px(g, x, y, c) { g.fillStyle = c; g.fillRect(x | 0, y | 0, 1, 1); }
function rect(g, x, y, w, hh, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(hh)); }
function line(g, x0, y0, x1, y1, cols) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  var dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1, err = dx + dy, k = 0;
  for (; ;) {
    g.fillStyle = cols[k % cols.length]; g.fillRect(x0, y0, 1, 1); k++;
    if (x0 === x1 && y0 === y1) break;
    var e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
function disc(g, cx, cy, r, c) { g.fillStyle = c; var r2 = (r + 0.35) * (r + 0.35); for (var y = -Math.ceil(r); y <= Math.ceil(r); y++) { var w = Math.floor(Math.sqrt(Math.max(0, r2 - y * y))); if (r2 - y * y >= 0) g.fillRect(Math.round(cx) - w, Math.round(cy) + y, w * 2 + 1, 1); } }
function oval(g, cx, cy, rx, ry, c) { g.fillStyle = c; for (var y = -Math.ceil(ry); y <= Math.ceil(ry); y++) { var q = 1 - (y * y) / ((ry + 0.4) * (ry + 0.4)); if (q < 0) continue; var w = Math.floor(Math.sqrt(q) * (rx + 0.4)); g.fillRect(Math.round(cx) - w, Math.round(cy) + y, w * 2 + 1, 1); } }

/* ---------------- sprite finishing: selective outline + variants ---------------- */
var DK = [16, 10, 26];
function finishSprite(src, ax, ay) {
  var w = src.width, hh = src.height, W = w + 2, H = hh + 2;
  var c = mkCanvas(W, H), x = c.getContext('2d'); x.drawImage(src, 1, 1);
  var id = x.getImageData(0, 0, W, H), d = id.data, o = new Uint8ClampedArray(d);
  for (var yy = 0; yy < H; yy++) for (var xx = 0; xx < W; xx++) {
    var i = (yy * W + xx) * 4; if (d[i + 3] > 40) continue;
    var k = -1, lit = false;
    if (xx < W - 1 && d[i + 7] > 40) { k = i + 4; lit = true; }
    else if (yy < H - 1 && d[i + W * 4 + 3] > 40) { k = i + W * 4; lit = true; }
    else if (xx > 0 && d[i - 1] > 40) k = i - 4;
    else if (yy > 0 && d[i - W * 4 + 3] > 40) k = i - W * 4;
    if (k < 0) continue;
    var f = lit ? 0.74 : 0.9;
    o[i] = d[k] * (1 - f) + DK[0] * f; o[i + 1] = d[k + 1] * (1 - f) + DK[1] * f; o[i + 2] = d[k + 2] * (1 - f) + DK[2] * f; o[i + 3] = 255;
  }
  id.data.set(o); x.putImageData(id, 0, 0);
  var wc = mkCanvas(W, H), wx = wc.getContext('2d'), wd = wx.createImageData(W, H);
  var fz = mkCanvas(W, H), fx = fz.getContext('2d'), fd = fx.createImageData(W, H);
  for (var q = 0; q < o.length; q += 4) if (o[q + 3]) {
    wd.data[q] = 255; wd.data[q + 1] = 255; wd.data[q + 2] = 255; wd.data[q + 3] = 255;
    var lum = (o[q] * 0.3 + o[q + 1] * 0.55 + o[q + 2] * 0.15) / 255;
    fd.data[q] = 40 + lum * 150; fd.data[q + 1] = 70 + lum * 160; fd.data[q + 2] = 120 + lum * 135; fd.data[q + 3] = 255;
  }
  wx.putImageData(wd, 0, 0); fx.putImageData(fd, 0, 0);
  var top = 0; for (var ty = 0; ty < H; ty++) { var any = false; for (var tx = 0; tx < W; tx++) if (o[(ty * W + tx) * 4 + 3]) { any = true; break; } if (any) { top = ty; break; } }
  return { c: c, white: wc, frozen: fz, w: W, h: H, ax: ax + 1, ay: ay + 1, top: top };
}

/* ---------------- heroes: side-view figures built on the shaded-volume renderer (face left) ---------------- */
// About 20x34 native: skeleton per pose (IK legs), capsules/ellipsoids quantised to 5-step ramps lit from the
// upper left, dark selective outline from finishSprite, then hand-placed face, buckle and fold details.
var HAIRR = [
  ['#4a2c10', '#8a5a1e', '#c8922e', '#f0c856', '#fff2b8'],
  ['#2e1410', '#5c2a1c', '#8c4428', '#bc6c3e', '#e8a068'],
  ['#262048', '#463a80', '#7666b8', '#a89ae0', '#e2dcff'],
  ['#100c14', '#231c28', '#3a3040', '#5a4c5c', '#86747e']
];
var SKIN = ['#5a2a2c', '#a4605a', '#d89474', '#f4c09a', '#ffe4c8'];
function heroMats(cls, tint, hair, cx) {
  var H = HAIRR[hair % HAIRR.length];
  return mats(tint, {
    skin: { r: SKIN, dither: 0.05 },
    hair: { r: H, dither: 0.06, spec: true, hi: H[4], tex: function (x, y) { return ((x * 2 + y * 3) % 5 === 0) ? -0.24 : 0; } },
    tunic: { r: ramp(tint), dither: 0.06, tex: function (x, y) { return (((x - cx) % 3 + 3) % 3 === 0 && y > 28) ? -0.2 : 0; } },
    tdk: { r: ramp(mixh(tint, '#1a1030', 0.45)), dither: 0.06, tex: function (x, y) { return ((x + y * 0.4) | 0) % 3 === 0 ? -0.2 : 0; } },
    steel: { r: ['#22263e', '#464e70', '#7c86aa', '#b6c0dc', '#eef2ff'], dither: 0.02, spec: true, hi: '#ffffff' },
    blade: { r: ['#3a4060', '#7882a8', '#b8c4e0', '#e4ecff', '#ffffff'], dither: 0, spec: true, hi: '#ffffff' },
    brass: { dither: 0, spec: true, hi: '#fffbe0' },
    boot: { r: ['#160e0e', '#2c1c18', '#4a3024', '#6c4a32', '#906c48'], dither: 0.03 },
    pants: { r: ['#14122a', '#24223e', '#383658', '#504e78', '#6e6c96'], dither: 0.05 },
    shirt: { r: ['#3a3040', '#6a5e6a', '#a89c9a', '#d8d0c4', '#f8f4ea'], dither: 0.05 },
    gem: { r: ['#123a6a', '#2a74c0', '#4ab0f0', '#a0e8ff', '#ffffff'], dither: 0, spec: true, hi: '#ffffff' }
  });
}
// joint offsets per pose; arm points are relative to the shoulder, leg = [swing forward, lift]
function heroJoints(cls, pose) {
  var J = { lean: 0, by: 0, hb: 0, lf: [0.12, 0], lb: [-0.22, 0], kick: false,
    eF: [-0.8, 3.6], hF: [-2.4, 6.6], eB: [1.0, 3.6], hB: [1.8, 6.8], wd: [-0.45, -0.9], eye: 'open', cape: 0, glow: false };
  if (cls === 'rogue') J.wd = [-0.92, 0.36];
  if (cls === 'mage') { J.wd = [-0.16, -0.99]; J.eF = [-2.8, 3.0]; J.hF = [-5.8, 4.6]; }
  var m = /^run(\d)$/.exec(pose);
  if (m) {
    var a = (+m[1]) / 6 * Math.PI * 2, s = Math.sin(a), c = Math.cos(a);
    J.lean = -1.6; J.by = -Math.round(Math.abs(c) * 0.9);
    J.lf = [s * 0.95, Math.max(0, -c) * 0.8]; J.lb = [-s * 0.95, Math.max(0, c) * 0.8];
    J.eF = [-0.6 + s * 1.6, 3.4]; J.hF = [-2.2 + s * 3.0, 6.0 - Math.abs(s)];
    J.eB = [1.0 - s * 1.6, 3.4]; J.hB = [1.6 - s * 3.0, 6.0 - Math.abs(s)];
    J.cape = 2;
    if (cls === 'knight') J.wd = [-0.7, -0.7];
    if (cls === 'mage') { J.hF = [-5.0 + s, 4.6]; J.eF = [-2.4, 3.0]; J.wd = [-0.3, -0.95]; }
    return J;
  }
  switch (pose) {
    case 'idle1': J.by = 1; break;
    case 'ready':
      J.lf = [0.45, 0]; J.lb = [-0.5, 0]; J.lean = -0.8; J.by = 1;
      J.eF = [-0.4, -3.4]; J.hF = [-1.2, -7.0]; J.wd = cls === 'mage' ? [-0.25, -0.97] : cls === 'rogue' ? [-0.62, -0.78] : [0.34, -0.94]; J.glow = true; break;
    case 'wind':
      J.lf = [0.3, 0]; J.lb = [-0.45, 0]; J.lean = 0.6;
      J.eF = [1.8, -3.0]; J.hF = [3.4, -6.0]; J.wd = cls === 'mage' ? [-0.2, -0.98] : [0.62, -0.78]; break;
    case 'strike':
      J.lf = [0.9, 0]; J.lb = [-0.8, 0]; J.by = 1; J.lean = -2.2;
      J.eF = [-3.6, 1.4]; J.hF = [-6.8, 2.6]; J.eB = [1.8, 3.2]; J.hB = [3.6, 5.0]; J.wd = cls === 'mage' ? [-0.9, 0.42] : [-0.82, 0.57]; J.cape = 1; break;
    case 'cast':
      J.lean = -0.6; J.lf = [0.3, 0]; J.lb = [-0.35, 0];
      J.eF = [-3.2, -0.6]; J.hF = [-5.8, -2.2]; J.eB = [-1.4, 1.2]; J.hB = [-4.2, -0.6]; J.wd = [-0.15, -0.99]; J.glow = true; break;
    case 'hurt':
      J.lean = 2.4; J.hb = 1.0; J.by = 1; J.lf = [0.4, 0]; J.lb = [-0.1, 0];
      J.eF = [-0.6, 3.2]; J.hF = [-3.4, 1.4]; J.eB = [2.6, 2.4]; J.hB = [5.0, 0.8]; J.wd = [-0.7, -0.7]; J.eye = 'shut'; break;
    case 'jump':
      J.by = -5; J.lf = [0.4, 1.3]; J.lb = [-0.1, 1.5];
      J.eF = [-1.2, -3.4]; J.hF = [-2.2, -7.2]; J.wd = [-0.4, 0.92]; J.cape = -2; break;
    case 'kick':
      J.lean = 1.2; J.kick = true; J.lb = [-0.25, 0];
      J.eF = [1.6, 3.0]; J.hF = [3.2, 5.4]; J.wd = [0.3, -0.95]; break;
  }
  return J;
}
function heroBuild(cls, tint, hair, pose) {
  var W = 46, Hh = 46, cx = 24, G = 42;
  var J = heroJoints(cls, pose), P = Prims(), L = J.lean, by = J.by;
  var hipY = G - 10 + by, hx = cx - 1.4 + L * 1.25 + J.hb, hy = G - 28 + by;
  var sF = [cx - 1.4 + L, G - 21 + by], sB = [cx + 1.6 + L, G - 21 + by];
  var eF = [sF[0] + J.eF[0], sF[1] + J.eF[1]], hF = [sF[0] + J.hF[0], sF[1] + J.hF[1]];
  var eB = [sB[0] + J.eB[0], sB[1] + J.eB[1]], hB = [sB[0] + J.hB[0], sB[1] + J.hB[1]];
  var feet = [];
  function leg(hipX, sw, lift, z, front) {
    var fx, fy, kx, ky, L1 = 3.9;
    if (J.kick && front) { fx = hipX - 8.5; fy = hipY + 1.5; }
    else { fx = hipX - sw * 4.6; fy = G - 2.5 + (by < 0 ? by : 0) - lift * 3.4; }
    var vx = fx - hipX, vy = fy - hipY, d = Math.hypot(vx, vy) || 1;
    if (d > L1 * 2 - 0.05) { kx = (hipX + fx) / 2; ky = (hipY + fy) / 2; }
    else {
      var hgt = Math.sqrt(L1 * L1 - d * d / 4), nx = -vy / d, ny = vx / d;
      if (nx > 0) { nx = -nx; ny = -ny; }
      kx = (hipX + fx) / 2 + nx * hgt; ky = (hipY + fy) / 2 + ny * hgt;
    }
    var thigh = cls === 'rogue' || cls === 'mage' ? 'pants' : 'pants', shin = cls === 'knight' ? 'steel' : 'pants';
    P.c(hipX, hipY, 2.3, kx, ky, 1.95, thigh, z, z, { g: front ? 11 : 10 });
    P.c(kx, ky, 1.95, fx, fy, 1.6, shin, z + 0.2, z + 0.2, { g: front ? 11 : 10 });
    if (cls === 'knight') P.e(kx - 0.4, ky, 1.7, 1.5, 'steel', z + 1.4, 1.2, { g: front ? 11 : 10 });
    var toe = J.kick && front ? [-1.6, 0] : [-0.9, 1.3];
    P.e(fx + toe[0], fy + toe[1], J.kick && front ? 2.2 : 2.8, J.kick && front ? 2.2 : 1.6, 'boot', z + 0.6, 1.6, { g: front ? 11 : 10 });
    P.c(fx + 0.2, fy - 1.0, 1.9, fx + 0.1, fy + 0.4, 1.8, 'boot', z + 0.5, z + 0.5, { g: front ? 11 : 10 });
    feet.push([fx, fy]);
  }
  // back limbs and cape first (lowest z)
  if (cls === 'knight') {
    var cb = J.cape;
    P.p([[sB[0] - 0.5, sB[1] - 0.5], [sB[0] + 3, sB[1]], [cx + 7 + cb * 1.2, G - 5 + Math.min(0, by)], [cx + 3 + cb * 0.6, G - 3.5 + Math.min(0, by)], [cx + 1.5, hipY - 1]], 'tdk', -4, [0.45, -0.3, 1], { g: 12 });
  }
  if (cls === 'rogue') { P.c(hx + 4.5, hy - 3.5, 1.1, hx + 9 + J.cape, hy - 1 + Math.abs(J.cape) * 0.3, 0.5, 'tunic', -3, -3, { g: 12 }); P.c(hx + 4.5, hy - 3, 1, hx + 8 + J.cape, hy + 1.5, 0.4, 'tunic', -3.5, -3.5, { g: 12 }); }
  leg(cx + 1.4 + L * 0.3, J.lb[0], J.lb[1], 0, false);
  var armU = cls === 'knight' ? 'tunic' : cls === 'rogue' ? 'shirt' : 'tunic', armL = cls === 'knight' ? 'steel' : cls === 'rogue' ? 'skin' : 'tunic';
  P.c(sB[0], sB[1], 1.7, eB[0], eB[1], 1.5, armU, -1, -1, { g: 13 }); P.c(eB[0], eB[1], cls === 'mage' ? 1.9 : 1.45, hB[0], hB[1], cls === 'mage' ? 2.1 : 1.3, armL, -1, -1, { g: 13 });
  P.e(hB[0], hB[1] + 0.4, 1.4, 1.4, cls === 'knight' ? 'steel' : 'skin', -0.5, 1.4, { g: 13 });
  // torso
  var torso = cls === 'rogue' ? 'shirt' : 'tunic';
  P.e(cx + L * 0.5, G - 17 + by, 4.2, 5.0, torso, 3, 4, { g: 1 });
  if (cls === 'knight') {
    P.e(cx - 0.4 + L * 0.8, G - 19.6 + by, 4.6, 3.8, 'steel', 3.6, 4.4, { g: 1 });
    P.c(cx + L * 0.45, G - 13.2 + by, 4.3, cx + L * 0.2, G - 8.6 + by, 5.0, 'tunic', 4.2, 4.2, { g: 1, clip: function (X, Y) { return Y > G - 7.4 + by; } });
  } else if (cls === 'rogue') {
    P.e(cx + 0.6 + L * 0.7, G - 18.4 + by, 4.6, 4.6, 'leather', 3.5, 4.4, { g: 1, clip: function (X, Y) { return X < cx - 2.2 + L * 0.8 && Y > G - 21.5 + by; } });
    P.c(cx + L * 0.4, G - 13 + by, 4.2, cx + L * 0.3, G - 10.5 + by, 4.4, 'pants', 3.8, 3.8, { g: 1 });
  } else {
    var f0 = Math.min(feet.length ? 0 : 0, 0);
    P.c(cx + L * 0.45, G - 15 + by, 4.4, cx + 0.8 + L * 0.1 + J.cape * 0.4, G - 3.2 + Math.min(0, by), 6.2, 'tunic', 3.6, 3.2, { g: 1, clip: function (X, Y) { return Y > G - 1.2 + Math.min(0, by); } });
    P.e(cx - 0.2 + L * 0.8, G - 20.2 + by, 5.2, 2.6, 'tdk', 6.5, 2.4, { g: 1 });
  }
  P.c(cx - 3.8 + L * 0.55, G - 12.4 + by, 0.95, cx + 4.2 + L * 0.45, G - 12.4 + by, 0.95, cls === 'mage' ? 'brass' : 'leather', 8.2, 8.2, { g: 1 });
  leg(cx - 1.0 + L * 0.3, J.lf[0], J.lf[1], cls === 'mage' ? 1 : 3, true);
  if (cls === 'mage') { // robe hem in front of the legs
    P.c(cx + L * 0.4, G - 9 + by, 4.9, cx + 0.6 + J.cape * 0.4, G - 3.2 + Math.min(0, by), 6.2, 'tunic', 5.2, 4.6, { g: 1, clip: function (X, Y) { return Y > G - 1.2 + Math.min(0, by) || Y < G - 9.5 + by; } });
  }
  // neck, head, hair, headgear
  P.c(hx + 0.8, hy + 4.6, 1.3, cx - 0.6 + L, G - 21 + by, 1.6, 'skin', 4, 4, { g: 2 });
  P.e(hx, hy, 5.4, 5.6, 'skin', 6, 5.4, { g: 2 });
  P.e(hx - 2.2, hy + 2.8, 3.2, 2.5, 'skin', 7, 2.2, { g: 2 });
  var face = function (X, Y) { return X < hx - 1.2 && Y > hy - 2.4; };
  if (cls === 'knight') {
    P.e(hx + 0.6, hy - 1.0, 6.0, 5.4, 'steel', 6.4, 5.8, { g: 3, clip: function (X, Y) { return (X < hx - 0.6 && Y > hy - 1.8) || Y > hy + 3.6; } });
    P.c(hx - 6.0, hy - 1.6, 0.9, hx - 0.4, hy - 1.6, 0.9, 'steel', 11.8, 11.8, { g: 3 });
    P.c(hx + 4.6, hy - 1.2, 1.5, hx + 5.2, hy + 4.2, 1.3, 'steel', 9, 9, { g: 3 });
    P.c(hx - 0.6, hy - 6.4, 1.5, hx + 3.6, hy - 7.6, 1.6, 'tunic', 11, 10, { g: 4 });
    P.c(hx + 3.6, hy - 7.6, 1.6, hx + 8.4 + J.cape * 0.6, hy - 4.4, 0.6, 'tunic', 10, 9, { g: 4 });
    P.e(hx + 0.2, hy - 6.2, 1.4, 1.0, 'brass', 12, 1, { g: 4 });
  } else if (cls === 'rogue') {
    P.e(hx + 1.2, hy - 1.4, 5.7, 5.0, 'hair', 6.6, 5.4, { g: 3, clip: face });
    P.c(hx + 3.5, hy - 3.6, 1.8, hx + 8.0, hy - 2.0, 0.4, 'hair', 8, 7, { g: 3 });
    P.c(hx + 4.0, hy - 0.8, 1.7, hx + 7.6, hy + 1.6, 0.4, 'hair', 8, 7, { g: 3 });
    P.c(hx + 1.0, hy - 5.4, 1.6, hx + 4.4, hy - 8.0, 0.4, 'hair', 9, 8, { g: 3 });
    P.c(hx - 5.4, hy - 3.6, 1.3, hx + 4.6, hy - 4.2, 1.5, 'tunic', 12, 12, { g: 4 });
    P.e(hx - 3.6, hy - 1.9, 2.2, 1.2, 'hair', 12, 1, { g: 3 });
  } else {
    P.e(hx + 1.0, hy - 1.2, 5.8, 5.2, 'hair', 6.6, 5.4, { g: 3, clip: face });
    P.c(hx + 3.2, hy + 1.0, 2.6, hx + 4.6, hy + 7.8, 1.8, 'hair', 5.2, 4.6, { g: 3 });
    P.e(hx - 3.4, hy - 3.0, 2.6, 1.6, 'hair', 11.6, 1.2, { g: 3 });
    P.e(hx + 0.8, hy - 2.4, 6.6, 5.4, 'tdk', 7.4, 5.4, { g: 4, clip: function (X, Y) { return (X < hx + 0.6 && Y > hy - 3.8) || Y > hy + 3.2; } });
    P.c(hx + 4.8, hy + 1.6, 2.2, hx + 6.2, hy + 7.0, 2.6, 'tdk', 6, 6, { g: 4 });
  }
  // front arm and weapon (highest z)
  var aU = cls === 'rogue' ? 'shirt' : 'tunic';
  if (cls === 'knight') P.e(sF[0], sF[1] + 0.4, 2.7, 2.3, 'steel', 9.4, 2.4, { g: 5 });
  P.c(sF[0], sF[1], 1.75, eF[0], eF[1], 1.55, aU, 9, 9.4, { g: 5 });
  P.c(eF[0], eF[1], cls === 'mage' ? 1.9 : 1.5, hF[0], hF[1], cls === 'mage' ? 2.1 : 1.35, armL, 9.4, 9.8, { g: 5 });
  if (cls === 'rogue') P.c(eF[0] + (hF[0] - eF[0]) * 0.45, eF[1] + (hF[1] - eF[1]) * 0.45, 1.55, eF[0] + (hF[0] - eF[0]) * 0.8, eF[1] + (hF[1] - eF[1]) * 0.8, 1.45, 'leather', 10, 10, { g: 5 });
  var wx = J.wd[0], wy = J.wd[1], nx = -wy, ny = wx;
  P.e(hF[0], hF[1], 1.55, 1.55, cls === 'knight' ? 'steel' : 'skin', 10.6, 1.6, { g: 5 });
  if (cls === 'knight' || cls === 'rogue') {
    var bl = cls === 'knight' ? 12 : 6.5;
    P.c(hF[0] - wx * 2.4, hF[1] - wy * 2.4, 0.9, hF[0] - wx * 0.6, hF[1] - wy * 0.6, 0.7, 'leather', 12, 12, { g: 6 });
    P.e(hF[0] - wx * 2.8, hF[1] - wy * 2.8, 1.0, 1.0, 'brass', 12.4, 1, { g: 6 });
    P.c(hF[0] + wx * 1.4 - nx * 2.6, hF[1] + wy * 1.4 - ny * 2.6, 0.8, hF[0] + wx * 1.4 + nx * 2.6, hF[1] + wy * 1.4 + ny * 2.6, 0.8, 'brass', 12.6, 12.6, { g: 6 });
    P.c(hF[0] + wx * 2.0, hF[1] + wy * 2.0, cls === 'knight' ? 1.25 : 1.0, hF[0] + wx * bl, hF[1] + wy * bl, 0.45, 'blade', 12.4, 12.4, { g: 6 });
  } else {
    P.c(hF[0] - wx * 8, hF[1] - wy * 8, 0.8, hF[0] + wx * 8.5, hF[1] + wy * 8.5, 0.8, 'wood', 12, 12, { g: 6 });
    P.e(hF[0] + wx * 9.6, hF[1] + wy * 9.6, 2.0, 2.0, 'brass', 12.2, 1.4, { g: 6, clip: function (X, Y) { return Math.hypot(X - (hF[0] + wx * 9.6), Y - (hF[1] + wy * 9.6)) < 1.1; } });
    P.e(hF[0] + wx * 10.4, hF[1] + wy * 10.4, 1.6, 1.6, 'gem', 13, 1.6, { g: 6 });
  }
  var M = heroMats(cls, tint, hair, cx);
  if (J.glow) M.gem = { r: ['#6a4a10', '#c08a20', '#f0c840', '#fff0a0', '#ffffff'], dither: 0, spec: true, hi: '#ffffff' };
  var src = renderVolume(W, Hh, P, M, function (g, inside) {
    var X = Math.round(hx), Y = Math.round(hy);
    // face: eye (iris + glint), brow, ear, mouth, cheek
    if (J.eye === 'shut') { px(g, X - 4, Y, '#2a1426'); px(g, X - 3, Y + 1, '#2a1426'); px(g, X - 2, Y, '#2a1426'); }
    else {
      px(g, X - 3, Y, '#1a1024'); px(g, X - 3, Y + 1, '#1a1024'); px(g, X - 4, Y, '#ffffff'); px(g, X - 4, Y + 1, '#d8d0e8');
      px(g, X - 2, Y + 1, cls === 'mage' ? '#3a6ad0' : '#4a3a6a');
    }
    if (cls !== 'knight') { px(g, X - 4, Y - 1, HAIRR[hair % 4][0]); px(g, X - 3, Y - 1, HAIRR[hair % 4][0]); }
    px(g, X - 5, Y + 3, '#a85a50'); px(g, X - 2, Y + 2, '#f0a090');
    if (cls !== 'knight') { px(g, X + 1, Y + 1, SKIN[1]); px(g, X + 1, Y + 2, SKIN[1]); px(g, X + 2, Y + 1, SKIN[2]); }
    else { line(g, X - 5, Y - 2, X - 1, Y - 2, ['#1a1024']); px(g, X - 3, Y - 3, '#ffffff'); }
    // belt buckle
    var bx = Math.round(cx - 3.2 + L * 0.55), byy = Math.round(G - 12.4 + by);
    if (inside(bx, byy)) { px(g, bx, byy, '#fff0b4'); px(g, bx + 1, byy, '#bc8630'); px(g, bx, byy - 1, '#e6bc5c'); px(g, bx + 1, byy - 1, '#84541c'); }
    if (cls === 'rogue') { // pouch on the hip
      var qx = Math.round(cx + 2.5 + L * 0.4), qy = Math.round(G - 11.5 + by);
      stamp(g, ['kkk', 'lLk', 'lLk'], qx, qy, { k: '#2a1810', l: '#7a5434', L: '#9a7048' });
    }
    if (cls === 'mage') { // sash tail and gold trim at the hem
      var sx2 = Math.round(cx + 3 + L * 0.4), sy2 = Math.round(G - 12 + by);
      for (var k = 0; k < 4; k++) if (inside(sx2, sy2 + k)) px(g, sx2, sy2 + k, k % 2 ? '#bc8630' : '#e6bc5c');
      var hemY = Math.round(G - 1.6 + Math.min(0, by));
      for (var xx = 0; xx < W; xx++) if (inside(xx, hemY) && !inside(xx, hemY + 1)) px(g, xx, hemY, '#e6bc5c');
    }
    if (cls === 'knight') { // tabard trim and a crest on the breastplate
      var ty = Math.round(G - 7.6 + by);
      for (var x2 = 0; x2 < W; x2++) if (inside(x2, ty) && !inside(x2, ty + 1)) px(g, x2, ty, '#e6bc5c');
      var crx = Math.round(cx - 2 + L * 0.8), cry = Math.round(G - 20 + by);
      if (inside(crx, cry)) { px(g, crx, cry, '#e6bc5c'); px(g, crx, cry + 1, '#bc8630'); px(g, crx - 1, cry, '#fff0b4'); }
    }
    if (J.glow) { var gx = Math.round(hF[0] + wx * (cls === 'mage' ? 10.4 : 12)), gy = Math.round(hF[1] + wy * (cls === 'mage' ? 10.4 : 12)); px(g, gx, gy - 2, '#ffffff'); px(g, gx - 2, gy, '#fff6c0'); px(g, gx + 2, gy, '#fff6c0'); px(g, gx, gy + 2, '#fff6c0'); }
  });
  return { c: src, ax: cx, ay: G };
}
// extra shade step where a tone meets a darker one to its right/below (light from the upper left),
// then a 1px rim light on the back edge (the side away from the enemy) from the scene's light
function heroPolish(g, w, hh, rim) {
  var id = g.getImageData(0, 0, w, hh), d = id.data, o = new Uint8ClampedArray(d);
  function lum(i) { return d[i] * 0.3 + d[i + 1] * 0.55 + d[i + 2] * 0.15; }
  for (var y = 1; y < hh - 1; y++) for (var x = 1; x < w - 1; x++) {
    var i = (y * w + x) * 4; if (!d[i + 3]) continue;
    var L0 = lum(i), best = -1;
    [i + 4, i + w * 4].forEach(function (j) { if (d[j + 3] && L0 - lum(j) > 34 && lum(j) > 46 && Math.abs(d[j] - d[i]) + Math.abs(d[j + 1] - d[i + 1]) + Math.abs(d[j + 2] - d[i + 2]) < 220) best = j; });
    var back = i - 4;
    if (best >= 0 && d[back + 3] && Math.abs(lum(back) - L0) < 6) { for (var c = 0; c < 3; c++) o[i + c] = (d[i + c] + d[best + c]) / 2; }
  }
  if (rim) {
    var rc = h2r(rim);
    for (var y2 = 0; y2 < hh; y2++) for (var x2 = w - 1; x2 >= 0; x2--) {
      var k = (y2 * w + x2) * 4; if (!o[k + 3]) continue;
      if (lum(k) > 40) for (var c2 = 0; c2 < 3; c2++) o[k + c2] = o[k + c2] * 0.4 + rc[c2] * 0.6;
      break;
    }
    for (var x3 = 0; x3 < w; x3++) for (var y3 = 0; y3 < hh * 0.5; y3++) {
      var k3 = (y3 * w + x3) * 4; if (!o[k3 + 3]) continue;
      if (x3 > w * 0.5 && lum(k3) > 60) for (var c3 = 0; c3 < 3; c3++) o[k3 + c3] = o[k3 + c3] * 0.55 + rc[c3] * 0.45;
      break;
    }
  }
  id.data.set(o); g.putImageData(id, 0, 0);
}
// knocked-out hero: the hurt frame laid on its back (head away from the enemy), grey palette
function heroKO(cls, tint, hair) {
  var key = 'ko|' + cls + '|' + tint + '|' + hair; if (SPR[key]) return SPR[key];
  var s = heroSprite(cls, tint, hair, 'hurt'), w = s.c.width, hh = s.c.height, c = mkCanvas(hh, w), q = c.getContext('2d');
  q.translate(hh, 0); q.rotate(Math.PI / 2); q.drawImage(s.c, 0, 0); q.setTransform(1, 0, 0, 1, 0, 0);
  var id = q.getImageData(0, 0, hh, w), d = id.data, bot = 0;
  for (var j = 0; j < d.length; j += 4) if (d[j + 3]) {
    var l = (d[j] * 0.3 + d[j + 1] * 0.55 + d[j + 2] * 0.15) / 255; d[j] = 30 + l * 150; d[j + 1] = 28 + l * 140; d[j + 2] = 44 + l * 160;
    bot = Math.max(bot, (j / 4 / hh) | 0);
  }
  q.putImageData(id, 0, 0);
  return (SPR[key] = { c: c, white: c, frozen: c, w: hh, h: w, ax: Math.round(hh / 2), ay: bot, top: 0 });
}
// pose: idle0 idle1 run0-run5 (walkA/walkB alias) wind strike cast hurt jump kick ready
function heroSprite(cls, tint, hair, pose, rim) {
  if (pose === 'walkA') pose = 'run1'; else if (pose === 'walkB') pose = 'run4';
  var key = 'h|' + cls + '|' + tint + '|' + hair + '|' + pose + '|' + (rim || '');
  if (SPR[key]) return SPR[key];
  var b = heroBuild(cls, tint, hair, pose);
  heroPolish(b.c.getContext('2d'), b.c.width, b.c.height, rim);
  return (SPR[key] = finishSprite(b.c, b.ax, b.ay));
}

/* ---------------- monsters: shaded-volume renderer ---------------- */
var LIGHT = (function () { var v = [-0.52, -0.64, 0.58], n = Math.hypot(v[0], v[1], v[2]); return [v[0] / n, v[1] / n, v[2] / n]; })();
function Prims() {
  var a = [];
  return {
    a: a,
    e: function (x, y, rx, ry, m, z, rz, o) { a.push({ k: 'e', x: x, y: y, rx: rx, ry: ry, m: m, z: z || 0, rz: rz == null ? Math.min(rx, ry) : rz, o: o || {} }); },
    c: function (x1, y1, r1, x2, y2, r2, m, z1, z2, o) { a.push({ k: 'c', x1: x1, y1: y1, r1: r1, x2: x2, y2: y2, r2: r2, m: m, z1: z1 || 0, z2: z2 == null ? (z1 || 0) : z2, o: o || {} }); },
    p: function (pts, m, z, n, o) { var nn = n || [0, 0, 1], l = Math.hypot(nn[0], nn[1], nn[2]); a.push({ k: 'p', pts: pts, m: m, z: z || 0, nx: nn[0] / l, ny: nn[1] / l, nz: nn[2] / l, o: o || {} }); }
  };
}
function inPoly(x, y, pts) { var ins = false; for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) { var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) ins = !ins; } return ins; }
function renderVolume(w, hh, P, mats, post) {
  var N = w * hh, dep = new Float32Array(N), pid = new Int16Array(N), NX = new Float32Array(N), NY = new Float32Array(N), NZ = new Float32Array(N);
  dep.fill(-1e9); pid.fill(-1);
  var prims = P.a, miss = [];
  prims.forEach(function (p) { if (!mats[p.m] && miss.indexOf(p.m) < 0) miss.push(p.m); });
  if (miss.length) throw new Error('renderVolume: unknown material keys ' + miss.join(', '));
  prims.forEach(function (p, i) {
    var x0, x1, y0, y1;
    if (p.k === 'e') { x0 = p.x - p.rx; x1 = p.x + p.rx; y0 = p.y - p.ry; y1 = p.y + p.ry; }
    else if (p.k === 'c') { var rr = Math.max(p.r1, p.r2); x0 = Math.min(p.x1, p.x2) - rr; x1 = Math.max(p.x1, p.x2) + rr; y0 = Math.min(p.y1, p.y2) - rr; y1 = Math.max(p.y1, p.y2) + rr; }
    else { x0 = 1e9; x1 = -1e9; y0 = 1e9; y1 = -1e9; p.pts.forEach(function (q) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }); }
    x0 = Math.max(0, Math.floor(x0) - 1); y0 = Math.max(0, Math.floor(y0) - 1); x1 = Math.min(w - 1, Math.ceil(x1) + 1); y1 = Math.min(hh - 1, Math.ceil(y1) + 1);
    var vx = 0, vy = 0, vl = 1;
    if (p.k === 'c') { vx = p.x2 - p.x1; vy = p.y2 - p.y1; vl = vx * vx + vy * vy || 1; }
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
      var X = x + 0.5, Y = y + 0.5, z, nx, ny, nz;
      if (p.k === 'e') {
        var u = (X - p.x) / p.rx, v = (Y - p.y) / p.ry, q = u * u + v * v; if (q > 1) continue;
        nz = Math.sqrt(1 - q); z = p.z + nz * p.rz; nx = u; ny = v;
      } else if (p.k === 'c') {
        var t = clamp(((X - p.x1) * vx + (Y - p.y1) * vy) / vl, 0, 1), cx = p.x1 + vx * t, cy = p.y1 + vy * t, r = p.r1 + (p.r2 - p.r1) * t;
        var ddx = X - cx, ddy = Y - cy, dd = Math.sqrt(ddx * ddx + ddy * ddy); if (dd > r) continue;
        nz = Math.sqrt(1 - (dd / r) * (dd / r)); nx = ddx / r; ny = ddy / r; z = p.z1 + (p.z2 - p.z1) * t + nz * r;
      } else {
        if (!inPoly(X, Y, p.pts)) continue; z = p.z; nx = p.nx; ny = p.ny; nz = p.nz;
      }
      if (p.o.clip && p.o.clip(X, Y)) continue;
      var j = y * w + x;
      if (z > dep[j]) { dep[j] = z; pid[j] = i; NX[j] = nx; NY[j] = ny; NZ[j] = nz; }
    }
  });
  var lvl = new Int8Array(N).fill(-1);
  for (var j = 0; j < N; j++) {
    if (pid[j] < 0) continue;
    var x = j % w, y = (j / w) | 0, p = prims[pid[j]], m = mats[p.m];
    var nl = Math.hypot(NX[j], NY[j], NZ[j]) || 1, nx = NX[j] / nl, ny = NY[j] / nl, nz = NZ[j] / nl;
    var dif = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
    var v = dif + (m.bias || 0) + (m.tex ? m.tex(x, y, p) : 0) + (bay(x, y) - 0.5) * (m.dither == null ? 0.16 : m.dither);
    var l = v < -0.08 ? 0 : v < 0.28 ? 1 : v < 0.6 ? 2 : v < 0.84 ? 3 : 4;
    if (l === 0 && ny > 0.5) l = 1;                     // bounce light on the underside
    if (m.spec && dif > 0.94) l = 5;
    lvl[j] = l;
  }
  // contour lines where a part passes in front of another, and contact occlusion
  var out = new Int8Array(lvl);
  for (var j2 = 0; j2 < N; j2++) {
    if (pid[j2] < 0) continue;
    var x2 = j2 % w, y2 = (j2 / w) | 0, pa = prims[pid[j2]], ga = pa.o.g != null ? pa.o.g : pid[j2], near = false, occ = false;
    for (var k = 0; k < 4; k++) {
      var xx = x2 + (k === 0 ? 1 : k === 1 ? -1 : 0), yy = y2 + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (xx < 0 || yy < 0 || xx >= w || yy >= hh) continue;
      var jk = yy * w + xx; if (pid[jk] < 0) continue;
      var pb = prims[pid[jk]], gb = pb.o.g != null ? pb.o.g : pid[jk];
      if (gb !== ga && dep[jk] > dep[j2] + 1.6) near = true;
      var jk2 = (yy + (yy - y2)) * w + xx + (xx - x2);
      if (jk2 >= 0 && jk2 < N && pid[jk2] >= 0 && dep[jk2] > dep[j2] + 2.5 && gb !== ga) occ = true;
    }
    if (near) out[j2] = -2; else if (occ && out[j2] > 0 && out[j2] < 5) out[j2] = out[j2] - 1;
  }
  var src = mkCanvas(w, hh), g = src.getContext('2d'), id = g.createImageData(w, hh), D = id.data;
  for (var j3 = 0; j3 < N; j3++) {
    if (pid[j3] < 0) continue;
    var mm = mats[prims[pid[j3]].m], L = out[j3], col;
    if (L === -2) col = mixc(h2r(mm.r[0]), DK, 0.45); else if (L === 5) col = h2r(mm.hi || '#ffffff'); else col = h2r(mm.r[L]);
    D[j3 * 4] = col[0]; D[j3 * 4 + 1] = col[1]; D[j3 * 4 + 2] = col[2]; D[j3 * 4 + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  if (post) post(g, function (xx, yy) { var j = (yy | 0) * w + (xx | 0); return xx >= 0 && yy >= 0 && xx < w && yy < hh && pid[j] >= 0; });
  return src;
}
function paintRows(g, rows, pal, ox, oy, map) {
  for (var y = 0; y < rows.length; y++) for (var x = 0; x < rows[y].length; x++) {
    var ch = rows[y][x]; if (ch === '.') continue; if (map && map[ch]) ch = map[ch];
    var c = pal[ch]; if (!c) continue; g.fillStyle = c; g.fillRect(ox + x, oy + y, 1, 1);
  }
}
function stamp(g, rows, ox, oy, pal) { paintRows(g, rows, pal, ox, oy); }

var MAT = {
  bone: ['#5a4a3e', '#968066', '#cbb898', '#eadcc0', '#fffaf0'],
  wood: ['#341e14', '#55331f', '#7e512e', '#a8744a', '#cc9c6c'],
  steel: ['#262a44', '#4a5274', '#8088ac', '#b8c2dc', '#eef2ff'],
  brass: ['#4e2c10', '#84541c', '#bc8630', '#e6bc5c', '#fff0b4'],
  dark: ['#100c16', '#221c2c', '#363044', '#4e4660', '#6c6484'],
  cloth: ['#24161a', '#422a26', '#684434', '#8c6048', '#ae8466'],
  leather: ['#1e1210', '#3a2418', '#5a3a24', '#7a5434', '#9a7048'],
  blade: ['#3a4060', '#7882a8', '#b8c4e0', '#e4ecff', '#ffffff'],
  rim: ['#5a4630', '#8e7650', '#c2aa78', '#e0cc98', '#fff4cc']
};
function mats(tint, extra) {
  var m = {};
  Object.keys(MAT).forEach(function (k) { m[k] = { r: MAT[k] }; });
  m.body = { r: ramp(tint) };
  m.belly = { r: ramp(mixh(tint, '#f4e4b0', 0.45)) };
  m.dkbody = { r: ramp(mixh(tint, '#2a1838', 0.42)) };
  if (extra) Object.keys(extra).forEach(function (k) { m[k] = Object.assign({}, m[k] || {}, extra[k]); });
  return m;
}
var MON = {};
// Each design takes pose {f: idle frame 0-3, atk: 0 none / 1 wind-up / 2 strike, hurt: bool}.
// Gel cube (original): a translucent jelly block with a floating crystal nucleus and no face.
MON.slime = {
  w: 36, h: 30, ax: 17, ay: 29,
  build: function (tint, ps) {
    var sq = [0, 1, 2, 1][ps.f], sh = ps.atk === 2 ? 3 : ps.atk === 1 ? -2 : 0;
    if (ps.hurt) { sq = 3; sh = -3; }
    var c = mkCanvas(36, 30), g = c.getContext('2d');
    var r = ramp(mixh(tint, '#4a3a9a', 0.15)), dk = mixh(r[0], '#120a24', 0.4), gl = mixh(r[4], '#ffffff', 0.4);
    var DX = 7, DY = -5, yb = 27, fh = Math.round(17 - sq * 1.2), x0 = Math.round(4 - sq * 0.7), x1 = Math.round(24 + sq * 0.7), yt = yb - fh;
    var X, Y, f;
    function so(Y) { return Math.round(sh * clamp((yb - Y) / fh, 0, 1.4)); }
    function bulge(Y) { var q = (Y - yt) / fh; return q > 0.32 && q < 0.72 ? 2 : q > 0.12 && q < 0.9 ? 1 : 0; }
    // goo puddle under the block
    for (X = x0 - 1; X <= x1 + 4; X++) if (h1s(X, 5) > 0.2) px(g, X, yb + 2, X < x0 + 2 || X > x1 ? r[0] : r[1]);
    for (X = x0 - 2; X <= x1 + 4; X++) px(g, X, yb + 1, X === x0 - 2 ? r[3] : X > x1 + 2 ? r[1] : r[2]);
    // side face (in shadow, toward the party)
    for (X = x1 + 1; X <= x1 + DX; X++) {
      var u = (X - x1) / DX, ytp = yt + Math.round(DY * u) + 1, ybt = yb + Math.round(DY * u * 0.8);
      for (Y = ytp; Y <= ybt; Y++) { var vv = (Y - ytp) / Math.max(1, ybt - ytp); px(g, X + so(Y), Y, vv > 0.75 ? dk : (vv > 0.45 && bay(X, Y) < 0.5) ? dk : (u < 0.2 ? r[2] : r[1])); }
    }
    // top face: convex, lit
    for (Y = 0; Y < -DY; Y++) {
      var off = Math.round((-DY - Y) * DX / -DY), yy = yt + DY + Y + 1;
      for (X = x0 + 3 + off - (Y > 2 ? 1 : 0) + (Y === 0 ? 2 : 0); X <= x1 + off - (Y === 0 ? 3 : Y === 1 ? 1 : 0); X++) px(g, X + so(yy), yy, (Y === 1 || (Y === 2 && bay(X, yy) < 0.4)) ? r[4] : r[3]);
    }
    // front face: glassy, lighter at the top, a deep inner volume, darker toward the floor
    for (Y = yt; Y <= yb; Y++) {
      f = (Y - yt) / fh; var cut = [3, 2, 1, 1][Y - yt] || (Y === yb ? 2 : Y === yb - 1 ? 1 : 0), b = bulge(Y);
      for (X = x0 + cut - b; X <= x1 - cut + b; X++) {
        var lv = f < 0.15 ? 3 : f < 0.6 ? 2 : 1;
        var ins = X > x0 + 1 && X < x1 - 1 && Y > yt + 1 && Y < yb - 1;
        if (ins) lv = (bay(X, Y) < 0.35 + f * 0.4) ? 1 : 2;
        if (f > 0.82 && bay(X, Y) < (f - 0.82) * 5) lv = 0;
        px(g, X + so(Y), Y, r[lv]);
      }
    }
    // seen through the jelly: the back edges of the block, faint
    for (Y = yt + DY + 3; Y <= yb + DY; Y++) if (Y > yt + 1 && (Y & 1)) px(g, x0 + DX + so(Y), Y, r[3]);
    for (X = x0 + DX; X <= x1; X++) if (X & 1) px(g, X + so(yb + DY), yb + DY, r[3]);
    // floating nucleus: a crystal shard with a halo, bobbing
    var bob = [0, 1, 1, 0][ps.f], ncx = Math.round((x0 + x1) / 2 + 2 + sh * 0.4), ncy = Math.round(yt + fh * 0.5 + bob);
    var N = ps.hurt ? ['#6a6a9a', '#b0b0d8', '#eeeeff', '#ffffff'] : ['#1e5a9a', '#46a6e6', '#a8f0ff', '#ffffff'];
    for (Y = -5; Y <= 5; Y++) for (X = -6; X <= 6; X++) { var q2 = X * X / 36 + Y * Y / 25; if (q2 <= 1 && ((X + Y) & 1) === 0) px(g, ncx + X, ncy + Y, q2 < 0.45 ? r[4] : r[3]); }
    stamp(g, ['..a..', '.abc.', '.abc.', 'abccd', '.bcd.', '.bcd.', '..d..'], ncx - 2, ncy - 4, { a: N[3], b: N[2], c: N[1], d: N[0] });
    px(g, ncx - 1, ncy - 2, '#ffffff');
    stamp(g, ['.b.', 'bcd', '.d.'], ncx - 8, ncy + 2 - bob, { b: N[2], c: N[1], d: N[0] });
    // bubbles and a swallowed pebble
    px(g, ncx + 6, ncy - 4 + bob, gl); px(g, ncx + 5, ncy - 3 + bob, r[3]); px(g, x0 + 4, yt + 5 + bob, gl); px(g, ncx + 4, ncy + 5, r[4]);
    stamp(g, ['.kk.', 'kkkj'], x0 + 3 + so(yb - 2), yb - 3, { k: mixh(r[0], '#201830', 0.55), j: r[3] });
    // specular: lit front-left edge, glossy streak on the top edge, a glint
    for (Y = yt + 3; Y < yt + 10; Y++) px(g, x0 - bulge(Y) + so(Y) + (Y < yt + 4 ? 1 : 0), Y, Y < yt + 6 ? gl : r[4]);
    for (X = x0 + 3; X < x1 - 6; X++) if (X < x0 + 7 || (X & 1)) px(g, X + so(yt), yt, X < x0 + 6 ? '#ffffff' : gl);
    stamp(g, ['ww', 'w.', 'w.'], x0 + 2 + so(yt + 3), yt + 3, { w: '#ffffff' });
    line(g, x0 + 4 + DX - 1 + so(yt + DY + 2), yt + DY + 2, x0 + 10 + DX - 2 + so(yt + DY + 2), yt + DY + 2, ['#ffffff']);
    // drip running down the shadow side
    var dpx = x1 + 3 + so(yt + 4), dpy = yt + 1 + Math.round(DY * 3 / DX);
    px(g, dpx, dpy + 6, r[2]); px(g, dpx, dpy + 7, r[2]); px(g, dpx, dpy + 8 + (ps.f & 1), r[3]);
    return c;
  }
};
MON.imp = {
  w: 38, h: 38, ax: 16, ay: 37,
  build: function (tint, ps) {
    var P = Prims(), b = ps.f % 2, hl = ps.hurt ? -2 : 0, lean = ps.atk === 2 ? 2 : 0;
    P.c(12, 28, 2.8, 9 - lean, 34, 2.3, 'body', 0, 0); P.e(8 - lean, 35.5, 3.4, 1.6, 'body', 1, 2);
    P.c(19, 28, 2.8, 21 + lean, 34, 2.3, 'body', 3, 3); P.e(23 + lean, 35.5, 3.4, 1.6, 'body', 4, 2);
    P.c(11, 20 + b, 2.3, 7 + hl, 27, 1.9, 'body', -2, -2); P.e(7 + hl, 28, 2.2, 2.2, 'body', -2, 2);
    P.e(16 + hl * 0.5, 24 + b, 6.8, 6.2, 'body', 2, 6);
    P.e(18 + hl * 0.5, 26 + b, 3.6, 3.6, 'belly', 7, 2);
    P.p([[9, 27], [23, 27], [22, 32], [17, 30], [15, 33], [10, 31]], 'cloth', 9, [0, 0.2, 1]);
    P.c(9, 27, 1, 23, 27, 1, 'leather', 9.5, 9.5);
    var hx = 20 + hl + lean, hy = 13 + b + (ps.hurt ? 1 : 0);
    P.c(hx + 4, hy - 4, 1.8, hx + 11, hy - 8, 0.5, 'body', 1, 0);
    P.e(hx, hy, 8.4, 7.2, 'body', 6, 7, { g: 2 });
    P.e(hx + 7, hy + 1.5, 2.4, 2.2, 'body', 12, 2, { g: 2 });
    P.c(hx - 6, hy - 1, 2.6, hx - 16, hy - 4, 0.5, 'body', 9, 8);
    P.c(hx - 3, hy - 6, 1.5, hx - 5, hy - 11, 0.4, 'bone', 7, 6); P.c(hx + 2, hy - 7, 1.5, hx + 3, hy - 12, 0.4, 'bone', 9, 8);
    var sx = 22 + hl, sy = 20 + b, ex, ey, kx, ky;
    if (ps.atk === 1) { ex = sx + 1; ey = sy - 9; kx = ex - 3; ky = ey - 7; }
    else if (ps.atk === 2) { ex = sx + 9; ey = sy + 1; kx = ex + 6; ky = ey + 3; }
    else { ex = sx + 4; ey = sy + 6; kx = ex + 4; ky = ey - 6; }
    P.c(sx, sy, 2.5, ex, ey, 2.2, 'body', 9, 10); P.e(ex, ey, 2.4, 2.4, 'body', 11, 2);
    P.c(ex + (kx - ex) * 0.15, ey + (ky - ey) * 0.15, 1, kx, ky, 0.5, 'blade', 12, 12);
    return renderVolume(38, 38, P, mats(tint), function (g) {
      var x = Math.round(hx), y = Math.round(hy);
      if (ps.hurt) { stamp(g, ['kk.', '..k'], x + 1, y - 1, { k: '#1a1024' }); stamp(g, ['.kk', 'k..'], x + 5, y - 1, { k: '#1a1024' }); }
      else { stamp(g, ['kkk.', 'yyYk', 'yyk.'], x, y - 2, { k: '#2a1024', y: '#ffd640', Y: '#fff8c0' }); stamp(g, ['kk', 'yk', 'k.'], x + 5, y - 2, { k: '#2a1024', y: '#ffd640' }); }
      stamp(g, ps.atk === 2 ? ['kkkkkk', 'kwRwRk', '.kkkk.'] : ['kkkkk.', '.w.w..'], x - 1, y + 3, { k: '#2a1024', w: '#fffaf0', R: '#a8203a' });
    });
  }
};
MON.bat = {
  w: 50, h: 36, ax: 24, ay: 35, fly: 12,
  build: function (tint, ps) {
    var P = Prims(), f = ps.atk === 2 ? 2 : ps.atk === 1 ? 0 : ps.f, hl = ps.hurt ? -2 : 0, lean = ps.atk === 2 ? 3 : 0;
    var tips = [[[3, 2], [47, 3]], [[0, 13], [49, 13]], [[5, 29], [45, 29]], [[0, 13], [49, 13]]][f];
    function wing(sx, sy, tip, side, z) {
      var bx = side < 0 ? sx + 1 : sx - 1, by = sy + 9, pts = [[sx, sy]];
      var ex = sx + (tip[0] - sx) * 0.45, ey = sy + (tip[1] - sy) * 0.45 - 3;
      pts.push([ex, ey], tip);
      for (var i = 1; i <= 3; i++) {
        var t = i / 4, qx = tip[0] + (bx - tip[0]) * t, qy = tip[1] + (by - tip[1]) * t;
        var ix = qx + (ex - qx) * 0.18, iy = qy + (ey - qy) * 0.18;
        pts.push([ix, iy + 2], [qx, qy]);
      }
      pts.push([bx, by]);
      P.p(pts, 'wing', z, [side * -0.1, -0.35, 1]);
      P.c(sx, sy, 1.3, ex, ey, 1, 'dkbody', z + 0.5, z + 0.5); P.c(ex, ey, 1, tip[0], tip[1], 0.5, 'dkbody', z + 0.5, z + 0.5);
      for (var k = 1; k <= 3; k++) { var t2 = k / 4; P.c(ex, ey, 0.7, tip[0] + (bx - tip[0]) * t2, tip[1] + (by - tip[1]) * t2, 0.4, 'dkbody', z + 0.4, z + 0.4); }
    }
    var cx = 24 + hl + lean, cy = 17 + (f === 2 ? -1 : f === 0 ? 1 : 0);
    wing(cx - 3, cy - 3, tips[0], -1, -2);
    P.e(cx, cy + 1, 6.2, 7.2, 'body', 2, 6, { g: 3 });
    P.e(cx + 1, cy + 3, 3.4, 4.4, 'belly', 6, 2, { g: 3 });
    P.e(cx + 2, cy - 7, 5.2, 4.6, 'body', 5, 5, { g: 3 });
    P.e(cx + 6, cy - 6, 2.2, 1.7, 'body', 9, 2, { g: 3 });
    P.c(cx - 1, cy - 10, 1.9, cx - 4, cy - 16, 0.4, 'body', 4, 3); P.c(cx + 4, cy - 10, 1.9, cx + 7, cy - 16, 0.4, 'body', 6, 5);
    P.c(cx - 2, cy + 8, 1, cx - 3, cy + 12, 0.7, 'dkbody', 3, 3); P.c(cx + 2, cy + 8, 1, cx + 3, cy + 12, 0.7, 'dkbody', 3, 3);
    wing(cx + 3, cy - 3, tips[1], 1, 8);
    return renderVolume(50, 36, P, mats(tint, { wing: { r: ramp(mixh(tint, '#3a1a40', 0.55)), dither: 0.22, tex: function (x, y) { return (Math.abs(x - cx) / 40) * 0.5 - 0.1; } } }), function (g) {
      var x = Math.round(cx + 2), y = Math.round(cy - 8);
      if (ps.hurt) { px(g, x, y, '#1a1024'); px(g, x + 3, y, '#1a1024'); }
      else { stamp(g, ['RR.RR', 'rY.rY'], x - 1, y - 1, { R: '#ff4060', r: '#b01838', Y: '#fff0a0' }); }
      stamp(g, ps.atk === 2 ? ['kkkk', 'wkkw', 'w..w'] : ['kkk.', 'w.w.'], x + 1, y + 3, { k: '#2a1024', w: '#fffaf0' });
    });
  }
};
MON.shell = {
  w: 58, h: 40, ax: 26, ay: 39,
  build: function (tint, ps) {
    var P = Prims(), b = ps.f % 2, hl = ps.hurt ? -2 : 0, reach = ps.atk === 2 ? 5 : ps.atk === 1 ? -2 : 0;
    P.c(5, 29, 2.4, 0, 32, 0.6, 'body', 0, 0);
    P.e(12, 33, 4.6, 5, 'body', -2, 4); P.e(31, 34, 4.6, 5, 'body', -2, 4);
    P.e(18, 34, 5, 5, 'body', 6, 5); P.e(38, 34, 5.2, 5, 'body', 6, 5);
    var hx = 50 + reach + hl, hy = 23 + b + (ps.atk === 2 ? 2 : 0);
    P.c(40, 27, 4.4, hx - 3, hy + 1, 4.4, 'body', 8, 10, { g: 4 });
    P.e(hx, hy, 5.8, 5, 'body', 11, 5, { g: 4 });
    P.p([[hx + 3, hy - 1], [hx + 8, hy + 1], [hx + 3, hy + 3]], 'bone', 15, [0.3, -0.2, 1]);
    var cy = 20 + hl * 0.3;
    P.e(26 + hl, cy, 20, 14.5, 'shell', 4, 15, { clip: function (X, Y) { return Y > 30; }, g: 5 });
    P.e(26 + hl, 29, 22, 4.5, 'rim', 3, 4);
    P.c(16 + hl, 8, 2.2, 14 + hl, 2, 0.5, 'bone', 14, 12); P.c(26 + hl, 6, 2.4, 26 + hl, 0, 0.5, 'bone', 17, 15); P.c(36 + hl, 8, 2.2, 38 + hl, 2, 0.5, 'bone', 14, 12);
    var cen = [];
    for (var gy = 0; gy < 5; gy++) for (var gx = -1; gx < 7; gx++) cen.push([gx * 8.5 + (gy & 1) * 4.2 + 4 + hl + (h2s(gx, gy, 3) - 0.5) * 2, gy * 6.2 + 5 + (h2s(gx, gy, 4) - 0.5) * 1.6]);
    var M = mats(tint, {
      shell: {
        r: ramp(mixh(tint, '#6a5a2a', 0.45)),
        tex: function (x, y) {
          var d1 = 1e9, d2 = 1e9; cen.forEach(function (c) { var dd = Math.hypot(x + 0.5 - c[0], (y + 0.5 - c[1]) * 1.25); if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd; });
          return d2 - d1 < 1.3 ? -0.55 : d1 < 1.6 ? 0.18 : (d2 - d1 < 2.4 ? 0.1 : 0);
        }
      }
    });
    return renderVolume(58, 40, P, M, function (g) {
      var x = Math.round(hx), y = Math.round(hy);
      if (ps.hurt) stamp(g, ['kk', '..'], x, y - 2, { k: '#1a1024' });
      else stamp(g, ['ww.', 'wkY'], x, y - 3, { w: '#fffaf0', k: '#1a1024', Y: '#ffd640' });
      line(g, x + 2, y + 1, x + 7, y + 1, ['#3a2420']);
    });
  }
};
MON.brute = {
  w: 60, h: 64, ax: 28, ay: 63,
  build: function (tint, ps) {
    var P = Prims(), b = ps.f % 2, hl = ps.hurt ? -3 : 0, lean = ps.atk === 2 ? 3 : ps.atk === 1 ? -1 : 0;
    P.c(20, 46, 6.8, 17, 58, 5.6, 'body', 0, 0); P.e(15, 60, 7, 3, 'body', 2, 3);
    P.c(33, 46, 6.8, 36, 58, 5.6, 'body', 3, 3); P.e(38, 60, 7, 3, 'body', 5, 3);
    P.c(14 + hl, 26 + b, 5.6, 9 + hl, 41, 4.6, 'body', -4, -4); P.e(9 + hl, 44, 5.2, 4.6, 'body', -3, 4);
    P.e(27 + hl + lean * 0.5, 31 + b, 15.5, 13.5, 'body', 4, 12, { g: 6 });
    P.e(31 + hl + lean * 0.5, 37 + b, 9, 7.5, 'belly', 10, 5, { g: 6 });
    P.p([[14, 42], [41, 42], [39, 53], [29, 49], [19, 54]], 'cloth', 12, [0, 0.25, 1]);
    P.c(14, 42, 1.8, 41, 42, 1.8, 'leather', 13, 13);
    var hx = 33 + hl + lean, hy = 14 + b + (ps.hurt ? 1 : 0);
    P.e(hx, hy, 8.2, 7.8, 'body', 10, 7, { g: 7 });
    P.e(hx + 2, hy + 5, 6.4, 3.8, 'body', 13, 3, { g: 7 });
    P.c(hx - 6, hy - 4, 2.2, hx + 6, hy - 3, 2.2, 'body', 15, 15, { g: 7 });
    P.c(hx - 5, hy - 6, 2.4, hx - 11, hy - 13, 0.6, 'bone', 9, 7); P.c(hx + 5, hy - 6, 2.4, hx + 10, hy - 13, 0.6, 'bone', 9, 7);
    var sx = 40 + hl + lean, sy = 24 + b, ex, ey, c1, c2;
    if (ps.atk === 1) { ex = sx + 3; ey = sy - 11; c1 = [ex + 1, ey - 1]; c2 = [ex + 12, ey - 9]; }
    else if (ps.atk === 2) { ex = sx + 10; ey = sy + 10; c1 = [ex + 1, ey + 3]; c2 = [ex + 6, ey + 22]; }
    else { ex = sx + 6; ey = sy + 13; c1 = [ex + 1, ey + 2]; c2 = [ex + 7, ey - 22]; }
    P.e(sx, sy, 6.2, 5.6, 'body', 12, 5);
    P.c(sx + 1, sy + 1, 5.6, ex, ey, 4.6, 'body', 12, 14);
    P.c(c1[0], c1[1], 2, c2[0], c2[1], 5, 'wood', 17, 17);
    P.e(ex, ey + 2, 5, 4.6, 'body', 18, 4);
    var M = mats(tint, { wood: { tex: function (x, y) { return h2s(x, y, 9) > 0.86 ? -0.4 : 0; } } });
    return renderVolume(60, 64, P, M, function (g) {
      var x = Math.round(hx), y = Math.round(hy);
      if (ps.hurt) { stamp(g, ['kk.', '..k'], x - 3, y - 1, { k: '#1a1024' }); stamp(g, ['.kk', 'k..'], x + 2, y - 1, { k: '#1a1024' }); }
      else { stamp(g, ['kkk', 'Rrk'], x - 4, y - 2, { k: '#1a1024', R: '#ff5040', r: '#ffd0a0' }); stamp(g, ['kkk', 'Rrk'], x + 2, y - 2, { k: '#1a1024', R: '#ff5040', r: '#ffd0a0' }); }
      stamp(g, ps.atk === 2 ? ['kkkkkkk', 'kRRRRRk', 'w.kkk.w'] : ['kkkkkk', 'w....w', 'w....w'], x - 2, y + 4, { k: '#2a1024', w: '#fffaf0', R: '#8a1a2a' });
      // scar + nipples-free chest shading strokes
      line(g, x - 14, y + 16 + b, x - 9, y + 13 + b, [ramp(tint)[1]]);
      line(g, x - 6, y + 22 + b, x - 1, y + 21 + b, [ramp(tint)[1]]);
    });
  }
};
MON.sentinel = {
  w: 46, h: 54, ax: 20, ay: 53,
  build: function (tint, ps) {
    var P = Prims(), b = ps.f % 2, hl = ps.hurt ? -2 : 0, lean = ps.atk === 2 ? 2 : 0;
    P.c(9 + hl, 18 + b, 2.4, 8 + hl, 9, 2.4, 'steel', -2, -2); P.e(8 + hl, 8, 3, 1.5, 'dark', -1, 2);
    P.c(14, 37, 3.6, 13, 48, 3.6, 'steel', 0, 0); P.e(12, 50.5, 5.4, 2.6, 'dark', 1, 3); P.e(13.5, 42, 3, 2.6, 'brass', 4, 3);
    P.c(24, 37, 3.6, 26, 48, 3.6, 'steel', 3, 3); P.e(27, 50.5, 5.4, 2.6, 'dark', 4, 3); P.e(25, 42, 3, 2.6, 'brass', 7, 3);
    P.e(19, 35, 8.4, 4.2, 'dark', 4, 4);
    P.c(11 + hl, 21 + b, 2.6, 9 + hl, 31, 2.4, 'steel', -2, -2); P.e(9 + hl, 32, 2.6, 2.6, 'dark', -1, 2);
    P.e(19 + hl + lean, 23 + b, 10.6, 8.4, 'body', 5, 9, { g: 8 });
    P.c(14 + hl + lean, 30 + b, 4.6, 24 + hl + lean, 30 + b, 4.6, 'body', 6, 8, { g: 8 });
    P.p([[16 + hl + lean, 19 + b], [27 + hl + lean, 19 + b], [26 + hl + lean, 28 + b], [17 + hl + lean, 28 + b]], 'plate', 13, [-0.3, -0.35, 1]);
    P.e(11 + hl, 18 + b, 5, 4, 'body', 3, 4);
    var hx = 21 + hl + lean, hy = 11 + b;
    P.e(hx, hy, 6.8, 6.8, 'steel', 9, 6);
    P.c(hx - 4, hy - 6, 2, hx + 3, hy - 7, 1.4, 'body', 13, 13);
    var sx = 29 + hl + lean, sy = 20 + b, ex, ey, s1, s2;
    if (ps.atk === 1) { ex = sx + 2; ey = sy - 7; s1 = [ex - 3, ey + 12]; s2 = [ex + 1, ey - 14]; }
    else if (ps.atk === 2) { ex = sx + 8; ey = sy + 4; s1 = [ex - 14, ey + 1]; s2 = [ex + 8, ey - 2]; }
    else { ex = sx + 4; ey = sy + 9; s1 = [ex + 1, ey + 22]; s2 = [ex + 2, ey - 19]; }
    P.c(sx, sy, 2.9, ex, ey, 2.7, 'steel', 13, 13); P.e(ex, ey, 3, 3, 'dark', 14, 3);
    P.c(s1[0], s1[1], 1, s2[0], s2[1], 1, 'wood', 15, 15);
    var dx = s2[0] - s1[0], dy = s2[1] - s1[1], dl = Math.hypot(dx, dy), ux = dx / dl, uy = dy / dl, nx = -uy, ny = ux;
    P.p([[s2[0] + ux * 6, s2[1] + uy * 6], [s2[0] + nx * 2.5, s2[1] + ny * 2.5], [s2[0] - ux * 2, s2[1] - uy * 2], [s2[0] - nx * 2.5, s2[1] - ny * 2.5]], 'blade', 16, [nx * 0.4 - 0.2, ny * 0.4 - 0.3, 1]);
    P.p([[s2[0] - ux * 1 + nx * 2, s2[1] - uy * 1 + ny * 2], [s2[0] - ux * 1 + nx * 6, s2[1] - uy * 1 + ny * 6], [s2[0] - ux * 5 + nx * 2, s2[1] - uy * 5 + ny * 2]], 'blade', 16, [0.1, -0.5, 1]);
    P.e(sx, sy - 1, 5.6, 4.6, 'plate', 14, 5);
    // enamelled plate armour (not skin): clean 4-step ramp, no noise; steel and brass trims flat-lit
    var plate = ['#240a18', '#501428', '#84202e', '#b8383a', '#ec7c52'];
    var M = mats(tint, { body: { r: plate, dither: 0 }, plate: { r: plate, dither: 0 }, steel: { dither: 0.02 }, brass: { dither: 0, spec: true, hi: '#fffbe0' }, dark: { dither: 0 } });
    return renderVolume(46, 54, P, M, function (g, inside) {
      var x = Math.round(hx), y = Math.round(hy);
      line(g, x - 1, y, x + 6, y, ['#120a18']);
      if (!ps.hurt) { line(g, x + 1, y, x + 5, y, ['#7ff6ff', '#e8ffff', '#7ff6ff', '#38b8e0']); px(g, x + 6, y, '#38b8e0'); }
      line(g, x - 1, y + 1, x + 6, y + 1, ['#262a44']);
      var tx = Math.round(19 + hl + lean), ty = Math.round(25 + b), X, Y;
      // plate seams: a curved breastplate edge and a centre ridge, lit edge above each seam
      for (X = tx - 9; X <= tx + 8; X++) { Y = ty - 7 + Math.round(Math.abs(X - tx) * 0.25); if (inside(X, Y)) { px(g, X, Y, plate[0]); if (inside(X, Y - 1)) px(g, X, Y - 1, plate[4]); } }
      for (Y = ty - 6; Y <= ty + 3; Y++) if (inside(tx - 3, Y)) { px(g, tx - 3, Y, plate[3]); px(g, tx - 2, Y, plate[1]); }
      // brass collar studs
      [[-6, -4], [-7, 1], [6, -6], [8, 0]].forEach(function (q) { if (inside(tx + q[0], ty + q[1])) { px(g, tx + q[0], ty + q[1], '#fff0b4'); px(g, tx + q[0] + 1, ty + q[1] + 1, '#84541c'); } });
      // belt with a square buckle
      var by = Math.round(31 + b);
      for (X = tx - 10; X <= tx + 9; X++) if (inside(X, by)) { px(g, X, by, '#3a2418'); px(g, X, by + 1, '#1e1210'); if (inside(X, by - 1)) px(g, X, by - 1, '#7a5434'); }
      stamp(g, ['bbbb', 'bkkb', 'bbbb'], tx - 2, by - 1, { b: '#e6bc5c', k: '#4e2c10' }); px(g, tx - 2, by - 1, '#fff0b4');
      // gem in the breastplate
      stamp(g, ['.oo.', 'oRwo', '.oo.'], tx + 1, ty - 3, { o: '#1a1024', w: '#ffffff', R: '#ff5040' });
      // dark selective edge on the shadow (right) side of the torso
      for (Y = ty - 12; Y <= ty + 8; Y++) for (X = tx + 14; X > tx; X--) if (inside(X, Y)) { if (!inside(X + 1, Y)) px(g, X, Y, mixh(plate[0], '#0a0612', 0.4)); break; }
      // knee guards: specular pixels
      px(g, 12, 41, '#ffffff'); px(g, 24, 41, '#ffffff');
    });
  }
};
// Goblin shaman (original): hunched, hook-nosed, curled horns, bone beads, tattered hide, crooked staff with a glowing stone.
MON.gshaman = {
  w: 48, h: 54, ax: 21, ay: 53,
  build: function (tint, ps) {
    var P = Prims(), b = ps.f % 2, hl = ps.hurt ? -2 : 0, lean = ps.atk === 2 ? 2 : 0;
    P.c(17, 39, 2.4, 13, 46, 1.9, 'body', 0, 0); P.c(13, 46, 1.9, 15, 50, 1.5, 'body', 0.2, 0.2); P.e(17, 51, 3.4, 1.5, 'dkbody', 1, 1.5);
    P.c(16 + hl, 25 + b, 2.2, 12 + hl, 32 + b, 1.8, 'body', -2, -2); P.c(12 + hl, 32 + b, 1.8, 15 + hl, 37 + b, 1.5, 'body', -2, -2); P.e(15 + hl, 37.5 + b, 2, 1.8, 'body', -1.5, 1.6);
    P.e(21 + hl + lean * 0.5, 31 + b, 7.2, 8.2, 'body', 2, 7, { g: 1 });
    P.e(23.5 + hl + lean * 0.5, 34 + b, 4, 4, 'belly', 7, 2.4, { g: 1 });
    P.c(23, 39, 2.5, 26, 46, 2, 'body', 3, 3, { g: 2 }); P.c(26, 46, 2, 24, 50, 1.6, 'body', 3.2, 3.2, { g: 2 }); P.e(27, 51, 3.6, 1.6, 'dkbody', 4, 1.6, { g: 2 });
    P.p([[13, 36.5 + b], [29, 36.5 + b], [28, 42], [25.5, 40.5], [23.5, 45], [21, 41], [18, 44.5], [15.5, 41], [13.5, 43]], 'hide', 9, [0, 0.25, 1]);
    P.c(13, 37 + b, 1.1, 29, 37 + b, 1.1, 'leather', 10, 10);
    var hx = 28 + hl + lean, hy = 18 + b + (ps.hurt ? 1 : 0);
    P.c(hx - 4, hy - 1, 2.6, hx - 14, hy - 7, 0.4, 'body', 4, 3, { g: 3 });
    P.e(hx, hy, 6.8, 6.0, 'body', 6, 6, { g: 3 });
    P.c(hx + 4, hy + 0.5, 2.0, hx + 8.5, hy + 3.5, 1.2, 'body', 11, 10, { g: 3 });
    P.e(hx + 2.5, hy + 4, 3.8, 2.2, 'body', 9, 2, { g: 3 });
    P.c(hx - 2, hy - 5, 1.6, hx - 4, hy - 10, 1.0, 'bone', 7, 7); P.c(hx - 4, hy - 10, 1.0, hx - 1.5, hy - 13, 0.4, 'bone', 7, 7);
    P.c(hx + 2, hy - 5, 1.6, hx + 2, hy - 10, 1.0, 'bone', 9, 9); P.c(hx + 2, hy - 10, 1.0, hx + 5, hy - 12.5, 0.4, 'bone', 9, 9);
    for (var k = 0; k < 5; k++) P.e(hx - 5 + k * 2.2, 26 + b + Math.abs(k - 2) * -0.6, 1.1, 1.1, 'bone', 12, 1);
    var sx = 26 + hl + lean, sy = 25 + b, ex, ey, hx2, hy2, s1, s2;
    if (ps.atk === 1) { ex = sx + 6; ey = sy - 2; hx2 = sx + 11; hy2 = sy - 8; s1 = [hx2 + 1, hy2 + 22]; s2 = [hx2 - 1, hy2 - 14]; }
    else if (ps.atk === 2) { ex = sx + 5; ey = sy + 1; hx2 = sx + 10; hy2 = sy - 1; s1 = [hx2 - 10, hy2 + 12]; s2 = [hx2 + 9, hy2 - 13]; }
    else { ex = sx + 6; ey = sy + 6; hx2 = sx + 12; hy2 = sy + 4; s1 = [hx2 + 1, 51]; s2 = [hx2 - 0.5, hy2 - 20]; }
    P.c(s1[0], s1[1], 1.0, s2[0], s2[1], 0.9, 'wood', 12, 12, { g: 4 });
    var dx = s2[0] - s1[0], dy = s2[1] - s1[1], dl = Math.hypot(dx, dy), ux = dx / dl, uy = dy / dl;
    P.c(s2[0], s2[1], 0.9, s2[0] + uy * -3 + ux * 2, s2[1] + ux * 3 + uy * 2, 0.6, 'wood', 12, 12, { g: 4 });
    P.e(s2[0] + ux * 2.2, s2[1] + uy * 2.2, 2.2, 2.2, 'gem', 13, 2, { g: 4 });
    P.c(sx, sy, 2.3, ex, ey, 1.9, 'body', 10, 11, { g: 5 }); P.c(ex, ey, 1.9, hx2, hy2, 1.6, 'body', 11, 12, { g: 5 }); P.e(hx2, hy2, 2.1, 2.0, 'body', 13, 2, { g: 5 });
    P.c(ex + (hx2 - ex) * 0.5, ey + (hy2 - ey) * 0.5, 1.9, ex + (hx2 - ex) * 0.8, ey + (hy2 - ey) * 0.8, 1.8, 'leather', 12.5, 12.5, { g: 5 });
    var glow = ps.atk ? ['#6a2a10', '#c05a20', '#f09a3a', '#ffd870', '#ffffff'] : ['#163a60', '#2a74c0', '#4ab0f0', '#a0e8ff', '#ffffff'];
    var M = mats(tint, { hide: { r: ['#2a1a14', '#4a3222', '#6e4c32', '#94704a', '#b49068'], tex: function (x, y) { return h2s(x, y >> 1, 5) > 0.75 ? -0.35 : 0; } }, gem: { r: glow, dither: 0, spec: true, hi: '#ffffff' } });
    return renderVolume(48, 54, P, M, function (g, inside) {
      var x = Math.round(hx), y = Math.round(hy), R = ramp(tint);
      if (ps.hurt) { stamp(g, ['k.k', '.k.'], x + 1, y - 1, { k: '#1a1024' }); }
      else { stamp(g, ['kkk.', 'yYyk'], x + 1, y - 2, { k: '#1a1024', y: '#ffd640', Y: '#fff8c0' }); }
      line(g, x - 2, y - 3, x + 4, y - 3, [R[0]]);
      stamp(g, ['w.w.', 'kkkk'], x + 3, y + 4, { w: '#fffaf0', k: '#2a1024' });
      stamp(g, ['r.r', 'r.r'], x - 2, y + 1, { r: '#e8e0c8' });
      // ribs / belly folds and hide stitches
      for (var r = 0; r < 3; r++) { var yy = Math.round(27 + b + r * 2.4), xx = Math.round(18 + hl + lean * 0.5); if (inside(xx, yy)) line(g, xx, yy, xx + 3, yy - 1, [R[1]]); }
      for (var X = 14; X < 29; X += 3) if (inside(X, 39 + b)) px(g, X, Math.round(39 + b), '#2a1a14');
    });
  }
};
// Goblin brute (original): squat and broad, mohawk, under-bite tusk, shoulder pad, wrapped wrists, nail-studded club.
MON.gbrute = {
  w: 58, h: 56, ax: 25, ay: 55,
  build: function (tint, ps) {
    var P = Prims(), b = ps.f % 2, hl = ps.hurt ? -3 : 0, lean = ps.atk === 2 ? 3 : ps.atk === 1 ? -1 : 0;
    P.c(20, 40, 4.2, 17, 48, 3.4, 'body', 0, 0); P.e(16, 51.5, 5.0, 2.3, 'dkbody', 1, 2);
    P.c(14 + hl, 22 + b, 4.2, 10 + hl, 30 + b, 3.6, 'body', -3, -3); P.c(10 + hl, 30 + b, 3.6, 12 + hl, 38 + b, 3.2, 'body', -3, -3); P.e(12 + hl, 39 + b, 3.4, 3.2, 'body', -2, 3);
    P.c(10.5 + hl, 33 + b, 3.4, 11.5 + hl, 36 + b, 3.3, 'wrap', -1.5, -1.5);
    P.e(25 + hl + lean * 0.5, 30 + b, 12, 11, 'body', 3, 10, { g: 1 });
    P.e(29 + hl + lean * 0.5, 24 + b, 7.5, 4.6, 'body', 9, 4, { g: 1 });
    P.e(28 + hl + lean * 0.5, 35 + b, 6.4, 5.2, 'gbelly', 9, 4, { g: 1 });
    P.c(30, 40, 4.4, 32, 48, 3.6, 'body', 4, 4, { g: 2 }); P.e(34, 51.5, 5.4, 2.4, 'dkbody', 5, 2.2, { g: 2 });
    P.p([[14, 39 + b], [38, 39 + b], [36, 46], [32, 44], [29, 48], [25, 44.5], [21, 47.5], [17, 44], [14.5, 45]], 'hide', 13, [0, 0.25, 1]);
    P.c(14, 39 + b, 1.8, 38, 39 + b, 1.8, 'leather', 14, 14);
    P.e(27, 39 + b, 2.4, 2.2, 'brass', 15.5, 1.6);
    var hx = 33 + hl + lean, hy = 13 + b + (ps.hurt ? 1 : 0);
    P.c(hx - 4, hy - 1, 2.0, hx - 10, hy - 6, 0.5, 'body', 8, 7, { g: 3 });
    P.e(hx, hy, 5.8, 5.4, 'body', 10, 5.4, { g: 3 });
    P.e(hx + 2.6, hy + 4, 5.0, 3.0, 'jaw', 12, 3, { g: 3 });
    P.c(hx + 5.5, hy + 3, 0.9, hx + 6.2, hy - 0.5, 0.4, 'bone', 16, 16);
    for (var k = 0; k < 4; k++) P.c(hx - 4 + k * 2.4, hy - 4.6 + Math.abs(k - 1.5) * 0.4, 1.3, hx - 5.5 + k * 2.4, hy - 9 + Math.abs(k - 1.5) * 0.8, 0.4, 'mane', 12, 11);
    var sx = 37 + hl + lean, sy = 21 + b, ex, ey, h2x, h2y, c1, c2;
    if (ps.atk === 1) { ex = sx + 2; ey = sy - 8; h2x = sx - 1; h2y = sy - 15; c1 = [h2x, h2y]; c2 = [h2x - 12, h2y + 2]; }
    else if (ps.atk === 2) { ex = sx + 8; ey = sy + 6; h2x = sx + 12; h2y = sy + 13; c1 = [h2x, h2y]; c2 = [h2x + 4, h2y + 17]; }
    else { ex = sx + 4; ey = sy + 9; h2x = sx + 5; h2y = sy + 16; c1 = [h2x, h2y]; c2 = [h2x + 6, h2y - 20]; }
    P.c(c1[0], c1[1], 1.8, c2[0], c2[1], 4.2, 'wood', 16, 17, { g: 4 });
    P.e(sx + 1, sy + 2.5, 3.8, 3.0, 'leather', 13, 3.2, { g: 5 }); P.c(sx - 4, sy + 1, 0.7, sx + 3, sy + 6, 0.7, 'leather', 13.5, 13.5, { g: 5 });
    P.c(sx + 1, sy + 1, 3.8, ex, ey, 3.4, 'body', 12, 13, { g: 5 }); P.c(ex, ey, 3.4, h2x, h2y, 3.0, 'body', 13, 14, { g: 5 });
    P.c(ex + (h2x - ex) * 0.5, ey + (h2y - ey) * 0.5, 3.2, ex + (h2x - ex) * 0.85, ey + (h2y - ey) * 0.85, 3.1, 'wrap', 14.5, 14.5, { g: 5 });
    P.e(h2x, h2y, 3.4, 3.2, 'body', 18, 3, { g: 5 });
    var M = mats(tint, {
      hide: { r: ['#24140e', '#40261a', '#60402a', '#84603e', '#a6825a'], tex: function (x, y) { return h2s(x, y >> 1, 7) > 0.72 ? -0.35 : 0; } },
      wrap: { r: ['#3a3028', '#6a5c4a', '#9a8a70', '#c4b494', '#e8dcc0'], tex: function (x, y) { return (x + y) % 3 === 0 ? -0.3 : 0; } },
      body: { bias: -0.16 },
      jaw: { r: ramp(tint), bias: 0.2 },
      gbelly: { r: ramp(mixh(tint, '#f4e4b0', 0.18)), bias: -0.12 },
      mane: { r: ['#2a0a10', '#5a1420', '#8a2430', '#c03c3c', '#e8705a'], dither: 0.05 },
      wood: { tex: function (x, y) { return h2s(x, y, 9) > 0.86 ? -0.4 : 0; } }
    });
    return renderVolume(58, 56, P, M, function (g, inside) {
      var x = Math.round(hx), y = Math.round(hy), R = ramp(tint);
      if (ps.hurt) { stamp(g, ['k.k', '.k.'], x + 1, y - 1, { k: '#1a1024' }); }
      else { stamp(g, ['kkkk', '.Rrk'], x, y - 2, { k: '#1a1024', R: '#ff5040', r: '#ffd0a0' }); }
      stamp(g, ps.atk === 2 ? ['kkkkk', 'kRRRk'] : ['kkkkk'], x + 2, y + 5, { k: '#2a1024', R: '#8a1a2a' });
      // muscle: pec line, ab ridges, bicep crease
      var tx = Math.round(29 + hl + lean * 0.5), ty = Math.round(24 + b);
      for (var X = tx - 6; X <= tx + 5; X++) { var Y = ty + 3 + Math.round(Math.abs(X - tx) * 0.25); if (inside(X, Y) && X !== tx) px(g, X, Y, R[1]); }
      for (var Y2 = ty + 3; Y2 < ty + 13; Y2++) if (inside(tx, Y2)) px(g, tx, Y2, R[1]);
      [ty + 7, ty + 10].forEach(function (yy) { line(g, tx - 3, yy, tx + 3, yy, [R[1]]); });
      // nails on the club head
      var nx = c2[0] - c1[0], ny = c2[1] - c1[1], nl = Math.hypot(nx, ny);
      [0.6, 0.75, 0.9].forEach(function (f, i) { var qx = Math.round(c1[0] + nx * f + (i % 2 ? 3 : -3) * (-ny / nl)), qy = Math.round(c1[1] + ny * f + (i % 2 ? 3 : -3) * (nx / nl)); px(g, qx, qy, '#eef2ff'); px(g, qx + 1, qy + 1, '#4a5274'); });
      for (var X2 = 15; X2 < 38; X2 += 3) if (inside(X2, 42 + b)) px(g, X2, Math.round(42 + b), '#24140e');
    });
  }
};
// rim light from the scene's key light on the side facing the party (right edge of every row)
function rimLight(c, rim) {
  var w = c.width, hh = c.height, g = c.getContext('2d'), id = g.getImageData(0, 0, w, hh), d = id.data, rc = h2r(rim);
  for (var y = 0; y < hh; y++) for (var x = w - 1; x >= 0; x--) {
    var k = (y * w + x) * 4; if (!d[k + 3]) continue;
    for (var n = 0; n < 2; n++) { var j = k - n * 4; if (x - n < 0 || !d[j + 3]) break; var f = n ? 0.22 : 0.55; for (var q = 0; q < 3; q++) d[j + q] = d[j + q] * (1 - f) + rc[q] * f; }
    break;
  }
  g.putImageData(id, 0, 0);
}
function monSprite(type, tint, pose, rim) {
  var key = 'm|' + type + '|' + tint + '|' + pose.f + pose.atk + (pose.hurt ? 1 : 0) + '|' + (rim || '');
  if (SPR[key]) return SPR[key];
  var D = MON[type], src = D.build(tint, pose);
  if (rim) rimLight(src, rim);
  return (SPR[key] = finishSprite(src, D.ax, D.ay));
}

/* ---------------- fonts ---------------- */
var BIG = {
  '0': ['.###.', '##.##', '##.##', '##.##', '##.##', '##.##', '.###.'],
  '1': ['.##..', '###..', '.##..', '.##..', '.##..', '.##..', '####.'],
  '2': ['.###.', '##.##', '...##', '..##.', '.##..', '##...', '#####'],
  '3': ['####.', '...##', '...##', '.###.', '...##', '...##', '####.'],
  '4': ['...##', '..###', '.#.##', '#..##', '#####', '...##', '...##'],
  '5': ['#####', '##...', '####.', '...##', '...##', '##.##', '.###.'],
  '6': ['.###.', '##...', '####.', '##.##', '##.##', '##.##', '.###.'],
  '7': ['#####', '...##', '..##.', '..##.', '.##..', '.##..', '.##..'],
  '8': ['.###.', '##.##', '##.##', '.###.', '##.##', '##.##', '.###.'],
  '9': ['.###.', '##.##', '##.##', '.####', '...##', '..##.', '.##..'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '?': ['.###.', '##.##', '...##', '..##.', '.##..', '.....', '.##..']
};
var GLY = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001',
  '5': '111100111001111', '6': '111100111101111', '7': '111001010010010', '8': '111101111101111', '9': '111101111001111',
  '-': '000000111000000', '+': '000010111010000', '?': '111001011000010', 'M': '101111111101101', 'I': '111010010010111', 'S': '111100111001111', 'A': '010101111101101', 'B': '110101110101110', 'C': '011100100100011', 'D': '110101101101110', 'E': '111100110100111', 'F': '111100110100100', 'G': '011100101101011', 'H': '101101111101101', 'J': '001001001101010', 'K': '101101110101101', 'L': '100100100100111', 'N': '110101101101101', 'O': '010101101101010', 'P': '110101110100100', 'Q': '010101101110011', 'R': '110101110101101', 'T': '111010010010010', 'U': '101101101101111', 'V': '101101101101010', 'W': '101101111111101', 'X': '101101010101101', 'Y': '101101010010010', 'Z': '111001010100111', '/': '001001010100100', '.': '000000000000010', ':': '000010000010000', ' ': '000000000000000'
};
function numWidth(str) { return str.length * 6 - 1; }
// damage digits: outlined, two-tone fill (bright top, tinted bottom)
function drawNum(g, str, x, y, col, col2) {
  var i, gl, xx, yy;
  function plot(c, ox, oy, rowsFrom) {
    for (i = 0; i < str.length; i++) {
      gl = BIG[str[i]]; if (!gl) continue;
      for (yy = 0; yy < 7; yy++) {
        if (rowsFrom != null && yy < rowsFrom) continue;
        g.fillStyle = typeof c === 'function' ? c(yy) : c;
        for (xx = 0; xx < 5; xx++) if (gl[yy][xx] === '#') g.fillRect(x + i * 6 + xx + ox, y + yy + oy, 1, 1);
      }
    }
  }
  for (var oy = -1; oy <= 2; oy++) for (var ox = -1; ox <= 1; ox++) if (ox || oy) plot(OUT, ox, oy);
  plot(function (r) { return r < 3 ? '#ffffff' : r < 5 ? col : (col2 || col); }, 0, 0);
}

function drawSmall(g, str, x, y, col) {
  str = String(str).toUpperCase();
  for (var i = 0; i < str.length; i++) {
    var gl = GLY[str[i]]; if (!gl) continue;
    for (var py = 0; py < 5; py++) for (var pxx = 0; pxx < 3; pxx++) if (gl[py * 3 + pxx] === '1') { g.fillStyle = col; g.fillRect(x + i * 4 + pxx, y + py, 1, 1); }
  }
}

/* ---------------- backdrops ---------------- */
function gradRows(D, W, y0, y1, cols, x0, x1) {
  x0 = x0 || 0; x1 = x1 == null ? W : x1;
  var n = cols.length - 1, rgb = cols.map(h2r);
  for (var y = y0; y < y1; y++) {
    var f = (y - y0) / Math.max(1, (y1 - y0)) * n, i0 = Math.min(n, Math.floor(f)), fr = f - i0, t = clamp((fr - 0.45) * 1.8, 0, 1);
    for (var x = x0; x < x1; x++) {
      var c = rgb[Math.min(n, i0 + (t > bay(x, y) ? 1 : 0))], j = (y * W + x) * 4;
      D[j] = c[0]; D[j + 1] = c[1]; D[j + 2] = c[2]; D[j + 3] = 255;
    }
  }
}
// a faceted crystal: pointed prism, lit facet left, shaded facet right, bright ridge and edge
function crystal(g, x, y, hgt, w, lean, R) {
  for (var yy = 0; yy <= hgt; yy++) {
    var f = yy / hgt, hw = (w / 2) * Math.min(1, (1 - f) * 3.2), cx = x + lean * f, Y = Math.round(y - yy);
    if (hw < 0.3) { px(g, Math.round(cx), Y, R[4]); continue; }
    var l = Math.round(cx - hw), r = Math.round(cx + hw), rg = Math.round(cx - hw * 0.25);
    rect(g, l, Y, rg - l, 1, R[3]); rect(g, rg, Y, r - rg + 1, 1, R[1]);
    px(g, rg, Y, R[4]); px(g, l, Y, yy > hgt * 0.7 ? R[4] : R[2]); px(g, r, Y, R[0]);
    if ((yy % 5) === 2) px(g, rg + 1, Y, R[2]);
  }
  px(g, Math.round(x + lean), Math.round(y - hgt), '#ffffff');
}
var CRY = { cyan: ['#163464', '#2a68b0', '#46a6e6', '#90e2ff', '#eaffff'], vio: ['#2a1a5a', '#5a3aa8', '#8a64e0', '#c4a8ff', '#f4ecff'], far: ['#2c2c6a', '#3a3c80', '#4c5296', '#6670b0', '#8a94cc'] };

function layer(W, H) { var c = mkCanvas(W, H); return { c: c, g: c.getContext('2d') }; }

function fxSlash(g, cx, cy, q, r, flip) {
  // crescent sweep, head white, tail through yellow to orange
  var head = -1.9 + q * 3.4, tail = 1.6;
  for (var k = 0; k < 26; k++) {
    var f = k / 25, a = head - f * tail; if (a < -1.9) continue;
    var X = cx + Math.cos(a) * r * (flip ? -1 : 1), Y = cy + Math.sin(a) * r * 0.9;
    var c = f < 0.12 ? '#ffffff' : f < 0.35 ? '#fff2a8' : f < 0.65 ? '#ffc054' : '#e8703a', th = f < 0.3 ? 2 : 1;
    if (f > 0.7 && (k & 1)) continue;
    rect(g, X, Y, th, th, c);
    if (f < 0.25) px(g, X + (flip ? 1 : -1) * Math.cos(a) * -2, Y - Math.sin(a) * 2, '#ffe8a0');
  }
}
// party melee: a large 3-frame crescent sweeping across the target, white edge into cyan
function fxCrescent(g, cx, cy, q, r) {
  if (q < 0 || q >= 1) return;
  var fr = Math.floor(q * 3), a0 = [-2.4, -2.4, -0.9][fr], a1 = [-0.4, 1.3, 1.7][fr], th = [0.34, 0.5, 0.26][fr];
  var C = ['#ffffff', '#e8fcff', '#8ae8ff', '#3aa8e0', '#1a5aa0'];
  for (var y = -r - 2; y <= r + 2; y++) for (var x = -r - 2; x <= r + 2; x++) {
    var d = Math.hypot(x, y * 1.1) / r, a = Math.atan2(y, -x);
    if (d > 1.06 || d < 1 - th || a < a0 - 0.5 || a > a1) continue;
    var fa = (a - a0) / (a1 - a0), e = (1 - d) / th;
    if (a < a0) { // fading trail behind the sweep
      if (((x + y) & 1) || d < 1 - th * 0.5) continue;
      px(g, cx + x, cy + y, fr === 2 ? C[4] : C[3]); continue;
    }
    var thick = th * (0.35 + fa * 0.65); if ((1 - d) > thick) continue;
    var k = d > 1.0 ? 3 : e < thick / th * 0.45 ? (fr === 2 ? 1 : 0) : e < thick / th * 0.8 ? 2 : 3;
    if (fr === 2 && fa < 0.5 && ((x + y) & 1)) continue;
    px(g, cx + x, cy + y, C[k]);
  }
}
// impact: star burst with a white core, and shards that fly out and fall
function fxBurst(g, x, y, q, big, seed) {
  if (q < 0 || q > 1) return;
  var R0 = (big ? 12 : 9) * Math.min(1, q * 3.2) * (q > 0.55 ? 1 - (q - 0.55) * 1.6 : 1);
  if (R0 > 1) for (var k = 0; k < 8; k++) {
    var an = k * Math.PI / 4 + 0.2, len = Math.round(k % 2 ? R0 : R0 * 0.55);
    for (var d = 1; d <= len; d++) px(g, x + Math.round(Math.cos(an) * d), y + Math.round(Math.sin(an) * d), d > len - 2 ? '#ffb040' : d > len * 0.5 ? '#fff0a0' : '#ffffff');
  }
  if (q < 0.45) { disc(g, x, y, q < 0.2 ? 3 : 2, '#ffffff'); }
  var n = big ? 6 : 4;
  for (var i = 0; i < n; i++) {
    var an2 = h1s(i, seed) * Math.PI * 2, sp = 10 + h1s(i, seed + 3) * 9, tt = q;
    var X = x + Math.cos(an2) * sp * tt, Y = y + Math.sin(an2) * sp * tt * 0.8 + tt * tt * 14;
    if (q > 0.85 && (i & 1)) continue;
    px(g, X, Y, '#ffffff'); px(g, X - Math.cos(an2), Y - Math.sin(an2), q < 0.5 ? '#ffe080' : '#ff8a3a');
  }
}
function fxSpark(g, x, y, q, big) {
  var L = Math.round(Math.sin(Math.min(1, q) * Math.PI) * (big ? 8 : 5));
  if (L <= 0) return;
  rect(g, x - L, y, L * 2 + 1, 1, '#fff2b0'); rect(g, x, y - L, 1, L * 2 + 1, '#fff2b0');
  var d = Math.round(L * 0.6);
  for (var i = 1; i <= d; i++) { px(g, x + i, y + i, '#ffc054'); px(g, x - i, y - i, '#ffc054'); px(g, x + i, y - i, '#ffc054'); px(g, x - i, y + i, '#ffc054'); }
  rect(g, x - 1, y - 1, 3, 3, '#ffffff');
}
// impact star: 8-ray burst with a white core, rays shorten as it fades
function fxImpact(g, x, y, q) {
  if (q < 0 || q > 1) return;
  var r0 = Math.round(2 + q * 9), r1 = Math.round(r0 * (q < 0.5 ? 0.4 : 0.75));
  for (var k = 0; k < 8; k++) {
    var a = k * Math.PI / 4 + 0.39, len = k % 2 ? r0 : Math.round(r0 * 0.6);
    for (var d = r1; d <= len; d++) px(g, x + Math.round(Math.cos(a) * d), y + Math.round(Math.sin(a) * d), d > len - 2 ? '#ff8a3a' : q < 0.5 ? '#ffffff' : '#ffe080');
  }
  if (q < 0.4) { rect(g, x - 2, y - 1, 5, 3, '#ffffff'); rect(g, x - 1, y - 2, 3, 5, '#ffffff'); }
}
function fxClaw(g, cx, cy, q) {
  var len = Math.round(Math.min(1, q * 2.2) * 15), fade = q > 0.6;
  for (var c = 0; c < 3; c++) {
    var x0 = cx - 6 + c * 5, y0 = cy - 8;
    line(g, x0, y0, x0 + Math.round(len * 0.55), y0 + len, fade ? ['#ff9aa0', '#ff9aa0', 'transparent'] : ['#ffffff', '#ffffff', '#ffe0e0']);
    if (!fade) line(g, x0 - 1, y0, x0 - 1 + Math.round(len * 0.55), y0 + len, ['#d0304a']);
  }
}
function fxGlyph(g, x, y, q, col) {
  var a = Math.sin(clamp(q, 0, 1) * Math.PI); if (a <= 0.05) return;
  var rx = 12 * Math.min(1, a * 1.6), ry = rx * 0.3, seen = {};
  g.globalAlpha = Math.min(1, a * 1.4);
  for (var i = 0; i < 90; i++) {
    var t = i / 90 * Math.PI * 2, X = Math.round(x + Math.cos(t) * rx), Y = Math.round(y + Math.sin(t) * ry), kk = X + ',' + Y;
    if (seen[kk]) continue; seen[kk] = 1; px(g, X, Y, ((i + Math.floor(q * 40)) % 9) < 2 ? '#ffffff' : col);
  }
  for (var j = 0; j < 8; j++) { var t2 = j / 8 * Math.PI * 2 + q * 4; px(g, x + Math.cos(t2) * rx * 0.62, y + Math.sin(t2) * ry * 0.62, '#ffffff'); }
  g.globalAlpha = a * 0.8;
  for (var k = 0; k < 6; k++) { var rr = (q * 2.5 + k / 6) % 1, X2 = x + Math.cos(k * 2.1) * rx * 0.8; rect(g, X2, y - rr * 20, 1, 2, rr < 0.4 ? '#ffffff' : col); }
  g.globalAlpha = 1;
}
var ELEM = {
  fire: function (g, x, y, q, seed) {
    var RAMPF = ['#5a2038', '#b02a2a', '#e8562a', '#ff9a30', '#ffd860', '#fff8d0'];
    if (q > 0.1 && q < 0.6) { g.globalAlpha = 0.35 * Math.sin((q - 0.1) / 0.5 * Math.PI); oval(g, x, y + 3, 12, 7, '#ff8a30'); g.globalAlpha = 1; }
    for (var i = 0; i < 16; i++) {
      var s1 = h1s(i, seed), s2 = h1s(i, seed + 1), life = q * 1.7 - s1 * 0.7; if (life <= 0 || life >= 1) continue;
      var X = x + (s2 - 0.5) * 16 * (1 - life * 0.4) + Math.sin(life * 7 + i) * 1.5, Y = y + 9 - life * 20 - s1 * 3;
      var r = Math.max(0.6, (1 - life) * 3.4), lvl = Math.max(0, Math.min(5, Math.round((1 - life) * 5.4 - 0.2)));
      disc(g, X, Y, r + 0.6, RAMPF[Math.max(0, lvl - 1)]); disc(g, X, Y - r * 0.9, r * 0.6, RAMPF[Math.max(0, lvl - 1)]);
      disc(g, X, Y + 0.4, r * 0.55, RAMPF[lvl]); if (lvl >= 4) px(g, X, Y + 1, '#ffffff');
    }
    for (var e = 0; e < 6; e++) { var l2 = (q * 1.4 + h1s(e, seed + 9)) % 1; px(g, x + (h1s(e, seed + 7) - 0.5) * 22, y - l2 * 26, l2 < 0.6 ? '#ffd860' : '#e8562a'); }
  },
  ice: function (g, x, y, q, seed) {
    for (var i = 0; i < 7; i++) {
      var a = i / 7 * Math.PI * 2 + 0.3, d = q < 0.5 ? (1 - q * 2) * 14 : 0, s = h1s(i, seed);
      var X = x + Math.cos(a) * (d + 4 + s * 4), Y = y + Math.sin(a) * (d + 3) * 0.8;
      if (q < 0.7) crystal(g, X, Y + 3, 5 + s * 4, 3, (Math.cos(a)) * 1.5, CRY.cyan);
      else for (var k = 0; k < 3; k++) px(g, X + Math.cos(a + k) * (q - 0.7) * 30, Y + Math.sin(a + k) * (q - 0.7) * 30 + (q - 0.7) * 20, k ? '#90e2ff' : '#ffffff');
    }
    if (q > 0.45 && q < 0.6) { g.globalAlpha = 0.6; oval(g, x, y, 10, 8, '#eaffff'); g.globalAlpha = 1; }
  },
  bolt: function (g, x, y, q, seed) {
    if (q < 0.15 || q > 0.6) return;
    for (var s = 0; s < 2; s++) {
      var X = x + (s ? 3 : -2), Y = 0, n = 0;
      while (Y < y + 6) { var nx = x + (h1s(n + s * 50 + Math.floor(q * 12) * 7, seed) - 0.5) * 12, ny = Y + 4 + h1s(n, seed + 3) * 4; line(g, X, Y, nx, ny, s ? ['#a8c8ff'] : ['#ffffff', '#fff6a0']); if (!s) line(g, X + 1, Y, nx + 1, ny, ['#8a7aff']); X = nx; Y = ny; n++; }
    }
    fxSpark(g, Math.round(x), Math.round(y + 4), (q - 0.15) / 0.45, true);
  },
  morph: function (g, x, y, q, seed) {
    for (var i = 0; i < 14; i++) { var s = h1s(i, seed), life = (q * 2 + s) % 1; px(g, x + (s - 0.5) * 16 + Math.sin(life * 8) * 2, y - life * 26, life < 0.5 ? '#ffd0f0' : '#e070c8'); }
  }
};
function fxDust(g, x, y, q, dir) {
  if (q < 0 || q > 1) return;
  for (var i = 0; i < 3; i++) {
    var r = 1 + q * 2.5, X = x + dir * (i * 3 + q * 6) - dir * 2, Y = y - 1 - q * 3 - i % 2;
    g.globalAlpha = (1 - q) * 0.9; disc(g, X, Y, r, i ? '#b8a8c0' : '#e0d4e4'); g.globalAlpha = 1;
  }
}
function fxCursor(g, x, y) {
  stamp(g, ['ooooooo', 'oWWWWWo', '.oWWWo.', '..oYo..', '...o...'], x - 3, y, { o: OUT, W: '#ffffff', Y: '#ffd040' });
}

function fxStatus(g, kind, x, y, w, R) {
  if (x && typeof x === 'object') { R = y; y = x.top; w = x.right - x.left; x = x.left; }
  if (kind === 'stop') { stamp(g, ['.ooo.', 'oWWWo', 'oWkWo', 'oWWko', '.ooo.'], x + w - 5, y - 2, { o: '#20304a', W: '#c8e8ff', k: '#20304a' }); return; }
  var up = kind === 'haste', c = up ? ['#fff07a', '#d89a20'] : ['#a8c0ff', '#4a5ab8'];
  for (var i = 0; i < 2; i++) {
    var ph = (R * (up ? 1.6 : 0.6) + i * 0.5) % 1, yy = Math.round(y + 8 - ph * 12), xx = x + (i ? w - 3 : 1);
    if (up) stamp(g, ['.a.', 'aba', 'b.b'], xx, yy, { a: c[0], b: c[1] }); else stamp(g, ['b.b', 'aba', '.a.'], xx, Math.round(y + ph * 10), { a: c[0], b: c[1] });
  }
}

/* ---------------- pixel font: original proportional 5x7 with descenders ---------------- */
// rows 0-6 cap height, 7-8 descenders; '#' = ink. Latin and digits only; CJK goes through a
// 1-bit threshold of the system font so every glyph sits on the same native pixel grid.
var PF_SRC = {
  A: '..#..|.#.#.|#...#|#...#|#####|#...#|#...#', B: '####.|#...#|#...#|####.|#...#|#...#|####.', C: '.###.|#...#|#....|#....|#....|#...#|.###.',
  D: '####.|#...#|#...#|#...#|#...#|#...#|####.', E: '#####|#....|#....|####.|#....|#....|#####', F: '#####|#....|#....|####.|#....|#....|#....',
  G: '.###.|#...#|#....|#.###|#...#|#...#|.####', H: '#...#|#...#|#...#|#####|#...#|#...#|#...#', I: '###|.#.|.#.|.#.|.#.|.#.|###',
  J: '..###|...#.|...#.|...#.|#..#.|#..#.|.##..', K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#', L: '#....|#....|#....|#....|#....|#....|#####',
  M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#', N: '#...#|##..#|#.#.#|#..##|#...#|#...#|#...#', O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
  P: '####.|#...#|#...#|####.|#....|#....|#....', Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#', R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  S: '.###.|#...#|#....|.###.|....#|#...#|.###.', T: '#####|..#..|..#..|..#..|..#..|..#..|..#..', U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.',
  V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..', W: '#...#|#...#|#...#|#.#.#|#.#.#|##.##|#...#', X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
  Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..', Z: '#####|....#|...#.|..#..|.#...|#....|#####',
  a: '....|....|.##.|...#|.###|#..#|.###', b: '#...|#...|###.|#..#|#..#|#..#|###.', c: '...|...|.##|#..|#..|#..|.##', d: '...#|...#|.###|#..#|#..#|#..#|.###',
  e: '....|....|.##.|#..#|####|#...|.###', f: '..#|.#.|###|.#.|.#.|.#.|.#.', g: '....|....|.###|#..#|#..#|#..#|.###|...#|.##.', h: '#...|#...|###.|#..#|#..#|#..#|#..#',
  i: '#|.|#|#|#|#|#', j: '..#|...|..#|..#|..#|..#|..#|..#|##.', k: '#...|#...|#..#|#.#.|##..|#.#.|#..#', l: '#.|#.|#.|#.|#.|#.|.#',
  m: '.....|.....|##.#.|#.#.#|#.#.#|#.#.#|#.#.#', n: '....|....|###.|#..#|#..#|#..#|#..#', o: '....|....|.##.|#..#|#..#|#..#|.##.', p: '....|....|###.|#..#|#..#|#..#|###.|#...|#...',
  q: '....|....|.###|#..#|#..#|#..#|.###|...#|...#', r: '...|...|#.#|##.|#..|#..|#..', s: '...|...|.##|#..|.#.|..#|##.', t: '.#.|.#.|###|.#.|.#.|.#.|..#',
  u: '....|....|#..#|#..#|#..#|#..#|.###', v: '....|....|#..#|#..#|#..#|.##.|.##.', w: '.....|.....|#...#|#...#|#.#.#|#.#.#|.#.#.',
  x: '....|....|#..#|#..#|.##.|#..#|#..#', y: '....|....|#..#|#..#|#..#|#..#|.###|...#|.##.', z: '....|....|####|...#|.##.|#...|####',
  0: '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.', 1: '..#..|.##..|..#..|..#..|..#..|..#..|.###.', 2: '.###.|#...#|....#|...#.|..#..|.#...|#####',
  3: '####.|....#|....#|.###.|....#|....#|####.', 4: '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.', 5: '#####|#....|####.|....#|....#|#...#|.###.',
  6: '..##.|.#...|#....|####.|#...#|#...#|.###.', 7: '#####|....#|...#.|..#..|.#...|.#...|.#...', 8: '.###.|#...#|#...#|.###.|#...#|#...#|.###.',
  9: '.###.|#...#|#...#|.####|....#|...#.|.##..',
  ' ': '..|..|..|..|..|..|..', '-': '...|...|...|###|...|...|...', '.': '.|.|.|.|.|.|#', ',': '.|.|.|.|.|.|#|#', ':': '.|.|#|.|.|#|.',
  '!': '#|#|#|#|#|.|#', '?': '.##.|#..#|...#|..#.|.#..|....|.#..', '/': '...#|...#|..#.|.##.|.#..|#...|#...', '+': '...|...|.#.|###|.#.|...|...',
  "'": '#|#|.|.|.|.|.', '(': '.#|#.|#.|#.|#.|#.|.#', ')': '#.|.#|.#|.#|.#|.#|#.', '%': '##..#|##.#.|...#.|..#..|.#...|.#.##|#..##', '—': '.....|.....|.....|#####|.....|.....|.....',
  '×': '.....|.....|#...#|.#.#.|..#..|.#.#.|#...#'
};
var PF = {};
Object.keys(PF_SRC).forEach(function (k) { var rows = PF_SRC[k].split('|'); PF[k] = { w: rows[0].length, rows: rows }; });
var CJK_CELL = 9, LAT_OY = 0;
function glyphOf(ch) { return PF[ch] || PF['?']; }
function textW(str) { var w = 0; for (var i = 0; i < str.length; i++) w += glyphOf(str[i]).w + 1; return Math.max(0, w - 1); }
var TXT = {}, TXTN = 0;
// cached text image: 1px drop shadow down-right, optional 2-tone fill (top rows lighter)
function textImg(str, col, sh, col2) {
  var key = str + '|' + col + '|' + sh + '|' + (col2 || '');
  if (TXT[key]) return TXT[key];
  if (++TXTN > 1500) { TXT = {}; TXTN = 0; }
  var w = textW(str) + 1, c = mkCanvas(Math.max(1, w), Math.max(CJK_CELL, LAT_OY + 9) + 1), g = c.getContext('2d');
  [1, 0].forEach(function (pass) {
    var x = 0;
    for (var i = 0; i < str.length; i++) {
      var gl = glyphOf(str[i]), oy = LAT_OY;
      for (var yy = 0; yy < gl.rows.length; yy++) for (var xx = 0; xx < gl.rows[yy].length; xx++) if (gl.rows[yy][xx] === '#') {
        if (pass) { if (sh) { g.fillStyle = sh; g.fillRect(x + xx + 1, oy + yy + 1, 1, 1); } }
        else { g.fillStyle = col2 && yy + oy >= LAT_OY + 4 ? col2 : col; g.fillRect(x + xx, oy + yy, 1, 1); }
      }
      x += gl.w + 1;
    }
  });
  return (TXT[key] = { c: c, w: w - 1 });
}
// text drawn with its cap top at y (CJK glyphs extend about 3px above and 3px below the Latin caps)
function drawText(g, str, x, y, col, sh, col2) { var t = textImg(str, col, sh == null ? '#0a0c30' : sh, col2); g.drawImage(t.c, Math.round(x), Math.round(y) - LAT_OY); return t.w; }

/* ---------------- windows and gauges ---------------- */
var WIN = {};
var WIN_GRAD = ['#4e62d6', '#3e50c4', '#3242ae', '#283696', '#1f2b7e', '#182268'];
function winImg(w, hh) {
  var key = w + 'x' + hh; if (WIN[key]) return WIN[key];
  var c = mkCanvas(w, hh), g = c.getContext('2d'), id = g.createImageData(w, hh), D = id.data;
  var top = 4, bot = hh - 4, rgb = WIN_GRAD.map(h2r), n = rgb.length - 1;
  for (var y = 0; y < hh; y++) {
    var f = clamp((y - top) / Math.max(1, bot - top), 0, 1) * n, i0 = Math.min(n, Math.floor(f)), t = clamp((f - i0 - 0.5) * 2, 0, 1);
    for (var x = 0; x < w; x++) { var cc = rgb[Math.min(n, i0 + (t > bay(x, y) ? 1 : 0))], j = (y * w + x) * 4; D[j] = cc[0]; D[j + 1] = cc[1]; D[j + 2] = cc[2]; D[j + 3] = 255; }
  }
  g.putImageData(id, 0, 0);
  // 1px dark outer border, 2px light bevel (bright top-left, cooler bottom-right), 1px inner shade
  rect(g, 0, 0, w, 1, '#0a0c24'); rect(g, 0, hh - 1, w, 1, '#0a0c24'); rect(g, 0, 0, 1, hh, '#0a0c24'); rect(g, w - 1, 0, 1, hh, '#0a0c24');
  rect(g, 1, 1, w - 2, 1, '#f4f6ff'); rect(g, 1, 1, 1, hh - 2, '#f4f6ff'); rect(g, 1, hh - 2, w - 2, 1, '#aeb6e2'); rect(g, w - 2, 1, 1, hh - 2, '#aeb6e2');
  rect(g, 2, 2, w - 4, 1, '#c8ceff'); rect(g, 2, 2, 1, hh - 4, '#c8ceff'); rect(g, 2, hh - 3, w - 4, 1, '#7a84c8'); rect(g, w - 3, 2, 1, hh - 4, '#7a84c8');
  rect(g, 3, 3, w - 6, 1, '#141a5a'); rect(g, 3, 3, 1, hh - 6, '#141a5a');
  g.clearRect(0, 0, 1, 1); g.clearRect(w - 1, 0, 1, 1); g.clearRect(0, hh - 1, 1, 1); g.clearRect(w - 1, hh - 1, 1, 1);
  px(g, 1, 1, '#0a0c24'); px(g, w - 2, 1, '#0a0c24'); px(g, 1, hh - 2, '#0a0c24'); px(g, w - 2, hh - 2, '#0a0c24');
  return (WIN[key] = c);
}
function drawWin(g, x, y, w, hh) { g.drawImage(winImg(w, hh), Math.round(x), Math.round(y)); }
var GAUGE_COL = {
  hero: ['#fff8c8', '#f6c840', '#c08a18', '#7a5410'], mon: ['#ffd8d0', '#f05a50', '#b42a3a', '#6a1424'],
  hp: ['#d8ffe0', '#58e08a', '#2a9a5a', '#145a34'], hpLow: ['#fff0c0', '#ffc040', '#c07818', '#6a3e10'],
  flashW: ['#ffffff', '#ffffff', '#e8ecff', '#a8b4f0'], flashY: ['#fffbe0', '#ffe868', '#ffc030', '#b07818'],
  wait: ['#e0fbff', '#6ad8f0', '#2a8ab8', '#144a6a'], haste: ['#f0ffd0', '#a8f060', '#5aa82a', '#2a5a14'], slow: ['#f0e0ff', '#b08af0', '#6a4ab8', '#34206a']
};
// pixel gauge: 1px outline, inner 1px highlight / mid / 1px shadow rows, bright end cap
function drawGauge(g, x, y, w, hh, fr, kind) {
  x = Math.round(x); y = Math.round(y);
  rect(g, x + 1, y, w - 2, 1, '#0a0c24'); rect(g, x + 1, y + hh - 1, w - 2, 1, '#0a0c24'); rect(g, x, y + 1, 1, hh - 2, '#0a0c24'); rect(g, x + w - 1, y + 1, 1, hh - 2, '#0a0c24');
  var iw = w - 2, ih = hh - 2;
  rect(g, x + 1, y + 1, iw, ih, '#1a1c3e'); rect(g, x + 1, y + 1, iw, 1, '#0e1030');
  if (kind === 'off') { for (var k = 0; k < iw; k += 3) px(g, x + 1 + k, y + 1 + (ih >> 1), '#3a3e66'); return; }
  var fw = Math.round(clamp(fr, 0, 1) * iw); if (fw <= 0) return;
  var C = GAUGE_COL[kind] || GAUGE_COL.hero;
  rect(g, x + 1, y + 1, fw, ih, C[1]); rect(g, x + 1, y + 1, fw, 1, C[0]);
  if (ih > 2) rect(g, x + 1, y + hh - 2, fw, 1, C[2]);
  if (ih > 3) rect(g, x + 1, y + hh - 3, fw, 1, mixh(C[1], C[2], 0.5));
  if (fw < iw) rect(g, x + fw, y + 1, 1, ih, C[3]); else rect(g, x + iw, y + 1, 1, ih, C[0]);
}
// pointing glove cursor (original), tip at (x, y); dir = right (default) | left | down
var HAND_ROWS = ['.oooo.....', 'oWWWWoooo.', 'oWWWWWWWWo', 'oWWWWooooo', 'oWWWWo....', 'osWWso....', '.oooo.....'];
var HAND_PAL = { o: '#141020', W: '#ffffff', s: '#b8c0dc' };
function drawHand(g, x, y, dir) {
  x = Math.round(x); y = Math.round(y);
  if (dir === 'left') { stamp(g, HAND_ROWS.map(function (r) { return r.split('').reverse().join(''); }), x, y - 3, HAND_PAL); return; }
  if (dir === 'down') {
    var T = []; for (var c = 0; c < 10; c++) { var r = ''; for (var k = 0; k < 7; k++) r += HAND_ROWS[k][c]; T.push(r); }
    stamp(g, T, x - 3, y - 9, HAND_PAL); return;
  }
  stamp(g, HAND_ROWS, x - 10, y - 3, HAND_PAL);
  stamp(g, ['.', 'b', '.', 'b'], x - 5, y - 2, { b: '#c8cee8' });
}

function drawTargetHand(g, box, W) {
  W = W || 256;
  var cy = Math.round(box.cy), L = Math.round(box.left), R = Math.round(box.right == null ? box.left + 20 : box.right), T = Math.round(box.top);
  if (L - 12 >= 2) drawHand(g, L - 2, cy, 'right');
  else if (T - 12 >= 2) drawHand(g, clamp(Math.round((L + R) / 2), 4, W - 5), T - 2, 'down');
  else drawHand(g, Math.min(W - 12, R + 2), cy, 'left');
}

function bannerBox(W, txt) { var w = textW(txt) + 18; return { x: Math.round((W - w) / 2), y: 4, w: w, h: 22 }; }
function drawBanner(g, W, txt) {
  var tw = textW(txt), w = tw + 18, hh = 22, x = Math.round((W - w) / 2);
  drawWin(g, x, 4, w, hh); drawText(g, txt, x + 9, 12, '#ffffff', '#0a0c30');
}


var TEXT_ROW = 12;

/* ---------------- motion preference ---------------- */
var motion = (function () {
  var r = false;
  try { r = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { }
  try { var q = new URLSearchParams(location.search).get('reduced'); if (q != null) r = q !== '0'; } catch (e) { }
  return { reduced: r };
})();

/* ---------------- screen: native buffer, integer nearest-neighbour blit, letterbox ---------------- */
function createScreen(canvas, opt) {
  opt = opt || {};
  var w = opt.w || 256, hh = opt.h || 224, bg = opt.bg || '#000';
  var buf = mkCanvas(w, hh), g = buf.getContext('2d'), out = canvas.getContext('2d'), last = {};
  g.imageSmoothingEnabled = false;

  function avail() {
    var el = opt.fitTo;
    if (el) return [el.clientWidth || w, el.clientHeight || hh];
    return [window.innerWidth || document.documentElement.clientWidth || w, window.innerHeight || document.documentElement.clientHeight || hh];
  }
  var scr = {
    w: w, h: hh, buf: buf, g: g, canvas: canvas, scale: 1, ox: 0, oy: 0,
    fit: function () {
      var dpr = window.devicePixelRatio || 1, A = avail();
      // whole native pixels only: one integer scale for the whole frame, never a fractional one
      var s = Math.max(1, Math.floor(Math.min(A[0] * dpr / w, A[1] * dpr / hh)));
      var bw = w * s, bh = hh * s;
      if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }

      var cw = bw / dpr, ch = bh / dpr, st = canvas.style;
      st.display = 'block'; st.width = cw + 'px'; st.height = ch + 'px'; st.imageRendering = 'pixelated';
      st.marginLeft = Math.max(0, Math.floor((A[0] - cw) / 2)) + 'px'; st.marginTop = Math.max(0, Math.floor((A[1] - ch) / 2)) + 'px';
      scr.scale = s; scr.ox = 0; scr.oy = 0;
    },
    present: function (o) {
      o = o || {}; last = o; scr.fit();
      var s = scr.scale, sx = Math.round(o.shakeX || 0), sy = Math.round(o.shakeY || 0), split = o.splitY == null ? hh : o.splitY;
      out.setTransform(1, 0, 0, 1, 0, 0); out.imageSmoothingEnabled = false;
      out.fillStyle = bg; out.fillRect(0, 0, canvas.width, canvas.height);
      out.save(); out.beginPath(); out.rect(scr.ox, scr.oy, w * s, split * s); out.clip();
      out.fillStyle = '#000'; out.fillRect(scr.ox, scr.oy, w * s, split * s);
      out.drawImage(buf, 0, 0, w, split, scr.ox + sx * s, scr.oy + sy * s, w * s, split * s);
      out.restore();
      if (split < hh) out.drawImage(buf, 0, split, w, hh - split, scr.ox, scr.oy + split * s, w * s, (hh - split) * s);
    },

    refresh: function () { scr.present(last); },

    toNative: function (cx, cy) { var r = canvas.getBoundingClientRect(); return { x: (cx - r.left) / (r.width || 1) * w, y: (cy - r.top) / (r.height || 1) * hh }; }
  };
  try {
    addEventListener('resize', scr.refresh);
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(scr.refresh).observe(opt.fitTo || document.documentElement);
  } catch (e) { }
  return scr;
}

/* ---------------- sprites: string maps and variants ---------------- */
// rows: array of equal-length strings, one char per pixel, '.' transparent; pal: {char: '#hex'}
function spriteFromMap(rows, pal, o) {
  o = o || {};
  var w = 0; rows.forEach(function (r) { w = Math.max(w, r.length); });
  var c = mkCanvas(w, rows.length); paintRows(c.getContext('2d'), rows, pal, 0, 0);
  var ax = o.ax == null ? w >> 1 : o.ax, ay = o.ay == null ? rows.length - 1 : o.ay;
  if (o.outline === false) return withVariants(c, ax, ay);
  return finishSprite(c, ax, ay);
}
// white (hit flash) and frozen (stopped, blue-grey) versions of an already finished canvas
function withVariants(c, ax, ay) {
  var w = c.width, hh = c.height, d = c.getContext('2d').getImageData(0, 0, w, hh).data;
  var wc = mkCanvas(w, hh), wx = wc.getContext('2d'), wd = wx.createImageData(w, hh);
  var fz = mkCanvas(w, hh), fx = fz.getContext('2d'), fd = fx.createImageData(w, hh), top = -1;
  for (var q = 0; q < d.length; q += 4) if (d[q + 3]) {
    if (top < 0) top = (q / 4 / w) | 0;
    wd.data[q] = wd.data[q + 1] = wd.data[q + 2] = 255; wd.data[q + 3] = d[q + 3];
    var lum = (d[q] * 0.3 + d[q + 1] * 0.55 + d[q + 2] * 0.15) / 255;
    fd.data[q] = 40 + lum * 150; fd.data[q + 1] = 70 + lum * 160; fd.data[q + 2] = 120 + lum * 135; fd.data[q + 3] = d[q + 3];
  }
  wx.putImageData(wd, 0, 0); fx.putImageData(fd, 0, 0);
  return { c: c, white: wc, frozen: fz, w: w, h: hh, ax: ax, ay: ay, top: Math.max(0, top) };
}
function flipSprite(spr) {
  function fl(src) { var c = mkCanvas(src.width, src.height), g = c.getContext('2d'); g.translate(src.width, 0); g.scale(-1, 1); g.drawImage(src, 0, 0); return c; }
  return { c: fl(spr.c), white: fl(spr.white), frozen: fl(spr.frozen), w: spr.w, h: spr.h, ax: spr.w - 1 - spr.ax, ay: spr.ay, top: spr.top };
}
function mapPixels(src, fn) {
  var c = mkCanvas(src.width, src.height), g = c.getContext('2d'); g.drawImage(src, 0, 0);
  var id = g.getImageData(0, 0, c.width, c.height), d = id.data;
  for (var i = 0; i < d.length; i += 4) if (d[i + 3]) fn(d, i);
  g.putImageData(id, 0, 0); return c;
}
// palette swap: exact colours only (the art is palette-indexed, so a swap is a lookup, not a hue shift)
function recolorSprite(spr, map) {
  var M = {}; Object.keys(map).forEach(function (k) { M[k.toLowerCase()] = h2r(map[k]); });
  var c = mapPixels(spr.c, function (d, i) { var k = r2h([d[i], d[i + 1], d[i + 2]]); var t = M[k]; if (t) { d[i] = t[0]; d[i + 1] = t[1]; d[i + 2] = t[2]; } });
  return withVariants(c, spr.ax, spr.ay);
}

function remapRamps(spr, pairs, o) {
  o = o || {};
  var tol = o.tol || 14, cand = [];
  pairs.forEach(function (pr) {
    var A = (typeof pr[0] === 'string' ? ramp(pr[0]) : pr[0]).map(h2r), Bn = (typeof pr[1] === 'string' ? ramp(pr[1]) : pr[1]).map(h2r);
    for (var i = 0; i < A.length; i++) {
      cand.push([A[i], Bn[i]]);
      if (i + 1 < A.length) cand.push([mixc(A[i], A[i + 1], 0.5), mixc(Bn[i], Bn[i + 1], 0.5)]);
    }
  });
  function near(c, t) { var best = null, bd = t * t; cand.forEach(function (k) { var dx = c[0] - k[0][0], dy = c[1] - k[0][1], dz = c[2] - k[0][2], dd = dx * dx + dy * dy + dz * dz; if (dd < bd) { bd = dd; best = k[1]; } }); return best; }
  var blends = [[DK, 0.45], [DK, 0.74], [DK, 0.9]];
  if (o.rim) { var rc = h2r(o.rim); blends.push([rc, 0.55], [rc, 0.22]); }
  var c = mapPixels(spr.c, function (d, i) {
    var p = [d[i], d[i + 1], d[i + 2]], t = near(p, tol), out = t;
    if (!t) for (var b = 0; b < blends.length && !out; b++) {
      var K = blends[b][0], f = blends[b][1], u = [(p[0] - K[0] * f) / (1 - f), (p[1] - K[1] * f) / (1 - f), (p[2] - K[2] * f) / (1 - f)];
      var n = near(u, tol / (1 - f) * 0.6); if (n) out = mixc(n, K, f);
    }
    if (out) { d[i] = cl8(out[0]); d[i + 1] = cl8(out[1]); d[i + 2] = cl8(out[2]); }
  });
  return withVariants(c, spr.ax, spr.ay);
}
function tintSprite(spr, hex, f) {
  var t = h2r(hex);
  var c = mapPixels(spr.c, function (d, i) { for (var q = 0; q < 3; q++) d[i + q] = d[i + q] * (1 - f) + t[q] * f; });
  return withVariants(c, spr.ax, spr.ay);
}
function drawSprite(g, spr, x, y, o) {
  o = o || {};
  var img = o.white ? spr.white : o.frozen ? spr.frozen : spr.c;
  if (o.alpha != null) g.globalAlpha = o.alpha;
  g.drawImage(img, Math.round(x - spr.ax), Math.round(y - spr.ay));
  g.globalAlpha = 1;
}

/* ---------------- pop-up numbers and words ---------------- */

var POP_MS = 1100;
function popY(ageMs) {
  var q = ageMs / POP_MS;
  return q < 0.2 ? Math.round(Math.sin(q / 0.2 * Math.PI) * 8) : q < 0.3 ? Math.round(Math.sin((q - 0.2) / 0.1 * Math.PI) * 3) : q < 0.37 ? Math.round(Math.sin((q - 0.3) / 0.07 * Math.PI) * 1) : 0;
}
function popVisible(g, ageMs) {
  var q = ageMs / POP_MS;
  if (q < 0 || q >= 1) return false;
  if (motion.reduced) { g.globalAlpha = q < 0.15 ? q / 0.15 : q > 0.85 ? (1 - q) / 0.15 : 1; return true; }
  return !(q > 0.84 && Math.floor(ageMs / 33) % 2);
}
function drawPopNumber(g, str, cx, y, ageMs, o) {
  o = o || {};
  if (!popVisible(g, ageMs)) return;
  var x = Math.round(cx - numWidth(str) / 2), yy = Math.round(y - (motion.reduced ? 0 : popY(ageMs)));
  drawNum(g, str, x, yy, o.col || '#f4f6ff', o.col2 || '#a8bcf0');
  g.globalAlpha = 1;
}
function drawPopText(g, str, cx, y, ageMs, col) {
  if (!popVisible(g, ageMs)) return;
  var yy = Math.round(y - (motion.reduced ? 0 : popY(ageMs)));
  drawText(g, str, Math.round(cx - textW(str) / 2), yy, col || '#ffffff', OUT);
  g.globalAlpha = 1;
}

/* ---------------- extra element: heal ---------------- */
ELEM.heal = function (g, x, y, q, seed) {
  var C = ['#1a6a4a', '#3ac070', '#9cffb8', '#ffffff'];
  if (q > 0.1 && q < 0.7) { g.globalAlpha = 0.28 * Math.sin((q - 0.1) / 0.6 * Math.PI); oval(g, x, y + 4, 11, 4, '#9cffb8'); g.globalAlpha = 1; }
  for (var i = 0; i < 12; i++) {
    var s1 = h1s(i, seed), life = q * 1.5 - s1 * 0.5; if (life <= 0 || life >= 1) continue;
    var X = Math.round(x + (h1s(i, seed + 2) - 0.5) * 20), Y = Math.round(y + 8 - life * 26), k = life < 0.3 ? 3 : life < 0.6 ? 2 : 1;
    if (i % 3 === 0) { px(g, X, Y, C[k]); px(g, X - 1, Y, C[k - 1]); px(g, X + 1, Y, C[k - 1]); px(g, X, Y - 1, C[k - 1]); px(g, X, Y + 1, C[k - 1]); }
    else { px(g, X, Y, C[k]); px(g, X, Y + 1, C[Math.max(0, k - 2)]); }
  }
};

/* ---------------- particles ---------------- */
// simple per-frame particles on the native grid; one call to step() per 60Hz virtual frame
var PK = {
  spark: { life: [10, 18], v: [1.2, 2.6], grav: 0.12, drag: 0.94, cols: ['#ffffff', '#fff2a8', '#ffc054', '#e8703a'] },
  dust: { life: [16, 28], v: [0.2, 0.6], grav: -0.02, drag: 0.9, cols: ['#e0d4e4', '#b8a8c0', '#8a7a96'], r: 2 },
  ember: { life: [30, 60], v: [0.1, 0.4], grav: -0.03, drag: 0.98, cols: ['#fff0a0', '#ff9a30', '#e8562a', '#8a2a2a'] },
  heal: { life: [24, 40], v: [0.1, 0.3], grav: -0.05, drag: 0.97, cols: ['#ffffff', '#9cffb8', '#3ac070'] },
  shard: { life: [14, 24], v: [1.0, 2.2], grav: 0.16, drag: 0.95, cols: ['#ffffff', '#90e2ff', '#46a6e6', '#2a68b0'] }
};
function createParticles(seed) {
  var R = rng(seed || 7), list = [];
  return {
    list: list,
    emit: function (kind, x, y, n, o) {
      o = o || {}; var K = PK[kind] || PK.spark;
      for (var i = 0; i < (n || 6); i++) {
        var a = o.angle != null ? o.angle + (R() - 0.5) * (o.spread == null ? 1.2 : o.spread) : R() * Math.PI * 2;
        var sp = K.v[0] + R() * (K.v[1] - K.v[0]), life = Math.round(K.life[0] + R() * (K.life[1] - K.life[0]));
        list.push({ k: kind, K: K, x: x + (R() - 0.5) * (o.jitter || 2), y: y + (R() - 0.5) * (o.jitter || 2), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.8, life: life, max: life });
      }
    },
    step: function () {
      for (var i = list.length - 1; i >= 0; i--) {
        var p = list[i]; p.x += p.vx; p.y += p.vy; p.vx *= p.K.drag; p.vy = p.vy * p.K.drag + p.K.grav;
        if (--p.life <= 0) list.splice(i, 1);
      }
    },
    draw: function (g) {
      list.forEach(function (p) {
        var f = 1 - p.life / p.max, C = p.K.cols, c = C[Math.min(C.length - 1, Math.floor(f * C.length))];
        if (p.K.r) { g.globalAlpha = 0.8 * (1 - f); disc(g, p.x, p.y, Math.max(0.5, p.K.r * (0.6 + f)), c); g.globalAlpha = 1; return; }
        px(g, p.x, p.y, c);
        if (f < 0.4) px(g, p.x - p.vx, p.y - p.vy, C[Math.min(C.length - 1, 1 + Math.floor(f * C.length))]);
      });
    },
    clear: function () { list.length = 0; }
  };
}

/* ---------------- screen shake and flash ---------------- */

function createJuice() {
  var S = { f0: -99, n: 0, amp: 0 }, F = { f0: -99, n: 0, a: 0 };
  return {
    shake: function (f, frames, amp) { if (motion.reduced) return; if (f >= S.f0 + S.n || amp >= S.amp) { S.f0 = f; S.n = frames; S.amp = amp; } },
    flash: function (f, frames, alpha) { if (motion.reduced) return; if (f >= F.f0 + F.n || alpha >= F.a) { F.f0 = f; F.n = frames; F.a = alpha; } },
    sample: function (f) {
      var o = { sx: 0, sy: 0, flash: 0 };
      if (f >= S.f0 && f < S.f0 + S.n) { var k = Math.floor((f - S.f0) / 2) % 2 ? -1 : 1, d = 1 - (f - S.f0) / S.n; o.sx = Math.round(k * S.amp * (d > 0.5 ? 1 : 0.5)); o.sy = S.amp > 1 ? -o.sx >> 1 : 0; }
      if (f >= F.f0 && f < F.f0 + F.n) o.flash = F.a * (1 - (f - F.f0) / F.n);
      return o;
    }
  };
}
function drawFlash(g, W, H, a, col) { if (a <= 0) return; g.globalAlpha = a; g.fillStyle = col || '#ffffff'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }

/* ---------------- defeat: flash, then dissolve row by row from the top ---------------- */
// x, y = anchor; q 0..1
function drawDissolve(g, spr, x, y, q) {
  var dx = Math.round(x - spr.ax), dy = Math.round(y - spr.ay);
  if (q >= 1) return;
  if (motion.reduced) { g.globalAlpha = 1 - q; g.drawImage(spr.c, dx, dy); g.globalAlpha = 1; return; }
  if (q < 0.15) { g.drawImage(spr.c, dx, dy); g.globalAlpha = 0.6; g.drawImage(spr.white, dx, dy); g.globalAlpha = 1; return; }
  var top = spr.top || 0, cut = top + Math.round((q - 0.15) / 0.85 * (spr.h - top + 4));
  for (var ry = Math.max(0, cut - 4); ry < spr.h; ry++) {
    if (ry < cut) { g.globalAlpha = 0.55; g.drawImage(spr.white, 0, ry, spr.w, 1, dx + ((ry & 1) ? 2 : -2), dy + ry, spr.w, 1); g.globalAlpha = 1; }
    else g.drawImage(spr.c, 0, ry, spr.w, 1, dx, dy + ry, spr.w, 1);
  }
}

/* ---------------- backdrops ---------------- */
var CACHE = {};
// static layers are painted once; only the ambient pass runs every frame
function cached(key, build) { return CACHE[key] || (CACHE[key] = build()); }
// layers: [{img, f (0 = fixed .. 1 = moves with camera), y}], wraps horizontally
function drawParallax(g, layers, camX) {
  layers.forEach(function (L) {
    var w = L.img.width, off = Math.round(-(camX || 0) * (L.f == null ? 1 : L.f)) % w; if (off > 0) off -= w;
    for (var x = off; x < g.canvas.width; x += w) g.drawImage(L.img, x, L.y || 0);
  });
}

//   spec = {

//   }

function buildScene(W, H, spec) {
  spec = spec || {};
  var key = 'build|' + W + 'x' + H + '|' + JSON.stringify(spec);
  return cached(key, function () {
    var R = rng(spec.seed || 7), hz = Math.round(H * (spec.horizon == null ? 0.42 : spec.horizon));
    var sky = layer(W, H), land = layer(W, H), fg = layer(W, H);
    var id = sky.g.createImageData(W, H); gradRows(id.data, W, 0, hz + 2, spec.sky || ['#1a1838', '#3a3068', '#7a5a8a', '#d89a7a']); sky.g.putImageData(id, 0, 0);
    function ridge(L, o, base, seed) {
      if (!o) return;
      var cols = o.cols || ['#4a4a6a', '#5a5a7a'], amp = (o.amp == null ? 0.14 : o.amp) * H, y0 = base + Math.round((o.y || 0) * H), kind = o.kind || 'hills';
      for (var x = 0; x < W; x++) {
        var hgt;
        if (kind === 'spires') hgt = amp * (0.35 + 0.65 * Math.pow(vns(x / 9, seed), 3)) + (h1s(x >> 2, seed) > 0.9 ? amp * 0.4 : 0);
        else if (kind === 'skyline') hgt = amp * (0.3 + 0.7 * h1s(Math.floor(x / (6 + (h1s(x >> 4, seed) * 10 | 0))), seed + 3));
        else if (kind === 'waves') hgt = amp * (0.2 + 0.12 * Math.sin(x / 5 + seed) + 0.1 * vns(x / 13, seed));
        else hgt = amp * (0.35 + 0.65 * vns(x / 23, seed) * 0.7 + 0.3 * vns(x / 7, seed + 1) * 0.3);
        var top = Math.round(y0 - hgt);
        for (var y = top; y <= y0; y++) {
          var f = clamp((y - top) / Math.max(1, y0 - top), 0, 1), c = cols[Math.min(cols.length - 1, Math.floor(f * cols.length + (bay(x, y) - 0.5) * 0.9))];
          px(L, x, y, c || cols[0]);
        }
        if (kind === 'skyline' && h2s(x, top, seed) > 0.93 && top + 3 < y0) px(L, x, top + 3, mixh(cols[0], '#ffe0a0', 0.6));
        px(L, x, top, mixh(cols[0], (spec.sky || ['#fff'])[ (spec.sky || ['#fff']).length - 1 ], 0.35));
      }
    }
    ridge(sky.g, spec.far, hz, 11);
    // floor
    var F = spec.floor || {}, fc = F.cols || ['#5a4a5a', '#2a2030'], kind = F.kind || 'brick', cl = F.clean || [0, 0], fe = Math.max(1e-6, F.feather == null ? 16 : F.feather);
    var fd = land.g.createImageData(W, H), D = fd.data, A = h2r(fc[0]), Bc = h2r(fc[fc.length - 1]);
    for (var y = hz; y < H; y++) {
      var q = (y - hz) / Math.max(1, H - hz), depth = 1 / (0.15 + q), row = Math.floor(depth * 6);
      for (var x = 0; x < W; x++) {
        var u = (x - W / 2) * (0.25 + q) / 8, base = mixc(A, Bc, clamp(q * 0.9 + (bay(x, y) - 0.5) * 0.12, 0, 1)), m = 0;
        if (kind === 'brick') { var bx = Math.floor(u + (row % 2) * 0.5); if (Math.abs(depth * 6 - row) < 0.06 * (1 + q * 3) || Math.abs(u + (row % 2) * 0.5 - bx) < 0.04 * (1 + q)) m = -0.32; else m = (h1s(bx * 31 + row, 5) - 0.5) * 0.12; }
        else if (kind === 'plank') { var pr = Math.floor(depth * 4); if (Math.abs(depth * 4 - Math.round(depth * 4)) < 0.07 * (1 + q * 2)) m = -0.45; else if (Math.abs(((u * 0.5 + h1s(pr, 2) * 7) % 3 + 3) % 3) < 0.05 * (1 + q)) m = -0.38; else m = (h2s(Math.floor(u * 3), pr, 3) - 0.5) * 0.14 - (h2s(x, y, 4) > 0.97 ? 0.2 : 0); }
        else if (kind === 'water') { m = Math.sin(u * 3 + depth * 2) * 0.08 + (h2s(x >> 1, y, 6) > 0.96 ? 0.25 : 0); }
        else { m = (h2s(x >> (q > 0.5 ? 1 : 0), y >> (q > 0.5 ? 1 : 0), 8) - 0.5) * 0.35; }
        var cd = Math.min(x - cl[0] * W, cl[1] * W - x);
        if (cd > 0) m *= 1 - 0.55 * clamp(cd / fe + (bay(x, y) - 0.5) * 0.3, 0, 1);
        var k = (y * W + x) * 4, sc = 1 + m; D[k] = cl8(base[0] * sc); D[k + 1] = cl8(base[1] * sc); D[k + 2] = cl8(base[2] * sc); D[k + 3] = 255;
      }
    }
    land.g.putImageData(fd, 0, 0);
    if (spec.mid) { var mid = layer(W, H); ridge(mid.g, spec.mid, hz + 1, 23); var lc = mkCanvas(W, H), lg = lc.getContext('2d'); lg.drawImage(land.c, 0, 0); lg.drawImage(mid.c, 0, 0); land = { c: lc, g: lg }; }
    // foreground vignette: darkest layer in the corners (Bayer, no smooth alpha)
    var vg = spec.vignette == null ? 0.5 : spec.vignette, vd = fg.g.createImageData(W, H), V = vd.data, vc = h2r(spec.vignetteCol || '#06040c');
    for (var y2 = 0; y2 < H; y2++) for (var x2 = 0; x2 < W; x2++) {
      var dx = (x2 / W - 0.5) * 2, dy = (y2 / H - 0.55) * 2, e = (dx * dx * 0.8 + dy * dy * 0.6 - 0.62) * vg * 1.6;
      if (e > bay(x2, y2) * 0.9) { var k2 = (y2 * W + x2) * 4; V[k2] = vc[0]; V[k2 + 1] = vc[1]; V[k2 + 2] = vc[2]; V[k2 + 3] = 255; }
    }
    fg.g.putImageData(vd, 0, 0);
    var amb = (spec.ambient || []).map(function (a, n) {
      var ar = a.area || [0, 0, 1, hz / H], pts = [];
      for (var i = 0; i < (a.n || 8); i++) pts.push({ x: (ar[0] + R() * (ar[2] - ar[0])) * W, y: (ar[1] + R() * (ar[3] - ar[1])) * H, p: R(), s: 0.5 + R() });
      return { kind: a.kind || 'mote', col: a.col || '#c8d8ff', speed: a.speed == null ? 1 : a.speed, front: !!a.front, pts: pts, area: ar };
    });
    return { name: 'custom', sky: sky.c, land: land.c, fg: fg.c, hz: hz, amb: amb, W: W, H: H };
  });
}
function ambientCustom(g, S, R, front) {
  S.amb.forEach(function (a) {
    if (a.front !== front) return;
    var t = R * a.speed;
    a.pts.forEach(function (p) {
      var x, y, on = true, c = a.col;
      if (a.kind === 'twinkle') { x = p.x; y = p.y; on = ((t * 0.7 * p.s + p.p) % 1) < 0.25; }
      else if (a.kind === 'flicker') { x = p.x; y = p.y; c = vns(t * 4 * p.s + p.p * 9, 3) > 0.5 ? a.col : mixh(a.col, '#000000', 0.45); }
      else if (a.kind === 'smoke') { var q = (t * 0.06 * p.s + p.p) % 1; x = p.x + Math.sin(q * 6 + p.p * 9) * 3; y = p.y - q * S.H * 0.25; g.globalAlpha = (1 - q) * 0.35; disc(g, x, y, 1 + q * 3, c); g.globalAlpha = 1; return; }
      else if (a.kind === 'shimmer') { x = p.x + Math.round(Math.sin(t * 1.3 * p.s + p.p * 7) * 2); y = p.y; if (((t * 0.9 + p.p) % 1) > 0.5) return; g.fillStyle = c; g.fillRect(Math.round(x) - 1, Math.round(y), 3, 1); return; }
      else { var q2 = (t * 0.04 * p.s + p.p) % 1, ar = a.area; x = p.x + Math.sin(t * 0.5 * p.s + p.p * 6) * 4; y = (ar[3] - q2 * (ar[3] - ar[1])) * S.H; }
      if (on) px(g, x, y, c);
    });
  });
}

function ambientChange(S, tSec, span) {
  var W = S.sky.width, H = S.sky.height, base = mkCanvas(W, H), bg = base.getContext('2d');
  bg.drawImage(S.sky, 0, 0); bg.drawImage(S.land, 0, 0); bg.drawImage(S.fg, 0, 0);
  var B0 = bg.getImageData(0, 0, W, H).data, N = W * H, touched = new Uint8Array(N), bright = new Uint8Array(N), perFrame = 0;
  var red = motion.reduced; motion.reduced = false;
  function frame(t) { var c = mkCanvas(W, H), g = c.getContext('2d'); drawSceneBack(g, S, t); drawSceneFront(g, S, t); return g.getImageData(0, 0, W, H).data; }
  function diff(A, B, i) { return Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) > 24; }
  var t0 = tSec || 0, sp = span == null ? 4 : span;
  for (var t = t0; t <= t0 + sp + 1e-9; t += 0.25) {
    var A = frame(t), A2 = frame(t + 1 / 60), n = 0;
    for (var i = 0, j = 0; j < N; i += 4, j++) {
      if (diff(A, B0, i)) { touched[j] = 1; if ((A[i] * 0.3 + A[i + 1] * 0.55 + A[i + 2] * 0.15) / 255 > 0.8) bright[j] = 1; }
      if (diff(A, A2, i)) n++;
    }
    perFrame = Math.max(perFrame, n / N);
  }
  motion.reduced = red;
  var ft = 0, br = 0; for (var k = 0; k < N; k++) { ft += touched[k]; br += bright[k]; }
  return { footprint: ft / N, perFrame: perFrame, bright: br / N };
}
function drawSceneBack(g, S, tSec) {
  var R = motion.reduced ? 0 : tSec;
  g.drawImage(S.sky, 0, 0);
    g.drawImage(S.land, 0, 0);
  ambientCustom(g, S, R, false);
}
function drawSceneFront(g, S, tSec) {
  var R = motion.reduced ? 0 : tSec;
  ambientCustom(g, S, R, true);
  g.drawImage(S.fg, 0, 0);
}

return {hash: hash, clamp: clamp, mkCanvas: mkCanvas, OUT: OUT, SPR: SPR, h2r: h2r, cl8: cl8, r2h: r2h, mixc: mixc, mixh: mixh, toHsl: toHsl, fromHsl: fromHsl, RAMPC: RAMPC, ramp: ramp, shade: shade, BAYER4: BAYER4, bay: bay, h1s: h1s, h2s: h2s, vns: vns, h1: h1, h2: h2, vn: vn, rng: rng, px: px, rect: rect, line: line, disc: disc, oval: oval, DK: DK, finishSprite: finishSprite, HAIRR: HAIRR, SKIN: SKIN, heroMats: heroMats, heroJoints: heroJoints, heroBuild: heroBuild, heroPolish: heroPolish, heroKO: heroKO, heroSprite: heroSprite, LIGHT: LIGHT, Prims: Prims, inPoly: inPoly, renderVolume: renderVolume, paintRows: paintRows, stamp: stamp, MAT: MAT, mats: mats, MON: MON, rimLight: rimLight, monSprite: monSprite, BIG: BIG, GLY: GLY, numWidth: numWidth, drawNum: drawNum, drawSmall: drawSmall, gradRows: gradRows, crystal: crystal, CRY: CRY, layer: layer, fxSlash: fxSlash, fxCrescent: fxCrescent, fxBurst: fxBurst, fxSpark: fxSpark, fxImpact: fxImpact, fxClaw: fxClaw, fxGlyph: fxGlyph, ELEM: ELEM, fxDust: fxDust, fxCursor: fxCursor, fxStatus: fxStatus, PF_SRC: PF_SRC, PF: PF, CJK_CELL: CJK_CELL, glyphOf: glyphOf, textW: textW, TXT: TXT, textImg: textImg, drawText: drawText, WIN: WIN, WIN_GRAD: WIN_GRAD, winImg: winImg, drawWin: drawWin, GAUGE_COL: GAUGE_COL, drawGauge: drawGauge, HAND_ROWS: HAND_ROWS, HAND_PAL: HAND_PAL, drawHand: drawHand, drawTargetHand: drawTargetHand, bannerBox: bannerBox, drawBanner: drawBanner, TEXT_ROW: TEXT_ROW, motion: motion, createScreen: createScreen, spriteFromMap: spriteFromMap, withVariants: withVariants, flipSprite: flipSprite, mapPixels: mapPixels, recolorSprite: recolorSprite, remapRamps: remapRamps, tintSprite: tintSprite, drawSprite: drawSprite, POP_MS: POP_MS, popY: popY, popVisible: popVisible, drawPopNumber: drawPopNumber, drawPopText: drawPopText, PK: PK, createParticles: createParticles, createJuice: createJuice, drawFlash: drawFlash, drawDissolve: drawDissolve, CACHE: CACHE, cached: cached, drawParallax: drawParallax, buildScene: buildScene, ambientCustom: ambientCustom, ambientChange: ambientChange, drawSceneBack: drawSceneBack, drawSceneFront: drawSceneFront};
})();
