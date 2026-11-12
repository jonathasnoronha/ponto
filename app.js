
window.__startApp=function(ctx){
const KEY='ponto-v1:'+ctx.viewUid;
const pad=n=>String(n).padStart(2,'0');
const DOW=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const DOWL=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const MES=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const SLOTS=['Entrada','Saída p/ almoço','Volta do almoço','Saída'];
const SLOTS2=['Entrada','Saída'];
/* dias com jornada de até 6h (ex.: sábado de 4h) começam sem intervalo; dá para trocar por dia */
function almPadrao(x){ const d=S.dias[x]||{}; const base=d.prev!=null?d.prev:S.config.prev[parseDs(x).getDay()]; return !(base>0&&base<=360); }
function temAlmoco(x){ const d=S.dias[x]||{}; if(d.m&&(d.m[2]||d.m[3])) return true; return d.alm!=null?d.alm:almPadrao(x); }
function chave(act,on){ return `<button class="switch-row" role="switch" aria-checked="${on}" data-act="${act}"><span>Intervalo de almoço<small>${on?'4 marcações':'trabalhou direto: todo o tempo conta'}</small></span><span class="switch" aria-hidden="true"></span></button>`; }
function slotsDe(x){ return temAlmoco(x)?SLOTS:SLOTS2; }
function trocaAlmoco(x){
  ensureReal(); const d=dia(x); const novo=!temAlmoco(x);
  if(!novo && (d.m[2]||d.m[3])){ d.m[1]=d.m[3]||d.m[2]||d.m[1]; d.m[2]=''; d.m[3]=''; }
  if(novo===almPadrao(x)) delete d.alm; else d.alm=novo;
  limpaDia(x); save();
}
const TIPOS={normal:'Dia normal',feriado:'Feriado',folga:'Folga',falta:'Falta',atestado:'Atestado',ferias:'Férias'};
const ds=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const parseDs=s=>{const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)};
const toMin=t=>{if(!t)return null;const[h,m]=t.split(':').map(Number);return isNaN(h)?null:h*60+m};
const toHM=min=>pad(Math.floor(min/60))+':'+pad(min%60);
const nowHM=()=>{const n=new Date();return pad(n.getHours())+':'+pad(n.getMinutes())};
const nowMin=()=>{const n=new Date();return n.getHours()*60+n.getMinutes()};
function fmt(min,sign){ if(min==null)return '—'; min=Math.round(min); const s=min<0?'−':(sign&&min>0?'+':''); const a=Math.abs(min); return s+Math.floor(a/60)+'h'+pad(a%60); }
const brl=v=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const ddmm=s=>s.slice(8)+'/'+s.slice(5,7);

const DEF={nome:ctx.nome||'',prev:[0,480,480,480,480,480,240],tol:10,pctHE:50,pctDF:100,salario:'',divisor:220,feriados:[]};

/* ---------- estado ---------- */
let storageOk=true;
function seed(){
  const S={config:JSON.parse(JSON.stringify(DEF)),dias:{},exemplo:true};
  const t=new Date(); const varia=[0,5,-3,12,0,25,-8,4,0,15];
  let k=0;
  for(let i=1;i<=12;i++){
    const d=new Date(t.getFullYear(),t.getMonth(),t.getDate()-i);
    const wd=d.getDay(); if(wd===0) continue;
    const v=varia[k++%varia.length];
    if(wd===6) S.dias[ds(d)]={m:['08:00','12:0'+(k%3),'','']};
    else S.dias[ds(d)]={m:['08:0'+(k%4),'12:00','14:00',toHM(18*60+v)]};
  }
  return S;
}
function load(){
  try{const r=localStorage.getItem(KEY); if(r){const S=JSON.parse(r); S.config=Object.assign({},DEF,S.config||{}); S.dias=S.dias||{}; return S;}}catch(e){}
  const z={config:JSON.parse(JSON.stringify(DEF)),dias:{},exemplo:false}; return z;
}
let S=load();
function save(){ try{localStorage.setItem(KEY,JSON.stringify(S)); storageOk=true;}catch(e){storageOk=false;}
  document.getElementById('storage-warn').hidden=storageOk||modo==='nuvem'; agendarSync(); }

/* ---------- nuvem ----------
   Cada mês é um documento, mas só os DIAS alterados são enviados (merge),
   então dois aparelhos abertos não apagam o que o outro lançou.
   Um dia alterado aqui fica "pendente" até a nuvem confirmar; enquanto isso,
   nada que chega da nuvem sobrescreve esse dia. */
let modo='local', db=null, podeEscrever=true, carregado=false;
const DIA_RE=/^\d{4}-\d{2}-\d{2}$/;
const VAZIO={m:['','','','']};
let base={}, baseCfg=null;          // último estado confirmado com a nuvem
const pend=new Set(); let cfgPend=false;
const mesesExistem=new Set();
let tSync=null, gravando=false, pendente=false;
const SYNC_TXT={local:'Só neste aparelho',carregando:'Conectando…',ok:'Salvo na nuvem',salvando:'Salvando…',erro:'Não salvou, tentando de novo…',offline:'Sem conexão',leitura:'Somente leitura'};
function status(s){ const el=document.getElementById('sync'); el.dataset.s=s; el.textContent=SYNC_TXT[s];
  const ro=s==='leitura'; document.body.classList.toggle('ro',ro); document.getElementById('ro-warn').hidden=!ro; }
