(function(){
'use strict';
const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const ui={playing:true,speed:60,mode:'temp',sel:6*NP+3,tab:'overview',interacted:false,showTags:true,actual:60};
let sim,session=null;
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const fmtTime=t=>{t=Math.floor(t);return [Math.floor(t/3600),Math.floor(t/60)%60,t%60].map(x=>String(x).padStart(2,'0')).join(':');};
const css=v=>getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const C=k=>k-K0;

function restart(){
  const prof=sim?sim.profile:'wmtc1';
  sim=createSim(7,+$('#amb').value,+$('#soc0').value);sim.profile=prof;
  session=null;renderSession();bleFx.idle();hsRender([]);
  simLog(sim,'info',null,`Simulation started: ${NS}S${NP}P LG M50 pack near ${Math.round(+$('#soc0').value*100)} % SOC at ${$('#amb').value} °C; ${PROFILES[prof]}`);
  resetSmoke();
}

/* ---------------- BLE ---------------- */
const enc=new TextEncoder();
const rand=n=>crypto.getRandomValues(new Uint8Array(n));
const hex=b=>Array.from(b).map(x=>x.toString(16).padStart(2,'0')).join('');
const shortHex=h=>h.slice(0,10)+'…'+h.slice(-6);
const cat=(a,b)=>{const c=new Uint8Array(a.length+b.length);c.set(a);c.set(b,a.length);return c;};
function safeEq(a,b){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a[i]^b[i];return d===0;}
async function hmac(key,data){const k=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',k,data));}
const devices=[
  {id:'rider-phone',name:"Rider's phone",note:'Registered key, owner role',key:rand(32)},
  {id:'service-tool',name:'Service tool',note:'Registered key, technician role',key:rand(32)},
  {id:'unknown-phone',name:'Unregistered phone',note:'Has a key, but not one the Pi knows',key:rand(32)},
  {id:'replay',name:'Replay attacker',note:"Resends a sniffed response from the rider's phone",claims:'rider-phone'}];
const registry={'rider-phone':{key:devices[0].key,role:'owner'},'service-tool':{key:devices[1].key,role:'technician'}};
let captured=null,bleBusy=false;const fails={},lockUntil={};const wait=ms=>new Promise(r=>setTimeout(r,ms));
function renderDevices(){$('#devices').innerHTML=devices.map((d,i)=>`<li><strong>${d.name}</strong><span>${d.note}</span><button data-dev="${i}" ${bleBusy?'disabled':''}>Connect</button></li>`).join('');}
function hsRender(steps){$('#handshake').innerHTML=steps.length?steps.map(s=>`<li class="${s.c||''}">${s.t}</li>`).join(''):'<li class="muted" style="list-style:none;margin-left:-20px">Connect a device to watch the challenge and response.</li>';}
async function connect(dev){
  if(bleBusy)return;bleBusy=true;renderDevices();
  const steps=[],push=(t,c)=>{steps.push({t,c});hsRender(steps);};const claimed=dev.claims||dev.id;
  bleFx.start();push(`${dev.name} asks to open a session as <span class="code">${claimed}</span>.`);await wait(450);
  const now=performance.now();
  if(lockUntil[claimed]>now){push(`Rejected: <span class="code">${claimed}</span> is locked for another ${Math.ceil((lockUntil[claimed]-now)/1000)} s after three failed attempts.`,'bad');bleFx.end(false);bleBusy=false;renderDevices();return;}
  const nonce=rand(16);push(`Edge node sends a fresh 16-byte challenge: <span class="code">${shortHex(hex(nonce))}</span>`);await wait(450);
  let mac;
  if(dev.claims){if(!captured){push("Nothing captured yet. Connect the rider's phone first so there is traffic to replay.",'bad');bleFx.end(false);bleBusy=false;renderDevices();return;}
    mac=captured.mac;push(`Attacker resends the response it sniffed earlier: <span class="code">${shortHex(hex(mac))}</span>`);}
  else{mac=await hmac(dev.key,cat(nonce,enc.encode(claimed)));push(`Device returns HMAC-SHA256(key, challenge + ID): <span class="code">${shortHex(hex(mac))}</span>`);}
  await wait(450);
  const reg=registry[claimed];let ok=false,reason='';
  if(!reg)reason='no key is registered for this device ID';
  else{const expect=await hmac(reg.key,cat(nonce,enc.encode(claimed)));ok=safeEq(expect,mac);if(!ok)reason=dev.claims?'the response was computed for an old challenge':'the signature does not match the registered key';}
  if(ok){fails[claimed]=0;if(claimed==='rider-phone')captured={mac};session={dev,role:reg.role};push(`Accepted. Session open with ${reg.role} permissions.`,'ok');simLog(sim,'ble',null,`${dev.name} authenticated (${reg.role})`);}
  else{fails[claimed]=(fails[claimed]||0)+1;push(`Rejected: ${reason}. Attempt ${fails[claimed]} of 3.`,'bad');simLog(sim,'ble',null,`${dev.name} rejected: ${reason}`);
    if(fails[claimed]>=3){lockUntil[claimed]=performance.now()+30000;fails[claimed]=0;push(`<span class="code">${claimed}</span> locked for 30 s.`,'bad');simLog(sim,'ble',null,`${claimed} locked for 30 s`);}}
  bleFx.end(ok);bleBusy=false;renderDevices();renderSession();
}
function renderSession(){
  const el=$('#session');
  if(!session){el.className='session';el.innerHTML='<p class="muted">No device connected.</p>';return;}
  const tech=session.role==='technician';el.className='session live';
  el.innerHTML=`<p><strong>${session.dev.name}</strong> connected as ${session.role}.</p>
    <p class="muted" style="font-size:13px">${tech?'Can read telemetry and alerts, export logs and reset protection.':'Can read live telemetry and alerts. Cannot change pack state.'}</p>
    <div class="phone-view"><div><small>SOC</small><b class="num" id="pvSoc">–</b></div><div><small>Range left</small><b class="num" id="pvR">–</b></div><div><small>Alerts</small><b class="num" id="pvA">–</b></div></div>
    <div class="row"><button id="resetProt" ${tech?'':'disabled'}>Reset protection</button><button id="disconnect">Disconnect</button></div>
    ${tech?'':'<p class="muted" style="font-size:13px;margin-top:6px">Reset protection needs the technician role.</p>'}<p class="msg" id="sessMsg"></p>`;
  $('#disconnect').onclick=()=>{simLog(sim,'ble',null,`${session.dev.name} disconnected`);session=null;bleFx.idle();renderSession();};
  $('#resetProt').onclick=()=>{if(!session||session.role!=='technician')return;const r=resetProtection(sim);const m=$('#sessMsg');m.textContent=r.msg;m.className='msg '+(r.ok?'ok':'bad');if(!r.ok)simLog(sim,'ble',null,'Reset refused: '+r.msg);};
}

/* ---------------- colours ---------------- */
const RAMPS={soc:[[0,'#E5484D'],[0.2,'#F2B134'],[0.5,'#3FB8A8'],[1,'#3A7BD5']],temp:[[0,'#3A7BD5'],[0.35,'#3FB8A8'],[0.6,'#F2B134'],[1,'#E5484D']],
  cur:[[0,'#3FB8A8'],[0.33,'#62748F'],[0.66,'#F2B134'],[1,'#E5484D']],anomaly:[[0,'#62748F'],[0.6,'#F2B134'],[1,'#E5484D']]};
const MODES={
  temp:{ramp:'temp',min:'20 °C',max:'90 °C',x:c=>(C(c.Tc)-20)/70},
  soc:{ramp:'soc',min:'0 %',max:'100 %',x:c=>cellSOC(c)},
  current:{ramp:'cur',min:'−3 A',max:'9 A',x:c=>(c.Ie+3)/12},
  voltage:{ramp:'soc',min:'3.0 V',max:'4.2 V',x:c=>(sim.sensors.cellV[c.s].val-3)/1.2},
  anomaly:{ramp:'anomaly',min:'0',max:'1',x:c=>sim.bms.anomaly[c.s]}};
const rampCache={};
function rampColor(name,x,out){const st=rampCache[name]||(rampCache[name]=RAMPS[name].map(([p,c])=>[p,new THREE.Color(c)]));x=clamp(x,0,1);
  for(let i=0;i<st.length-1;i++)if(x<=st[i+1][0])return out.copy(st[i][1]).lerp(st[i+1][1],(x-st[i][0])/(st[i+1][0]-st[i][0]));return out.copy(st[st.length-1][1]);}
function updateLegend(){const m=MODES[ui.mode];$('#legMin').textContent=m.min;$('#legMax').textContent=m.max;$('#legBar').style.background=`linear-gradient(90deg,${RAMPS[m.ramp].map(([p,c])=>`${c} ${p*100}%`).join(',')})`;}

/* ---------------- 3D ---------------- */
const stage=$('#stage'),canvas=$('#three');
let renderer,scene,camera,cellMeshes=[],cellMats=[],edgeMat,floorMat,wireParticles=[],curve,phoneScreen,rings=[],tags=[],smoke=[],ledMat,fan;
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const orbit={theta:0.72,phi:1.0,r:74,target:null};
const bleFx={state:'idle',t:0,result:null,start(){this.state='connecting';this.t=0;},end(ok){this.state='result';this.result=ok;this.t=0;},idle(){this.state='idle';}};
const SP=2.3,H=7;const cellPos=(s,p)=>new THREE.Vector3((s-(NS-1)/2)*SP,H/2,(p-(NP-1)/2)*SP);
function build3D(){
  orbit.target=new THREE.Vector3(6,3,0);
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(36,1,0.1,800);
  scene.add(new THREE.HemisphereLight(0xdfe8ff,0x1a2233,0.85));
  const dl=new THREE.DirectionalLight(0xffffff,0.75);dl.position.set(-30,50,30);scene.add(dl);
  const dl2=new THREE.DirectionalLight(0xffe2c8,0.25);dl2.position.set(40,15,-40);scene.add(dl2);
  const fc=document.createElement('canvas');fc.width=fc.height=256;const fx=fc.getContext('2d'),grd=fx.createRadialGradient(128,128,10,128,128,128);
  grd.addColorStop(0,'rgba(255,255,255,0.9)');grd.addColorStop(1,'rgba(255,255,255,0)');fx.fillStyle=grd;fx.fillRect(0,0,256,256);
  floorMat=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(fc),transparent:true,opacity:0.35,depthWrite:false});
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(130,80),floorMat);floor.rotation.x=-Math.PI/2;floor.position.set(6,-0.6,0);scene.add(floor);
  const W=NS*SP+3,D=NP*SP+3;
  const base=new THREE.Mesh(new THREE.BoxGeometry(W,0.6,D),new THREE.MeshStandardMaterial({color:0x2a3346,roughness:0.8}));base.position.y=-0.3;scene.add(base);
  const cellGeo=new THREE.CylinderGeometry(1.06,1.06,H,26),capGeo=new THREE.CylinderGeometry(0.62,0.62,0.14,20);
  const capMat=new THREE.MeshStandardMaterial({color:0xc9ced6,metalness:0.8,roughness:0.3});
  const nickel=new THREE.MeshStandardMaterial({color:0xb9bfc7,metalness:0.7,roughness:0.35});
  for(let s=0;s<NS;s++){
    for(let p=0;p<NP;p++){
      const mat=new THREE.MeshStandardMaterial({color:0x3a7bd5,roughness:0.45,metalness:0.1,emissive:0x000000});cellMats.push(mat);
      const m=new THREE.Mesh(cellGeo,mat);m.position.copy(cellPos(s,p));m.userData.k=s*NP+p;scene.add(m);cellMeshes.push(m);
      const c=new THREE.Mesh(capGeo,capMat);c.position.copy(cellPos(s,p));c.position.y=H+0.07;scene.add(c);
    }
    const x=(s-(NS-1)/2)*SP;
    const strip=new THREE.Mesh(new THREE.BoxGeometry(1.1,0.08,NP*SP),nickel);strip.position.set(x,H+0.2,0);scene.add(strip);
    const bot=strip.clone();bot.position.y=-0.02;scene.add(bot);
    if(s<NS-1){const link=new THREE.Mesh(new THREE.BoxGeometry(SP,0.08,1.4),nickel);link.position.set(x+SP/2,s%2===0?H+0.22:0,(s%2===0?1:-1)*(NP*SP/2-0.6));scene.add(link);}
  }
  const encGeo=new THREE.BoxGeometry(W,H+3,D);
  const encF=new THREE.Mesh(encGeo,new THREE.MeshBasicMaterial({color:0x8fa3c4,transparent:true,opacity:0.04,depthWrite:false}));encF.position.y=(H+3)/2-0.3;scene.add(encF);
  edgeMat=new THREE.LineBasicMaterial({color:0x8e9db8,transparent:true,opacity:0.5});
  const edges=new THREE.LineSegments(new THREE.EdgesGeometry(encGeo),edgeMat);edges.position.y=(H+3)/2-0.3;scene.add(edges);
  const xEnd=W/2, zF=-D/2;
  const green=new THREE.MeshStandardMaterial({color:0x1f6b47,roughness:0.6}),black=new THREE.MeshStandardMaterial({color:0x1b1e24,roughness:0.6});
  const metal=new THREE.MeshStandardMaterial({color:0xc8cdd4,metalness:0.8,roughness:0.3}),copper=new THREE.MeshStandardMaterial({color:0xc9844f,metalness:0.6,roughness:0.35});
  const add=(geo,mat,x,y,z,parent=scene)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);parent.add(m);return m;};
  // AFE board with IMU, standing at the +x end inside the enclosure
  add(new THREE.BoxGeometry(0.2,6,12),green,xEnd-0.6,4,0);
  add(new THREE.BoxGeometry(0.3,1.6,1.6),black,xEnd-0.8,5,-2);add(new THREE.BoxGeometry(0.3,0.6,0.6),black,xEnd-0.8,2.4,3.4);
  const shunt=add(new THREE.BoxGeometry(3.4,0.45,1.3),copper,xEnd-3,H+0.6,zF+1.4);
  const cont=add(new THREE.BoxGeometry(2.6,2.4,2.6),black,xEnd-3.2,H+1.4,-zF-2.2);
  add(new THREE.BoxGeometry(1.4,0.5,0.5),new THREE.MeshStandardMaterial({color:0x6b4a2b}),xEnd-6,H+0.5,-zF-2.2);
  const bme=add(new THREE.BoxGeometry(1.4,0.12,1.4),new THREE.MeshStandardMaterial({color:0x3b2e6e}),-2,H+2.4,-2);
  const h2s=add(new THREE.CylinderGeometry(0.8,0.8,0.8,20),metal,3,H+2.2,-2);
  // thermistor beads
  const bead=new THREE.SphereGeometry(0.34,12,12),beadMat=new THREE.MeshStandardMaterial({color:0x111111});
  NTC_POS.forEach(pp=>{const v=cellPos(pp.s,pp.p);add(bead,beadMat,v.x,H+0.4,v.z);});
  // Pi 5 outside
  const pi=new THREE.Group();pi.position.set(xEnd+11,0.6,0);scene.add(pi);
  add(new THREE.BoxGeometry(8.5,0.16,5.6),green,0,0,0,pi);add(new THREE.BoxGeometry(1.6,0.2,1.6),metal,-0.6,0.18,0.2,pi);
  fan=add(new THREE.CylinderGeometry(1.2,1.2,0.5,28),black,-0.6,0.62,0.2,pi);
  add(new THREE.BoxGeometry(1.7,1.5,1.3),metal,3.5,0.83,-1.6,pi);add(new THREE.BoxGeometry(1.7,1.5,1.3),metal,3.5,0.83,0.1,pi);add(new THREE.BoxGeometry(1.7,1.3,1.6),metal,3.5,0.73,1.9,pi);
  add(new THREE.BoxGeometry(5.1,0.5,0.5),black,-0.6,0.33,-2.45,pi);
  ledMat=new THREE.MeshBasicMaterial({color:0x3fb8a8});add(new THREE.SphereGeometry(0.12,10,10),ledMat,-3.9,0.2,2.5,pi);
  curve=new THREE.CatmullRomCurve3([new THREE.Vector3(xEnd-0.4,6,-3),new THREE.Vector3(xEnd+3,8.5,-2.5),new THREE.Vector3(xEnd+8,4,-2.2),new THREE.Vector3(pi.position.x-0.6,1.3,-2.0)]);
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve,64,0.14,8,false),new THREE.MeshStandardMaterial({color:0x5b92e0,roughness:0.5})));
  const pg=new THREE.SphereGeometry(0.22,12,12);for(let i=0;i<7;i++){const m=new THREE.Mesh(pg,new THREE.MeshBasicMaterial({color:0xbfd8ff}));m.userData.u=i/7;scene.add(m);wireParticles.push(m);}
  const phone=new THREE.Group();phone.position.set(xEnd+13,13,-13);phone.rotation.set(-0.25,-0.6,0);scene.add(phone);
  phone.add(new THREE.Mesh(new THREE.BoxGeometry(2.6,5.0,0.3),new THREE.MeshStandardMaterial({color:0x22262e,roughness:0.4,metalness:0.4})));
  phoneScreen=new THREE.Mesh(new THREE.PlaneGeometry(2.3,4.6),new THREE.MeshBasicMaterial({color:0x2a3346}));phoneScreen.position.z=0.16;phone.add(phoneScreen);
  const mid=new THREE.Vector3(xEnd+12,7,-6.5);
  for(let i=0;i<3;i++){const r=new THREE.Mesh(new THREE.TorusGeometry(1.2,0.06,8,48),new THREE.MeshBasicMaterial({color:0x5b92e0,transparent:true,opacity:0}));r.position.copy(mid);r.lookAt(phone.position);r.userData.o=i/3;scene.add(r);rings.push(r);}
  const T=(t,p,minor)=>{const el=document.createElement('div');el.className='tag3d'+(minor?' minor':'');el.textContent=t;$('#tags').appendChild(el);tags.push({el,p,minor});};
  T('13S8P pack, 104 × LG M50',new THREE.Vector3(-6,H+4.8,0));
  T('AFE + IMU',new THREE.Vector3(xEnd-0.6,7.6,4));T('Shunt',shunt.position.clone().add(new THREE.Vector3(0,0.9,0)),true);
  T('Contactor',cont.position.clone().add(new THREE.Vector3(0,1.8,0)),true);T('BME688',bme.position.clone().add(new THREE.Vector3(0,0.6,0)),true);
  T('H₂ sensor',h2s.position.clone().add(new THREE.Vector3(0,1,0)),true);
  NTC_POS.forEach((pp,i)=>{const v=cellPos(pp.s,pp.p);T('T'+(i+1),new THREE.Vector3(v.x,H+1.3,v.z),true);});
  T('Raspberry Pi 5 edge node',new THREE.Vector3(pi.position.x,3.2,0));T('Phone over BLE',new THREE.Vector3(phone.position.x,phone.position.y+3.2,phone.position.z));
  applyTheme();resize();new ResizeObserver(resize).observe(stage);setupOrbit();
}
function applyTheme(){if(!edgeMat)return;edgeMat.color.set(css('--muted')||'#8e9db8');floorMat.color.set(css('--grid')||'#9fb0c8');}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',applyTheme);
function resize(){const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;if(w<600)orbit.r=Math.max(orbit.r,95);camera.updateProjectionMatrix();}
function placeCamera(){const {theta,phi,r,target}=orbit;camera.position.set(target.x+r*Math.sin(phi)*Math.sin(theta),target.y+r*Math.cos(phi),target.z+r*Math.sin(phi)*Math.cos(theta));camera.lookAt(target);}
function setupOrbit(){
  const pts=new Map();let downPos=null,moved=false,pinch0=0,r0=0;const ray=new THREE.Raycaster(),ndc=new THREE.Vector2();
  const pick=e=>{const rc=canvas.getBoundingClientRect();ndc.set(((e.clientX-rc.left)/rc.width)*2-1,-((e.clientY-rc.top)/rc.height)*2+1);ray.setFromCamera(ndc,camera);const h=ray.intersectObjects(cellMeshes)[0];return h?h.object.userData.k:null;};
  canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);pts.set(e.pointerId,{x:e.clientX,y:e.clientY});downPos={x:e.clientX,y:e.clientY};moved=false;ui.interacted=true;if(pts.size===2){const [a,b]=[...pts.values()];pinch0=Math.hypot(a.x-b.x,a.y-b.y);r0=orbit.r;}});
  canvas.addEventListener('pointermove',e=>{
    if(!pts.has(e.pointerId)){canvas.classList.toggle('hovering',pick(e)!==null);return;}
    const p=pts.get(e.pointerId),dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;
    if(Math.hypot(e.clientX-downPos.x,e.clientY-downPos.y)>4)moved=true;
    if(pts.size===1){orbit.theta-=dx*0.006;orbit.phi=clamp(orbit.phi-dy*0.006,0.15,1.5);canvas.classList.add('dragging');}
    else if(pts.size===2){const [a,b]=[...pts.values()];const d=Math.hypot(a.x-b.x,a.y-b.y);if(pinch0)orbit.r=clamp(r0*pinch0/d,30,150);}
  });
  canvas.addEventListener('pointerup',e=>{if(pts.has(e.pointerId)&&!moved&&pts.size===1){const k=pick(e);if(k!=null){ui.sel=k;syncTargetSelects();}}pts.delete(e.pointerId);canvas.classList.remove('dragging');});
  canvas.addEventListener('pointercancel',e=>pts.delete(e.pointerId));
  canvas.addEventListener('wheel',e=>{e.preventDefault();ui.interacted=true;orbit.r=clamp(orbit.r*(1+e.deltaY*0.001),30,150);},{passive:false});
}
const smokeGeo=()=>new THREE.SphereGeometry(0.7,10,10);
function resetSmoke(){smoke.forEach(s=>s.parts.forEach(m=>scene&&scene.remove(m)));smoke=[];}
function ensureSmoke(c){
  if(smoke.find(s=>s.k===c.k))return;const parts=[];const v=cellPos(c.s,c.p);
  for(let i=0;i<10;i++){const m=new THREE.Mesh(smokeGeo(),new THREE.MeshBasicMaterial({color:0x9aa3ad,transparent:true,opacity:0.5,depthWrite:false}));m.userData.ph=i/10;m.position.set(v.x,H,v.z);scene.add(m);parts.push(m);}
  smoke.push({k:c.k,parts,base:v});
}
let tmpC,hotC;
function update3D(rdt){
  if(!renderer)return;
  if(!tmpC){tmpC=new THREE.Color();hotC=new THREE.Color('#ff5a1f');}
  if(!ui.interacted&&!reduceMotion)orbit.theta+=rdt*0.03;
  placeCamera();
  const m=MODES[ui.mode];
  for(const c of sim.cells){
    const mat=cellMats[c.k];
    if(c.dead&&ui.mode!=='temp')mat.color.set(0x2b2f36);else rampColor(m.ramp,m.x(c),mat.color);
    const heat=clamp((C(c.Ts)-90)/250,0,1);mat.emissive.copy(hotC).multiplyScalar(heat);
    if(ui.sel===c.k){tmpC.copy(mat.color).multiplyScalar(0.55);mat.emissive.add(tmpC);}
    if(c.vented)ensureSmoke(c);
  }
  const t=performance.now()/1000;
  smoke.forEach(sm=>{const c=sim.cells[sm.k];const act=c.tr?(sim.t-c.trT<400?1:0.3):0.5;sm.parts.forEach(p=>{const ph=(p.userData.ph+t*(c.tr?0.35:0.18))%1;p.position.set(sm.base.x+Math.sin(ph*9+sm.k)*ph*1.5,H+0.5+ph*9,sm.base.z+Math.cos(ph*7+sm.k)*ph*1.5);p.scale.setScalar(0.5+ph*2.2*act);p.material.opacity=(1-ph)*0.45*act;p.material.color.set(c.tr&&ph<0.25&&sim.t-c.trT<200?0xff8a3d:0x9aa3ad);});});
  wireParticles.forEach(p=>{if(ui.playing)p.userData.u=(p.userData.u+rdt*0.22)%1;p.position.copy(curve.getPointAt(p.userData.u));});
  if(ui.playing&&!reduceMotion)fan.rotation.y+=rdt*8;
  ledMat.color.set(sim.contactor&&sim.bms.thermalLevel===0?0x3fb8a8:(Math.floor(performance.now()/400)%2?0xe5484d:0x3a1414));
  bleFx.t+=rdt;const connecting=bleFx.state==='connecting',res=bleFx.state==='result'&&bleFx.t<1.8;
  rings.forEach(r=>{if(connecting||res){const ph=(r.userData.o+bleFx.t*0.9)%1;r.scale.setScalar(0.4+ph*2.4);r.material.opacity=(1-ph)*0.8;r.material.color.set(connecting?0x5b92e0:(bleFx.result?0x3fb8a8:0xe5484d));}else r.material.opacity=0;});
  phoneScreen.material.color.set(session?(session.role==='technician'?0xd08a55:0x3fb8a8):(res&&!bleFx.result?0x6b2226:0x2a3346));
  const w=stage.clientWidth,h=stage.clientHeight,v=new THREE.Vector3();
  tags.forEach(tg=>{v.copy(tg.p).project(camera);const vis=v.z<1&&ui.showTags&&!(tg.minor&&w<600);tg.el.style.display=vis?'':'none';if(vis){tg.el.style.left=((v.x+1)/2*w)+'px';tg.el.style.top=((1-v.y)/2*h)+'px';}});
}

