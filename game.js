/* =====================================================================
   PIXEL INVADERS — game.js
   Lógica do jogo: fases, chefes, controles (teclado, mouse e toque),
   telas e integração com o login/salvamento (auth.js).
   ===================================================================== */

import { DOMINIO_ESCOLA } from './firebase-config.js';
import {
  TOTAL_FASES, iniciarAuth, entrarComGoogle, sairDaConta,
  carregarProgressoNuvem, salvarProgressoNuvem,
  progressoVazio, normalizarProgresso, mesclarProgresso, somaPontos, somaEstrelas,
  lerLocal, gravarLocal
} from './auth.js';

/* =====================================================================
   CONFIGURAÇÃO GERAL
   ===================================================================== */
const CFG = {
  vidasPorFase: 3,
  velJogador: 300,         // px/s
  aceleracao: 14,          // quanto maior, mais "seco" o movimento
  cooldownTiro: 0.17,      // segundos entre tiros
  velProjetil: 760,        // px/s
  invulnerabilidade: 1.6,  // segundos após levar dano
  raioStick: 56,           // alcance do joystick virtual (px)
  zonaMorta: 0.15,
  bonusPorVida: 100,
  pontosChefe: 500,
  chaveConvidado: 'pixelInvaders.convidado',
  prefixoCache: 'pixelInvaders.cache.'
};

/* =====================================================================
   FASES — edite aqui para mudar a dificuldade
   objetivo.tipo: 'eliminar' (alvo = nº de inimigos), 'sobreviver' (alvo = segundos)
                  ou 'chefe' (derrotar o chefe)
   vel:       velocidade base dos inimigos (px/s)
   intervalo: segundos entre levas de inimigos
   max:       máximo de inimigos ao mesmo tempo
   lote:      até quantos inimigos por leva (1 ou 2)
   pesos:     chance relativa de cada tipo (caranguejo, lula, polvo)
   chefe:     { vida, vel } só nas fases de chefe
   ===================================================================== */
const FASES = [
  { nome: 'Primeiro Contato', objetivo: { tipo: 'eliminar',   alvo: 12 }, vel: 65,  intervalo: 1.5,  max: 6,  lote: 1, pesos: { caranguejo: 1 } },
  { nome: 'Enxame',           objetivo: { tipo: 'eliminar',   alvo: 20 }, vel: 75,  intervalo: 1.3,  max: 8,  lote: 1, pesos: { caranguejo: 1 } },
  { nome: 'Lulas Velozes',    objetivo: { tipo: 'sobreviver', alvo: 30 }, vel: 80,  intervalo: 1.2,  max: 10, lote: 1, pesos: { caranguejo: 3, lula: 2 } },
  { nome: 'Cerco',            objetivo: { tipo: 'eliminar',   alvo: 35 }, vel: 90,  intervalo: 1.0,  max: 12, lote: 2, pesos: { caranguejo: 3, lula: 3 } },
  { nome: 'Mãe-Polvo',        objetivo: { tipo: 'chefe',      alvo: 1 },  vel: 90,  intervalo: 1.8,  max: 6,  lote: 1, pesos: { caranguejo: 3, lula: 1 }, chefe: { vida: 25, vel: 55 } },
  { nome: 'Gigantes',         objetivo: { tipo: 'eliminar',   alvo: 40 }, vel: 100, intervalo: 0.9,  max: 14, lote: 2, pesos: { caranguejo: 2, lula: 2, polvo: 2 } },
  { nome: 'Resistência',      objetivo: { tipo: 'sobreviver', alvo: 45 }, vel: 110, intervalo: 0.8,  max: 16, lote: 2, pesos: { caranguejo: 1, lula: 2, polvo: 2 } },
  { nome: 'Tempestade',       objetivo: { tipo: 'eliminar',   alvo: 60 }, vel: 120, intervalo: 0.7,  max: 18, lote: 2, pesos: { caranguejo: 2, lula: 3, polvo: 3 } },
  { nome: 'Maré Alta',        objetivo: { tipo: 'sobreviver', alvo: 60 }, vel: 130, intervalo: 0.65, max: 20, lote: 2, pesos: { caranguejo: 1, lula: 3, polvo: 3 } },
  { nome: 'Rainha Pixel',     objetivo: { tipo: 'chefe',      alvo: 1 },  vel: 125, intervalo: 1.1,  max: 12, lote: 2, pesos: { caranguejo: 2, lula: 3, polvo: 2 }, chefe: { vida: 50, vel: 70 } }
];

if (FASES.length !== TOTAL_FASES) {
  console.warn(`FASES tem ${FASES.length} itens, mas TOTAL_FASES é ${TOTAL_FASES}.`);
}

/* =====================================================================
   SPRITES (pixel art desenhada em código)
   ===================================================================== */
function compilar(linhas) {
  const cells = [];
  linhas.forEach((linha, r) => {
    for (let c = 0; c < linha.length; c++) if (linha[c] === '#') cells.push([c, r]);
  });
  return { w: linhas[0].length, h: linhas.length, cells };
}

const SPRITES = {
  nave: compilar([
    '.....#.....',
    '....###....',
    '....###....',
    '...#####...',
    '..#######..',
    '.#########.',
    '####.#.####',
    '###.....###',
    '##.......##'
  ]),
  caranguejo: [
    compilar(['..#.....#..', '...#...#...', '..#######..', '.##.###.##.', '###########', '#.#######.#', '#.#.....#.#', '...##.##...']),
    compilar(['..#.....#..', '#..#...#..#', '#.#######.#', '###.###.###', '###########', '.#########.', '..#.....#..', '.#.......#.'])
  ],
  lula: [
    compilar(['...##...', '..####..', '.######.', '##.##.##', '########', '..#..#..', '.#.##.#.', '#.#..#.#']),
    compilar(['...##...', '..####..', '.######.', '##.##.##', '########', '.#.##.#.', '#......#', '.#....#.'])
  ],
  polvo: [
    compilar(['....####....', '.##########.', '############', '###..##..###', '############', '...##..##...', '..##.##.##..', '##........##']),
    compilar(['....####....', '.##########.', '############', '###..##..###', '############', '..###..###..', '.##..##..##.', '..##....##..'])
  ],
  explosao: compilar([
    '.#..#...#..#.',
    '..#..#.#..#..',
    '...#.....#...',
    '##.........##',
    '...#.....#...',
    '..#..#.#..#..',
    '.#..#...#..#.'
  ])
};

const TIPOS = {
  caranguejo: { nome: 'caranguejo', cor: '#5dff7a', pontos: 10, vel: 1.0 },
  lula:       { nome: 'lula',       cor: '#ff5ad8', pontos: 20, vel: 1.3 },
  polvo:      { nome: 'polvo',      cor: '#ffd23f', pontos: 30, vel: 0.8 }
};