const jd=d=>JSON.stringify(d&&((d.m||[]).some(Boolean)||d.tipo||d.prev!=null||d.alm!=null||d.obs)?d:VAZIO);
function marcarPendentes(){
  for(const x of new Set([...Object.keys(S.dias),...Object.keys(base)])){ if(!DIA_RE.test(x)) continue; if(jd(S.dias[x])!==jd(base[x])) pend.add(x); }
  if(JSON.stringify(S.config)!==baseCfg) cfgPend=true;
}
function agendarSync(){ if(modo!=='nuvem'||!carregado||!podeEscrever) return; marcarPendentes(); if(!pend.size&&!cfgPend) return; status('salvando'); clearTimeout(tSync); tSync=setTimeout(flush,600); }
async function flush(){
  tSync=null; if(gravando){ pendente=true; return; } gravando=true;
  try{
    const grupos={}; pend.forEach(x=>{ (grupos[x.slice(0,7)]=grupos[x.slice(0,7)]||[]).push(x); });
    for(const k in grupos){
      const dias={}; const env={};
      grupos[k].forEach(x=>{ const v=JSON.parse(jd(S.dias[x])); dias[x]=v; env[x]=JSON.stringify(v); });
      const ref=db.collection('meses').doc(k);
      let feito=false;
      if(mesesExistem.has(k)){ try{ await ref.update({dias}); feito=true; }catch(e){ if(!e||e.code!=='invalid_argument') throw e; } }
      if(!feito){ const todo={}; for(const x in base) if(x.slice(0,7)===k) todo[x]=base[x]; Object.assign(todo,dias); await ref.set({dias:todo}); mesesExistem.add(k); }
      grupos[k].forEach(x=>{ base[x]=JSON.parse(env[x]); if(jd(S.dias[x])===env[x]) pend.delete(x); });
    }
    if(cfgPend){ const cj=JSON.stringify(S.config); await db.doc('ponto/config').set({config:S.config}); baseCfg=cj; if(JSON.stringify(S.config)===cj) cfgPend=false; }
    status(pend.size||cfgPend?'salvando':'ok');
  }catch(e){
    const c=e&&e.code;
    if(c==='invalid_argument'||c==='not_granted'){ podeEscrever=false; status('leitura'); toast('Não foi possível salvar: esta conta não tem permissão para editar.'); }
    else { status('erro'); if(c==='quota_exceeded') toast('O espaço na nuvem acabou. Os registros continuam neste aparelho.'); else setTimeout(agendarSync,4000); }
  }
  gravando=false; if(pendente||pend.size||cfgPend){ pendente=false; if(pend.size||cfgPend) tSync=setTimeout(flush,300); }
}
function aplicarRemoto(docs){
  let mudou=false;
  docs.forEach(({k,dias})=>{
    if(!/^\d{4}-\d{2}$/.test(k)) return;
    mesesExistem.add(k);
    for(const x in dias){
      if(!DIA_RE.test(x)) continue;
      const j=jd(dias[x]); base[x]=JSON.parse(j);
      if(pend.has(x)) continue;
      if(jd(S.dias[x])!==j){ if(j===JSON.stringify(VAZIO)) delete S.dias[x]; else S.dias[x]=JSON.parse(j); mudou=true; }
    }
  });
  return mudou;
}
async function conectar(){
  const d=ctx.db;
  db=d; modo='nuvem'; status('carregando'); document.getElementById('storage-warn').hidden=true;
  let cfgPronto=false, mesPronto=false, cfgRemota=null, mesesRemotos=null;
  const timer=setTimeout(()=>{ if(!carregado) status('offline'); },10000);
  function inicial(){
    if(!cfgPronto||!mesPronto||carregado) return;
    clearTimeout(timer);
    const temNuvem=cfgRemota||mesesRemotos.some(m=>Object.keys(m.dias).length);
    if(temNuvem){
      if(cfgRemota){ S.config=Object.assign({},DEF,cfgRemota); }
      S.dias={}; S.exemplo=false;
    } else if(S.exemplo){ S.dias={}; S.exemplo=false; }
    baseCfg=JSON.stringify(S.config); base={};
    aplicarRemoto(mesesRemotos);
    carregado=true;
    status(podeEscrever?'ok':'leitura');
    save(); render();
  }
  db.doc('ponto/config').onSnapshot(snap=>{
    if(snap.metadata.fromCache && !carregado && !snap.exists) return;
    const c=snap.exists?(snap.data()||{}).config:null;
    if(!carregado){ cfgRemota=c||null; cfgPronto=true; inicial(); return; }
    if(!c) return; const j=JSON.stringify(Object.assign({},DEF,c)); baseCfg=j;
    if(!cfgPend && j!==JSON.stringify(S.config)){ S.config=JSON.parse(j); try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){} if(!edX) render(); }
  },()=>{ clearTimeout(timer); if(!carregado) status('offline'); });
  db.collection('meses').onSnapshot(snap=>{
    if(snap.metadata.fromCache && !carregado && !snap.docs.length) return;
    const docs=snap.docs.map(d=>({k:d.id,dias:(d.data()||{}).dias||{}}));
    if(!carregado){ mesesRemotos=docs; mesPronto=true; inicial(); return; }
    if(aplicarRemoto(docs)){ try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){} if(!edX) render(); }
  },()=>{ clearTimeout(timer); if(!carregado) status('offline'); });
}
function inicio(){ let m=null; for(const x in S.dias){ const d=S.dias[x]; if((d.m||[]).some(Boolean)||d.tipo) { if(!m||x<m) m=x; } } return m; }
function ensureReal(){ if(S.exemplo){ S.dias={}; S.exemplo=false; } }
function dia(x){ if(!DIA_RE.test(x)) return {m:['','','',''],alm:null}; if(!S.dias[x]) S.dias[x]={m:['','','','']}; if(!S.dias[x].m) S.dias[x].m=['','','','']; return S.dias[x]; }
function limpaDia(x){ const d=S.dias[x]; if(d && !d.tipo && d.prev==null && d.alm==null && !d.obs && !(d.m||[]).some(Boolean)) delete S.dias[x]; }