/* ---------------- charts ---------------- */
function drawChart(cv,series,ymin,ymax,opts={}){
  const dpr=Math.min(2,devicePixelRatio||1),w=cv.clientWidth,h=cv.clientHeight;if(!w)return;
  if(cv.width!==Math.round(w*dpr)||cv.height!==Math.round(h*dpr)){cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);}
  const c=cv.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);
  const L=36,R=8,T=8,B=8,pw=w-L-R,ph=h-T-B,Y=v=>T+ph*(1-(v-ymin)/(ymax-ymin));
  c.font='11px Barlow, system-ui, sans-serif';c.fillStyle=css('--muted');c.strokeStyle=css('--line');c.lineWidth=1;
  (opts.ticks||[ymin,(ymin+ymax)/2,ymax]).forEach(t=>{const y=Math.round(Y(t))+0.5;c.beginPath();c.moveTo(L,y);c.lineTo(w-R,y);c.stroke();c.fillText(String(t),4,y+4);});
  if(opts.threshold!=null){c.setLineDash([4,4]);c.strokeStyle=css('--bad');c.beginPath();c.moveTo(L,Y(opts.threshold));c.lineTo(w-R,Y(opts.threshold));c.stroke();c.setLineDash([]);}
  const n=opts.n||900;
  series.forEach(s=>{const d=s.data;if(d.length<2)return;c.strokeStyle=s.color;c.lineWidth=s.w||1.7;c.setLineDash(s.dash||[]);c.beginPath();
    d.forEach((v,i)=>{const x=L+pw*(i+(n-d.length))/(n-1),y=Y(clamp(v,ymin,ymax));i?c.lineTo(x,y):c.moveTo(x,y);});c.stroke();c.setLineDash([]);});
}

