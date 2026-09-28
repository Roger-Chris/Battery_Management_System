/* ===== Electrochemical-thermal cell model: Single Particle Model, Chen2020 (LG M50 21700) ===== */
const FARADAY=96485.33212, RGAS=8.314462618, TREF=298.15;
const CELL={
  cnMax:33133, cpMax:63104, Rn:5.86e-6, Rp:5.22e-6, Dn:3.3e-14, Dp:4e-15,
  epsN:0.75, epsP:0.665, Ln:85.2e-6, Lp:75.6e-6, area:0.065*1.58, ce:1000,
  x0:0.02634579, x100:0.91061805, y0:0.85397467, y100:0.26384522, Qnom:5.0,
  EaDn:2092*RGAS, EaDp:1449*RGAS, Ej0n:35000, Ej0p:17800,
  Rohm:0.0, Re:0.0, tauE:60, NSH:20
};
function Un(x){return 1.9793*Math.exp(-39.3631*x)+0.2482-0.0909*Math.tanh(29.8538*(x-0.1234))-0.04478*Math.tanh(14.9159*(x-0.2769))-0.0205*Math.tanh(30.4444*(x-0.6103));}
function Up(y){return -0.8090*y+4.4875-0.0428*Math.tanh(18.5138*(y-0.5542))-17.7326*Math.tanh(15.7890*(y-0.3117))+17.5842*Math.tanh(15.9308*(y-0.3120));}
function dUnDT(x){return (-0.1112*x+0.02914+0.3561*Math.exp(-((x-0.08309)**2)/0.004616))/1000;}
function dUpDT(y){return (0.04006*Math.exp(-((y-0.2828)**2)/0.0009855)-0.06656*Math.exp(-((y-0.8032)**2)/0.02179))/1000;}
const arr=(Ea,T)=>Math.exp(Ea/RGAS*(1/TREF-1/T));

// particle geometry (precomputed)
function makeGeom(R,N){
  const dr=R/N,V=[],Af=[];
  for(let i=0;i<N;i++){V.push(4/3*Math.PI*(((i+1)*dr)**3-(i*dr)**3));Af.push(4*Math.PI*((i+1)*dr)**2);}
  return {dr,V,Af,N};
}
const GN=makeGeom(CELL.Rn,CELL.NSH), GP=makeGeom(CELL.Rp,CELL.NSH);
const AL_N=3*CELL.epsN/CELL.Rn*CELL.Ln*CELL.area, AL_P=3*CELL.epsP/CELL.Rp*CELL.Lp*CELL.area; // total particle surface [m2]

// implicit (backward Euler) finite-volume diffusion step, flux Nout [mol/m2/s] outward at surface
const _a=new Float64Array(32),_b=new Float64Array(32),_c=new Float64Array(32),_d=new Float64Array(32);
function diffuse(c,G,D,Nout,dt){
  const N=G.N,dr=G.dr;
  for(let i=0;i<N;i++){
    const kl=i>0?D*G.Af[i-1]/dr:0, ku=i<N-1?D*G.Af[i]/dr:0;
    _a[i]=-kl;_c[i]=-ku;_b[i]=G.V[i]/dt+kl+ku;_d[i]=G.V[i]/dt*c[i]-(i===N-1?G.Af[N-1]*Nout:0);
  }
  for(let i=1;i<N;i++){const m=_a[i]/_b[i-1];_b[i]-=m*_c[i-1];_d[i]-=m*_d[i-1];}
  c[N-1]=_d[N-1]/_b[N-1];
  for(let i=N-2;i>=0;i--)c[i]=(_d[i]-_c[i]*c[i+1])/_b[i];
}
function surf(c,G,D,Nout){return c[G.N-1]-Nout*(G.dr/2)/D;}
function avg(c,G){let s=0,v=0;for(let i=0;i<G.N;i++){s+=c[i]*G.V[i];v+=G.V[i];}return s/v;}