/* ---------- feriados ---------- */
const ferCache={};
function pascoa(y){const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mo=Math.floor((h+l-7*m+114)/31),da=((h+l-7*m+114)%31)+1;return new Date(y,mo-1,da);}
function feriados(y){
  const key=y+'|'+JSON.stringify(S.config.feriados); if(ferCache[key]) return ferCache[key];
  const F={}; const fx=[['01-01','Confraternização Universal'],['04-21','Tiradentes'],['05-01','Dia do Trabalho'],['09-07','Independência'],['10-12','N. Sra. Aparecida'],['11-02','Finados'],['11-15','Proclamação da República'],['11-20','Consciência Negra'],['12-25','Natal']];
  fx.forEach(([md,n])=>F[y+'-'+md]=n);
  const p=pascoa(y); const sx=new Date(p); sx.setDate(p.getDate()-2); F[ds(sx)]='Sexta-feira Santa';
  (S.config.feriados||[]).forEach(f=>{F[y+'-'+f.md]=f.nome});
  return (ferCache[key]=F);
}

/* ---------- cálculo ---------- */
function pares(m){
  let tot=0,ok=true,any=false,open=null;
  for(let i=0;i<4;i+=2){
    const a=toMin(m[i]),b=toMin(m[i+1]);
    if(a!=null&&b!=null){let d=b-a;if(d<0)d+=1440;tot+=d;any=true;}
    else if(a!=null||b!=null){ok=false; if(a!=null) open=a;}
  }
  return {tot,ok,any,open};
}
function info(x){
  const d=S.dias[x]||{}; const dt=parseDs(x), wd=dt.getDay();
  const fer=feriados(dt.getFullYear())[x]||null;
  const tipo=d.tipo||(fer?'feriado':'normal');
  const base=d.prev!=null?d.prev:S.config.prev[wd];
  const m=d.m||[]; const p=pares(m);
  const hoje=ds(new Date());
  const r={x,dt,wd,fer,tipo,base,m,obs:d.obs||'',trab:0,prev:0,he50:0,he100:0,deb:0,status:'ok',conta:false,p};
  if(tipo==='falta'){ r.prev=base; r.deb=base; r.conta=true; r.status='falta'; }
  else if(tipo!=='normal'){
    r.status='abonado';
    if(p.any){
      if(!p.ok){ r.status=x===hoje?'andamento':'incompleto'; }
      else { r.trab=p.tot; r.conta=true; if(tipo==='feriado'||wd===0) r.he100=p.tot; else r.he50=p.tot; r.status='ok'; }
    } else r.conta=true;
  } else {
    if(!p.any && p.ok){
      if(base===0){ r.status='descanso'; r.conta=true; }
      else { r.status = x>hoje?'futuro':(x===hoje?'hoje':'vazio'); if(r.status==='vazio'){ const ini=inicio(); if(!ini||x<ini) r.status='antes'; } }
    } else if(!p.ok){ r.status=x===hoje?'andamento':'incompleto'; r.trab=p.tot; }
    else {
      r.conta=true; r.trab=p.tot; r.prev=base;
      if(base===0){ if(wd===0) r.he100=p.tot; else r.he50=p.tot; }
      else { let diff=p.tot-base; if(Math.abs(diff)<=S.config.tol) diff=0; if(diff>0) r.he50=diff; else r.deb=-diff; }
    }
  }
  r.saldo=r.he50+r.he100-r.deb;
  return r;
}
function soma(lista){
  const t={trab:0,prev:0,he50:0,he100:0,deb:0,saldo:0,vazio:0,incompleto:0,dias:0};
  lista.forEach(r=>{ if(r.conta){ t.trab+=r.trab; t.prev+=r.prev; t.he50+=r.he50; t.he100+=r.he100; t.deb+=r.deb; t.saldo+=r.saldo; if(r.trab>0) t.dias++; }
    if(r.status==='vazio') t.vazio++; if(r.status==='incompleto') t.incompleto++; });
  return t;
}
function mesInfo(y,mo){
  const n=new Date(y,mo+1,0).getDate(); const dias=[];
  for(let d=1;d<=n;d++) dias.push(info(ds(new Date(y,mo,d))));
  const semanas=[]; let cur=null;
  dias.forEach(r=>{ if(!cur || r.wd===1){ cur={dias:[]}; semanas.push(cur);} cur.dias.push(r); });
  semanas.forEach(s=>{ s.t=soma(s.dias); s.ini=s.dias[0].x; s.fim=s.dias[s.dias.length-1].x; });
  return {dias,semanas,t:soma(dias)};
}
function chipSaldo(v){ if(!v) return '<span class="chip zero">0h00</span>'; return `<span class="chip ${v>0?'pos':'neg'}">${fmt(v,true)}</span>`; }
function dinheiro(t){
  const sal=parseFloat(String(S.config.salario).replace(/\./g,'').replace(',','.'));
  if(!(sal>0)) return null;
  const vh=sal/(S.config.divisor||220);
  const he50=t.he50/60*vh*(1+S.config.pctHE/100), he100=t.he100/60*vh*(1+S.config.pctDF/100), deb=t.deb/60*vh;
  return {vh,he50,he100,deb,liq:he50+he100-deb};
}

