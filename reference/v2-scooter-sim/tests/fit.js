const M=require('./core.js');const ref=require('/tmp/ref.json');const dyn=require('/tmp/ref_dyn.json');
const wm=require('/tmp/wmtc_cell_current.json');
function run(prof,soc0,Rohm,every=1,mid=true){const c=M.newCell(soc0,{Rohm});const out=[];for(let t=0;t<prof.length;t++){const I=prof[t];if(mid){M.advanceCell(c,I,M.TREF,0.5);const r=M.cellVoltage(c,I,M.TREF);if(t%every===0)out.push(r.V);M.advanceCell(c,I,M.TREF,0.5);}else{const r=M.cellVoltage(c,I,M.TREF);if(t%every===0)out.push(r.V);M.advanceCell(c,I,M.TREF,1);}}return out;}
const rm=(a,b)=>{const n=Math.min(a.length,b.length);let s=0;for(let i=0;i<n;i++)s+=(a[i]-b[i])**2;return Math.sqrt(s/n)*1000;};
const cc=(I,n)=>Array(n).fill(I);
function cost(p){M.CELL.Re=p[1];M.CELL.tauE=p[2];
 const a=rm(run(dyn.hppc_I,0.95,p[0]),dyn.dfn_hppc);
 const b=rm(run(cc(5,3500),1.0,p[0],5,false),ref.dfn_1C.v.slice(0,660)); // exclude final knee
 const c=rm(run(cc(10,1750),1.0,p[0],5,false),ref.dfn_2C.v.slice(0,320));
 return {tot:a+b+c,a,b,c};}
// coarse grid then refine
let best=null;
for(const R of [0.004,0.006,0.008,0.010,0.012])for(const Re of [0,0.002,0.004,0.006,0.008,0.01])for(const tau of [20,40,80,150]){const r=cost([R,Re,tau]);if(!best||r.tot<best.r.tot)best={p:[R,Re,tau],r};}
console.log('coarse',best);
let p=best.p.slice(),step=[0.001,0.001,10];
for(let it=0;it<60;it++){let imp=false;for(let k=0;k<3;k++)for(const s of [1,-1]){const q=p.slice();q[k]=Math.max(0,q[k]+s*step[k]);if(k===2)q[k]=Math.max(5,q[k]);const r=cost(q);if(r.tot<best.r.tot){best={p:q,r};p=q;imp=true;}}if(!imp)step=step.map(x=>x/2);}
console.log('fit',best);
M.CELL.Re=best.p[1];M.CELL.tauE=best.p[2];
// validation on held-out drive cycle
M.CELL.Re=0;M.CELL.tauE=60;
console.log('WMTC: JS-SPM(no extra) vs PyBaMM SPM mV',rm(run(wm,0.9,0),dyn.spm).toFixed(2));
console.log('WMTC: plain SPM vs DFN mV',rm(run(wm,0.9,0),dyn.dfn).toFixed(2));
M.CELL.Re=best.p[1];M.CELL.tauE=best.p[2];
console.log('WMTC: fitted model vs DFN mV (held out)',rm(run(wm,0.9,best.p[0]),dyn.dfn).toFixed(2));
const v=run(wm,0.9,best.p[0]);let mx=0;for(let i=0;i<v.length;i++)mx=Math.max(mx,Math.abs(v[i]-dyn.dfn[i]));console.log('max abs err mV',(mx*1000).toFixed(1));
require('fs').writeFileSync('/tmp/fit.json',JSON.stringify({p:best.p,wm_js:v.filter((_,i)=>i%5===0),wm_dfn:dyn.dfn.filter((_,i)=>i%5===0)}));
