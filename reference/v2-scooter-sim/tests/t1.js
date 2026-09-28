const X=require('./harness.js');
function run(label,sim,secs,every,fn){const t0=Date.now();for(let i=0;i<secs;i++){if(fn)fn(sim,i);X.stepSim(sim,1);if(every&&i%every===0)rep(sim);}console.log(label,'wall ms/sim-s',((Date.now()-t0)/secs).toFixed(2));rep(sim);}
function rep(s){const B=s.bms,S=s.sensors;const Tc=s.cells.map(c=>c.Tc-273.15);console.log(`t=${s.t} v=${(s.veh.v*3.6).toFixed(1)} I=${s.I.toFixed(1)} Vst=${s.Vstack.toFixed(2)} socT=${(B.socTrue*100).toFixed(2)} est=${(B.x[0]*100).toFixed(2)} cc=${(B.cc*100).toFixed(2)} Tmax=${Math.max(...Tc).toFixed(1)} air=${(s.air-273.15).toFixed(1)} ntc1=${S.ntc[0].val.toFixed(1)} gasK=${S.env.gasKohm.toFixed(0)} h2=${S.h2.ppm.toFixed(1)} dP=${s.gas.dP.toFixed(2)} lvl=${B.thermalLevel} cont=${s.contactor} TR=${s.maxTRcells} dist=${(s.veh.dist/1000).toFixed(2)}`);}
const sim=X.createSim(7,32,0.9);
console.log('R0 group mOhm',(sim.bms.R0*1000).toFixed(2));
run('WMTC1 30min',sim,1800,300);
console.log(sim.events.map(e=>e.t+' '+e.level+' '+e.msg).join('\n'));