/* ---------- UI util ---------- */
let tab='hoje'; const t0=new Date(); let vy=t0.getFullYear(), vm=t0.getMonth();
let toastT;
function toast(msg){ const el=document.getElementById('toast'); el.textContent=msg; el.hidden=false; clearTimeout(toastT); toastT=setTimeout(()=>el.hidden=true,2200); }
function copiar(txt,ok){
  const fallback=()=>{ abrirTexto(txt); };
  try{ navigator.clipboard.writeText(txt).then(()=>toast(ok),fallback); }catch(e){ fallback(); }
}
function abrirTexto(txt){
  const b=document.getElementById('ed-body');
  b.innerHTML=`<h3>Copie o texto</h3><p class="small muted">Toque no texto, selecione tudo e copie.</p><textarea id="cp-txt" rows="12" readonly></textarea><button class="btn primary" id="cp-ok">Fechar</button>`;
  const ta=b.querySelector('#cp-txt'); ta.value=txt; b.querySelector('#cp-ok').onclick=()=>edDlg.close();
  edDlg.showModal(); ta.focus(); ta.select();
}
function bannerExemplo(){ return S.exemplo?`<div class="banner"><span class="small"><b>Estes horários são um exemplo</b> para mostrar como funciona.</span><button class="btn primary" data-act="real">Começar a usar</button></div>`:''; }
function header(){
  document.getElementById('hdr-nome').textContent=S.config.nome?(' da '+S.config.nome.split(' ')[0]):'';
  const tot=S.config.prev.reduce((a,b)=>a+b,0);
  document.getElementById('hdr-sub').textContent='Jornada '+fmt(tot)+'/sem';
}
function monthNav(){ return `<div class="monthnav"><button class="icon-btn" data-act="prev" aria-label="Mês anterior">‹</button><h2>${MES[vm]} ${vy}</h2><button class="icon-btn" data-act="next" aria-label="Próximo mês">›</button></div>`; }

/* ---------- HOJE ---------- */
function renderHoje(){
  const x=ds(new Date()); const r=info(x); const m=r.m.length?r.m:['','','',''];
  const L=slotsDe(x); const next=L.map((_,i)=>i).find(i=>!m[i]);
  const mi=mesInfo(new Date().getFullYear(),new Date().getMonth());
  const sem=mi.semanas.find(s=>s.dias.some(d=>d.x===x));
  const el=document.getElementById('v-hoje');
  el.innerHTML=`${bannerExemplo()}
  <div class="card stack">
    <div class="row" style="justify-content:space-between">
      <span class="today-date">${DOWL[r.wd]}, ${r.dt.getDate()} de ${MES[r.dt.getMonth()].toLowerCase()}</span>
      ${r.fer?`<span class="chip hol">${esc(r.fer)}</span>`:(r.tipo!=='normal'?`<span class="chip info">${TIPOS[r.tipo]}</span>`:'')}
    </div>
    <div class="clock" id="clock">--:--<small>:--</small></div>
    <button class="punch" data-act="punch" ${next==null?'disabled':''}>
      <b>${next==null?'Dia completo':'Registrar '+L[next].toLowerCase()}</b>
      <span>${next==null?'Edite os horários abaixo se precisar':'Grava a hora de agora'}</span>
    </button>
    <div class="slots">
      ${L.map((s,i)=>`<div class="slot ${i===next?'next':''}"><label>${s}</label>${tsel('h-'+i,m[i]||'',true)}</div>`).join('')}
    </div>
    ${chave('alm-hoje',L.length===4)}
    <div class="row" style="justify-content:space-between">
      <span class="small muted">Trabalhado hoje · previsto ${fmt(r.tipo==='normal'?r.base:0)}</span>
      <b class="mono" id="hoje-trab" style="font-size:18px">—</b>
    </div>
  </div>
  <div class="card stack">
    <span class="eyebrow">Esta semana</span>
    <div class="kpis">
      <div class="kpi"><b>${fmt(sem?sem.t.trab:0)}</b><span>trabalhadas</span></div>
      <div class="kpi"><b>${fmt(sem?sem.t.he50+sem.t.he100:0)}</b><span>horas extras</span></div>
      <div class="kpi"><b>${fmt(sem?sem.t.saldo:0,true)}</b><span>saldo</span></div>
    </div>
    <span class="eyebrow" style="margin-top:4px">${MES[new Date().getMonth()]}</span>
    <div class="kpis">
      <div class="kpi"><b>${fmt(mi.t.trab)}</b><span>trabalhadas</span></div>
      <div class="kpi"><b>${fmt(mi.t.he50+mi.t.he100)}</b><span>horas extras</span></div>
      <div class="kpi"><b>${fmt(mi.t.saldo,true)}</b><span>saldo</span></div>
    </div>
    ${(mi.t.vazio||mi.t.incompleto)?`<span class="small muted">${mi.t.vazio?mi.t.vazio+' dia(s) sem registro':''}${mi.t.vazio&&mi.t.incompleto?' · ':''}${mi.t.incompleto?mi.t.incompleto+' dia(s) com marcação faltando':''}. Confira na aba Mês.</span>`:''}
  </div>`;
  tick();
}
function tick(){
  const c=document.getElementById('clock'); if(!c) return;
  const n=new Date(); c.innerHTML=pad(n.getHours())+':'+pad(n.getMinutes())+'<small>:'+pad(n.getSeconds())+'</small>';
  const ht=document.getElementById('hoje-trab'); if(!ht) return;
  const r=info(ds(n)); let tot=r.p.tot;
  if(r.p.open!=null){ let d=nowMin()-r.p.open; if(d<0)d+=1440; tot+=d; }
  ht.textContent=(r.p.any||r.p.open!=null)?fmt(tot)+(r.p.open!=null?' ▸':''):'—';
}