/* ---------------- panels ---------------- */
const LVL=['Normal','Level 1: abnormal heating','Level 2: off-gas detected','Level 3: venting or thermal runaway'];
function banner(el,sub){const L=sim.bms.thermalLevel;el.className='banner'+(L?' l'+L:'');el.querySelector('strong').textContent=LVL[L];
  sub.textContent=sim.cmdContactor?(sim.welded?'Contactor welded':'Contactor closed'):(sim.welded?'Commanded open, but welded':'Contactor open, protection latched');}
function syncTargetSelects(){const c=sim.cells[ui.sel];$('#fGroup').value=c.s;$('#fCell').value=c.p;updateInspect();}
function updateInspect(){
  const c=sim.cells[ui.sel];if(!c)return;const B=sim.bms,S=sim.sensors;
  const flags=[];if(isFinite(c.Risc)&&!c.sepGone)flags.push(`short ${c.Risc<1?(c.Risc*1000).toFixed(0)+' mΩ':c.Risc.toFixed(1)+' Ω'}`);if(c.heaterW)flags.push('hot spot');if(c.weldR>0.001)flags.push('cracked weld');
  const st=c.tr?'Thermal runaway':c.vented?'Vented, disconnected':flags.length?flags.join(', '):'Healthy';
  const ntc=S.ntc.find(n=>n.cell===c.k);
  $('#inspect').innerHTML=`<h3>Cell ${c.s+1}.${c.p+1} <span class="muted" style="font-weight:400">group ${c.s+1}</span></h3><dl>
    <dt>Core / surface</dt><dd class="num">${C(c.Tc).toFixed(1)} / ${C(c.Ts).toFixed(1)} °C</dd>
    <dt>Cell current</dt><dd class="num">${c.dead?'0.00':c.Ie.toFixed(2)} A</dd>
    <dt>True SOC</dt><dd class="num">${(cellSOC(c)*100).toFixed(1)} %</dd>
    <dt>Group reading</dt><dd class="num">${S.cellV[c.s].val.toFixed(3)} V</dd>
    <dt>Thermistor</dt><dd>${ntc?ntc.id+' on this cell':'none on this cell'}</dd>
    <dt>Group anomaly</dt><dd class="num" style="color:${B.alert[c.s]?'var(--bad)':'inherit'}">${B.anomaly[c.s].toFixed(2)}</dd>
    <dt>Status</dt><dd>${st}</dd></dl>`;
}
const fmtI=I=>Math.abs(I)<0.2?'0.0<small>A</small>':`${Math.abs(I).toFixed(1)}<small>A ${I>0?'out':'in'}</small>`;
function stTd(ok,msg){return `<td class="${ok?'st-ok':'st-bad'}">${msg}</td>`;}
function updateUI(){
  const B=sim.bms,S=sim.sensors;
  $('#simTime').textContent=fmtTime(sim.t);$('#actualSpeed').textContent=Math.round(ui.actual)+'×';
  const chip=$('#contactorChip');chip.textContent=sim.contactor?(sim.cmdContactor?'Contactor closed':'Contactor welded shut'):'Contactor open';chip.classList.toggle('open',!sim.cmdContactor);
  const items=[];
  B.latched.forEach((v,k)=>items.push(`<li class="trip">${k}${v.grp!=null?` (group ${v.grp+1})`:''}: ${v.detail}. Contactor latched open.</li>`));
  B.sensorFault.forEach(msg=>items.push(`<li class="sensor">${msg}</li>`));
  for(let s=0;s<NS;s++)if(B.alert[s])items.push(`<li>Group ${s+1}: ${B.alertKind[s]} (score ${B.anomaly[s].toFixed(2)})</li>`);
  const badge=$('#faultBadge');badge.hidden=!items.length;badge.textContent=items.length;
  const H=B.hist;
  if(ui.tab==='overview'){
    banner($('#banner'),$('#bannerSub'));
    $('#mSpd').innerHTML=`${(sim.veh.v*3.6).toFixed(1)}<small>km/h</small>`;
    $('#mP').innerHTML=`${(S.stack.val*S.shunt.val/1000).toFixed(2)}<small>kW</small>`;
    $('#mV').innerHTML=`${S.stack.val.toFixed(2)}<small>V</small>`;$('#mI').innerHTML=fmtI(S.shunt.val);
    const okN=S.ntc.slice(0,7).filter(n=>n.val>-30&&n.val<140);const hn=okN.reduce((a,n)=>n.val>a.val?n:a,okN[0]||S.ntc[0]);
    $('#mT').innerHTML=`${hn.val.toFixed(1)}<small>°C, ${hn.id}</small>`;
    const hc=sim.cells.reduce((a,c)=>c.Tc>a.Tc?c:a);$('#mTc').innerHTML=`${C(hc.Tc).toFixed(1)}<small>°C, ${hc.s+1}.${hc.p+1}</small>`;
    sim.eUsed=sim.eUsed||0;const km=sim.veh.dist/1000;$('#mE').innerHTML=km>0.2?`${(sim.eWh/km).toFixed(1)}<small>Wh/km</small>`:'–';
    $('#mD').innerHTML=`${km.toFixed(2)}<small>km</small>`;
    drawChart($('#chartSpd'),[{data:H.vt,color:css('--muted'),w:2.2},{data:H.v,color:css('--accent')}],0,100,{ticks:[0,50,100]});
    drawChart($('#chartSoc'),[{data:H.soc,color:css('--muted'),w:2.4},{data:H.cc,color:css('--cobalt'),dash:[5,4]},{data:H.est,color:css('--accent')}],0,100,{ticks:[0,50,100]});
    drawChart($('#chartI'),[{data:H.I,color:css('--cobalt')}],-30,90,{ticks:[-30,0,30,60,90]});
    const st=B.socTrue*100,se=B.x[0]*100,sc=B.cc*100;
    $('#socErr').textContent=`Now: true ${st.toFixed(1)} %, EKF ${se.toFixed(1)} % (${(se-st>=0?'+':'')+(se-st).toFixed(1)} points), coulomb counting ${sc.toFixed(1)} % (${(sc-st>=0?'+':'')+(sc-st).toFixed(1)}).`;
  }
  if(ui.tab==='sensors'){
    $('#sV').innerHTML=S.cellV.map((c,s)=>{const ok=c.val>0.5&&c.val<4.8;return `<tr><td>${s+1}</td><td class="r num">${c.raw}</td><td class="r num truth">${sim.cells[s*NP].dead&&sim.cells.slice(s*NP,s*NP+NP).every(x=>x.dead)?'open':sim.cells[s*NP].Vg.toFixed(4)}</td><td class="r">${sim.bleed[s]?'60 mA':'–'}</td>${stTd(ok,ok?'OK':'Implausible')}</tr>`;}).join('');
    $('#sT').innerHTML=S.ntc.map(n=>{const ok=n.val>-30&&n.val<140;const truth=n.cell!=null?C(sim.cells[n.cell].Tc).toFixed(1):(n.node==='term'?C(sim.term).toFixed(1):C(sim.amb+3).toFixed(1));return `<tr><td>${n.id}</td><td>${n.where}</td><td class="r num">${n.counts}</td><td class="r num">${n.val.toFixed(1)}</td><td class="r num truth">${truth}</td>${stTd(ok,ok?(n.fault==='detached'?'OK (reads air)':'OK'):'Open or short')}</tr>`;}).join('');
    const rows=[
      ['Shunt 100 µΩ, AFE coulomb counter',`${S.shunt.raw} µV`,`${S.shunt.val.toFixed(2)} A`,sim.I.toFixed(2)+' A'],
      ['Hall-effect sensor, redundant',`${S.hall.raw} mV`,`${S.hall.val.toFixed(2)} A`,sim.I.toFixed(2)+' A'],
      ['Stack voltage (AFE)',`${S.stack.raw} ×10 mV`,`${S.stack.val.toFixed(2)} V`,sim.Vstack.toFixed(2)+' V'],
      ['PACK+ after contactor',`${S.plus.raw} ×10 mV`,`${S.plus.val.toFixed(2)} V`,sim.Vplus.toFixed(2)+' V'],
      ['Contactor auxiliary contact','–',S.aux.closed?'Closed':'Open',sim.contactor?'Closed':'Open']];
    $('#sI').innerHTML=rows.map(r=>`<tr><td>${r[0]}</td><td class="r num">${r[1]}</td><td class="r num">${r[2]}</td><td class="r num truth">${r[3]}</td></tr>`).join('');
    const e=[['BME688 temperature',`${S.env.T.toFixed(1)} °C`,'Enclosure air'],['BME688 humidity',`${S.env.RH.toFixed(0)} %RH`,'Condensation risk below dew point'],
      ['BME688 pressure',`${S.env.P.toFixed(2)} kPa`,`Gauge ${(S.env.P-101.325).toFixed(2)} kPa`],['BME688 gas resistance',`${S.env.gasKohm.toFixed(0)} kΩ`,'Falls when electrolyte vapour appears'],
      ['H₂ sensor',S.h2.fault==='unplugged'?'no signal':`${S.h2.ppm.toFixed(1)} ppm`,'Main vent-gas marker'],
      ['IMU longitudinal',`${S.imu.ax.toFixed(2)} g`,`Peak this second ${S.imu.peak.toFixed(1)} g`],['IMU vertical',`${S.imu.az.toFixed(2)} g`,'Road vibration grows with speed'],
      ['Motor controller speed (CAN)',`${(S.can.speed*3.6).toFixed(1)} km/h`,''],['Motor controller DC current (CAN)',`${(S.can.idc||0).toFixed(1)} A`,'Cross-check for the shunt']];
    $('#sE').innerHTML=e.map(r=>`<tr><td>${r[0]}</td><td class="r num">${r[1]}</td><td class="muted">${r[2]}</td></tr>`).join('');
  }
  if(ui.tab==='faults'){
    banner($('#banner2'),$('#bannerSub2'));
    $('#alerts').innerHTML=items.length?items.join(''):'<li class="empty">No alerts. All checks pass.</li>';
    if(!sim.cmdContactor&&!session)$('#alerts').insertAdjacentHTML('beforeend','<li class="trip">Connect the service tool in BLE access to reset protection.</li>');
    drawChart($('#chartA'),[{data:H.anom,color:css('--warn')}],0,1,{threshold:0.6,ticks:[0,0.5,1]});
    drawChart($('#chartG'),[{data:H.gas.map(x=>x/1.3),color:css('--cobalt')},{data:H.h2,color:css('--bad')}],0,100,{ticks:[0,50,100]});
  }
  if(session&&$('#pvSoc')){$('#pvSoc').textContent=(B.x[0]*100).toFixed(0)+'%';const whkm=sim.veh.dist>500?sim.eWh/(sim.veh.dist/1000):25;$('#pvR').textContent=Math.round(B.x[0]*CELL.Qnom*NP*47/whkm)+' km';$('#pvA').textContent=items.length;}
  if(ui.tab==='log'){
    $('#rowCounts').textContent=`Rows written: telemetry ${B.telCount}, events ${sim.evCount}.`;
    $('#evRows').innerHTML=sim.events.slice(-14).reverse().map(e=>`<tr><td class="num">${fmtTime(e.t)}</td><td class="lv-${e.level}">${e.level}</td><td>${e.grp!=null?e.grp+1:''}</td><td>${e.msg}</td></tr>`).join('');
    $('#telRows').innerHTML=B.telem.slice(-8).reverse().map(r=>`<tr class="num"><td>${r.ts.toFixed(0)}</td><td>${r.pack_v.toFixed(2)}</td><td>${r.current_a.toFixed(2)}</td><td>${r.soc_est.toFixed(3)}</td><td>${r.t_max.toFixed(1)}</td><td>${r.h2_ppm.toFixed(1)}</td><td>${r.anomaly_max.toFixed(2)}</td></tr>`).join('');
  }
  if(ui.tab==='model')drawModel();
  updateInspect();
}
function drawModel(){
  drawChart($('#chartVal'),[{data:VAL.dfn,color:css('--muted'),w:2.4},{data:VAL.model,color:css('--accent'),w:1.4}],3.4,4.1,{ticks:[3.4,3.75,4.1],n:VAL.dfn.length});
}
function fillStatic(){
  $('#profile').innerHTML=Object.entries(PROFILES).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');
  $('#fGroup').innerHTML=Array.from({length:NS},(_,i)=>`<option value="${i}">${i+1}</option>`).join('');
  $('#fCell').innerHTML=Array.from({length:NP},(_,i)=>`<option value="${i}">${i+1}</option>`).join('');
  $('#fNtc').innerHTML=sim.sensors.ntc.map((n,i)=>`<option value="${i}">${n.id}, ${n.where}</option>`).join('');
  const s=VAL.stats,row=(t,v)=>`<tr><td>${t}</td><td class="r num">${v[0].toFixed(1)} mV</td><td class="r num">${v[1].toFixed(1)} mV</td></tr>`;
  $('#valRows').innerHTML=[row('Particle solver vs PyBaMM SPM, 1C discharge',s.spm1C),row('Particle solver vs PyBaMM SPM, drive cycle',s.spmDrive),
    row('Full model vs DFN, pulse test (fitting set)',s.dfnHPPC),row('Full model vs DFN, 1C discharge (fitting set)',s.dfn1C),row('Full model vs DFN, 2C discharge (fitting set)',s.dfn2C),
    row('Full model vs DFN, drive cycle (held out)',s.dfnDrive),row('Plain SPM without fitted terms vs DFN, drive cycle',s.plainSpmDrive)].join('')+
    `<tr><td>Heat generation vs DFN thermal model, 1C</td><td class="r num">0.06 W</td><td class="r num">mean 0.84 vs 0.78 W</td></tr>`;
}

