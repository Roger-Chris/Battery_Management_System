const M=require('./core.js');const ref=require('/tmp/ref.json');
function simCC(I,tEnd,Rohm){const c=M.newCell(1.0,{Rohm});const T=M.TREF;const out=[];let t=0;
 for(;t<=tEnd;t+=1){const r=M.cellVoltage(c,I,T);if(t%5===0)out.push(r.V);if(r.V<2.5)break;M.advanceCell(c,I,T,1);}return out;}
function rmse(a,b){const n=Math.min(a.length,b.length);let s=0;for(let i=0;i<n;i++)s+=(a[i]-b[i])**2;return {rmse:Math.sqrt(s/n)*1000,n,la:a.length,lb:b.length};}
for(const C of ['1C','2C']){const I=C==='1C'?5:10;const te=C==='1C'?3500:1750;
 const js=simCC(I,te,0);console.log(C,'JS SPM vs PyBaMM SPM mV',rmse(js,ref['spm_'+C].v));
 let best=null;for(let R=0;R<=0.04;R+=0.001){const r=rmse(simCC(I,te,R),ref['dfn_'+C].v);if(!best||r.rmse<best.r.rmse)best={R,r};}
 console.log(C,'best lumped R vs DFN',best.R.toFixed(3),best.r);}