/* =====================================================================
   ESTADO GLOBAL
   ===================================================================== */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);
const ui = $('ui');

let W = 0, H = 0, DPR = 1, PX = 4, ESC = 1;       // tamanho, escala do pixel e escala de velocidade
let SAFE = { t: 0, r: 0, b: 0, l: 0 };            // áreas seguras (notch do celular)

// 'menu' | 'jogando' | 'pausado' | 'encerrando' | 'vitoria' | 'fim'
let estado = 'menu';
let modoEntrada = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ? 'toque' : 'mouse';

const mouse = { x: 0, y: 0, pressionado: false, moveu: false };
const teclas = {};
const stickMov = novoStick();
const stickMira = novoStick();
let tiroPendente = false;

let jogador = null;
let inimigos = [], projeteis = [], particulas = [], flashes = [], estrelas = [], decoracao = [];
let chefe = null, chefeDerrotado = false;

let faseAtual = 1, cfgFase = FASES[0];
let pontosFase = 0, abatidos = 0, tempoFase = 0, tempoSpawn = 0, tempoAnim = 0;
let tremor = 0, flashDano = 0, tempoEncerrar = 0;
let resultado = null, estrelasGanhas = 0, bonusVidas = 0;

// Conta e progresso
let modo = null;                 // null | 'convidado' | 'nuvem'
let usuario = null;              // { uid, nome }
let progresso = progressoVazio();
let authDisponivel = false;
let filaSalvar = Promise.resolve();

/* =====================================================================
   UTILITÁRIOS
   ===================================================================== */
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const fmt = (n) => String(n).padStart(6, '0');
const fmtTempo = (s) => {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

// Distância de um ponto a um segmento (colisão "varrida": o tiro não atravessa inimigos)
function distSegPonto(x1, y1, x2, y2, px, py) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// Desenha um sprite centralizado em (cx, cy). Todos os pixels vão em um único path.
function desenharSprite(spr, cx, cy, escala, cor, rot = 0) {
  ctx.save();
  ctx.translate(Math.round(cx), Math.round(cy));
  if (rot) ctx.rotate(rot);
  const ox = -spr.w * escala / 2, oy = -spr.h * escala / 2;
  ctx.fillStyle = cor;
  ctx.beginPath();
  for (const [c, r] of spr.cells) ctx.rect(ox + c * escala, oy + r * escala, escala, escala);
  ctx.fill();
  ctx.restore();
}

function lerSafeArea() {
  const sonda = document.createElement('div');
  sonda.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;' +
    'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) ' +
    'env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  document.body.appendChild(sonda);
  const cs = getComputedStyle(sonda);
  SAFE = {
    t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0,
    b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0
  };
  sonda.remove();
}

let toastTimer = null;
function toast(texto, tipo = 'ok') {
  const el = $('toast');
  el.textContent = texto;
  el.className = 'mostrar ' + tipo;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 3600);
}

/* =====================================================================
   ÁUDIO (Web Audio API, sons gerados por código)
   ===================================================================== */
let audioCtx = null, mudo = false, bufferRuidoCache = null;

function iniciarAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { audioCtx = null; }
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

function tom(f0, f1, dur, tipo = 'square', vol = 0.05) {
  if (!audioCtx || mudo) return;
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = tipo;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(audioCtx.destination);
  o.start(t);
  o.stop(t + dur);
}

function bufferRuido() {
  if (!bufferRuidoCache) {
    const len = audioCtx.sampleRate;
    bufferRuidoCache = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const d = bufferRuidoCache.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return bufferRuidoCache;
}

function ruido(dur, vol = 0.16, freq = 2000) {
  if (!audioCtx || mudo) return;
  const t = audioCtx.currentTime;
  const src = audioCtx.createBufferSource();
  src.buffer = bufferRuido();
  const filtro = audioCtx.createBiquadFilter();
  filtro.type = 'lowpass';
  filtro.frequency.setValueAtTime(freq, t);
  filtro.frequency.exponentialRampToValueAtTime(120, t + dur);
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filtro).connect(g).connect(audioCtx.destination);
  src.start(t);
  src.stop(t + dur);
}

const somTiro     = () => tom(900, 200, 0.11, 'square', 0.04);
const somExplosao = () => { ruido(0.32, 0.18, 2400); tom(180, 40, 0.25, 'sawtooth', 0.05); };
const somDano     = () => { ruido(0.6, 0.28, 1600); tom(300, 50, 0.5, 'sawtooth', 0.08); };
const somFim      = () => { ruido(1.0, 0.3, 1400); tom(220, 30, 0.9, 'sawtooth', 0.1); };
const somChefeHit = () => tom(160, 70, 0.08, 'square', 0.05);
const somVitoria  = () => {
  [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tom(f, f, 0.14, 'square', 0.045), i * 120));
};

/* =====================================================================
   FUNDO (estrelas) E DECORAÇÃO DO MENU
   ===================================================================== */
function gerarEstrelas() {
  const n = Math.round((W * H) / 9000);
  estrelas = [];
  for (let i = 0; i < n; i++) {
    estrelas.push({
      x: Math.random() * W, y: Math.random() * H,
      tam: Math.random() < 0.2 ? 2 : 1,
      fase: rand(0, 6.28), vel: rand(4, 18)
    });
  }
  const nomes = ['caranguejo', 'lula', 'polvo'];
  decoracao = [];
  for (let i = 0; i < 8; i++) {
    decoracao.push({
      x: Math.random() * W, y: rand(0.08, 0.92) * H,
      vel: rand(12, 34) * (Math.random() < 0.5 ? -1 : 1),
      tipo: nomes[i % 3], anim: rand(0, 1)
    });
  }
}

function atualizarEstrelas(dt) {
  for (const s of estrelas) {
    s.y += s.vel * dt;
    if (s.y > H) { s.y = 0; s.x = Math.random() * W; }
  }
  if (estado === 'menu') {
    for (const d of decoracao) {
      d.x += d.vel * dt;
      if (d.x > W + 60) d.x = -60;
      if (d.x < -60) d.x = W + 60;
    }
  }
}

function desenharEstrelas() {
  for (const s of estrelas) {
    const a = 0.35 + 0.35 * Math.sin(tempoAnim * 2 + s.fase);
    ctx.fillStyle = `rgba(190, 210, 255, ${a})`;
    ctx.fillRect(Math.round(s.x), Math.round(s.y), s.tam * 2, s.tam * 2);
  }
}