/* ---------- MÊS ---------- */
function linhaDia(r){
  const hoje=ds(new Date());
  let meio, dir;
  const m=r.m;
  const p1=(m[0]||m[1])?`${m[0]||'--:--'}–${m[1]||'--:--'}`:'';
  const p2=(m[2]||m[3])?`${m[2]||'--:--'}–${m[3]||'--:--'}`:'';
  const marks=[p1,p2].filter(Boolean).map(s=>`<span>${s}</span>`).join('');
  if(r.tipo!=='normal' && !marks){ meio=`<span class="lbl">${r.tipo==='feriado'&&r.fer?esc(r.fer):TIPOS[r.tipo]}</span>`; }
  else if(marks){ meio=marks+(r.tipo!=='normal'?`<span class="ob">${r.tipo==='feriado'&&r.fer?esc(r.fer):TIPOS[r.tipo]}</span>`:''); }
  else if(r.status==='descanso') meio='<span class="lbl muted">Descanso</span>';
  else if(r.status==='futuro'||r.status==='antes') meio='<span class="muted">—</span>';
  else meio='<span class="lbl muted">Sem registro</span>';
  if(r.obs) meio+=`<span class="ob">${esc(r.obs)}</span>`;
  if(r.status==='incompleto') dir='<span class="chip warn">falta marcação</span>';
  else if(r.status==='andamento') dir=`<span class="tt">${fmt(r.p.tot)}</span><span class="chip info">em andamento</span>`;
  else if(r.status==='vazio') dir='<span class="chip warn">vazio</span>';
  else if(r.status==='hoje'||r.status==='futuro'||r.status==='descanso'||r.status==='antes') dir='';
  else if(r.tipo==='falta') dir=`<span class="tt">0h00</span>${chipSaldo(r.saldo)}`;
  else if(r.status==='abonado' && !r.trab) dir='<span class="chip hol">abonado</span>';
  else dir=`<span class="tt">${fmt(r.trab)}</span>${chipSaldo(r.saldo)}`;
  const cls=['dia']; if(r.x===hoje) cls.push('hoje'); if(r.x>hoje) cls.push('fut'); if(r.tipo==='feriado') cls.push('fer');
  return `<button class="${cls.join(' ')}" data-dia="${r.x}"><span class="dd"><b>${pad(r.dt.getDate())}</b><small>${DOW[r.wd]}</small></span><span class="mk">${meio}</span><span class="res">${dir}</span></button>`;
}
function renderMes(){
  const mi=mesInfo(vy,vm);
  document.getElementById('v-mes').innerHTML=`${bannerExemplo()}${monthNav()}
  <div class="card"><div class="kpis">
    <div class="kpi"><b>${fmt(mi.t.trab)}</b><span>trabalhadas</span></div>
    <div class="kpi"><b>${fmt(mi.t.he50+mi.t.he100)}</b><span>extras</span></div>
    <div class="kpi"><b>${fmt(mi.t.saldo,true)}</b><span>saldo</span></div>
  </div></div>
  <p class="small muted" style="margin:0">Toque em um dia para editar horários, marcar feriado, folga, falta ou atestado.</p>
  ${mi.semanas.map(s=>`<div class="week">
    <div class="week-h"><span class="eyebrow">Semana ${ddmm(s.ini)} a ${ddmm(s.fim)}</span>
    <span class="row" style="gap:6px"><span class="mono small">${fmt(s.t.trab)}</span>${chipSaldo(s.t.saldo)}</span></div>
    ${s.dias.map(linhaDia).join('')}
  </div>`).join('')}`;
}

/* ---------- EDITOR ---------- */
const edDlg=document.getElementById('ed');
let edX=null;
function abrirEditor(x){
  edX=x; const r=info(x); const m=r.m.length?r.m:['','','',''];
  const b=document.getElementById('ed-body');
  b.innerHTML=`<div class="row" style="justify-content:space-between"><h3>${DOWL[r.wd]}, ${pad(r.dt.getDate())}/${pad(r.dt.getMonth()+1)}</h3><button class="icon-btn" data-act="ed-close" aria-label="Fechar">✕</button></div>
  ${r.fer?`<span class="chip hol" style="align-self:flex-start">Feriado: ${esc(r.fer)}</span>`:''}
  <div class="field"><label>Tipo do dia</label><div class="tipos">${Object.keys(TIPOS).map(k=>`<button data-tipo="${k}" aria-pressed="${r.tipo===k}">${TIPOS[k]}</button>`).join('')}</div></div>
  <div class="slots">${slotsDe(x).map((s,i)=>`<div class="slot"><label>${s}</label>${tsel('e-'+i,m[i]||'',true)}</div>`).join('')}</div>
  ${chave('ed-alm',temAlmoco(x))}
  <div class="grid2">
    <div class="field"><label>Jornada prevista</label>${tsel('e-prev',toHM(r.base),false,true)}</div>
    <div class="field"><label for="e-obs">Observação</label><input type="text" id="e-obs" value="${esc(r.obs)}" placeholder="ex.: inventário"></div>
  </div>
  <div id="e-res" class="row" style="justify-content:space-between"></div>
  <div class="row"><button class="btn danger" data-act="ed-clear">Limpar dia</button><button class="btn primary" data-act="ed-close" style="flex:1">Pronto</button></div>`;
  edRes(); if(!edDlg.open) edDlg.showModal();
}
function edRes(){
  const r=info(edX); const el=document.getElementById('e-res'); if(!el) return;
  let t=`<span class="small muted">Trabalhado ${fmt(r.trab||r.p.tot)}</span>`;
  if(r.status==='incompleto'||r.status==='andamento') t+='<span class="chip warn">complete as marcações</span>';
  else if(r.he100) t+=`<span class="chip pos">extra 100%: ${fmt(r.he100)}</span>`;
  else if(r.he50) t+=`<span class="chip pos">extra 50%: ${fmt(r.he50)}</span>`;
  else if(r.deb) t+=`<span class="chip neg">débito ${fmt(r.deb)}</span>`;
  else if(r.conta) t+='<span class="chip zero">sem extra</span>';  el.innerHTML=t;
}
edDlg.addEventListener('close',()=>{ if(edX){ limpaDia(edX); save(); } edX=null; render(); });
document.getElementById('ed-body').addEventListener('input',e=>{
  if(!edX) return; const t=e.target;
  if(t.id==='e-obs'){ ensureReal(); dia(edX).obs=t.value; }
  else return;
  save(); edRes();
});
document.getElementById('ed-body').addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b) return;
  if(b.dataset.tipo){ ensureReal(); const r=info(edX); const k=b.dataset.tipo; const auto=r.fer?'feriado':'normal';
    if(k===auto) delete dia(edX).tipo; else dia(edX).tipo=k; save();
    document.querySelectorAll('.tipos button').forEach(x=>x.setAttribute('aria-pressed',x.dataset.tipo===k)); edRes(); }
  if(b.dataset.act==='ed-close') edDlg.close();
  if(b.dataset.act==='ed-alm'){ const x=edX; trocaAlmoco(x); abrirEditor(x); }
  if(b.dataset.act==='ed-clear'){ ensureReal(); delete S.dias[edX]; save(); const x=edX; edX=null; edDlg.close(); abrirEditor(x); toast('Dia limpo'); }
});

