/* ===== Pack, thermal, abuse kinetics, gas, vehicle, charger, sensors, edge BMS ===== */
const NS=13, NP=8, NC=NS*NP;
const FIT={Rohm:0.00387,Re:0.01007,tauE:70.8};           // fitted to PyBaMM DFN pulses (see Model tab)
CELL.Re=FIT.Re; CELL.tauE=FIT.tauE;
function mulberry(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function gaussR(r){let u=0,v=0;while(!u)u=r();while(!v)v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
const K0=273.15;
const TH={Cc:66,Cs:9,Rcs:2.3,Rin:15,Rx:25,hIn:5,Acell:0.00531,Cair:350,Gah:12,Chous:2200,Aext:0.45,Vfree:0.006,Vjr:2.2e-5,
  Tvent:130+K0,Tsep:170+K0,ejectFrac:0.5,Frad:0.0013};
const AB={Asei:1.667e15,Esei:1.3508e5,Hsei:257,Wc:6.104e5,Ane:2.5e13,Ene:1.3508e5,Hne:1714,tref:0.033,
  Ape:6.667e13,Epe:1.396e5,Hpe:314,Wp:1.221e6,Ae:5.14e25,Ee:2.74e5,He:155,We:4.07e5};
const LIM={OV:4.25,UV:2.6,OTd:60,OTc:45,UTc:0,OCd:85,OCc:32,Vcv:4.2*NS,gasH2:40,dP:1.5};
const NTC_POS=[0,2,4,6,8,10,12].map(s=>({s,p:3}));        // cell-surface thermistors
const PROFILES={wmtc1:'WMTC Part 1 (urban)',wmtc12:'WMTC Part 1 + 2 (urban + rural)',tsdc:'Real-world trip with road grade (NREL TSDC)',charge:'Charging, 10 A CC-CV',fast:'Charging, 20 A CC-CV',park:'Parked'};

function createSim(seed,amb,soc0){
  const r=mulberry(seed||7), T0=amb+K0;
  const cells=[];
  for(let s=0;s<NS;s++)for(let p=0;p<NP;p++){
    const c=newCell(Math.min(0.99,soc0+0.003*gaussR(r)),{capF:1+0.006*gaussR(r),rF:1+0.04*gaussR(r),Rohm:FIT.Rohm,T:T0});
    Object.assign(c,{Cc:TH.Cc*(1+0.03*gaussR(r)),s,p,k:s*NP+p,weldR:0.0005,heaterW:0,Iterm:0,Ie:0,Isc:0,qE:0,alive:true,tr:false,dead:false,trT:null,Vg:c.V});
    cells.push(c);
  }
  for(const c of cells){c.nb=[];for(const [s2,p2] of [[c.s-1,c.p],[c.s+1,c.p],[c.s,c.p-1],[c.s,c.p+1]])if(s2>=0&&s2<NS&&p2>=0&&p2<NP)c.nb.push(cells[s2*NP+p2]);}
  const sensors=makeSensors(r,T0);
  const sim={t:0,r,amb:T0,cells,linkR:new Array(NS-1).fill(0.0002),linkExtra:new Array(NS-1).fill(0),
    air:T0,hous:T0,term:T0,gas:{voc:0,h2:0,co2:0,dP:0,burst:false},
    veh:{v:0,a:0,dist:0,tc:0,Pb:0,vt:0},profile:'wmtc1',
    I:0,Vstack:NS*cells[0].V,Vplus:NS*cells[0].V,contactor:true,cmdContactor:true,welded:false,chargerFault:false,
    chg:{done:false},bleed:new Array(NS).fill(0),
    faults:{},crashT:null,events:[],evCount:0,sensors,bms:null,maxTRcells:0};
  sim.bms=makeBMS(sim,soc0);
  return sim;
}
function simLog(sim,level,grp,msg){sim.evCount++;sim.events.push({id:sim.evCount,t:sim.t,level,grp,msg});if(sim.events.length>500)sim.events.shift();}

/* ---- electrical network: 13 series groups of 8 parallel cells ---- */
function cellThevenin(c){
  if(c.dead)return null;
  const T=c.Tc;const I0=c.Ie;
  const r=cellVoltage(c,I0,T);
  let E=r.V+r.Rs*I0, R=r.Rs;                               // linearised at last current
  if(isFinite(c.Risc)){const f=c.Risc/(c.Risc+R);E=E*f;R=R*f;}  // internal short in parallel
  R+=c.weldR;
  return {E,R,r};
}
function solvePack(sim,demand){
  const G=[];let Ep=0,Rp=0,open=false;
  for(let s=0;s<NS;s++){
    let g=0,e=0;const th=[];
    for(let p=0;p<NP;p++){const c=sim.cells[s*NP+p];const t=cellThevenin(c);th.push(t);if(t){g+=1/t.R;e+=t.E/t.R;}}
    if(g===0){open=true;G.push(null);continue;}
    G.push({E:e/g,R:1/g,th});Ep+=e/g;Rp+=1/g;
  }
  for(let s=0;s<NS-1;s++)Rp+=sim.linkR[s]+sim.linkExtra[s];
  Rp+=0.0001+0.0003; // shunt + contactor
  let I=0;
  if(open)I=0;
  else if(demand.mode==='power'){const P=demand.P;const disc=Ep*Ep-4*Rp*P;I=disc>0?(Ep-Math.sqrt(disc))/(2*Rp):Ep/(2*Rp);}
  else I=demand.I;
  // distribute
  let Vstack=0;
  for(let s=0;s<NS;s++){
    const g=G[s];
    if(!g){for(let p=0;p<NP;p++){const c=sim.cells[s*NP+p];c.Iterm=0;c.Isc=0;}continue;}
    const Vg=g.E-g.R*I;Vstack+=Vg;
    for(let p=0;p<NP;p++){
      const c=sim.cells[s*NP+p],t=g.th[p];
      if(!t){c.Iterm=0;c.Isc=0;c.Vg=Vg;continue;}
      c.Iterm=(t.E-Vg)/t.R;
      const Vint=Vg+c.Iterm*c.weldR;              // voltage at cell terminals inside weld
      c.Isc=isFinite(c.Risc)?Vint/c.Risc:0;
      c.Ie=c.Iterm+c.Isc+sim.bleed[s]/NP;
      c.Vg=Vg;
    }
  }
  for(let s=0;s<NS-1;s++)Vstack-=I*(sim.linkR[s]+sim.linkExtra[s]);
  return {I,Ep,Rp,Vstack,open};
}

/* ---- abuse kinetics (Kim et al. 2007 four-reaction model) ---- */
function abuseStep(c,dt){
  const T=c.Tc, RT=RGAS*T;
  const rsei=AB.Asei*Math.exp(-AB.Esei/RT)*c.sei;
  const rne=AB.Ane*Math.exp(-AB.Ene/RT)*c.ne*Math.exp(-c.tsei/AB.tref);
  const rpe=AB.Ape*Math.exp(-AB.Epe/RT)*c.pe*(1-c.pe);
  const re=AB.Ae*Math.exp(-AB.Ee/RT)*c.el;
  const q=(AB.Hsei*AB.Wc*rsei+AB.Hne*AB.Wc*rne+AB.Hpe*AB.Wp*rpe+AB.He*AB.We*re)*TH.Vjr;
  return {q,rsei,rne,rpe,re};
}
function applyAbuse(c,ab,dt){
  c.sei=Math.max(0,c.sei-ab.rsei*dt);c.ne=Math.max(0,c.ne-ab.rne*dt);c.tsei+=ab.rne*dt;
  c.pe=Math.min(1,c.pe+ab.rpe*dt);c.el=Math.max(0,c.el-ab.re*dt);
}

/* ---- one simulation step ---- */
function stepSim(sim,dt){
  const S=sim.sensors, B=sim.bms;
  sim.contactor=sim.cmdContactor||sim.welded;
  // 1) load demand
  let demand={mode:'power',P:4.5};  // edge node + AFE quiescent load, always on the stack
  const prof=sim.profile, v=sim.veh;
  const driving=prof==='wmtc1'||prof==='wmtc12'||prof==='tsdc';
  const charging=prof==='charge'||prof==='fast';
  if(driving){
    const cyc=prof==='tsdc'?CYC.tsdc:(prof==='wmtc12'?CYC.w12:CYC.wmtc1);
    const n=cyc.length, i=Math.floor(v.tc)%n, j=(i+1)%n;
    v.vt=cyc[j]; const grade=prof==='tsdc'?CYC.tsdcGrade[i]:0;
    let a=clampN((v.vt-v.v)/1,-3,3.5);
    const Plim=sim.cmdContactor?Math.min(VEH.Pmax,B.pLimit):0;   // BMS also disables the drive over CAN
    let P=battPower(v.v,a,grade);
    if(!sim.cmdContactor){a=-(wheelForce(v.v,0,grade))/((VEH.m+VEH.rider)*(1+VEH.rotI));P=0;}
    else if(P>Plim){const Froad=wheelForce(v.v,0,grade);const Fmax=(Plim-VEH.Paux)*0.84/Math.max(v.v,1.0);a=Math.min(a,(Fmax-Froad)/((VEH.m+VEH.rider)*(1+VEH.rotI)));P=battPower(v.v,a,grade);}
    const Pregen=-B.iChargeAllow*Math.max(40,sim.Vstack);if(P<Pregen)P=Pregen; // BMS regen limit; friction brakes take the rest
    v.a=a;v.Pb=P;demand.P+=P;
    v.v=clampN(v.v+a*dt,0,VEH.vmax);v.dist+=v.v*dt;v.tc+=dt;
  } else {v.v=Math.max(0,v.v-2*dt);v.a=0;v.Pb=0;}
  let chargeI=0;
  if(charging&&sim.cmdContactor&&!sim.chg.done){
    const Iset=prof==='fast'?20:10;
    const th=solvePack(sim,{mode:'current',I:0});
    const Icv=Math.max(0,(LIM.Vcv-th.Ep)/th.Rp);
    chargeI=sim.chargerFault?Iset:Math.min(Iset,B.iChargeAllow,Icv);
    if(!sim.chargerFault&&chargeI<2&&th.Ep>LIM.Vcv-0.3){sim.chg.done=true;simLog(sim,'info',null,'Charge complete: CV current fell below C/20');}
  }
  // 2) electrical solve (two passes to refine linearisation)
  let sol;
  for(let it=0;it<2;it++){
    if(charging)sol=solvePack(sim,{mode:'current',I:-chargeI+demand.P/Math.max(30,sim.Vstack)});
    else sol=solvePack(sim,demand);
  }
  sim.I=sol.I;sim.Vstack=sol.Vstack;
  sim.Vplus=(sim.contactor||sim.welded)?sol.Vstack-sim.I*0.0004:Math.max(0,sim.Vplus*Math.exp(-dt/2));
  // 3) electrochemistry + electrical heat
  for(const c of sim.cells){
    c.qWeld=0;
    if(c.dead){c.qE=isFinite(c.Risc)?shortDeadCell(c,dt):0;continue;}
    const r=cellVoltage(c,c.Ie,c.Tc);
    c.V=r.V;
    const ent=cellEntropic(c);
    c.qE=c.Ie*(r.U-r.V)-c.Ie*c.Tc*ent+c.Isc*Math.max(0,r.V);
    c.qWeld=c.Iterm*c.Iterm*c.weldR;
    advanceCell(c,c.Ie,c.Tc,dt);
  }
  // 4) thermal network with adaptive sub-stepping for abuse reactions
  thermalStep(sim,dt);
  // 5) gas and enclosure pressure
  gasStep(sim,dt);
  if(sim.crashT!=null&&!sim.crashDone&&sim.t-sim.crashT>45){sim.crashDone=true;const c=sim.cells[sim.crashCell];if(!c.dead){c.Risc=1.5;simLog(sim,'phys',c.s,`Deformed cell ${cellName(c)} developed a soft internal short (1.5 Ω)`);}}
  // 6) sensors and edge BMS (1 Hz)
  sim.t+=dt;
  sampleSensors(sim,dt);
  bmsStep(sim,dt);
}
// a vented (CID-open) cell whose separator has collapsed dumps its remaining charge through the internal short
function shortDeadCell(c,dt){
  const soc=cellSOC(c);if(soc<=0.001)return 0;
  const U=cellOCVbulk(c),Rint=0.02;const Isc=Math.max(0,U)/(c.Risc+Rint);
  const dQ=Math.min(Isc*dt,soc*CELL.Qnom*c.capF*3600);
  const dx=dQ/(CELL.Qnom*c.capF*3600)*(CELL.x100-CELL.x0),dy=dQ/(CELL.Qnom*c.capF*3600)*(CELL.y100-CELL.y0);
  for(let i=0;i<c.cn.length;i++)c.cn[i]=Math.max(1,c.cn[i]-dx*CELL.cnMax);
  for(let i=0;i<c.cp.length;i++)c.cp[i]=Math.min(CELL.cpMax-1,c.cp[i]-dy*CELL.cpMax);
  c.Isc=dQ/dt;return U*dQ/dt;
}
function clampN(x,a,b){return Math.min(b,Math.max(a,x));}

function thermalStep(sim,dt){
  const cells=sim.cells;let t=0,guard=0;
  const hExt=7+3.9*Math.pow(sim.veh.v,0.8);
  const Gcell=TH.hIn*TH.Acell;
  while(t<dt-1e-9&&guard<400){
    guard++;
    // abuse heat rates and adaptive step
    let maxRate=0;const ab=new Array(NC);
    for(const c of cells){
      if(c.Tc>60+K0&&!c.consumed){ab[c.k]=abuseStep(c,0);maxRate=Math.max(maxRate,ab[c.k].q/c.Cc);}
    }
    let h=dt-t;
    if(maxRate>0)h=Math.min(h,Math.max(0.005,2/maxRate));
    // explicit update (small conductances, stable for h<=1 s)
    const dTc=new Float64Array(NC),dTs=new Float64Array(NC);let qAir=0;
    for(const c of cells){
      const k=c.k;let qa=0;
      if(ab[k]){qa=ab[k].q;applyAbuse(c,ab[k],h);if(c.sei<1e-4&&c.ne<1e-4&&c.pe>0.9999&&c.el<1e-4)c.consumed=true;}
      c.qAbuse=qa;
      let qCore=c.qE+c.heaterW*0+qa;
      if(c.tr){qAir+=qa*TH.ejectFrac;qCore-=qa*TH.ejectFrac;}
      const qcs=(c.Tc-c.Ts)/TH.Rcs;
      dTc[k]=(qCore-qcs)/c.Cc;
      let qs=qcs+c.qWeld+c.heaterW-Gcell*(c.Ts-sim.air);
      // neighbours on the 13x8 grid
      for(const o of c.nb){qs+=(o.Ts-c.Ts)/(o.s===c.s?TH.Rin:TH.Rx);if(o.Ts>400||c.Ts>400)qs+=5.670e-8*0.8*TH.Frad*(o.Ts**4-c.Ts**4);} // conduction + radiation
      dTs[k]=qs/TH.Cs;
      qAir+=Gcell*(c.Ts-sim.air);
    }
    for(const c of cells){c.Tc=Math.min(1100+K0,c.Tc+dTc[c.k]*h);c.Ts=Math.min(1000+K0,c.Ts+dTs[c.k]*h);}
    // link heating (loose busbar) to surfaces of adjacent groups
    for(let s=0;s<NS-1;s++){if(sim.linkExtra[s]>0){const q=sim.I*sim.I*sim.linkExtra[s];for(let p=0;p<NP;p++){cells[s*NP+p].Ts+=q/(2*NP)*h/TH.Cs;cells[(s+1)*NP+p].Ts+=q/(2*NP)*h/TH.Cs;}}}
    const qTerm=sim.I*sim.I*0.0006;
    sim.term+=h*(qTerm-0.8*(sim.term-sim.air))/60;
    const dAir=(qAir-TH.Gah*(sim.air-sim.hous))/TH.Cair;
    const dH=(TH.Gah*(sim.air-sim.hous)-hExt*TH.Aext*(sim.hous-sim.amb))/TH.Chous;
    sim.air+=dAir*h;sim.hous+=dH*h;
    // events: vent, separator collapse, thermal runaway
    for(const c of cells){
      if(!c.vented&&c.Tc>=TH.Tvent){c.vented=true;c.gasVent=0.012;simLog(sim,'phys',c.s,`Cell ${cellName(c)} safety vent opened at ${(c.Tc-K0).toFixed(0)} °C; CID disconnects it`);c.dead=true;}
      if(!c.sepGone&&c.Tc>=TH.Tsep){c.sepGone=true;c.Risc=0.01;}
      if(!c.tr&&c.vented&&(dTc[c.k]>1||c.Tc>200+K0)){c.tr=true;c.trT=sim.t;sim.maxTRcells++;simLog(sim,'phys',c.s,`Cell ${cellName(c)} in thermal runaway`);}
    }
    t+=h;
  }
}
function cellName(c){return `${c.s+1}.${c.p+1}`;}

function gasStep(sim,dt){
  const g=sim.gas;const Vf=TH.Vfree;
  for(const c of sim.cells){
    // SEI/electrolyte decomposition off-gassing before venting (retained in cell until vent, small leakage through crimp)
    const gen=(c.qAbuse||0)*2e-5*dt;           // mol per J of decomposition heat (order-of-magnitude assumption)
    if(c.vented){g.voc+=gen*0.6;g.co2+=gen*0.3;g.h2+=gen*0.1*(c.tr?3:1);
      if(c.gasVent>0){const rel=Math.min(c.gasVent,0.004*dt);c.gasVent-=rel;g.voc+=rel;}}
    else{g.voc+=gen*0.02;}
    if(c.tr&&!c.trGas){c.trGas=true;c.trGasLeft=0.22;}
    if(c.trGasLeft>0){const rel=Math.min(c.trGasLeft,0.02*dt);c.trGasLeft-=rel;g.h2+=rel*0.28;g.co2+=rel*0.4;g.voc+=rel*0.32;}
  }
  const nAirMol=101325*Vf/(RGAS*sim.air);
  const nx=g.voc+g.h2+g.co2;
  g.dP=nx*RGAS*sim.air/Vf/1000+ (sim.air-sim.amb)/sim.amb*101.325*0.15; // kPa gauge (breather limits thermal part)
  const tau=g.burst?1:600;                    // breather membrane leak; burst disc at 8 kPa
  if(g.dP>8&&!g.burst){g.burst=true;simLog(sim,'phys',null,'Enclosure burst disc opened at 8 kPa');}
  const f=Math.exp(-dt/tau);g.voc*=f;g.h2*=f;g.co2*=f;
  g.vocPpm=g.voc/nAirMol*1e6;g.h2Ppm=g.h2/nAirMol*1e6;
}

/* ---- sensors ---- */
function makeSensors(r,T0){
  const S={
    cellV:Array.from({length:NS},(_,s)=>({off:0.0015*gaussR(r),gain:1+0.0003*gaussR(r),fault:'ok',val:0,raw:0})),
    stack:{gain:1+0.001*gaussR(r),val:0,raw:0,fault:'ok'},
    plus:{val:0,raw:0,fault:'ok'},
    shunt:{off:0.02*gaussR(r),gain:1+0.003*gaussR(r),fault:'ok',val:0,raw:0,drift:0},
    hall:{off:0.25*gaussR(r),gain:1+0.01*gaussR(r),fault:'ok',val:0,raw:0},
    ntc:[...NTC_POS.map((p,i)=>({id:'T'+(i+1),where:`cell ${p.s+1}.${p.p+1} surface`,cell:p.s*NP+p.p,grp:p.s})),
         {id:'T8',where:'main terminal / contactor',node:'term'},{id:'T9',where:'ambient, edge node board',node:'amb'}]
         .map(n=>Object.assign(n,{Tf:T0,fault:'ok',counts:0,val:T0-K0})),
    env:{T:T0-K0,RH:60,P:101.3,gasR:120,gasKohm:120,Rf:120,fault:'ok'},
    h2:{ppm:0,f:0,fault:'ok'},
    imu:{ax:0,az:1,peak:0,fault:'ok'},
    aux:{closed:true},
    can:{speed:0,online:true},
  };
  return S;
}
function ntcCounts(Tk){const R=10000*Math.exp(3435*(1/Tk-1/298.15));return Math.round(3.3*R/(R+10000)/3.3*4095);}
function countsToC(n){if(n<=0)return 150;if(n>=4095)return -40;const R=10000*n/(4095-n);const T=1/(1/298.15+Math.log(R/10000)/3435)-K0;return clampN(T,-40,150);}
function sampleSensors(sim,dt){
  const S=sim.sensors,r=sim.r;
  for(let s=0;s<NS;s++){
    const cs=S.cellV[s];let Vtrue=sim.cells[s*NP].Vg;
    if(s>0)Vtrue-=sim.I*sim.linkExtra[s-1];     // sense tap sits after the link
    let v=(Vtrue*cs.gain+cs.off)+0.0008*gaussR(r);
    if(cs.fault==='open')v=0.03*Math.abs(gaussR(r));
    if(cs.fault==='stuck'){if(cs.stuckV==null)cs.stuckV=cs.val;v=cs.stuckV;}
    cs.raw=Math.round(v*1000);cs.val=cs.raw/1000;
  }
  S.stack.raw=Math.round(sim.Vstack*S.stack.gain*100);S.stack.val=S.stack.raw/100;
  S.plus.raw=Math.round(sim.Vplus*100);S.plus.val=S.plus.raw/100;
  const shTemp=(sim.term-K0-25)*0.001;
  let ish=sim.I*S.shunt.gain+S.shunt.off+S.shunt.drift+shTemp+0.01*gaussR(r);
  S.shunt.raw=Math.round(ish*100);  // µV across the 100 µΩ shunt
  S.shunt.val=Math.round(ish*1000)/1000;
  let ih=sim.I*S.hall.gain+S.hall.off+0.12*gaussR(r);
  if(S.hall.fault==='dead')ih=-0.0;
  S.hall.raw=Math.round((2.5+ih*0.01)*1000);S.hall.val=Math.round(ih*100)/100;
  for(const n of S.ntc){
    let Ttrue;
    if(n.cell!=null)Ttrue=n.fault==='detached'?sim.air:sim.cells[n.cell].Ts;
    else if(n.node==='term')Ttrue=sim.term; else Ttrue=sim.amb+3;
    n.Tf+= (Ttrue-n.Tf)*(1-Math.exp(-dt/8));
    let cnt=ntcCounts(n.Tf)+Math.round(gaussR(r)*1.5);
    if(n.fault==='open')cnt=4095; if(n.fault==='short')cnt=0;
    n.counts=clampN(cnt,0,4095);n.val=countsToC(n.counts);
  }
  const e=S.env,g=sim.gas;
  e.T=sim.air-K0+0.3*gaussR(r)*0.3;
  const AH=0.7*satVap(sim.amb);e.RH=clampN(100*AH/satVap(sim.air),0,100);
  e.P=101.325+g.dP+0.02*gaussR(r);
  const R0=120*(1-0.004*(e.RH-50));
  const target=R0/(1+Math.pow(Math.max(0,g.vocPpm||0)/5,0.7));
  e.Rf+= (target-e.Rf)*(1-Math.exp(-dt/8));e.gasKohm=e.Rf*(1+0.01*gaussR(r));
  const h2t=Math.min(2000,g.h2Ppm||0);S.h2.f+=(h2t-S.h2.f)*(1-Math.exp(-dt/13));S.h2.ppm=S.h2.fault==='unplugged'?0:Math.max(0,S.h2.f+0.8*gaussR(r));
  const vib=0.03+0.012*sim.veh.v;
  S.imu.ax=sim.veh.a/9.81+vib*gaussR(r);S.imu.az=1+vib*gaussR(r);
  S.imu.peak=Math.max(Math.abs(S.imu.ax),Math.abs(S.imu.az-1)+1);
  if(sim.crashT!=null&&sim.t-sim.crashT<1.01){S.imu.peak=26.4;S.imu.ax=-26.4;}
  S.aux.closed=sim.contactor||sim.welded;
  S.can.speed=sim.veh.v;S.can.idc=(sim.veh.Pb/Math.max(40,sim.Vstack))+(sim.profile==='charge'||sim.profile==='fast'?sim.I-(4.5/Math.max(40,sim.Vstack))-sim.veh.Pb/Math.max(40,sim.Vstack):0)+0.2*gaussR(sim.r);
}
function satVap(Tk){const T=Tk-K0;return 6.112*Math.exp(17.62*T/(243.12+T))*216.7/Tk;} // g/m3

/* ---- edge BMS (runs on the Raspberry Pi) ---- */
function makeBMS(sim,soc0){
  // ECM identified from the cell model at 25 C: OCV table + R0 + one RC (what a lab HPPC test would give)
  const tab=[];for(let i=0;i<=50;i++){const s=i/50;tab.push(Up(CELL.y0+s*(CELL.y100-CELL.y0))-Un(CELL.x0+s*(CELL.x100-CELL.x0)));}
  const probe=newCell(0.5,{Rohm:FIT.Rohm});const r=cellVoltage(probe,1,TREF);
  const R0=(r.Rs-CELL.Re*(1-Math.exp(-1/CELL.tauE)))/NP;
  return {tab,R0,R1:CELL.Re/NP,tau:CELL.tauE,Cah:CELL.Qnom*NP*0.995,
    x:[0.70,0],P:[0.03,0,0,1e-4],cc:0.70,ccInit:0.70,
    latched:new Map(),pLimit:VEH.Pmax,iChargeAllow:20,anomaly:new Array(NS).fill(0),alert:new Array(NS).fill(false),alertKind:new Array(NS).fill(''),
    over:new Array(NS).fill(0),calm:new Array(NS).fill(0),sensorFault:new Map(),thermalLevel:0,rateT:new Array(9).fill(0),prevT:null,
    telem:[],telCount:0,hist:{soc:[],est:[],cc:[],I:[],v:[],vt:[],tmax:[],anom:[],gas:[],h2:[]},acc:{h:0,tl:0},balancing:0};
}
function ocvOf(B,s){s=clampN(s,0,1);const x=s*50,i=Math.min(49,Math.floor(x));return B.tab[i]+(B.tab[i+1]-B.tab[i])*(x-i);}
function docvOf(B,s){s=clampN(s,0,0.999);const i=Math.floor(s*50);return (B.tab[i+1]-B.tab[i])*50;}
function bmsFault(sim,key,msg,grp){const B=sim.bms;if(B.okCount)B.okCount[key]=0;if(!B.sensorFault.has(key)){B.sensorFault.set(key,msg);simLog(sim,'sensor',grp==null?null:grp,msg);}}
function bmsClear(sim,key){const B=sim.bms;if(B.sensorFault.has(key)){B.okCount=B.okCount||{};B.okCount[key]=(B.okCount[key]||0)+1;if(B.okCount[key]>=10){B.okCount[key]=0;B.sensorFault.delete(key);simLog(sim,'info',null,'Sensor check passed again: '+key);}}}
function bmsTrip(sim,reason,grp,detail){
  const B=sim.bms;
  if(!B.latched.has(reason)){B.latched.set(reason,{grp,detail});simLog(sim,'trip',grp,reason+': '+detail);}
  if(sim.cmdContactor){sim.cmdContactor=false;simLog(sim,'trip',null,'Contactor commanded open');}
  sim.contactor=sim.cmdContactor||sim.welded;
}
function bmsStep(sim,dt){
  const B=sim.bms,S=sim.sensors,cells=sim.cells;
  const I=S.shunt.val;
  // --- sensor plausibility ---
  const vOK=S.cellV.map((c,s)=>{const ok=c.val>0.5&&c.val<4.8;if(!ok)bmsFault(sim,'Cell voltage channel '+(s+1),`Voltage sense channel ${s+1} implausible (${c.val.toFixed(3)} V); excluded`,s);else bmsClear(sim,'Cell voltage channel '+(s+1));return ok;});
  const sumV=S.cellV.reduce((a,c)=>a+c.val,0);
  if(vOK.every(x=>x)&&Math.abs(sumV-S.stack.val)>0.6)bmsFault(sim,'Stack sum',`Sum of cells ${sumV.toFixed(2)} V disagrees with stack ${S.stack.val.toFixed(2)} V`);
  if(Math.abs(S.shunt.val-S.hall.val)>3){B.curMis=(B.curMis||0)+dt;if(B.curMis>5)bmsFault(sim,'Current sensors',`Shunt ${S.shunt.val.toFixed(1)} A and Hall ${S.hall.val.toFixed(1)} A disagree`);}else{B.curMis=0;}
  // cross-check shunt against the motor controller's reported DC-bus current (CAN) plus known edge-node load
  const expI=(S.can.idc||0)+4.5/Math.max(40,S.stack.val);
  B.offEst=(B.offEst||0)+(S.shunt.val-expI-(B.offEst||0))*(1-Math.exp(-dt/30));
  if(Math.abs(B.offEst)>0.8)bmsFault(sim,'Shunt offset',`Shunt reads ${B.offEst.toFixed(2)} A more than the motor controller and charger report; offset drift suspected`);else if(Math.abs(B.offEst)<0.4)bmsClear(sim,'Shunt offset');
  const tOK=S.ntc.map((n,i)=>{const ok=n.val>-30&&n.val<140;if(!ok)bmsFault(sim,n.id,`${n.id} (${n.where}) out of range: ${n.val.toFixed(0)} °C, treated as open/short`,n.grp);else bmsClear(sim,n.id);return ok;});
  if(!sim.cmdContactor&&S.aux.closed)bmsFault(sim,'Contactor','Contactor welded: PACK+ still at stack voltage after open command');
  // --- protection (validated signals only) ---
  const vv=S.cellV.map((c,s)=>vOK[s]?c.val:null);
  vv.forEach((v,s)=>{if(v==null)return;if(v>LIM.OV)bmsTrip(sim,'Over-voltage',s,v.toFixed(3)+' V');if(v<LIM.UV&&I>1)bmsTrip(sim,'Under-voltage',s,v.toFixed(3)+' V under load');});
  const charging=I<-0.5;
  S.ntc.slice(0,7).forEach((n,i)=>{if(!tOK[i])return;if(n.val>LIM.OTd)bmsTrip(sim,'Over-temperature',n.grp,`${n.id} ${n.val.toFixed(1)} °C`);if(charging&&n.val>LIM.OTc)bmsTrip(sim,'Charge over-temperature',n.grp,`${n.id} ${n.val.toFixed(1)} °C`);});
  if(I>LIM.OCd)bmsTrip(sim,'Over-current',null,I.toFixed(1)+' A');
  if(-I>LIM.OCc)bmsTrip(sim,'Charge over-current',null,(-I).toFixed(1)+' A');
  // --- thermal event detection (gas, pressure, temperature rate) ---
  const tv=S.ntc.slice(0,7).map((n,i)=>tOK[i]?n.val:null);
  B.tBuf=B.tBuf||[];B.tBuf.push(tv);if(B.tBuf.length>11)B.tBuf.shift();
  const old=B.tBuf[0],span=(B.tBuf.length-1)*dt;
  if(B.tBuf.length>=11)tv.forEach((t,i)=>{B.rateT[i]=(t!=null&&old[i]!=null)?(t-old[i])/span:0;});
  const maxRate=Math.max(...B.rateT.slice(0,7));
  let lvl=0;
  const tmaxv=Math.max(...tv.filter(x=>x!=null));
  if(maxRate>0.05||tmaxv>55)lvl=1;
  if(S.env.gasKohm<60||S.h2.ppm>10||(maxRate>0.3&&tmaxv>60))lvl=Math.max(lvl,2);
  if(S.h2.ppm>LIM.gasH2||(S.env.P-101.325)>LIM.dP||(maxRate>1&&tmaxv>90))lvl=3;
  if(lvl>0){B.lvlHold=60;}else if(B.lvlHold>0){B.lvlHold-=dt;lvl=B.thermalLevel;}
  if(lvl>B.thermalLevel){const msg=['','Level 1: abnormal heating','Level 2: electrolyte off-gas detected in enclosure','Level 3: cell venting or thermal runaway, evacuate'][lvl];simLog(sim,lvl===3?'trip':'anomaly',null,msg);if(lvl>=2)bmsTrip(sim,'Thermal event',null,msg);}
  B.thermalLevel=lvl;
  // --- power limits ---
  const tmax=Math.max(...tv.filter(x=>x!=null));
  B.pLimit=VEH.Pmax*clampN((60-tmax)/10,0,1)*clampN(B.x[0]/0.1,0.2,1);
  B.iChargeAllow=tmax>LIM.OTc?0:(tmax<10?4:25);
  // --- SOC: EKF on pack-average group ECM; coulomb counting for comparison ---
  const use=vv.map((v,s)=>v!=null&&!B.alert[s]?v:null).filter(v=>v!=null);
  const a=Math.exp(-dt/B.tau);
  B.x[0]-=I*dt/3600/B.Cah;B.x[1]=B.x[1]*a+I*B.R1*(1-a);
  let [p00,p01,p10,p11]=B.P;p00+=1e-9*dt;p01*=a;p10*=a;p11=p11*a*a+1e-7*dt;
  if(use.length){
    const z=use.reduce((x,y)=>x+y,0)/use.length,h=ocvOf(B,B.x[0])-I*B.R0-B.x[1],H0=docvOf(B,B.x[0]),H1=-1,Rn=4e-5;
    const Sv=H0*H0*p00+H0*H1*(p01+p10)+H1*H1*p11+Rn,K0g=(p00*H0+p01*H1)/Sv,K1g=(p10*H0+p11*H1)/Sv,y=z-h;
    B.x[0]=clampN(B.x[0]+K0g*y,0,1);B.x[1]+=K1g*y;
    const n00=p00-K0g*(H0*p00+H1*p10),n01=p01-K0g*(H0*p01+H1*p11),n10=p10-K1g*(H0*p00+H1*p10),n11=p11-K1g*(H0*p01+H1*p11);p00=n00;p01=n01;p10=n10;p11=n11;
  }
  B.P=[p00,p01,p10,p11];
  B.cc=clampN(B.cc-I*dt/3600/B.Cah,0,1.05);
  // --- passive balancing at rest or end of charge ---
  const vmin=Math.min(...(use.length?use:[0]));  // 'use' already excludes groups flagged by the anomaly detector
  B.balancing=0;
  for(let s=0;s<NS;s++){const on=Math.abs(I)<2&&vv[s]!=null&&!B.alert[s]&&vv[s]>3.6&&vv[s]-vmin>0.008;sim.bleed[s]=on?0.06:0;if(on)B.balancing++;}
  // --- anomaly detector (residual stand-in for the trained model) ---
  const medV=median(use),medT=median(tv.filter(x=>x!=null)),load=Math.max(1,Math.abs(I));
  // slow self-discharge trend: deviation from pack median sampled at low current, slope over ~5 min
  B.devT=(B.devT||0)+dt;
  if(Math.abs(I)<3&&B.devT>=10){B.devT=0;B.devHist=B.devHist||[];B.devHist.push({t:sim.t,d:vv.map(v=>v==null?null:v-medV)});while(B.devHist.length&&sim.t-B.devHist[0].t>360)B.devHist.shift();}
  const slope=new Array(NS).fill(0);
  if(B.devHist&&B.devHist.length>=8){const H=B.devHist;for(let s=0;s<NS;s++){let n=0,sx=0,sy=0,sxx=0,sxy=0;for(const h of H){if(h.d[s]==null)continue;const x=(h.t-H[0].t)/60;n++;sx+=x;sy+=h.d[s];sxx+=x*x;sxy+=x*h.d[s];}if(n>=6){slope[s]=(n*sxy-sx*sy)/(n*sxx-sx*sx);}}}
  B.slope=slope;
  for(let s=0;s<NS;s++){
    let sc,kind;
    if(vv[s]==null){sc=1;kind='Sensor fault';}
    else{
      const ni=Math.round(s/2),tt=tv[ni];
      const zv=(vv[s]-medV)/(0.006+0.0003*load),zt=tt!=null?(tt-medT)/2.5:0,zr=(B.rateT[ni]||0)/0.05,zd=Math.min(0,slope[s])/0.00025;
      sc=1-Math.exp(-(zv*zv+zt*zt+zr*zr+zd*zd)/24);
      const m=Math.max(Math.abs(zv),Math.abs(zt),Math.abs(zr),Math.abs(zd));kind=m===Math.abs(zd)?'Self-discharge faster than the pack (possible internal short)':m===Math.abs(zv)?(zv<0?'Voltage low against the pack':'Voltage high against the pack'):'Abnormal heating near this group';
    }
    B.anomaly[s]=0.6*B.anomaly[s]+0.4*sc;
    if(B.anomaly[s]>0.6){B.over[s]++;B.calm[s]=0;}else{B.over[s]=0;if(B.anomaly[s]<0.4)B.calm[s]++;}
    if(!B.alert[s]&&B.over[s]>=4){B.alert[s]=true;B.alertKind[s]=kind;simLog(sim,'anomaly',s,`${kind} (score ${B.anomaly[s].toFixed(2)})`);}
    if(B.alert[s]&&B.calm[s]>=60){B.alert[s]=false;simLog(sim,'info',s,'Anomaly cleared');}
  }
  if(S.imu.peak>8&&!B.crashSeen){B.crashSeen=true;simLog(sim,'anomaly',null,`Shock of ${S.imu.peak.toFixed(1)} g recorded by IMU; inspect pack`);}
  // --- history and telemetry ---
  B.acc.h+=dt;B.acc.tl+=dt;
  const socT=cells.filter(c=>!c.dead).reduce((a,c)=>a+cellSOC(c),0)/Math.max(1,cells.filter(c=>!c.dead).length);
  if(B.acc.h>=2){B.acc.h=0;const H=B.hist,push=(k,v)=>{H[k].push(v);if(H[k].length>900)H[k].shift();};
    push('soc',socT*100);push('est',B.x[0]*100);push('cc',B.cc*100);push('I',I);push('v',sim.veh.v*3.6);push('vt',sim.veh.vt*3.6);
    push('tmax',Math.max(...cells.map(c=>c.Tc))-K0);push('anom',Math.max(...B.anomaly));push('gas',S.env.gasKohm);push('h2',S.h2.ppm);}
  if(B.acc.tl>=5){B.acc.tl=0;B.telCount++;B.telem.push({ts:sim.t,pack_v:S.stack.val,current_a:I,soc_est:B.x[0],t_max:tmax,h2_ppm:S.h2.ppm,anomaly_max:Math.max(...B.anomaly)});if(B.telem.length>300)B.telem.shift();}
  B.socTrue=socT;
}
function injectFault(sim,kind,k,ntcIdx){
  const c=sim.cells[k],s=c.s,name=cellName(c);let msg='';
  switch(kind){
    case 'isc_soft':c.Risc=5;msg=`Soft internal short (5 Ω) in cell ${name}`;break;
    case 'isc_hard':c.Risc=0.05;msg=`Hard internal short (50 mΩ) in cell ${name}`;break;
    case 'heater':c.heaterW=25;msg=`25 W external hot spot on cell ${name}`;break;
    case 'busbar':{const l=Math.min(s,NS-2);sim.linkExtra[l]=0.003;msg=`Loose busbar between groups ${l+1} and ${l+2} (+3 mΩ)`;break;}
    case 'weld':c.weldR=0.02;msg=`Cracked tab weld on cell ${name} (20 mΩ)`;break;
    case 'crash':sim.crashT=sim.t;sim.crashCell=k;msg=`Crash: 26 g side impact near cell ${name}`;break;
    case 'contactor':sim.welded=true;msg='Main contactor tips welded';break;
    case 'charger':sim.chargerFault=true;msg='Charger lost CV regulation (keeps pushing current)';break;
    case 'ntc_open':case 'ntc_short':case 'ntc_detached':{const n=sim.sensors.ntc[ntcIdx];n.fault=kind.slice(4);msg=`${n.id} ${kind.slice(4)}`;break;}
    case 'vsense':sim.sensors.cellV[s].fault='open';msg=`Voltage sense wire of group ${s+1} open`;break;
    case 'shunt':sim.sensors.shunt.drift=1.5;msg='Shunt amplifier offset drifted by +1.5 A';break;
    case 'hall':sim.sensors.hall.fault='dead';msg='Hall current sensor failed (reads 0 A)';break;
    case 'h2':sim.sensors.h2.fault='unplugged';msg='H₂ sensor unplugged';break;
  }
  simLog(sim,'inject',kind.startsWith('ntc')||['vsense','shunt','hall','h2','contactor','charger','busbar','crash'].includes(kind)?(kind==='vsense'?s:null):s,'Injected: '+msg);
}
function repairAll(sim){
  for(const c of sim.cells){if(!c.dead){c.Risc=Infinity;}c.heaterW=0;c.weldR=0.0005;}
  sim.linkExtra.fill(0);sim.welded=false;sim.chargerFault=false;
  const S=sim.sensors;S.ntc.forEach(n=>n.fault='ok');S.cellV.forEach(c=>{c.fault='ok';c.stuckV=null;});S.shunt.drift=0;S.hall.fault='ok';S.h2.fault='ok';
  simLog(sim,'inject',null,'All reversible faults repaired (damaged or vented cells stay damaged)');
}
function resetProtection(sim){
  const B=sim.bms,S=sim.sensors;
  const hot=S.ntc.slice(0,7).find(n=>n.val>50&&n.val<140);
  if(hot)return {ok:false,msg:`Contactor stays open: ${hot.id} reads ${hot.val.toFixed(1)} °C, must cool below 50 °C.`};
  if(B.thermalLevel>=2)return {ok:false,msg:'Contactor stays open: off-gas is still present in the enclosure.'};
  if(sim.cells.some(c=>c.vented))return {ok:false,msg:'Contactor stays open: a vented cell is in the pack. Replace the module first.'};
  const low=S.cellV.findIndex(c=>c.val>0.5&&c.val<2.9);
  if(low>=0&&sim.profile!=='charge'&&sim.profile!=='fast')return {ok:false,msg:`Contactor stays open: group ${low+1} is below 2.9 V. Switch to charging first.`};
  B.latched.clear();sim.cmdContactor=true;sim.chg.done=false;
  simLog(sim,'ble',null,'Technician reset protection; contactor closed');
  return {ok:true,msg:'Protection reset. Contactor closed.'};
}
function median(a){const b=a.slice().sort((x,y)=>x-y),n=b.length;if(!n)return 0;return n%2?b[(n-1)/2]:(b[n/2-1]+b[n/2])/2;}
if(typeof module!=='undefined')module.exports={injectFault,repairAll,resetProtection,createSim,stepSim,simLog,NS,NP,NC,K0,TH,AB,LIM,PROFILES,NTC_POS,FIT};
