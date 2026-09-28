// Scooter longitudinal dynamics. Parameters are representative of an Indian 2-3 kW e-scooter class (assumed, editable)
const VEH={m:115,rider:75,Crr:0.012,CdA:0.62,rho:1.16,rotI:0.04,etaDrive:0.86,regenFrac:0.55,Pmax:3200,Paux:35,vmax:19.4};
function wheelForce(v,a,grade){const m=VEH.m+VEH.rider;const th=Math.atan(grade||0);
 return m*(1+VEH.rotI)*a+m*9.81*VEH.Crr*Math.cos(th)*(v>0.05?1:0)+0.5*VEH.rho*VEH.CdA*v*v+m*9.81*Math.sin(th);}
function motorEff(v,P){const base=VEH.etaDrive-0.18*Math.exp(-v/2.5);const load=Math.abs(P)/VEH.Pmax;return Math.max(0.55,base-0.08*Math.exp(-load/0.08));}
function battPower(v,a,grade){const F=wheelForce(v,a,grade);const Pw=F*v;const eta=motorEff(v,Pw);
 return Pw>=0?Pw/eta+VEH.Paux:Pw*eta*VEH.regenFrac+VEH.Paux;}
function loadCycle(text){const L=text.trim().split(/\r?\n/);const h=L[0].replace(/^\ufeff/,'').split(',');const gi=h.findIndex(x=>/grade/i.test(x));
 return L.slice(1).map(l=>{const p=l.split(',');return {t:+p[0],v:+p[1],g:gi>=0?+p[gi]:0};});}
if(typeof module!=='undefined')module.exports={VEH,battPower,loadCycle,wheelForce};
