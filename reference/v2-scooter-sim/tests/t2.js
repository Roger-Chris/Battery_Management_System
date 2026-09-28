const X=require('./harness.js');
function rep(s){const B=s.bms,S=s.sensors;const Tc=s.cells.map(c=>c.Tc-273.15);const hot=s.cells.reduce((a,c)=>c.Tc>a.Tc?c:a);console.log(`t=${s.t} I=${s.I.toFixed(1)} socT=${(B.socTrue*100).toFixed(2)} est=${(B.x[0]*100).toFixed(2)} Tmax=${Math.max(...Tc).toFixed(1)}@${hot.s+1}.${hot.p+1} Ts=${(hot.Ts-273.15).toFixed(1)} air=${(s.air-273.15).toFixed(1)} T4=${S.ntc[3].val.toFixed(1)} gasK=${S.env.gasKohm.toFixed(0)} h2=${S.h2.ppm.toFixed(1)} dP=${s.gas.dP.toFixed(2)} lvl=${B.thermalLevel} cont=${s.contactor} TR=${s.maxTRcells} an7=${B.anomaly[6].toFixed(2)}`);}
function scen(label,setup,secs,every,prof){const sim=X.createSim(7,32,0.9);sim.profile=prof||'wmtc1';const t0=Date.now();for(let i=0;i<secs;i++){setup(sim,i);X.stepSim(sim,1);if(i%every===0)rep(sim);}rep(sim);console.log(label,'ms/sim-s',((Date.now()-t0)/secs).toFixed(2));console.log(sim.events.map(e=>'  '+e.t+' ['+e.level+'] '+(e.grp!=null?'g'+(e.grp+1)+' ':'')+e.msg).join('\n'));}
const c=(s)=>s.cells[6*8+3];
scen('NORMAL 1800s',()=>{},1800,600);
scen('SOFT ISC 5 ohm on 7.4',(s,i)=>{if(i===60)c(s).Risc=5;},3600,600);
scen('HARD ISC 0.05 ohm on 7.4',(s,i)=>{if(i===60)c(s).Risc=0.05;},900,30);
