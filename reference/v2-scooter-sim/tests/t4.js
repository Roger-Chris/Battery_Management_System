const X=require('./harness.js');
function rep(s){const B=s.bms,S=s.sensors;const hot=s.cells.reduce((a,c)=>c.Tc>a.Tc?c:a);const vs=S.cellV.map(c=>c.val);console.log(`t=${s.t} prof=${s.profile} I=${s.I.toFixed(1)} sh=${S.shunt.val.toFixed(2)} hall=${S.hall.val.toFixed(2)} Vst=${S.stack.val.toFixed(2)} vmin=${Math.min(...vs).toFixed(3)} vmax=${Math.max(...vs).toFixed(3)} socT=${(B.socTrue*100).toFixed(1)} est=${(B.x[0]*100).toFixed(1)} Tmax=${(hot.Tc-273.15).toFixed(1)} bal=${B.balancing} cont=${s.contactor}/${s.cmdContactor} lvl=${B.thermalLevel}`);}
function scen(label,setup,secs,every,prof,soc){const sim=X.createSim(7,32,soc||0.9);sim.profile=prof||'wmtc1';for(let i=0;i<secs;i++){setup(sim,i);X.stepSim(sim,1);if(i%every===0)rep(sim);}rep(sim);console.log('== '+label);console.log(sim.events.map(e=>'  '+e.t+' ['+e.level+'] '+(e.grp!=null?'g'+(e.grp+1)+' ':'')+e.msg).join('\n'));}
scen('CHARGE',()=>{},14000,2000,'charge',0.3);
scen('CHARGER FAULT',(s,i)=>{if(i===10)X.injectFault(s,'charger',0);},4000,1000,'charge',0.8);
scen('BUSBAR',(s,i)=>{if(i===60)X.injectFault(s,'busbar',6*8);},900,300);
scen('SENSORS',(s,i)=>{if(i===60)X.injectFault(s,'ntc_open',0,2);if(i===120)X.injectFault(s,'vsense',3*8);if(i===180)X.injectFault(s,'hall',0);if(i===240)X.injectFault(s,'shunt',0);},600,120);
scen('CONTACTOR WELD + TRIP',(s,i)=>{if(i===30)X.injectFault(s,'contactor',0);if(i===60)X.injectFault(s,'isc_hard',6*8+3);},200,50);
scen('CRASH',(s,i)=>{if(i===60)X.injectFault(s,'crash',12*8+7);},1200,300);
