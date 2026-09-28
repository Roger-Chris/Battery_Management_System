const X=require('./harness.js');
function rep(s){const B=s.bms,S=s.sensors;const hot=s.cells.reduce((a,c)=>c.Tc>a.Tc?c:a);const nb=hot.nb.map(c=>(c.Tc-273.15).toFixed(0)).join('/');console.log(`t=${s.t} I=${s.I.toFixed(1)} Tmax=${(hot.Tc-273.15).toFixed(0)}@${hot.s+1}.${hot.p+1} nb=${nb} air=${(s.air-273.15).toFixed(1)} h2=${S.h2.ppm.toFixed(0)} dP=${s.gas.dP.toFixed(2)} lvl=${B.thermalLevel} TR=${s.maxTRcells}`);}
function scen(label,setup,secs,every,prof){const sim=X.createSim(7,32,0.9);sim.profile=prof||'wmtc1';for(let i=0;i<secs;i++){setup(sim,i);X.stepSim(sim,1);if(i%every===0)rep(sim);}console.log(label);console.log(sim.events.filter(e=>e.level!=='sensor').map(e=>'  '+e.t+' ['+e.level+'] '+(e.grp!=null?'g'+(e.grp+1)+' ':'')+e.msg).join('\n'));}
const c=(s)=>s.cells[6*8+3];
scen('HARD ISC',(s,i)=>{if(i===60)c(s).Risc=0.05;},1500,100);
scen('HEATER 25W on 7.4',(s,i)=>{if(i===60)c(s).heaterW=25;},2400,300,'park');
