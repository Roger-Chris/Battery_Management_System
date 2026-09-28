const fs=require('fs');const V=require('./vehicle.js');
const cyc=V.loadCycle(fs.readFileSync('wmtc_part1.csv','utf8'));
const out=[];let E=0;
for(let rep=0;rep<3;rep++)for(let i=0;i<cyc.length-1;i++){const v=cyc[i].v,a=cyc[i+1].v-cyc[i].v;const P=Math.min(V.VEH.Pmax,V.battPower(v,a,cyc[i].g));E+=P;out.push(P/(13*8*3.7));}
fs.writeFileSync('/tmp/wmtc_cell_current.json',JSON.stringify(out));
console.log('points',out.length,'max A/cell',Math.max(...out).toFixed(2),'min',Math.min(...out).toFixed(2),'mean W',(E/out.length).toFixed(0),'Wh/km', (E/3600/(cyc.reduce((s,c)=>s+c.v,0)*3/1000)).toFixed(1));
