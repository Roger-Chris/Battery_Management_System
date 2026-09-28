const M=require('./core.js');const dyn=require('/tmp/ref_dyn.json');
M.CELL.Re=0.0;M.CELL.tauE=47;
const c=M.newCell(0.95,{Rohm:0.011});const I=dyn.hppc_I;const e=[];
for(let t=0;t<I.length;t++){const r=M.cellVoltage(c,I[t],M.TREF);e.push([t,I[t],r.V,dyn.dfn_hppc[t]]);M.advanceCell(c,I[t],M.TREF,1);}
for(const t of [0,5,9,10,15,49,50,55,59,60,99,100,150,219,220,279,280,1000,2000,3000,3359])console.log(e[t].map(x=>typeof x==='number'?x.toFixed(4):x).join('\t'));