/* ---------- RESUMO ---------- */
function relatorio(){
  const mi=mesInfo(vy,vm), t=mi.t, $=dinheiro(t);
  const L=[`*Ponto ${MES[vm]}/${vy}*${S.config.nome?' – '+S.config.nome:''}`,
  `Trabalhadas: ${fmt(t.trab)}`,`Previstas: ${fmt(t.prev)}`,`Extras 50%: ${fmt(t.he50)}`,`Extras 100%: ${fmt(t.he100)}`,`Débito: ${fmt(t.deb)}`,`Saldo: ${fmt(t.saldo,true)}`];
  if($) L.push(`Estimativa extras: ${brl($.he50+$.he100)} · descontos: ${brl($.deb)}`);
  L.push('','*Semanas*'); mi.semanas.forEach(s=>L.push(`${ddmm(s.ini)}–${ddmm(s.fim)}: ${fmt(s.t.trab)} (saldo ${fmt(s.t.saldo,true)})`));
  L.push('','*Dias*');
  mi.dias.forEach(r=>{
    if(r.status==='futuro'||r.status==='antes'||(r.status==='descanso'&&!r.obs)) return;
    let s=`${ddmm(r.x)} ${DOW[r.wd]} `;
    const mk=r.m.filter(Boolean).join(' ');
    if(r.tipo!=='normal') s+=`[${r.tipo==='feriado'&&r.fer?r.fer:TIPOS[r.tipo]}] `;
    if(mk) s+=mk+' = '+fmt(r.trab||r.p.tot); else if(r.status==='vazio') s+='sem registro';
    if(r.saldo) s+=` (${fmt(r.saldo,true)})`;
    if(r.status==='incompleto') s+=' ⚠ falta marcação';
    if(r.obs) s+=' – '+r.obs;
    L.push(s.trim());
  });
  return L.join('\n');
}
function renderResumo(){
  const mi=mesInfo(vy,vm), t=mi.t, $=dinheiro(t);
  document.getElementById('v-resumo').innerHTML=`${monthNav()}
  <div class="big">
    <div class="card saldo"><div><span class="eyebrow">Saldo do mês</span><b class="mono" style="color:${t.saldo>0?'var(--pos)':t.saldo<0?'var(--neg)':'var(--ink)'}">${fmt(t.saldo,true)}</b></div><span class="small muted">extras − débitos</span></div>
    <div class="card"><span class="eyebrow">Trabalhadas</span><b>${fmt(t.trab)}</b></div>
    <div class="card"><span class="eyebrow">Previstas</span><b>${fmt(t.prev)}</b></div>
    <div class="card"><span class="eyebrow">Extras ${S.config.pctHE}%</span><b style="color:var(--pos)">${fmt(t.he50)}</b></div>
    <div class="card"><span class="eyebrow">Extras ${S.config.pctDF}%</span><b style="color:var(--pos)">${fmt(t.he100)}</b></div>
    <div class="card"><span class="eyebrow">Débito</span><b style="color:var(--neg)">${fmt(t.deb)}</b></div>
    <div class="card"><span class="eyebrow">Dias trabalhados</span><b>${t.dias}</b></div>  </div>
  ${(t.vazio||t.incompleto)?`<div class="banner warn"><span class="small">${t.vazio?t.vazio+' dia(s) sem registro':''}${t.vazio&&t.incompleto?' e ':''}${t.incompleto?t.incompleto+' com marcação faltando':''}. Esses dias ficam fora da conta até serem preenchidos.</span><button class="btn" data-tab-go="mes">Ver no mês</button></div>`:''}
  <div class="card stack"><span class="eyebrow">Por semana</span>
    <div class="tablebox"><table><thead><tr><th>Semana</th><th>Trab.</th><th>Extras</th><th>Débito</th><th>Saldo</th></tr></thead><tbody>
    ${mi.semanas.map(s=>`<tr><td>${ddmm(s.ini)}–${ddmm(s.fim)}</td><td>${fmt(s.t.trab)}</td><td>${fmt(s.t.he50+s.t.he100)}</td><td>${fmt(s.t.deb)}</td><td>${fmt(s.t.saldo,true)}</td></tr>`).join('')}
    <tr><td><b>Mês</b></td><td><b>${fmt(t.trab)}</b></td><td><b>${fmt(t.he50+t.he100)}</b></td><td><b>${fmt(t.deb)}</b></td><td><b>${fmt(t.saldo,true)}</b></td></tr>
    </tbody></table></div>
  </div>
  ${$?`<div class="card stack"><span class="eyebrow">Estimativa em dinheiro</span>
    <div class="tablebox"><table><tbody>
    <tr><td>Valor da hora</td><td>${brl($.vh)}</td></tr>
    <tr><td>Extras ${S.config.pctHE}%</td><td>${brl($.he50)}</td></tr>
    <tr><td>Extras ${S.config.pctDF}%</td><td>${brl($.he100)}</td></tr>
    <tr><td>Desconto por débito</td><td>−${brl($.deb)}</td></tr>
    <tr><td><b>Líquido estimado</b></td><td><b>${brl($.liq)}</b></td></tr></tbody></table></div>
    <span class="small muted">Sem DSR, adicional noturno ou impostos. Serve para conferir o holerite.</span></div>`
  :`<div class="card small muted">Informe o salário em Ajustes para ver quanto as horas extras valem em reais.</div>`}
  <button class="btn primary wide" data-act="copy-rel">Copiar relatório do mês</button>
  <p class="small muted" style="margin:0">O relatório vai pronto para colar no WhatsApp ou mandar para o RH.</p>`;
}