function desenharDecoracao() {
  ctx.globalAlpha = 0.22;
  for (const d of decoracao) {
    const t = TIPOS[d.tipo];
    const frame = Math.floor(tempoAnim * 2 + d.anim * 2) % 2;
    desenharSprite(SPRITES[t.nome][frame], d.x, d.y, PX, t.cor);
  }
  ctx.globalAlpha = 1;
}

/* =====================================================================
   ENTRADA: JOYSTICKS VIRTUAIS (toque)
   ===================================================================== */
function novoStick() {
  return { id: null, ativo: false, ox: 0, oy: 0, x: 0, y: 0, vx: 0, vy: 0 };
}

function iniciarStick(s, id, x, y) {
  s.id = id; s.ativo = true;
  s.ox = x; s.oy = y; s.x = x; s.y = y;
  s.vx = 0; s.vy = 0;
}

// Joystick "flutuante": se o dedo passa do alcance, a base acompanha o dedo.
function moverStick(s, x, y) {
  const R = CFG.raioStick;
  let dx = x - s.ox, dy = y - s.oy;
  const d = Math.hypot(dx, dy);
  if (d > R) {
    const k = (d - R) / d;
    s.ox += dx * k; s.oy += dy * k;
    dx = x - s.ox; dy = y - s.oy;
  }
  s.x = s.ox + dx; s.y = s.oy + dy;
  s.vx = dx / R; s.vy = dy / R;
}

function resetStick(s) {
  s.id = null; s.ativo = false; s.vx = 0; s.vy = 0;
}

/* Direção de movimento desejada (teclado + joystick esquerdo), com módulo ≤ 1 */
function lerMovimento() {
  let kx = 0, ky = 0;
  if (teclas['KeyA'] || teclas['ArrowLeft'])  kx -= 1;
  if (teclas['KeyD'] || teclas['ArrowRight']) kx += 1;
  if (teclas['KeyW'] || teclas['ArrowUp'])    ky -= 1;
  if (teclas['KeyS'] || teclas['ArrowDown'])  ky += 1;
  if (kx && ky) { kx *= Math.SQRT1_2; ky *= Math.SQRT1_2; }

  let sx = 0, sy = 0;
  if (stickMov.ativo) {
    const m = Math.hypot(stickMov.vx, stickMov.vy);
    if (m > CFG.zonaMorta) { sx = stickMov.vx; sy = stickMov.vy; }
  }
  let ix = kx + sx, iy = ky + sy;
  const m = Math.hypot(ix, iy);
  if (m > 1) { ix /= m; iy /= m; }
  return { ix, iy };
}

/* =====================================================================
   JOGADOR
   ===================================================================== */
function criarJogador() {
  return {
    x: W / 2, y: H / 2, vx: 0, vy: 0,
    ang: -Math.PI / 2,
    vidas: CFG.vidasPorFase,
    invuln: 0, cooldown: 0, raio: 12
  };
}

function atualizarJogador(dt) {
  const j = jogador;
  const { ix, iy } = lerMovimento();

  const vel = CFG.velJogador * ESC;
  const k = Math.min(1, CFG.aceleracao * dt);
  j.vx += (ix * vel - j.vx) * k;
  j.vy += (iy * vel - j.vy) * k;
  j.x += j.vx * dt;
  j.y += j.vy * dt;

  const m = 20;
  j.x = Math.max(m + SAFE.l * 0.5, Math.min(W - m - SAFE.r * 0.5, j.x));
  j.y = Math.max(m, Math.min(H - m, j.y));

  // Mira: cursor do mouse ou joystick direito
  if (modoEntrada === 'mouse') {
    j.ang = Math.atan2(mouse.y - j.y, mouse.x - j.x);
  } else if (stickMira.ativo && Math.hypot(stickMira.vx, stickMira.vy) > 0.2) {
    j.ang = Math.atan2(stickMira.vy, stickMira.vx);
  }

  // Tiro: segurar o botão do mouse ou usar o joystick direito dispara continuamente
  j.cooldown -= dt;
  if (j.invuln > 0) j.invuln -= dt;
  const atirando = (modoEntrada === 'mouse' && mouse.pressionado) || stickMira.ativo || tiroPendente;
  if (atirando && j.cooldown <= 0) {
    atirar();
    j.cooldown = CFG.cooldownTiro;
    tiroPendente = false;
  }
}

function desenharJogador() {
  const j = jogador;
  if (j.invuln > 0 && Math.floor(j.invuln * 12) % 2 === 0) return;   // pisca ao levar dano
  const rot = j.ang + Math.PI / 2;
  const spr = SPRITES.nave;
  const escala = Math.max(3, PX - 1);

  // Chama do motor
  ctx.save();
  ctx.translate(Math.round(j.x), Math.round(j.y));
  ctx.rotate(rot);
  const fy = spr.h * escala / 2;
  const comp = (Math.sin(tempoAnim * 40) > 0 ? 3 : 2) * escala;
  ctx.fillStyle = '#ff9a2e';
  ctx.fillRect(-escala * 1.5, fy, escala, comp);
  ctx.fillRect(escala * 0.5, fy, escala, comp);
  ctx.restore();

  desenharSprite(spr, j.x, j.y, escala, '#5df2ff', rot);
}

/* =====================================================================
   PROJÉTEIS
   ===================================================================== */
function atirar() {
  const j = jogador;
  const dx = Math.cos(j.ang), dy = Math.sin(j.ang);
  const x = j.x + dx * 22, y = j.y + dy * 22;
  projeteis.push({
    x, y, ox: x, oy: y,
    vx: dx * CFG.velProjetil * Math.max(0.8, ESC), vy: dy * CFG.velProjetil * Math.max(0.8, ESC),
    ang: j.ang, vida: 1.4, morto: false
  });
  somTiro();
}

function atualizarProjeteis(dt) {
  for (const p of projeteis) {
    p.ox = p.x; p.oy = p.y;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vida -= dt;
    if (p.vida <= 0 || p.x < -40 || p.x > W + 40 || p.y < -40 || p.y > H + 40) p.morto = true;
  }
}

function desenharProjeteis() {
  for (const p of projeteis) {
    ctx.save();
    ctx.translate(Math.round(p.x), Math.round(p.y));
    ctx.rotate(p.ang);
    ctx.fillStyle = 'rgba(255, 245, 138, 0.35)';
    ctx.fillRect(-PX * 6, -PX / 2, PX * 4, PX);      // rastro
    ctx.fillStyle = '#fff58a';
    ctx.fillRect(-PX * 2, -PX / 2, PX * 4, PX);      // corpo
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, -PX / 2, PX * 2, PX);            // núcleo
    ctx.restore();
  }
}

/* =====================================================================
   INIMIGOS
   ===================================================================== */