function newCell(soc,opts={}){
  const capF=opts.capF||1;
  const x=CELL.x0+soc*(CELL.x100-CELL.x0), y=CELL.y0+soc*(CELL.y100-CELL.y0);
  return {cn:new Float64Array(CELL.NSH).fill(x*CELL.cnMax),cp:new Float64Array(CELL.NSH).fill(y*CELL.cpMax),
    capF, rF:opts.rF||1, Rohm:(opts.Rohm!=null?opts.Rohm:CELL.Rohm), Tc:opts.T||TREF, Ts:opts.T||TREF,
    I:0,ve:0,V:Up(y)-Un(x),Q:0,Risc:Infinity,alive:true,vented:false,
    sei:0.15,ne:0.75,tsei:0.033,pe:0.04,el:1.0, qAbuse:0, gas:0};
}
// electrochemical state -> voltage for a given cell current I (A, +discharge) at temperature T
function cellVoltage(cell,I,T){
  const Ie=I/cell.capF;                       // capacity scaling = more/less electrode area
  const jn=Ie/AL_N, jp=-Ie/AL_P;              // A/m2
  const Dn=CELL.Dn*arr(CELL.EaDn,T), Dp=CELL.Dp*arr(CELL.EaDp,T);
  const csn=Math.min(CELL.cnMax-1,Math.max(1,surf(cell.cn,GN,Dn,jn/FARADAY)));
  const csp=Math.min(CELL.cpMax-1,Math.max(1,surf(cell.cp,GP,Dp,jp/FARADAY)));
  const j0n=6.48e-7*arr(CELL.Ej0n,T)*Math.sqrt(CELL.ce*csn*(CELL.cnMax-csn));
  const j0p=3.42e-6*arr(CELL.Ej0p,T)*Math.sqrt(CELL.ce*csp*(CELL.cpMax-csp));
  const k=2*RGAS*T/FARADAY;
  const etan=k*Math.asinh(jn/(2*j0n)), etap=k*Math.asinh(jp/(2*j0p));
  const U=Up(csp/CELL.cpMax)-Un(csn/CELL.cnMax);
  const V=U+etap-etan-I*cell.Rohm*cell.rF*rohmT(T)-cell.ve;
  // small-signal resistance dV/dI
  const dn=k/Math.sqrt(1+(jn/(2*j0n))**2)/(2*j0n)/AL_N/cell.capF;
  const dp=k/Math.sqrt(1+(jp/(2*j0p))**2)/(2*j0p)/AL_P/cell.capF;
  return {V,U,Rs:dn+dp+cell.Rohm*cell.rF*rohmT(T)+CELL.Re*cell.rF*rohmT(T)*(1-Math.exp(-1/CELL.tauE))};
}
function rohmT(T){return Math.exp(1800*(1/T-1/TREF));} // electrolyte/contact resistance temperature dependence (Arrhenius-like)
function advanceCell(cell,I,T,dt){
  const Ie=I/cell.capF;
  const Dn=CELL.Dn*arr(CELL.EaDn,T), Dp=CELL.Dp*arr(CELL.EaDp,T);
  diffuse(cell.cn,GN,Dn,(Ie/AL_N)/FARADAY,dt);
  const e=Math.exp(-dt/CELL.tauE); cell.ve=cell.ve*e+I*CELL.Re*cell.rF*rohmT(T)*(1-e);
  diffuse(cell.cp,GP,Dp,(-Ie/AL_P)/FARADAY,dt);
}
function cellSOC(cell){return (avg(cell.cn,GN)/CELL.cnMax-CELL.x0)/(CELL.x100-CELL.x0);}
function cellOCVbulk(cell){return Up(avg(cell.cp,GP)/CELL.cpMax)-Un(avg(cell.cn,GN)/CELL.cnMax);}
function cellEntropic(cell){return dUpDT(avg(cell.cp,GP)/CELL.cpMax)-dUnDT(avg(cell.cn,GN)/CELL.cnMax);}
if(typeof module!=='undefined')module.exports={CELL,newCell,cellVoltage,advanceCell,cellSOC,cellOCVbulk,Un,Up,TREF};