/* ---------------- wiring ---------------- */
function wire(){
  $('#play').onclick=()=>{ui.playing=!ui.playing;$('#play').textContent=ui.playing?'Pause':'Play';};
  $('#restart').onclick=restart;
  $$('#speedSeg button').forEach(b=>b.onclick=()=>{ui.speed=+b.dataset.speed;$$('#speedSeg button').forEach(x=>x.setAttribute('aria-pressed',x===b));});
  $$('.modes button').forEach(b=>b.onclick=()=>{ui.mode=b.dataset.mode;$$('.modes button').forEach(x=>x.setAttribute('aria-pressed',x===b));updateLegend();});
  $('#showTags').onchange=e=>{ui.showTags=e.target.checked;};
  $('#profile').onchange=e=>{sim.profile=e.target.value;sim.chg.done=false;simLog(sim,'info',null,'Duty cycle: '+PROFILES[sim.profile]);};
  $('#amb').oninput=e=>{sim.amb=+e.target.value+K0;$('#ambVal').textContent=e.target.value+' °C';};
  $('#fGroup').onchange=$('#fCell').onchange=()=>{ui.sel=+$('#fGroup').value*NP+ +$('#fCell').value;updateInspect();};
  $$('[data-fault]').forEach(b=>b.onclick=()=>{injectFault(sim,b.dataset.fault,ui.sel,+$('#fNtc').value);if(!ui.playing)$('#play').click();});
  $('#repair').onclick=()=>repairAll(sim);
  $('#devices').addEventListener('click',e=>{const b=e.target.closest('[data-dev]');if(b)connect(devices[+b.dataset.dev]);});
  $$('.tabs [role=tab]').forEach(b=>b.onclick=()=>{ui.tab=b.dataset.tab;$$('.tabs [role=tab]').forEach(x=>x.setAttribute('aria-selected',x===b));$$('.pane').forEach(p=>p.hidden=p.dataset.pane!==ui.tab);updateUI();});
}