function sortearTipo(pesos) {
  const entradas = Object.entries(pesos);
  const total = entradas.reduce((s, [, p]) => s + p, 0);
  let r = Math.random() * total;
  for (const [nome, p] of entradas) { r -= p; if (r <= 0) return TIPOS[nome]; }
  return TIPOS.caranguejo;
}

function spawnInimigo() {
  const tipo = sortearTipo(cfgFase.pesos);
  const spr = SPRITES[tipo.nome][0];
  const raio = Math.max(spr.w, spr.h) * PX * 0.4;
  const m = raio + 24;
  let x, y;
  switch ((Math.random() * 4) | 0) {        // aparece em uma das 4 bordas
    case 0: x = rand(0, W); y = -m; break;
    case 1: x = W + m;      y = rand(0, H); break;
    case 2: x = rand(0, W); y = H + m; break;
    default: x = -m;        y = rand(0, H);
  }
  const rampa = 1 + Math.min(0.2, tempoFase / 200);   // acelera um pouco durante a fase
  inimigos.push({
    x, y, tipo, raio,
    vel: cfgFase.vel * tipo.vel * rand(0.85, 1.15) * ESC * rampa,
    fase: rand(0, 6.28), anim: rand(0, 1), morto: false
  });
}

function atualizarInimigos(dt) {
  const j = jogador;
  for (const e of inimigos) {
    // Persegue o jogador com um leve zigue-zague
    const dx = j.x - e.x, dy = j.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = dx / d, ny = dy / d;
    const zig = Math.sin(e.fase + tempoFase * 3) * 0.35;
    e.x += (nx - ny * zig) * e.vel * dt;
    e.y += (ny + nx * zig) * e.vel * dt;
  }

  // Separação simples para os inimigos não se empilharem
  for (let i = 0; i < inimigos.length; i++) {
    for (let k = i + 1; k < inimigos.length; k++) {
      const a = inimigos[i], b = inimigos[k];
      const dx = b.x - a.x, dy = b.y - a.y;
      const min = (a.raio + b.raio) * 0.8;
      const d2 = dx * dx + dy * dy;
      if (d2 < min * min && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        const nx = dx / d, ny = dy / d;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
      }
    }
  }
}

function desenharInimigos(animar) {
  for (const e of inimigos) {
    const frames = SPRITES[e.tipo.nome];
    const frame = animar ? Math.floor(tempoAnim * 2 + e.anim * 2) % 2 : 0;
    desenharSprite(frames[frame], e.x, e.y, PX, e.tipo.cor);
  }
}

/* =====================================================================
   CHEFE
   ===================================================================== */
function criarChefe() {
  const cfg = cfgFase.chefe;
  const spr = SPRITES.polvo[0];
  const esc = PX * 3;
  const raio = Math.max(spr.w, spr.h) * esc * 0.4;
  return {
    x: W / 2, y: -raio - 20, raio, esc,
    vida: cfg.vida, vidaMax: cfg.vida, vel: cfg.vel, flash: 0
  };
}

function atualizarChefe(dt) {
  if (!chefe) return;
  const j = jogador;
  const dx = j.x - chefe.x, dy = j.y - chefe.y;
  const d = Math.hypot(dx, dy) || 1;
  const furia = 1 + 0.7 * (1 - chefe.vida / chefe.vidaMax);   // fica mais rápido ao apanhar
  chefe.x += (dx / d) * chefe.vel * furia * ESC * dt;
  chefe.y += (dy / d) * chefe.vel * furia * ESC * dt;
  if (chefe.flash > 0) chefe.flash -= dt;
}

function desenharChefe(animar) {
  if (!chefe) return;
  const frame = animar ? Math.floor(tempoAnim * 3) % 2 : 0;
  const cor = chefe.flash > 0 ? '#ffffff' : '#ff4d5e';
  desenharSprite(SPRITES.polvo[frame], chefe.x, chefe.y, chefe.esc, cor);
}

function danoChefe() {
  chefe.vida--;
  chefe.flash = 0.08;
  faiscas(chefe.x, chefe.y, '#ff4d5e', 6);
  somChefeHit();
  if (chefe.vida <= 0) matarChefe();
}

function matarChefe() {
  pontosFase += CFG.pontosChefe;
  for (let i = 0; i < 8; i++) {
    explodir(chefe.x + rand(-chefe.raio, chefe.raio), chefe.y + rand(-chefe.raio, chefe.raio), '#ff4d5e', 20, 1.6);
  }
  tremor = Math.max(tremor, 24);
  somFim();
  chefe = null;
  chefeDerrotado = true;
}

/* =====================================================================
   PARTÍCULAS E EXPLOSÃO (estilo Space Invaders)
   ===================================================================== */
function faiscas(x, y, cor, qtd) {
  for (let i = 0; i < qtd; i++) {
    const a = rand(0, Math.PI * 2);
    const v = rand(60, 200);
    const vida = rand(0.2, 0.45);
    particulas.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vida, max: vida, tam: PX, cor: pick([cor, '#ffffff']) });
  }
}

function explodir(x, y, cor, qtd = 22, escala = 1) {
  // Flash: o "splat" clássico, branco e depois na cor do inimigo
  flashes.push({ x, y, t: 0, dur: 0.2, cor, esc: escala });

  // Pixels quadrados que se espalham
  const cores = [cor, cor, '#ffffff', '#ffe66d'];
  for (let i = 0; i < qtd; i++) {
    const a = rand(0, Math.PI * 2);
    const v = rand(70, 300) * escala;
    const vida = rand(0.35, 0.85);
    particulas.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      vida, max: vida,
      tam: Math.round(PX * (Math.random() < 0.35 ? 2 : 1)),
      cor: pick(cores)
    });
  }
}

function atualizarParticulas(dt) {
  const atrito = Math.pow(0.08, dt);
  for (const p of particulas) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= atrito;
    p.vy *= atrito;
    p.vida -= dt;
  }
  particulas = particulas.filter(p => p.vida > 0);

  for (const f of flashes) f.t += dt;
  flashes = flashes.filter(f => f.t < f.dur);
}

function desenharParticulas() {
  for (const p of particulas) {
    const a = Math.max(0, p.vida / p.max);
    const t = Math.max(1, Math.round(p.tam * (0.4 + 0.6 * a)));
    ctx.globalAlpha = a;
    ctx.fillStyle = p.cor;
    ctx.fillRect(Math.round(p.x - t / 2), Math.round(p.y - t / 2), t, t);
  }
  ctx.globalAlpha = 1;

  for (const f of flashes) {
    const k = f.t / f.dur;
    ctx.globalAlpha = 1 - k * 0.6;
    desenharSprite(SPRITES.explosao, f.x, f.y, PX * (1.1 + k * 0.5) * f.esc, k < 0.5 ? '#ffffff' : f.cor);
  }
  ctx.globalAlpha = 1;
}

