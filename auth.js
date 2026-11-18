/* =====================================================================
   auth.js — login (Firebase Authentication) e salvamento (Firestore)
   ---------------------------------------------------------------------
   O Firebase é carregado sob demanda via CDN. Se a configuração estiver
   incompleta ou a internet falhar, o jogo continua funcionando no modo
   convidado (progresso salvo no localStorage).
   ===================================================================== */

import { firebaseConfig, DOMINIO_ESCOLA } from './firebase-config.js';

export const TOTAL_FASES = 10;
export const LIMITES = Object.freeze({
  pontosFase: 1000000,   // pontuação máxima aceita por fase
  recorde: 10000000      // soma máxima das pontuações
});

const VERSAO_SDK = '10.12.2';
const BASE_CDN = `https://www.gstatic.com/firebasejs/${VERSAO_SDK}/`;
const TEMPO_LIMITE_MS = 8000;

let fb = null; // { auth, db, authM, fsM } depois de iniciado

/* ---------------------------------------------------------------------
   Utilitários de armazenamento local
   --------------------------------------------------------------------- */
export function lerLocal(chave) {
  try {
    const bruto = localStorage.getItem(chave);
    return bruto ? JSON.parse(bruto) : null;
  } catch (e) { return null; }
}

export function gravarLocal(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) { /* ignora */ }
}

/* ---------------------------------------------------------------------
   Modelo do progresso
   { maiorFase: 1..10, fases: { "1": {estrelas:0..3, pontos:n}, ... }, recorde: n }
   "maiorFase" = fase mais alta liberada.
   "recorde"   = soma das melhores pontuações de cada fase.
   --------------------------------------------------------------------- */
export function progressoVazio() {
  return { maiorFase: 1, fases: {}, recorde: 0 };
}

function inteiro(valor, min, max) {
  let n = Math.floor(Number(valor));
  if (!Number.isFinite(n)) n = min;
  return Math.min(max, Math.max(min, n));
}

export function somaPontos(p) {
  let soma = 0;
  for (const n in p.fases) soma += p.fases[n].pontos;
  return soma;
}

export function somaEstrelas(p) {
  let soma = 0;
  for (const n in p.fases) soma += p.fases[n].estrelas;
  return soma;
}

/* Valida e limita qualquer dado recebido (nuvem, localStorage ou jogo).
   Sempre devolve um objeto no formato exato esperado pelas regras. */
export function normalizarProgresso(bruto) {
  const p = progressoVazio();
  if (!bruto || typeof bruto !== 'object') return p;

  for (let n = 1; n <= TOTAL_FASES; n++) {
    const f = bruto.fases && bruto.fases[n];
    if (f && typeof f === 'object') {
      p.fases[n] = {
        estrelas: inteiro(f.estrelas, 0, 3),
        pontos: inteiro(f.pontos, 0, LIMITES.pontosFase)
      };
    }
  }

  // A fase liberada nunca pode ser menor que (última fase concluída + 1)
  let maior = inteiro(bruto.maiorFase, 1, TOTAL_FASES);
  for (const n in p.fases) {
    if (p.fases[n].estrelas > 0) maior = Math.max(maior, Math.min(TOTAL_FASES, Number(n) + 1));
  }
  p.maiorFase = maior;
  p.recorde = Math.min(LIMITES.recorde, somaPontos(p));
  return p;
}

/* Junta dois progressos ficando sempre com o melhor de cada campo. */
export function mesclarProgresso(a, b) {
  const pa = normalizarProgresso(a);
  const pb = normalizarProgresso(b);
  const saida = { maiorFase: Math.max(pa.maiorFase, pb.maiorFase), fases: {}, recorde: 0 };
  for (let n = 1; n <= TOTAL_FASES; n++) {
    const fa = pa.fases[n], fb2 = pb.fases[n];
    if (fa || fb2) {
      saida.fases[n] = {
        estrelas: Math.max(fa ? fa.estrelas : 0, fb2 ? fb2.estrelas : 0),
        pontos: Math.max(fa ? fa.pontos : 0, fb2 ? fb2.pontos : 0)
      };
    }
  }
  return normalizarProgresso(saida);
}

/* ---------------------------------------------------------------------
   Login com Google
   --------------------------------------------------------------------- */
export function verificarConfiguracao() {
  const valores = Object.values(firebaseConfig).map(String);
  if (valores.some(v => !v || v.includes('COLE_AQUI') || v.includes('SEU-PROJETO'))) {
    return { ok: false, motivo: 'Login desativado: preencha o firebase-config.js (veja o README).' };
  }
  if (!DOMINIO_ESCOLA || DOMINIO_ESCOLA === 'DOMINIO_DA_ESCOLA') {
    return { ok: false, motivo: 'Login desativado: defina o domínio da escola no firebase-config.js.' };
  }
  return { ok: true, motivo: '' };
}

