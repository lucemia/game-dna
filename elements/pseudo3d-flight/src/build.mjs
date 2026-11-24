// Builds starter/index.html (module inlined verbatim) and demo/index.html (shared world + art from the starter): node src/build.mjs
import fs from 'fs'; import path from 'path'; import url from 'url';
const D = path.dirname(path.dirname(url.fileURLToPath(import.meta.url)));
const rd = f => fs.readFileSync(path.join(D, f), 'utf8');
const mod = rd('module/pseudo3d-flight.js'), src = rd('src/starter.src.html'), demo = rd('src/demo.src.html');
if (!src.includes('/*@MODULE*/')) throw new Error('module marker missing');
const a = src.indexOf('// @world-begin'), b = src.indexOf('// @world-end'); if (a < 0 || b < a) throw new Error('world markers missing');
const world = src.slice(a, b).replace(/^\/\/ @world-begin.*\n/, '');
fs.mkdirSync(path.join(D, 'starter'), { recursive: true }); fs.mkdirSync(path.join(D, 'demo'), { recursive: true });
fs.writeFileSync(path.join(D, 'starter/index.html'), src.replace('/*@MODULE*/', () => mod.trimEnd()));
fs.writeFileSync(path.join(D, 'demo/index.html'), demo.replace('/*@WORLD*/', () => '/* ---------- world + art (same as the starter) ---------- */\n' + world.trimEnd()));
console.log('starter/index.html, demo/index.html written');
