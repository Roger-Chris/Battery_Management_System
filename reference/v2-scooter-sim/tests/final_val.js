const M=require('./core.js');const ref=require('/tmp/ref.json');const dyn=require('/tmp/ref_dyn.json');const wm=require('/tmp/wmtc_cell_current.json');
const F={Rohm:0.00387,Re:0.01007,tauE:70.8};
const rm=(a,b)=>{const n=Math.min(a.length,b.length);let s=0,mx=0;for(let i=0;i<n;i++){s+=(a[i]-b[i])**2;mx=Math.max(mx,Math.abs(a[i]-b[i]));}return [Math.sqrt(s/n)*1000,mx*1000];};
function run(prof,soc0,full,mid,every=1){M.CELL.Re=full?F.Re:0;M.CELL.tauE=F.tauE;const c=M.newCell(soc0,{Rohm:full?F.Rohm:0});const out=[];for(let t=0;t<prof.length;t++){const I=prof[t];if(mid){M.advanceCell(c,I,M.TREF,0.5);if(t%every===0)out.push(M.cellVoltage(c,I,M.TREF).V);M.advanceCell(c,I,M.TREF,0.5);}else{if(t%every===0)out.push(M.cellVoltage(c,I,M.TREF).V);M.advanceCell(c,I,M.TREF,1);}}return out;}
const cc=(I,n)=>Array(n).fill(I);
const r={
 spm1C:rm(run(cc(5,3500),1,false,false,5),ref.spm_1C.v),
 spmDrive:rm(run(wm,0.9,false,true),dyn.spm),
 dfn1C:rm(run(cc(5,3300),1,true,false,5),ref.dfn_1C.v.slice(0,661)),
 dfn2C:rm(run(cc(10,1600),1,true,false,5),ref.dfn_2C.v.slice(0,321)),
 dfnHPPC:rm(run(dyn.hppc_I,0.95,true,true),dyn.dfn_hppc),
 dfnDrive:rm(run(wm,0.9,true,true),dyn.dfn),
 plainSpmDrive:rm(run(wm,0.9,false,true),dyn.dfn)};
console.log(JSON.stringify(r,(k,v)=>typeof v==='number'?+v.toFixed(1):v));
const v=run(wm,0.9,true,true);
require('fs').writeFileSync('/tmp/valchart.json',JSON.stringify({model:v.filter((_,i)=>i%5===0).map(x=>+x.toFixed(4)),dfn:dyn.dfn.filter((_,i)=>i%5===0).map(x=>+x.toFixed(4)),I:wm.filter((_,i)=>i%5===0),stats:r}));