/* =====================================================================
   COLISÕES E DANO
   ===================================================================== */
function colisoes() {
  // Tiros x inimigos e tiros x chefe
  for (const p of projeteis) {
    if (p.morto) continue;
    for (const e of inimigos) {
      if (e.morto) continue;
      if (distSegPonto(p.ox, p.oy, p.x, p.y, e.x, e.y) < e.raio + 4) {
        p.morto = true;
        e.morto = true;
        matarInimigo(e);
        break;
      }
    }
    if (!p.morto && chefe && distSegPonto(p.ox, p.oy, p.x, p.y, chefe.x, chefe.y) < chefe.raio + 4) {
      p.morto = true;
      danoChefe();
    }
  }

  // Inimigos e chefe x jogador
  if (estado === 'jogando' && jogador.invuln <= 0) {
    for (const e of inimigos) {
      if (e.morto) continue;
      if (Math.hypot(e.x - jogador.x, e.y - jogador.y) < e.raio + jogador.raio) {
        e.morto = true;
        explodir(e.x, e.y, e.tipo.cor, 22, 1);
        danoJogador(e.x, e.y, false);
        break;
      }
    }
    if (estado === 'jogando' && jogador.invuln <= 0 && chefe &&
        Math.hypot(chefe.x - jogador.x, chefe.y - jogador.y) < chefe.raio * 0.85 + jogador.raio) {
      danoJogador(chefe.x, chefe.y, true);
    }
  }

  projeteis = projeteis.filter(p => !p.morto);
  inimigos = inimigos.filter(e => !e.morto);
}

function matarInimigo(e) {
  pontosFase += e.tipo.pontos;
  abatidos++;
  explodir(e.x, e.y, e.tipo.cor, 22, 1);
  tremor = Math.max(tremor, 5);
  somExplosao();
}

function danoJogador(ox, oy, empurrar) {
  jogador.vidas--;
  jogador.invuln = CFG.invulnerabilidade;
  tremor = Math.max(tremor, 16);
  flashDano = 0.35;
  if (empurrar) {     // o chefe empurra o jogador para longe
    const dx = jogador.x - ox, dy = jogador.y - oy;
    const d = Math.hypot(dx, dy) || 1;
    jogador.vx = dx / d * 700;
    jogador.vy = dy / d * 700;
  }
  if (jogador.vidas <= 0) derrota(); else somDano();
}

/* =====================================================================
   FLUXO DAS FASES
   ===================================================================== */
function iniciarFase(n) {
  iniciarAudio();
  faseAtual = Math.max(1, Math.min(TOTAL_FASES, n));
  cfgFase = FASES[faseAtual - 1];

  jogador = criarJogador();
  inimigos = []; projeteis = []; particulas = []; flashes = [];
  pontosFase = 0; abatidos = 0; tempoFase = 0; tempoSpawn = 1.2;
  tremor = 0; flashDano = 0; tiroPendente = false;
  resultado = null; estrelasGanhas = 0; bonusVidas = 0;
  chefeDerrotado = false;
  chefe = cfgFase.objetivo.tipo === 'chefe' ? criarChefe() : null;
  resetStick(stickMov); resetStick(stickMira);
  mouse.pressionado = false;

  estado = 'jogando';
  mostrarTela(null);
  document.body.classList.add('em-jogo');
  $('botoes-jogo').classList.remove('oculto');
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  atualizarCursor();
}

function objetivoCumprido() {
  const o = cfgFase.objetivo;
  if (o.tipo === 'eliminar') return abatidos >= o.alvo;
  if (o.tipo === 'sobreviver') return tempoFase >= o.alvo;
  return chefeDerrotado;
}

function textoObjetivo() {
  const o = cfgFase.objetivo;
  if (o.tipo === 'eliminar') return `ELIMINE ${Math.min(abatidos, o.alvo)}/${o.alvo}`;
  if (o.tipo === 'sobreviver') return `SOBREVIVA ${fmtTempo(o.alvo - tempoFase)}`;
  return 'DERROTE O CHEFE';
}

function descricaoObjetivo() {
  const o = cfgFase.objetivo;
  if (o.tipo === 'eliminar') return `Elimine ${o.alvo} inimigos`;
  if (o.tipo === 'sobreviver') return `Sobreviva por ${o.alvo} segundos`;
  return 'Derrote o chefe!';
}

function concluirFase() {
  estado = 'encerrando';
  resultado = 'vitoria';
  tempoEncerrar = 1.4;
  bonusVidas = jogador.vidas * CFG.bonusPorVida;
  pontosFase += bonusVidas;
  estrelasGanhas = Math.max(1, Math.min(3, jogador.vidas));

  for (const e of inimigos) explodir(e.x, e.y, e.tipo.cor, 14, 0.8);
  inimigos = []; projeteis = [];
  mouse.pressionado = false; tiroPendente = false;
  resetStick(stickMov); resetStick(stickMira);
  tremor = Math.max(tremor, 10);
  somVitoria();
  atualizarCursor();
}

function derrota() {
  estado = 'encerrando';
  resultado = 'derrota';
  tempoEncerrar = 1.5;
  estrelasGanhas = 0;
  mouse.pressionado = false; tiroPendente = false;
  resetStick(stickMov); resetStick(stickMira);
  explodir(jogador.x, jogador.y, '#5df2ff', 60, 2.2);
  tremor = 26;
  somFim();
  atualizarCursor();
}

/* Chamado quando a animação de fim de fase termina: salva e mostra a tela. */
function finalizarFase() {
  const venceu = resultado === 'vitoria';
  const antes = JSON.stringify(progresso);
  const info = aplicarResultado(faseAtual, pontosFase, estrelasGanhas, venceu);
  const mudou = JSON.stringify(progresso) !== antes;

  document.body.classList.remove('em-jogo');
  $('botoes-jogo').classList.add('oculto');

  if (venceu) {
    estado = 'vitoria';
    const ultima = faseAtual === TOTAL_FASES;
    $('vit-titulo').textContent = ultima ? 'VOCÊ VENCEU O JOGO!' : 'FASE CONCLUÍDA!';
    $('vit-estrelas').textContent = '★'.repeat(estrelasGanhas) + '☆'.repeat(3 - estrelasGanhas);
    $('vit-pontos').textContent = `PONTOS  ${fmt(pontosFase)}`;
    const extras = [];
    if (bonusVidas > 0) extras.push(`Bônus de vidas: +${bonusVidas}`);
    if (info.recordeFase) extras.push('NOVO RECORDE NA FASE!');
    if (info.desbloqueou) extras.push(`Fase ${faseAtual + 1} liberada!`);
    $('vit-extra').textContent = extras.join('  ·  ');
    $('btn-proxima').classList.toggle('oculto', ultima);
    mostrarTela('vitoria');
  } else {
    estado = 'fim';
    $('fim-pontos').textContent = `PONTOS  ${fmt(pontosFase)}`;
    $('fim-extra').textContent = info.recordeFase ? 'Nova melhor pontuação nesta fase!' : '';
    mostrarTela('fim');
  }
  atualizarCursor();
  if (mudou) salvarProgresso();   // só salva quando há novidade
}