/* ---------- AJUSTES ---------- */
let delArm=false;
function renderAjustes(){
  const c=S.config;
  document.getElementById('v-ajustes').innerHTML=`
  <div class="card stack"><span class="eyebrow">Jornada por dia da semana</span>
    <div class="jornada">${[1,2,3,4,5,6,0].map(w=>`<div class="field"><label>${DOWL[w]}</label>${tsel('j-'+w,toHM(c.prev[w]),false,true)}</div>`).join('')}</div>
    <span class="small muted">Total: <b class="mono">${fmt(c.prev.reduce((a,b)=>a+b,0))}</b> por semana. Coloque 00:00 nos dias de folga fixa.</span>
  </div>
  <div class="card stack"><span class="eyebrow">Regras da conta</span>
    <div class="grid2">
      <div class="field"><label for="c-tol">Tolerância diária (min)</label><input type="number" id="c-tol" min="0" max="60" value="${c.tol}"></div>
      <div class="field"><label for="c-nome">Nome</label><input type="text" id="c-nome" value="${esc(c.nome)}"></div>
      <div class="field"><label for="c-he">Hora extra dia útil (%)</label><input type="number" id="c-he" min="0" value="${c.pctHE}"></div>
      <div class="field"><label for="c-df">Domingo e feriado (%)</label><input type="number" id="c-df" min="0" value="${c.pctDF}"></div>
      <div class="field"><label for="c-sal">Salário base (R$)</label><input type="text" inputmode="decimal" id="c-sal" value="${esc(c.salario)}" placeholder="opcional"></div>
      <div class="field"><label for="c-div">Divisor de horas</label><input type="number" id="c-div" min="1" value="${c.divisor}"></div>
    </div>
    <span class="small muted">A CLT tolera até 10 minutos de diferença por dia sem contar como extra ou atraso. Para 44h semanais o divisor é 220.</span>
  </div>
  <div class="card stack"><span class="eyebrow">Feriados locais</span>
    <span class="small muted">Os feriados nacionais já vêm marcados. Acrescente os da cidade e do estado; eles se repetem todo ano.</span>
    <div class="fer-list">${(c.feriados||[]).map((f,i)=>`<div class="fer-item"><span><b class="mono">${f.md.slice(3)}/${f.md.slice(0,2)}</b> ${esc(f.nome)}</span><button class="btn" data-delfer="${i}">Remover</button></div>`).join('')||'<span class="small muted">Nenhum ainda.</span>'}</div>
    <div class="grid2"><div class="field"><label for="f-data">Data</label><input type="text" id="f-data" placeholder="dd/mm" inputmode="numeric"></div><div class="field"><label for="f-nome">Nome</label><input type="text" id="f-nome" placeholder="ex.: Aniversário da cidade"></div></div>
    <button class="btn" data-act="addfer">Adicionar feriado</button>
  </div>
  <div class="card stack"><span class="eyebrow">Backup</span>
    <span class="small muted">Os registros ficam salvos na nuvem e aparecem em qualquer aparelho em que você entrar com a sua conta. O backup é uma cópia extra.</span>
    <button class="btn" data-act="backup">Copiar backup</button>
    <textarea id="rest-txt" rows="3" placeholder="Cole aqui um backup para restaurar"></textarea>
    <button class="btn" data-act="restore">Restaurar backup</button>
    <button class="btn danger" data-act="wipe">${delArm?'Toque de novo para apagar tudo':'Apagar todos os registros'}</button>
  </div>
  <div class="card stack"><span class="eyebrow">Conta</span>
    <span class="small">Conectada como <b>${esc(ctx.email)}</b></span>
    ${ctx.adminHtml||''}
    <button class="btn" data-act="sair">Sair da conta</button>
  </div>
  <details class="card help"><summary>Como colocar na tela inicial do celular</summary>
    <ol><li><b>iPhone (Safari):</b> abra o link, toque em Compartilhar e depois "Adicionar à Tela de Início".</li>
    <li><b>Android (Chrome):</b> abra o link, toque no menu ⋮ e escolha "Instalar app" ou "Adicionar à tela inicial".</li></ol>
  </details>`;
}
document.getElementById('v-ajustes').addEventListener('input',e=>{
  const t=e.target, c=S.config;
  if(t.id==='c-tol') c.tol=Math.max(0,parseInt(t.value)||0);
  else if(t.id==='c-nome') c.nome=t.value;
  else if(t.id==='c-he') c.pctHE=Math.max(0,parseFloat(t.value)||0);
  else if(t.id==='c-df') c.pctDF=Math.max(0,parseFloat(t.value)||0);
  else if(t.id==='c-sal') c.salario=t.value;
  else if(t.id==='c-div') c.divisor=Math.max(1,parseFloat(t.value)||220);
  else return;
  save(); header();
});

