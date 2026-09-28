const X=require('./harness.js');
const sim=X.createSim(7,32,0.9);sim.profile='wmtc1';
for(let i=0;i<900;i++){if(i===60)X.injectFault(sim,'busbar',6*8);X.stepSim(sim,1);const B=sim.bms;const mr=Math.max(...B.rateT.slice(0,7));if(mr>0.05||i%150==0)console.log(sim.t,'rate',B.rateT.slice(0,7).map(x=>x.toFixed(3)).join(' '),'I',sim.I.toFixed(0),'lvl',B.thermalLevel, 'off',(B.offEst||0).toFixed(2));}
console.log(sim.events.map(e=>'  '+e.t+' ['+e.level+'] '+e.msg).join('\n'));