export function dominioPermitido(email) {
  return typeof email === 'string' &&
    email.toLowerCase().endsWith('@' + DOMINIO_ESCOLA.toLowerCase());
}

function mensagemErro(e) {
  switch (e && e.code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Login cancelado.';
    case 'auth/popup-blocked':
      return 'O navegador bloqueou a janela de login. Permita pop-ups e tente de novo.';
    case 'auth/network-request-failed':
      return 'Sem conexão. Verifique a internet e tente de novo.';
    case 'auth/unauthorized-domain':
      return 'Este site não está autorizado no Firebase (veja o README, passo 3).';
    default:
      return 'Não foi possível entrar. Tente novamente.';
  }
}

function comTimeout(promessa, ms) {
  let t;
  const limite = new Promise((_, rejeitar) => {
    t = setTimeout(() => rejeitar(new Error('tempo-esgotado')), ms);
  });
  return Promise.race([promessa, limite]).finally(() => clearTimeout(t));
}

/* Inicia o Firebase. Chama aoMudar(usuario|null, erro|null) quando o login muda.
   Devolve { disponivel, motivo }. Nunca lança erro. */
export async function iniciarAuth(aoMudar) {
  const conf = verificarConfiguracao();
  if (!conf.ok) return { disponivel: false, motivo: conf.motivo };

  try {
    const [appM, authM, fsM] = await Promise.all([
      import(BASE_CDN + 'firebase-app.js'),
      import(BASE_CDN + 'firebase-auth.js'),
      import(BASE_CDN + 'firebase-firestore.js')
    ]);
    const app = appM.initializeApp(firebaseConfig);
    fb = { auth: authM.getAuth(app), db: fsM.getFirestore(app), authM, fsM };

    authM.onAuthStateChanged(fb.auth, async (user) => {
      if (!user) { aoMudar(null, null); return; }

      // Barreira no cliente. A barreira de verdade está nas regras do Firestore.
      if (!dominioPermitido(user.email) || user.emailVerified === false) {
        try { await authM.signOut(fb.auth); } catch (e) { /* ignora */ }
        aoMudar(null, `Use o seu e-mail da escola (@${DOMINIO_ESCOLA}).`);
        return;
      }
      const primeiroNome = (user.displayName || 'Jogador').split(' ')[0];
      aoMudar({ uid: user.uid, nome: primeiroNome }, null);
    });

    // Resultado do login por redirecionamento (usado quando o pop-up é bloqueado)
    authM.getRedirectResult(fb.auth).catch((e) => aoMudar(null, mensagemErro(e)));

    return { disponivel: true, motivo: '' };
  } catch (e) {
    fb = null;
    return { disponivel: false, motivo: 'Não foi possível carregar o Firebase. Jogue como convidado.' };
  }
}

export async function entrarComGoogle() {
  if (!fb) throw new Error('Login indisponível.');
  const provedor = new fb.authM.GoogleAuthProvider();
  provedor.setCustomParameters({ hd: DOMINIO_ESCOLA, prompt: 'select_account' });
  try {
    await fb.authM.signInWithPopup(fb.auth, provedor);
  } catch (e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
      await fb.authM.signInWithRedirect(fb.auth, provedor);
      return;
    }
    throw new Error(mensagemErro(e));
  }
}

export async function sairDaConta() {
  if (fb) await fb.authM.signOut(fb.auth);
}

/* ---------------------------------------------------------------------
   Firestore: um documento por jogador em users/{uid}
   Guarda só progresso. Nenhum e-mail ou nome é gravado.
   --------------------------------------------------------------------- */
export async function carregarProgressoNuvem(uid) {
  if (!fb) throw new Error('Firebase indisponível.');
  const ref = fb.fsM.doc(fb.db, 'users', uid);
  const snap = await comTimeout(fb.fsM.getDoc(ref), TEMPO_LIMITE_MS);
  return snap.exists() ? normalizarProgresso(snap.data()) : null;
}

export async function salvarProgressoNuvem(uid, progresso) {
  if (!fb) throw new Error('Firebase indisponível.');
  const p = normalizarProgresso(progresso);
  const ref = fb.fsM.doc(fb.db, 'users', uid);
  await comTimeout(fb.fsM.setDoc(ref, {
    maiorFase: p.maiorFase,
    fases: p.fases,
    recorde: p.recorde,
    atualizado: fb.fsM.serverTimestamp()
  }), TEMPO_LIMITE_MS);
}
                                                    