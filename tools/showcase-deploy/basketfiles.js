const fs=require('fs'),vm=require('vm');
const dir=process.argv[2];
const ctx={window:{},console};ctx.window.window=ctx.window;ctx.self=ctx.window;vm.createContext(ctx);
for(const f of ['combine-core.js','basket-data.js']) vm.runInContext(fs.readFileSync(dir+'/'+f,'utf8'),ctx);
const W=ctx.window; const keys=Object.keys(W); 
const Core=W.GameDNACombine||W.DNA_COMBINE||Object.values(W).find(v=>v&&typeof v.run==='function');
const D=W.DNA_BASKET_DATA; const ids=Object.keys(D.elements);
const out=new Set(); let n=0;
for(const id of ids){ for(const st of [false,true]){ try{const r=Core.run(D,{ids:[id],starter:st}); (r.files||[]).forEach(f=>out.add(f.path)); n++;}catch(e){} } }
// pairs to catch requires
for(const a of ids) for(const b of ids){ try{const r=Core.run(D,{ids:[a,b]}); (r.files||[]).forEach(f=>out.add(f.path));}catch(e){} }
console.error('keys',keys, 'runs',n,'files',out.size);
console.log([...out].sort().join('\n'));
