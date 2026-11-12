// Login (e-mail e senha) + banco Firestore + modo administrador.
import { firebaseConfig } from './config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, sendEmailVerification, updateProfile, signOut
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, onSnapshot, setDoc, updateDoc, getDocs, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const $ = id => document.getElementById(id);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
let fs;
try { fs = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
catch (e) { fs = getFirestore(app); }

/* ---------- adaptador: mesma interface que o app já usa ---------- */
function mapErr(e) {
  const c = e && e.code;
  if (c === 'not-found') return { code: 'invalid_argument', message: 'documento não existe' };
  if (c === 'permission-denied' || c === 'unauthenticated') return { code: 'not_granted', message: e.message };
  if (c === 'resource-exhausted') return { code: 'quota_exceeded', message: e.message };
  return { code: 'unavailable', message: (e && e.message) || '' };
}
function wrapDoc(ref) {
  return {
    onSnapshot: (next, err) => onSnapshot(ref,
      s => next({ exists: s.exists(), data: () => s.data(), metadata: { fromCache: s.metadata.fromCache } }),
      e => err && err(mapErr(e))),
    set: v => setDoc(ref, v).catch(e => { throw mapErr(e); }),
    // update só dos dias enviados: cada dia é substituído inteiro, os outros ficam como estão
    update: v => {
      const patch = {};
      for (const k in v) {
        if (k === 'dias' && v.dias && typeof v.dias === 'object') { for (const x in v.dias) patch['dias.' + x] = v.dias[x]; }
        else patch[k] = v[k];
      }
      return updateDoc(ref, patch).catch(e => { throw mapErr(e); });
    }
  };
}
function adapter(root) {
  return {
    doc: p => wrapDoc(doc(fs, root + '/' + p)),
    collection: p => ({
      onSnapshot: (next, err) => onSnapshot(collection(fs, root + '/' + p),
        s => next({ metadata: { fromCache: s.metadata.fromCache }, docs: s.docs.map(d => ({ id: d.id, data: () => d.data() })) }),
        e => err && err(mapErr(e))),
      doc: id => wrapDoc(doc(fs, root + '/' + p + '/' + id))
    })
  };
}

/* ---------- tela de login ---------- */
let modoCriar = false, criando = false;
function setModo(criar) {
  modoCriar = criar;
  $('m-entrar').setAttribute('aria-pressed', !criar);
  $('m-criar').setAttribute('aria-pressed', criar);
  $('w-nome').hidden = !criar;
  $('l-btn').textContent = criar ? 'Criar conta' : 'Entrar';
  $('l-senha').autocomplete = criar ? 'new-password' : 'current-password';
  $('l-esqueci').hidden = criar;
  msg('', '');
}
function msg(erro, ok) {
  $('l-erro').textContent = erro; $('l-erro').hidden = !erro;
  $('l-ok').textContent = ok; $('l-ok').hidden = !ok;
}
const ERROS = {
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'Não existe conta com este e-mail. Toque em "Criar conta".',
  'auth/email-already-in-use': 'Já existe uma conta com este e-mail. Toque em "Entrar".',
  'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
  'auth/invalid-email': 'Esse e-mail não parece válido. Confira se digitou certo.',
  'auth/missing-password': 'Digite a senha.',
  'auth/network-request-failed': 'Sem internet. Confira a conexão e tente de novo.',
  'auth/too-many-requests': 'Muitas tentativas. Espere alguns minutos e tente de novo.'
};
const erroTxt = e => ERROS[e && e.code] || 'Não deu certo. Tente de novo.';

$('m-entrar').onclick = () => setModo(false);
$('m-criar').onclick = () => setModo(true);
$('f-login').addEventListener('submit', async ev => {
  ev.preventDefault();
  const email = $('l-email').value.trim(), senha = $('l-senha').value, nome = $('l-nome').value.trim();
  if (!email) return msg('Digite o seu e-mail.', '');
  if (modoCriar && !nome) return msg('Digite o seu nome.', '');
  $('l-btn').disabled = true; msg('', '');
  try {
    if (modoCriar) {
      criando = true;
      const cred = await createUserWithEmailAndPassword(auth, email, senha);
      await updateProfile(cred.user, { displayName: nome });
      try { await sendEmailVerification(cred.user); } catch (e) {}
      criando = false; iniciar(cred.user, nome);
    } else {
      await signInWithEmailAndPassword(auth, email, senha);
    }
  } catch (e) { criando = false; msg(erroTxt(e), ''); }
  $('l-btn').disabled = false;
});
$('l-esqueci').onclick = async () => {
  const email = $('l-email').value.trim();
  if (!email) return msg('Digite o seu e-mail acima e toque de novo em "Esqueci minha senha".', '');
  try { await sendPasswordResetEmail(auth, email); msg('', 'Enviamos um link para criar uma nova senha. Confira o seu e-mail, inclusive o spam.'); }
  catch (e) { msg(erroTxt(e), ''); }
};

/* ---------- início do app ---------- */
let iniciado = false;
async function iniciar(user, nomeNovo) {
  if (iniciado) return; iniciado = true;
  const nome = nomeNovo || user.displayName || '';
  setDoc(doc(fs, 'usuarios', user.uid), { email: user.email, nome, atualizado: serverTimestamp() }, { merge: true }).catch(() => {});

  // administrador: só quem as regras do banco deixam listar todas as contas
  let usuarios = null;
  try {
    const q = await getDocs(collection(fs, 'usuarios'));
    usuarios = q.docs.map(d => ({ uid: d.id, ...(d.data()) })).filter(u => u.email);
  } catch (e) { usuarios = null; }

  let viewUid = user.uid, vendo = null;
  let ver = null; try { ver = sessionStorage.getItem('ponto-ver'); } catch (e) {}
  if (usuarios && ver && ver !== user.uid) { vendo = usuarios.find(u => u.uid === ver) || null; if (vendo) viewUid = vendo.uid; }

  let adminHtml = '';
  if (usuarios) {
    const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    adminHtml = `<div class="field"><label for="ver-como">Administrador: ver os registros de</label><select id="ver-como">${
      usuarios.map(u => `<option value="${u.uid}"${u.uid === viewUid ? ' selected' : ''}>${esc(u.nome || u.email)}${u.uid === user.uid ? ' (você)' : ''} · ${esc(u.email)}</option>`).join('')
    }</select></div>`;
  }

  $('boot').hidden = true; $('login').hidden = true; $('shell').hidden = false;
  if (vendo) {
    const bar = $('admin-bar');
    bar.innerHTML = `<span class="small">Você está vendo os registros de <b></b>.</span><button class="btn" id="voltar-meus">Ver os meus</button>`;
    bar.querySelector('b').textContent = vendo.nome || vendo.email;
    bar.hidden = false;
  }
  window.__startApp({
    viewUid,
    nome: vendo ? (vendo.nome || '') : nome,
    email: user.email,
    db: adapter('usuarios/' + viewUid),
    adminHtml,
    sair: async () => { try { sessionStorage.removeItem('ponto-ver'); } catch (e) {} await signOut(auth); location.reload(); }
  });
}
document.addEventListener('change', e => {
  if (e.target.id === 'ver-como') { try { sessionStorage.setItem('ponto-ver', e.target.value); } catch (er) {} location.reload(); }
});
document.addEventListener('click', e => {
  if (e.target.id === 'voltar-meus') { try { sessionStorage.removeItem('ponto-ver'); } catch (er) {} location.reload(); }
});

onAuthStateChanged(auth, user => {
  if (user) { if (!criando) iniciar(user); }
  else if (!iniciado) { $('boot').hidden = true; $('login').hidden = false; $('shell').hidden = true; }
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