/* =====================================================================
   PROGRESSO (convidado = localStorage; conta escolar = Firestore)
   ===================================================================== */
function aplicarResultado(n, pontos, estrelasFase, concluida) {
  const anterior = progresso.fases[n] || { estrelas: 0, pontos: 0 };
  const maiorAntes = progresso.maiorFase;
  // Derrota sem melhorar a pontuação da fase: nada para registrar nem salvar
  if (!concluida && pontos <= anterior.pontos) return { recordeFase: false, desbloqueou: false };
  progresso.fases[n] = {
    estrelas: Math.max(anterior.estrelas, concluida ? estrelasFase : 0),
    pontos: Math.max(anterior.pontos, pontos)
  };
  if (concluida) progresso.maiorFase = Math.max(progresso.maiorFase, Math.min(TOTAL_FASES, n + 1));
  progresso = normalizarProgresso(progresso);
  return {
    recordeFase: pontos > anterior.pontos && pontos > 0,
    desbloqueou: concluida && progresso.maiorFase > maiorAntes
  };
}

function salvarProgresso() {
  const copia = normalizarProgresso(progresso);
  if (modo === 'convidado') {
    gravarLocal(CFG.chaveConvidado, copia);
    return Promise.resolve();
  }
  if (modo !== 'nuvem' || !usuario) return Promise.resolve();

  const uid = usuario.uid;
  gravarLocal(CFG.prefixoCache + uid, copia);       // cópia local de segurança (também serve de fallback)
  filaSalvar = filaSalvar.then(async () => {
    try {
      await salvarProgressoNuvem(uid, copia);
      toast('Progresso salvo ✓');
    } catch (e) {
      toast('Sem conexão com o servidor. Progresso guardado neste aparelho e enviado na próxima vez.', 'aviso');
    }
  });
  return filaSalvar;
}

async function carregarProgressoDoUsuario() {
  const uid = usuario.uid;
  const cache = normalizarProgresso(lerLocal(CFG.prefixoCache + uid));
  try {
    const nuvem = await carregarProgressoNuvem(uid);
    progresso = mesclarProgresso(nuvem || progressoVazio(), cache);
    const temAlgo = Object.keys(progresso.fases).length > 0;
    const igual = nuvem && JSON.stringify(normalizarProgresso(nuvem)) === JSON.stringify(progresso);
    if (!igual && (nuvem || temAlgo)) salvarProgresso();
    toast('Progresso carregado ✓');
  } catch (e) {
    progresso = cache;
    toast('Não foi possível conectar ao servidor. Usando o progresso guardado neste aparelho.', 'aviso');
  }
}

/* =====================================================================
   TELAS (HTML sobre o canvas)
   ===================================================================== */
function mostrarTela(id) {
  for (const s of document.querySelectorAll('.tela')) {
    s.classList.toggle('oculto', s.id !== 'tela-' + id);
  }
  ui.classList.toggle('oculto', !id);
}

function irParaInicio() {
  estado = 'menu';
  document.body.classList.remove('em-jogo');
  $('botoes-jogo').classList.add('oculto');
  mostrarTela('inicio');
  atualizarCursor();
}

function irParaFases() {
  estado = 'menu';
  document.body.classList.remove('em-jogo');
  $('botoes-jogo').classList.add('oculto');
  montarGrade();
  mostrarTela('fases');
  atualizarCursor();
}

function montarGrade() {
  const grade = $('grade-fases');
  grade.innerHTML = '';
  const concluida = progresso.fases[progresso.maiorFase] && progresso.fases[progresso.maiorFase].estrelas > 0;
  for (let n = 1; n <= TOTAL_FASES; n++) {
    const f = progresso.fases[n];
    const liberada = n <= progresso.maiorFase;
    const destaque = n === progresso.maiorFase && !concluida;   // próxima fase a jogar
    const chefeFase = FASES[n - 1].objetivo.tipo === 'chefe';
    const estr = f ? f.estrelas : 0;

    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'fase' + (liberada ? '' : ' bloqueada') + (destaque ? ' atual' : '') + (chefeFase ? ' chefe' : '');
    b.disabled = !liberada;
    b.dataset.acao = 'fase';
    b.dataset.n = String(n);
    b.setAttribute('aria-label', `Fase ${n}: ${FASES[n - 1].nome}${liberada ? '' : ' (bloqueada)'}`);
    b.innerHTML =
      `<span class="num">${n}</span>` +
      `<span class="nome">${chefeFase ? 'CHEFE · ' : ''}${FASES[n - 1].nome}</span>` +
      `<span class="estrelas">${'★'.repeat(estr)}${'☆'.repeat(3 - estr)}</span>` +
      `<span class="pts">${liberada ? fmt(f ? f.pontos : 0) : '🔒'}</span>`;
    grade.appendChild(b);
  }

  $('chip-jogador').textContent = modo === 'nuvem' && usuario ? `👤 ${usuario.nome}` : '👤 Convidado';
  $('resumo').textContent =
    `Total: ${somaPontos(progresso)} pts  ·  ★ ${somaEstrelas(progresso)}/${TOTAL_FASES * 3}`;
  $('aviso-convidado').classList.toggle('oculto', modo !== 'convidado');
}

function msgLogin(texto) { $('msg-login').textContent = texto || ''; }

/* ---------- Ações dos botões ---------- */
async function entrarGoogle() {
  if (!authDisponivel) return;
  const botao = $('btn-google');
  msgLogin('Abrindo o login do Google…');
  botao.disabled = true;
  try {
    await entrarComGoogle();
    msgLogin('');
  } catch (e) {
    msgLogin(e.message || 'Não foi possível entrar.');
  } finally {
    botao.disabled = false;
  }
}

function entrarConvidado() {
  modo = 'convidado';
  usuario = null;
  progresso = normalizarProgresso(lerLocal(CFG.chaveConvidado));
  irParaFases();
}

async function sairDoJogo() {
  if (modo === 'nuvem') {
    try { await sairDaConta(); } catch (e) { /* ignora */ }
    // aoMudarAuth(null) cuida de voltar ao início
    modo = null; usuario = null;
  } else {
    modo = null;
  }
  progresso = progressoVazio();
  msgLogin('');
  irParaInicio();
}