/* ---------- eventos globais ---------- */
document.getElementById('app').addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b) return;
  const a=b.dataset.act;
  if(b.dataset.dia){ abrirEditor(b.dataset.dia); return; }
  if(b.dataset.tabGo){ go(b.dataset.tabGo); return; }
  if(b.dataset.delfer!=null){ S.config.feriados.splice(+b.dataset.delfer,1); save(); render(); return; }
  if(a==='real'){ ensureReal(); save(); render(); toast('Pronto, pode começar a registrar'); }
  if(a==='alm-hoje'){ if(modo==='nuvem'&&!podeEscrever) return; trocaAlmoco(ds(new Date())); render(); return; }
  if(a==='punch'){
    if(modo==='nuvem'&&!podeEscrever){ toast('Esta conta só pode ver os registros.'); return; }
    ensureReal(); const x=ds(new Date()); const d=dia(x); const i=[0,1,2,3].find(k=>!d.m[k]);
    if(i==null || i>=slotsDe(x).length) return; const nome=slotsDe(x)[i]; d.m[i]=nowHM(); save(); render(); toast(nome+' registrada às '+d.m[i]);
  }
  if(a==='prev'){ vm--; if(vm<0){vm=11;vy--;} render(); }
  if(a==='next'){ vm++; if(vm>11){vm=0;vy++;} render(); }
  if(a==='copy-rel') copiar(relatorio(),'Relatório copiado');
  if(a==='backup') copiar(JSON.stringify({app:'ponto-jessika',v:1,config:S.config,dias:S.dias}),'Backup copiado');
  if(a==='restore'){
    const txt=document.getElementById('rest-txt').value.trim();
    try{ const o=JSON.parse(txt); if(!o.dias||!o.config) throw 0; S={config:Object.assign({},DEF,o.config),dias:o.dias,exemplo:false}; save(); render(); toast('Backup restaurado'); }
    catch(err){ toast('Esse texto não é um backup válido. Copie de novo pelo botão "Copiar backup".'); }
  }
  if(a==='addfer'){
    const v=document.getElementById('f-data').value.trim(), n=document.getElementById('f-nome').value.trim();
    const mm=v.match(/^(\d{1,2})\/(\d{1,2})$/);
    if(!mm||+mm[1]>31||+mm[2]>12||!+mm[1]||!+mm[2]){ toast('Digite a data no formato dd/mm, ex.: 14/11'); return; }
    S.config.feriados.push({md:pad(mm[2])+'-'+pad(mm[1]),nome:n||'Feriado local'}); save(); render(); toast('Feriado adicionado');
  }
  if(a==='sair'){ ctx.sair(); return; }
  if(a==='wipe'){
    if(!delArm){ delArm=true; renderAjustes(); setTimeout(()=>{delArm=false; if(tab==='ajustes') renderAjustes();},4000); return; }
    delArm=false; S.dias={}; S.exemplo=false; save(); render(); toast('Registros apagados');
  }
});
/* seletores de hora (hora + minuto) — substituem o campo nativo, que falha no iPhone */
function tsel(key,val,big,obrig){
  const [h,m]=val?val.split(':'):['',''];
  const o=(n,cur)=>(obrig?'':`<option value=""${cur===''?' selected':''}>--</option>`)+Array.from({length:n},(_,i)=>`<option value="${pad(i)}"${pad(i)===cur?' selected':''}>${pad(i)}</option>`).join('');
  return `<span class="tsel${big?' big':''}" data-tkey="${key}"><select aria-label="Hora" data-part="h">${o(24,h)}</select><b>:</b><select aria-label="Minuto" data-part="m">${o(60,m)}</select></span>`;
}
document.addEventListener('change',e=>{
  const sel=e.target; if(sel.tagName!=='SELECT') return; const box=sel.closest('.tsel'); if(!box) return;
  const hs=box.querySelector('[data-part=h]'), ms=box.querySelector('[data-part=m]');
  if(sel===hs && hs.value!=='' && ms.value==='') ms.value='00';
  if(sel===ms && ms.value!=='' && hs.value==='') hs.value=pad(new Date().getHours());
  if(sel===hs && hs.value==='') ms.value='';
  if(sel===ms && ms.value==='' ) hs.value='';
  const v=hs.value===''?'':hs.value+':'+ms.value;
  const key=box.dataset.tkey, [k,n]=key.split('-');
  if(k==='h'){ ensureReal(); const x=ds(new Date()); dia(x).m[+n]=v; limpaDia(x); save(); render(); }
  else if(k==='e' && edX){
    ensureReal();
    if(n==='prev'){ const mv=toMin(v); const wd=parseDs(edX).getDay(); if(mv==null||mv===S.config.prev[wd]) delete dia(edX).prev; else dia(edX).prev=mv; }
    else dia(edX).m[+n]=v;
    save(); edRes();
  }
  else if(k==='j'){ const mv=toMin(v); S.config.prev[+n]=mv==null?0:mv; save(); header(); renderAjustes(); }
});
document.querySelectorAll('nav.tabs button').forEach(b=>b.addEventListener('click',()=>go(b.dataset.tab)));
function go(t){ tab=t; if(t==='hoje'){const n=new Date(); vy=n.getFullYear(); vm=n.getMonth();}
  document.querySelectorAll('nav.tabs button').forEach(b=>b.setAttribute('aria-current',b.dataset.tab===t?'page':'false'));
  ['hoje','mes','resumo','ajustes'].forEach(k=>document.getElementById('v-'+k).hidden=k!==t);
  render(); window.scrollTo(0,0); }
function render(){ header();
  if(tab==='hoje') renderHoje(); else if(tab==='mes') renderMes(); else if(tab==='resumo') renderResumo(); else renderAjustes(); }

save(); render(); conectar();
if(ctx.onReady) ctx.onReady();
setInterval(()=>{ if(tab==='hoje') tick(); },1000);
document.addEventListener('visibilitychange',()=>{ if(!document.hidden) render(); });
};
