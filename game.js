import * as THREE from './three.module.js';
const R=new THREE.WebGLRenderer({antialias:true});R.setSize(innerWidth,innerHeight);R.setPixelRatio(Math.min(devicePixelRatio,2));document.body.prepend(R.domElement);
const S=new THREE.Scene();S.background=new THREE.Color(0x88bbee);S.fog=new THREE.Fog(0x88bbee,800,5000);
const cam=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,1,8000);
S.add(new THREE.HemisphereLight(0xddeeff,0x445522,1));const sun=new THREE.DirectionalLight(0xffffff,1.2);sun.position.set(1,2,1);S.add(sun);
onresize=()=>{R.setSize(innerWidth,innerHeight);cam.aspect=innerWidth/innerHeight;cam.updateProjectionMatrix()};
// terrain
const H=(x,z)=>Math.sin(x*.002)*Math.cos(z*.0017)*180+Math.sin(x*.007+1)*Math.sin(z*.006)*60+Math.cos(x*.0005-z*.0004)*120;
const tg=new THREE.PlaneGeometry(12000,12000,200,200);tg.rotateX(-Math.PI/2);const cols=[];
const p=tg.attributes.position;for(let i=0;i<p.count;i++){const h=H(p.getX(i),p.getZ(i));p.setY(i,h);const c=h<-100?[.8,.75,.5]:h>200?[.9,.9,.95]:h>80?[.45,.4,.35]:[.25,.5,.2];cols.push(...c)}
tg.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));tg.computeVertexNormals();
S.add(new THREE.Mesh(tg,new THREE.MeshLambertMaterial({vertexColors:true})));
const water=new THREE.Mesh(new THREE.PlaneGeometry(12000,12000),new THREE.MeshLambertMaterial({color:0x2266aa,transparent:true,opacity:.8}));water.rotation.x=-Math.PI/2;water.position.y=-110;S.add(water);
for(let i=0;i<40;i++){const c=new THREE.Mesh(new THREE.SphereGeometry(60+Math.random()*80,8,6),new THREE.MeshLambertMaterial({color:0xffffff,transparent:true,opacity:.7}));c.scale.y=.4;c.position.set((Math.random()-.5)*8000,600+Math.random()*500,(Math.random()-.5)*8000);S.add(c)}
// jet model
function jet(col){const g=new THREE.Group(),m=new THREE.MeshLambertMaterial({color:col}),d=new THREE.MeshLambertMaterial({color:0x222222});
const b=new THREE.Mesh(new THREE.ConeGeometry(1.5,14,8),m);b.rotation.x=-Math.PI/2;g.add(b);
const w=new THREE.Mesh(new THREE.BoxGeometry(14,.3,4),m);w.position.z=1;g.add(w);
const t=new THREE.Mesh(new THREE.BoxGeometry(5,.3,2),m);t.position.z=6;g.add(t);
const f=new THREE.Mesh(new THREE.BoxGeometry(.3,3,2),m);f.position.set(0,1.5,6);g.add(f);
const ck=new THREE.Mesh(new THREE.SphereGeometry(.9,8,6),d);ck.position.set(0,.9,-2);ck.scale.z=2;g.add(ck);S.add(g);return g}
const keys={};onkeydown=e=>{keys[e.code]=1;if(e.code==='Space'||e.code.startsWith('Arrow'))e.preventDefault()};onkeyup=e=>keys[e.code]=0;
let mouse={x:0,y:0,l:0,r:0},touch={x:0,y:0,gun:0,msl:0,thr:0,brk:0},started=false;
addEventListener('mousemove',e=>{mouse.x=e.clientX/innerWidth*2-1;mouse.y=e.clientY/innerHeight*2-1});
addEventListener('mousedown',e=>{if(e.button==0)mouse.l=1;if(e.button==2)mouse.r=1});addEventListener('mouseup',e=>{if(e.button==0)mouse.l=0;if(e.button==2)mouse.r=0});
addEventListener('contextmenu',e=>e.preventDefault());
const st=document.getElementById('start');st.onclick=()=>{st.style.display='none';started=true};
if('ontouchstart' in window){['stick','bGun','bMsl','bThr','bBrk'].forEach(i=>document.getElementById(i).style.display='flex');
const sk=document.getElementById('stick');const mv=e=>{const t=e.targetTouches[0],r=sk.getBoundingClientRect();touch.x=Math.max(-1,Math.min(1,(t.clientX-r.left-65)/65));touch.y=Math.max(-1,Math.min(1,(t.clientY-r.top-65)/65));e.preventDefault()};
sk.addEventListener('touchstart',mv);sk.addEventListener('touchmove',mv);sk.addEventListener('touchend',()=>{touch.x=touch.y=0});
[['bGun','gun'],['bMsl','msl'],['bThr','thr'],['bBrk','brk']].forEach(([i,k])=>{const b=document.getElementById(i);b.addEventListener('touchstart',e=>{touch[k]=1;e.preventDefault()});b.addEventListener('touchend',()=>touch[k]=0)});
st.addEventListener('touchend',()=>{st.style.display='none';started=true})}
// entities
const player={m:jet(0x5577aa),speed:120,thr:.6,hp:100,ammo:500,msl:6,gunCd:0,mslCd:0,lock:null,lockT:0,alive:true,respawn:0};
let enemies=[],bullets=[],missiles=[],parts=[],score=0,wave=0;
const bulletGeo=new THREE.BoxGeometry(.3,.3,6),bMatP=new THREE.MeshBasicMaterial({color:0xffff66}),bMatE=new THREE.MeshBasicMaterial({color:0xff5533});
function resetPlayer(){player.m.position.set(0,500,0);player.m.quaternion.identity();player.hp=100;player.ammo=500;player.msl=6;player.speed=120;player.alive=true;player.m.visible=true}
resetPlayer();
function spawnWave(){wave++;for(let i=0;i<2+wave;i++){const e={m:jet(0xaa3333),hp:40,speed:110+Math.random()*30,gunCd:0,alive:true};
const a=Math.random()*6.28;e.m.position.set(player.m.position.x+Math.cos(a)*1500,400+Math.random()*400,player.m.position.z+Math.sin(a)*1500);enemies.push(e)}}
const fwd=o=>new THREE.Vector3(0,0,-1).applyQuaternion(o.quaternion);
function shoot(src,isP){const b=new THREE.Mesh(bulletGeo,isP?bMatP:bMatE);b.position.copy(src.m.position).add(fwd(src.m).multiplyScalar(10)).add(new THREE.Vector3((Math.random()-.5),(Math.random()-.5),0));
b.quaternion.copy(src.m.quaternion);b.userData={v:fwd(src.m).multiplyScalar(src.speed+700),life:2,p:isP};S.add(b);bullets.push(b)}
function boom(pos,n=40,c=0xff8822,s=1){for(let i=0;i<n;i++){const m=new THREE.Mesh(new THREE.SphereGeometry((1+Math.random()*2)*s,5,4),new THREE.MeshBasicMaterial({color:Math.random()<.3?0x333333:c,transparent:true}));
m.position.copy(pos);m.userData={v:new THREE.Vector3().randomDirection().multiplyScalar(Math.random()*60*s),life:1+Math.random()};S.add(m);parts.push(m)}}
function kill(e){e.alive=false;boom(e.m.position,60);S.remove(e.m);score+=100}
function damagePlayer(d){if(!player.alive)return;player.hp-=d;if(player.hp<=0){player.alive=false;player.m.visible=false;boom(player.m.position,80);player.respawn=3}}
const msg=document.getElementById('msg'),info=document.getElementById('info'),hpEl=document.getElementById('hp'),lockEl=document.getElementById('lock'),rc=document.getElementById('radar').getContext('2d');
const clk=new THREE.Clock();const tmpQ=new THREE.Quaternion(),ax=new THREE.Vector3();
function rot(o,axis,a){tmpQ.setFromAxisAngle(ax.copy(axis),a);o.quaternion.multiply(tmpQ)}
function steerTo(e,target,dt,rate){const to=target.clone().sub(e.m.position).normalize();const local=to.applyQuaternion(e.m.quaternion.clone().invert());
rot(e.m,new THREE.Vector3(1,0,0),THREE.MathUtils.clamp(local.y*3,-1,1)*rate*dt);rot(e.m,new THREE.Vector3(0,1,0),THREE.MathUtils.clamp(-local.x*3,-1,1)*rate*dt);
const up=new THREE.Vector3(0,1,0).applyQuaternion(e.m.quaternion),right=new THREE.Vector3(1,0,0).applyQuaternion(e.m.quaternion);rot(e.m,new THREE.Vector3(0,0,1),-right.y*dt*1.5);return local}
function loop(){requestAnimationFrame(loop);const dt=Math.min(clk.getDelta(),.05);if(!started){R.render(S,cam);cam.position.set(0,520,40);cam.lookAt(player.m.position);return}
const P=player.m;
if(player.alive){
 if(keys.KeyW||touch.thr)player.thr=Math.min(1,player.thr+dt*.5);if(keys.KeyS||touch.brk)player.thr=Math.max(0,player.thr-dt*.5);
 player.speed+=((60+player.thr*200)-player.speed)*dt;
 let pitch=(keys.ArrowDown?1:0)-(keys.ArrowUp?1:0),roll=(keys.ArrowLeft?1:0)-(keys.ArrowRight?1:0),yaw=(keys.KeyA?1:0)-(keys.KeyD?1:0);
 if(Math.abs(mouse.x)>.05)roll-=mouse.x*1.2;if(Math.abs(mouse.y)>.05)pitch+=mouse.y*1.2;pitch+=touch.y;roll-=touch.x;
 rot(P,new THREE.Vector3(1,0,0),-pitch*1.4*dt);rot(P,new THREE.Vector3(0,0,1),roll*2.5*dt);rot(P,new THREE.Vector3(0,1,0),yaw*.6*dt);
 P.position.add(fwd(P).multiplyScalar(player.speed*dt));
 if(P.position.y<H(P.position.x,P.position.z)+3||P.position.y<-108)damagePlayer(999);
 if(P.position.y>3000)P.position.y=3000;
 player.gunCd-=dt;if((mouse.l||keys.Space||touch.gun)&&player.gunCd<=0&&player.ammo>0){shoot(player,true);player.ammo--;player.gunCd=.06}
 // lock-on
 let best=null,bd=.97;for(const e of enemies){const to=e.m.position.clone().sub(P.position);const d=to.length();if(d>2500)continue;const dot=to.normalize().dot(fwd(P));if(dot>bd){bd=dot;best=e}}
 if(best&&best===player.lock)player.lockT+=dt;else{player.lock=best;player.lockT=0}
 player.mslCd-=dt;if((mouse.r||keys.KeyF||touch.msl)&&player.mslCd<=0&&player.msl>0){player.msl--;player.mslCd=1;
  const m=new THREE.Mesh(new THREE.CylinderGeometry(.3,.3,4,6),new THREE.MeshBasicMaterial({color:0xffffff}));m.position.copy(P.position).add(new THREE.Vector3(0,-2,0));m.quaternion.copy(P.quaternion);
  missiles.push({m,speed:player.speed+150,target:player.lockT>1?player.lock:null,life:8,p:true});S.add(m)}
} else {player.respawn-=dt;msg.textContent='SHOT DOWN — respawn in '+Math.ceil(player.respawn);if(player.respawn<=0){resetPlayer();msg.textContent=''}}
// enemies
if(enemies.filter(e=>e.alive).length===0){enemies=[];spawnWave();msg.textContent='WAVE '+wave;setTimeout(()=>{if(player.alive)msg.textContent=''},2000)}
for(const e of enemies){if(!e.alive)continue;const ground=H(e.m.position.x,e.m.position.z);let tgt=P.position.clone();
 if(e.m.position.y<ground+150)tgt=e.m.position.clone().add(new THREE.Vector3(0,400,0)).add(fwd(e.m).multiplyScalar(100));
 const loc=steerTo(e,tgt,dt,1.3);e.m.position.add(fwd(e.m).multiplyScalar(e.speed*dt));
 e.gunCd-=dt;const d=e.m.position.distanceTo(P.position);if(player.alive&&loc.z<-.97&&d<900&&e.gunCd<=0){shoot(e,false);e.gunCd=.15}
 if(Math.random()<dt*.05&&d<2000&&player.alive){const m=new THREE.Mesh(new THREE.CylinderGeometry(.3,.3,4,6),new THREE.MeshBasicMaterial({color:0xff4444}));m.position.copy(e.m.position);m.quaternion.copy(e.m.quaternion);missiles.push({m,speed:e.speed+120,target:player,life:6,p:false});S.add(m);msg.textContent='MISSILE INCOMING!';setTimeout(()=>{if(player.alive)msg.textContent=''},1500)}
 if(e.m.position.y<ground)kill(e)}
// bullets
for(let i=bullets.length-1;i>=0;i--){const b=bullets[i];b.position.addScaledVector(b.userData.v,dt);b.userData.life-=dt;let hit=false;
 if(b.userData.p){for(const e of enemies)if(e.alive&&e.m.position.distanceTo(b.position)<9){e.hp-=4;hit=true;boom(b.position,3,0xffff00,.3);if(e.hp<=0)kill(e);break}}
 else if(player.alive&&P.position.distanceTo(b.position)<8){damagePlayer(3);hit=true}
 if(hit||b.userData.life<0){S.remove(b);bullets.splice(i,1)}}
// missiles
for(let i=missiles.length-1;i>=0;i--){const m=missiles[i];m.life-=dt;const t=m.target;
 if(t&&(t.alive)){steerTo(m,t.m.position,dt,m.p?3:1.6)}
 m.m.position.add(fwd(m.m).multiplyScalar(m.speed*dt));m.speed=Math.min(m.speed+dt*100,500);
 if(Math.random()<.7)boom(m.m.position,1,0xcccccc,.4);let done=m.life<0;
 if(m.p){for(const e of enemies)if(e.alive&&e.m.position.distanceTo(m.m.position)<15){kill(e);done=true}}
 else if(player.alive&&P.position.distanceTo(m.m.position)<12){damagePlayer(45);boom(m.m.position,30);done=true}
 if(done){S.remove(m.m);missiles.splice(i,1)}}
for(let i=parts.length-1;i>=0;i--){const q=parts[i];q.position.addScaledVector(q.userData.v,dt);q.userData.life-=dt;q.material.opacity=Math.max(0,q.userData.life);if(q.userData.life<0){S.remove(q);q.geometry.dispose();parts.splice(i,1)}}
if(player.alive&&player.hp<100)player.hp=Math.min(100,player.hp+dt*1.5);
// camera
const off=new THREE.Vector3(0,6,26).applyQuaternion(P.quaternion).add(P.position);cam.position.lerp(off,Math.min(1,dt*6));
cam.quaternion.slerp(P.quaternion,Math.min(1,dt*5));
// HUD
const alt=Math.round(P.position.y-Math.max(-110,H(P.position.x,P.position.z)));
info.innerHTML=`SPD ${Math.round(player.speed*3.6)} km/h | THR ${Math.round(player.thr*100)}%<br>ALT ${alt} m<br>GUN ${player.ammo} | MSL ${player.msl}<br>SCORE ${score} | WAVE ${wave}`+(alt<80?'<br><span style="color:#f44">PULL UP!</span>':'');
hpEl.style.width=Math.max(0,player.hp)+'%';hpEl.style.background=player.hp>50?'#0f0':player.hp>25?'#ff0':'#f00';
if(player.lock&&player.alive){const v=player.lock.m.position.clone().project(cam);if(v.z<1){lockEl.style.display='block';lockEl.style.left=(v.x+1)/2*innerWidth+'px';lockEl.style.top=(1-v.y)/2*innerHeight+'px';lockEl.style.borderColor=player.lockT>1?'#f00':'#ff0';lockEl.textContent=player.lockT>1?'LOCK':''}else lockEl.style.display='none'}else lockEl.style.display='none';
rc.clearRect(0,0,150,150);rc.fillStyle='#0f0';rc.fillRect(73,73,4,4);const hd=Math.atan2(fwd(P).x,-fwd(P).z);
for(const e of enemies){if(!e.alive)continue;const dx=e.m.position.x-P.position.x,dz=e.m.position.z-P.position.z;const c=Math.cos(-hd),s=Math.sin(-hd);let rx=(dx*c-dz*s)/30,ry=(dx*s+dz*c)/30;const l=Math.hypot(rx,ry);if(l>70){rx*=70/l;ry*=70/l}
 rc.fillStyle='#f33';rc.fillRect(75+rx-2,75+ry-2,5,5)}
for(const m of missiles)if(!m.p){const dx=m.m.position.x-P.position.x,dz=m.m.position.z-P.position.z;const c=Math.cos(-hd),s=Math.sin(-hd);rc.fillStyle='#ff0';rc.fillRect(75+(dx*c-dz*s)/30,75+(dx*s+dz*c)/30,3,3)}
R.render(S,cam)}
loop();window.__ok=true;