function pausar() {
  if (estado !== 'jogando') return;
  estado = 'pausado';
  mouse.pressionado = false; tiroPendente = false;
  resetStick(stickMov); resetStick(stickMira);
  mostrarTela('pausa');
  atualizarCursor();
}

function retomar() {
  if (estado !== 'pausado') return;
  estado = 'jogando';
  mostrarTela(null);
  atualizarCursor();
}

function acao(nome, el) {
  switch (nome) {
    case 'google':    return entrarGoogle();
    case 'convidado': return entrarConvidado();
    case 'sair':      return sairDoJogo();
    case 'fase': {
      const n = Number(el.dataset.n);
      if (n >= 1 && n <= progresso.maiorFase) iniciarFase(n);
      return;
    }
    case 'proxima':   return iniciarFase(faseAtual + 1);
    case 'repetir':   return iniciarFase(faseAtual);
    case 'fases':     return irParaFases();
    case 'continuar': return retomar();
  }
}

ui.addEventListener('click', (e) => {
  const alvo = e.target.closest ? e.target.closest('[data-acao]') : null;
  if (!alvo || alvo.disabled) return;
  iniciarAudio();
  acao(alvo.dataset.acao, alvo);
  if (alvo.blur) alvo.blur();
});

$('btn-pausa').addEventListener('click', () => { if (estado === 'jogando') pausar(); });

/* ---------- Tela cheia ---------- */
const raiz = document.documentElement;
const podeTelaCheia = !!(raiz.requestFullscreen || raiz.webkitRequestFullscreen);
if (!podeTelaCheia) $('btn-tela-cheia').classList.add('oculto');

function alternarTelaCheia() {
  const ativa = document.fullscreenElement || document.webkitFullscreenElement;
  if (ativa) {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    return;
  }
  try {
    const pedido = (raiz.requestFullscreen || raiz.webkitRequestFullscreen).call(raiz);
    Promise.resolve(pedido)
      .then(() => { try { return screen.orientation.lock('landscape'); } catch (e) { return null; } })
      .catch(() => {});
  } catch (e) { /* ignora */ }
}
$('btn-tela-cheia').addEventListener('click', alternarTelaCheia);

/* =====================================================================
   LOGIN: reação às mudanças de estado do Firebase
   ===================================================================== */
async function aoMudarAuth(user, erro) {
  if (erro) msgLogin(erro);
  if (user) {
    usuario = user;
    modo = 'nuvem';
    msgLogin('Carregando seu progresso…');
    await carregarProgressoDoUsuario();
    msgLogin('');
    irParaFases();
  } else if (modo === 'nuvem') {
    modo = null; usuario = null;
    progresso = progressoVazio();
    irParaInicio();
  }
}

/* =====================================================================
   HUD E DESENHO
   ===================================================================== */
function texto(txt, x, y, tam, cor, alinhar = 'center') {
  ctx.font = `bold ${tam}px "Courier New", monospace`;
  ctx.textAlign = alinhar;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = cor;
  ctx.fillText(txt, x, y);
}

function desenharHUD() {
  const f = 12 + PX * 2;
  const mx = 16 + SAFE.l;
  const my = 18 + SAFE.t + f / 2;

  texto('PONTOS ' + fmt(pontosFase), mx, my, f, '#ffffff', 'left');
  texto(`FASE ${faseAtual} · ${cfgFase.nome.toUpperCase()}`, mx, my + f + 4, f - 4, '#8fa0ff', 'left');
  texto(textoObjetivo(), W / 2, my, f, '#ffd23f', 'center');

  if (chefe) {
    const bw = Math.min(340, W * 0.4), bx = W / 2 - bw / 2, by = my + f;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, 12);
    ctx.fillStyle = '#ff4d5e';
    ctx.fillRect(bx + 2, by + 2, (bw - 4) * Math.max(0, chefe.vida / chefe.vidaMax), 8);
  }

  // Vidas (à esquerda dos botões de pausa e tela cheia)
  for (let i = 0; i < jogador.vidas; i++) {
    desenharSprite(SPRITES.nave, W - SAFE.r - 135 - i * 30, my, 2, '#5df2ff');
  }

  // Faixa de abertura da fase
  if (estado === 'jogando' && tempoFase < 2.6) {
    ctx.globalAlpha = tempoFase < 2 ? 1 : (2.6 - tempoFase) / 0.6;
    const g = 28 + PX * 6;
    texto(`FASE ${faseAtual}`, W / 2, H * 0.30, g, '#ffffff');
    texto(cfgFase.nome.toUpperCase(), W / 2, H * 0.30 + g * 0.9, g * 0.55, '#5dff7a');
    texto(descricaoObjetivo(), W / 2, H * 0.30 + g * 1.6, g * 0.4, '#cfd6ff');
    ctx.globalAlpha = 1;
  }
}

function desenharMira() {
  const { x, y } = mouse;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  const g = 6, s = PX * 2;
  ctx.fillRect(Math.round(x - g - s), Math.round(y - 1), s, 2);
  ctx.fillRect(Math.round(x + g),     Math.round(y - 1), s, 2);
  ctx.fillRect(Math.round(x - 1), Math.round(y - g - s), 2, s);
  ctx.fillRect(Math.round(x - 1), Math.round(y + g),     2, s);
}