/* ---------------- boot ---------------- */
restart();fillStatic();wire();renderDevices();updateLegend();syncTargetSelects();
let ok3D=true;
try{if(!window.THREE)throw new Error('three.js did not load');build3D();}
catch(err){ok3D=false;const f=document.createElement('div');f.className='fallback';f.textContent='The 3D view could not start in this browser ('+err.message+'). The simulation and dashboard still run.';stage.appendChild(f);}
let last=performance.now(),uiAcc=1,debt=0,speedAvg=60;
function frame(now){
  const rdt=Math.min(0.1,(now-last)/1000);last=now;
  if(ui.playing){
    debt=Math.min(debt+rdt*ui.speed,ui.speed*0.2);let n=0;const t0=performance.now();
    while(debt>=1&&performance.now()-t0<12){const P0=sim.I*sim.Vstack;stepSim(sim,1);sim.eWh=(sim.eWh||0)+Math.max(0,sim.veh.Pb)/3600;debt-=1;n++;}
    speedAvg=0.95*speedAvg+0.05*(rdt>0?n/rdt:0);ui.actual=Math.min(ui.speed,speedAvg);
  }
  if(ok3D){update3D(rdt);renderer.render(scene,camera);}
  uiAcc+=rdt;if(uiAcc>0.25){uiAcc=0;updateUI();}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})();