function desenharSticks() {
  const R = CFG.raioStick;
  const base = H - SAFE.b - 90;
  const dicas = [
    [stickMov, SAFE.l + 100, base, '#5df2ff'],
    [stickMira, W - SAFE.r - 100, base, '#ff5ad8']
  ];
  for (const [s, hx, hy, cor] of dicas) {
    const cx = s.ativo ? s.ox : hx, cy = s.ativo ? s.oy : hy;
    const kx = s.ativo ? s.x : hx, ky = s.ativo ? s.y : hy;
    ctx.globalAlpha = s.ativo ? 0.55 : 0.2;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = cor;
    ctx.beginPath();
    ctx.arc(kx, ky, R * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function desenhar() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#05060f';
  ctx.fillRect(0, 0, W, H);
  desenharEstrelas();

  if (estado === 'menu') { desenharDecoracao(); return; }

  const animar = estado === 'jogando' || estado === 'encerrando';
  ctx.save();
  if (tremor > 0) ctx.translate(rand(-tremor, tremor) * 0.5, rand(-tremor, tremor) * 0.5);
  desenharInimigos(animar);
  desenharChefe(animar);
  desenharProjeteis();
  if (jogador.vidas > 0) desenharJogador();
  desenharParticulas();
  ctx.restore();

  if (flashDano > 0) {
    ctx.fillStyle = `rgba(255, 40, 60, ${Math.min(0.35, flashDano)})`;
    ctx.fillRect(0, 0, W, H);
  }

  desenharHUD();
  if (estado === 'jogando') {
    if (modoEntrada === 'mouse') desenharMira(); else desenharSticks();
  }
}

/* =====================================================================
   ATUALIZAÇÃO
   ===================================================================== */
function atualizarJogo(dt) {
  tempoFase += dt;

  // Chegada de inimigos (começa 1,2 s depois do início da fase)
  tempoSpawn -= dt;
  if (tempoSpawn <= 0) {
    const qtd = cfgFase.lote > 1 && Math.random() < 0.35 ? 2 : 1;
    for (let i = 0; i < qtd; i++) if (inimigos.length < cfgFase.max) spawnInimigo();
    tempoSpawn = cfgFase.intervalo;
  }

  atualizarJogador(dt);
  atualizarProjeteis(dt);
  atualizarInimigos(dt);
  atualizarChefe(dt);
  colisoes();

  if (estado === 'jogando' && objetivoCumprido()) concluirFase();
}

function atualizar(dt) {
  tempoAnim += dt;
  atualizarEstrelas(dt);

  if (estado === 'jogando') atualizarJogo(dt);
  if (estado === 'jogando' || estado === 'encerrando') atualizarParticulas(dt);
  if (estado === 'encerrando') {
    tempoEncerrar -= dt;
    if (tempoEncerrar <= 0) finalizarFase();
  }

  if (tremor > 0) { tremor *= Math.pow(0.002, dt); if (tremor < 0.3) tremor = 0; }
  if (flashDano > 0) flashDano -= dt;
}

/* =====================================================================
   LOOP PRINCIPAL (independente da taxa de quadros via delta time)
   ===================================================================== */
let ultimo = 0;
function loop(agora) {
  const dt = Math.min(0.05, (agora - ultimo) / 1000 || 0);
  ultimo = agora;
  atualizar(dt);
  desenhar();
  requestAnimationFrame(loop);
}

/* =====================================================================
   ENTRADA: teclado, mouse e toque
   ===================================================================== */
function atualizarCursor() {
  canvas.style.cursor = (estado === 'jogando' && modoEntrada === 'mouse') ? 'none' : 'default';
}

function redimensionar() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  PX = H < 640 ? 3 : 4;
  ESC = Math.max(0.65, Math.min(1, Math.min(W, H) / 720));   // telas pequenas = velocidades menores
  lerSafeArea();
  if (!mouse.moveu) { mouse.x = W / 2; mouse.y = H * 0.3; }
  gerarEstrelas();
  if (jogador) {
    jogador.x = Math.max(20, Math.min(W - 20, jogador.x));
    jogador.y = Math.max(20, Math.min(H - 20, jogador.y));
  }
}

window.addEventListener('resize', redimensionar);

window.addEventListener('keydown', (e) => {
  teclas[e.code] = true;
  if (estado === 'jogando' &&
      ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;

  if (e.code === 'KeyM') { mudo = !mudo; toast(mudo ? 'Som desligado' : 'Som ligado'); return; }
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (estado === 'jogando') pausar(); else if (estado === 'pausado') retomar();
    return;
  }
  if (e.code === 'KeyR' && (estado === 'fim' || estado === 'vitoria')) iniciarFase(faseAtual);
});

window.addEventListener('keyup', (e) => { teclas[e.code] = false; });

/* Pointer Events: o mesmo código atende mouse, caneta e toque (multitoque). */
canvas.addEventListener('pointerdown', (e) => {
  iniciarAudio();
  if (e.pointerType === 'mouse') {
    modoEntrada = 'mouse';
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.moveu = true;
    if (e.button === 0 && estado === 'jogando') { mouse.pressionado = true; tiroPendente = true; }
    atualizarCursor();
    return;
  }

  // Toque: metade esquerda = mover, metade direita = mirar e atirar
  modoEntrada = 'toque';
  e.preventDefault();
  if (estado !== 'jogando') return;
  const stick = e.clientX < W / 2 ? stickMov : stickMira;
  if (stick.ativo) return;
  iniciarStick(stick, e.pointerId, e.clientX, e.clientY);
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignora */ }
  atualizarCursor();
});

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') {
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.moveu = true;
    if (modoEntrada !== 'mouse') { modoEntrada = 'mouse'; atualizarCursor(); }
    return;
  }
  for (const s of [stickMov, stickMira]) {
    if (s.ativo && s.id === e.pointerId) moverStick(s, e.clientX, e.clientY);
  }
});

function soltarPonteiro(e) {
  if (e.pointerType === 'mouse') {
    if (e.button === 0 || e.type === 'pointercancel') mouse.pressionado = false;
    return;
  }
  for (const s of [stickMov, stickMira]) {
    if (s.id === e.pointerId) resetStick(s);
  }
}
window.addEventListener('pointerup', soltarPonteiro);
window.addEventListener('pointercancel', soltarPonteiro);

// Sem menu de contexto, sem zoom por gesto e sem rolagem durante o jogo
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());
canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

// Pausa automática: aba em segundo plano, perda de foco ou celular na vertical
function soltarTudo() {
  for (const k in teclas) teclas[k] = false;
  mouse.pressionado = false;
  resetStick(stickMov); resetStick(stickMira);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) { soltarTudo(); pausar(); } });
window.addEventListener('blur', () => { soltarTudo(); pausar(); });

if (window.matchMedia) {
  const retrato = window.matchMedia('(orientation: portrait) and (pointer: coarse)');
  const aoGirar = (e) => { if (e.matches) { soltarTudo(); pausar(); } };
  if (retrato.addEventListener) retrato.addEventListener('change', aoGirar);
  else if (retrato.addListener) retrato.addListener(aoGirar);
}

/* =====================================================================
   INÍCIO
   ===================================================================== */
async function iniciarApp() {
  redimensionar();
  requestAnimationFrame(loop);

  $('txt-dominio').textContent = DOMINIO_ESCOLA === 'DOMINIO_DA_ESCOLA'
    ? '@dominio-da-escola' : '@' + DOMINIO_ESCOLA;
  mostrarTela('inicio');

  const botao = $('btn-google');
  botao.disabled = true;
  botao.textContent = 'Conectando…';

  const r = await iniciarAuth(aoMudarAuth);
  authDisponivel = r.disponivel;
  if (r.disponivel) {
    botao.disabled = false;
    botao.textContent = 'Entrar com Google';
  } else {
    botao.textContent = 'Login indisponível';
    msgLogin(r.motivo);
  }
}

iniciarApp();
