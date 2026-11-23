// Imagens do jogo (ficam na pasta img/)
const A = {
  city:   'img/city.png',    // fundo da cidade (parte de cima da imagem)
  ground: 'img/ground.png',  // faixa de grama + tijolos (parte de baixo)
  cloud0: 'img/cloud0.png',
  cloud1: 'img/cloud1.png',
  cloud2: 'img/cloud2.png',
  pipe:   'img/pipe.png',    // o cano
  run:    'img/run.png',     // 4 quadros da corrida lado a lado (97x120 cada)
  over:   'img/over.png',    // personagem surpreso (fim de jogo)
};
const imgs = {};
let loaded = 0;
const names = Object.keys(A);
names.forEach(k => { const im = new Image(); im.onload = () => { if (++loaded === names.length) boot(); }; im.src = A[k]; imgs[k] = im; });

const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
ctx.imageSmoothingEnabled = false;
const W = 800, H = 400;
const K = 400 / 370;
const GY = Math.round(291 * K);   // topo da grama
const PX = 140;                    // posição fixa do personagem na tela

// ---------- estado ----------
const PW = 34, PH = 79;
const P = { x: PX, y: GY - PH, w: PW, h: PH, vy: 0, onGround: true, frame: 0, ft: 0 };
let state = 'title', dist = 0, speed = 5, pipes = [], nextPipe = 0, score = 0, tick = 0, paused = false, deathT = 0;
let best = 0; try { best = +localStorage.getItem('scr_best') || 0; } catch (e) {}

function newGame() {
  jumpBuf = 0; Object.assign(P, { y: GY - PH, vy: 0, onGround: true, frame: 0 });
  dist = 0; speed = 3.5; pipes = []; nextPipe = W + 200; score = 0; state = 'play'; paused = false;
}

// ---------- canos ----------
function spawnPipe(x) {
  const lvl = Math.min(1, dist / 30000);               // dificuldade 0..1
  const h = 50 + Math.floor(Math.random() * (30 + 40 * lvl));   // 50..120
  pipes.push({ x, w: 50, h, passed: false });
  // às vezes um cano em seguida (dupla)
  if (dist > 3000 && Math.random() < 0.1 + 0.25 * lvl) { pipes.push({ x: x + 50 + 120 + Math.random() * 40, w: 50, h: 50 + Math.floor(Math.random() * 50), passed: false }); x += 200; }
  const gap = 360 + Math.random() * 280 - 100 * lvl + speed * 20;
  nextPipe = x + gap;
}

// ---------- controles ----------
const keys = {};
let jumpPressed = false, jumpBuf = 0, coyote = 0;
function act(k, v) { if (v && !keys[k] && k === 'jump') jumpPressed = true; keys[k] = v; }
addEventListener('keydown', e => {
  if (['ArrowUp', 'Space', 'KeyW'].includes(e.code) || e.key === 'ArrowUp' || e.key === ' ') { e.preventDefault(); if (e.repeat) return; if (state !== 'play') { start(); return; } jumpPressed = true; }
  if (['ArrowDown', 'KeyS'].includes(e.code) || e.key === 'ArrowDown') { e.preventDefault(); keys.down = true; }
  if (e.code === 'Enter' && state !== 'play') start();
  if (e.code === 'KeyP' && state === 'play') paused = !paused;
  if (e.code === 'KeyM') muted = !muted;
});
addEventListener('keyup', e => {
  if (['ArrowDown', 'KeyS'].includes(e.code) || e.key === 'ArrowDown') keys.down = false;
});
cv.tabIndex = 0;
function tap(e) { e.preventDefault(); cv.focus(); if (state !== 'play') start(); else { jumpPressed = true; } }
cv.addEventListener('pointerdown', tap);
addEventListener('load', () => { try { cv.focus(); window.focus(); } catch (e) {} });
function start() { audioInit(); if (state === 'dying' && deathT < 50) return; newGame(); }

// ---------- som ----------
let ac = null, muted = false;
function audioInit() { if (!ac) try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
function beep(f1, f2, dur, type = 'square', vol = 0.08) {
  if (!ac || muted) return;
  const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
  o.type = type; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur);
}
const sfxJump = () => beep(300, 700, 0.15);
const sfxPoint = () => beep(880, 1320, 0.08, 'square', 0.05);
const sfxDie = () => beep(500, 90, 0.8, 'sawtooth', 0.08);

// ---------- lógica ----------
const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

function update() {
  tick++;
  if (state === 'dying') { deathT++; P.vy += 0.5; P.y += P.vy; if (deathT > 70) state = 'over'; return; }
  if (state !== 'play' || paused) return;

  speed = Math.min(7, 3.5 + dist / 8000);
  dist += speed;
  score = Math.floor(dist / 10);

  // pulo
  // pulo sempre cheio; aceita o aperto um pouco antes de tocar o chão
  if (jumpPressed) { jumpBuf = 10; jumpPressed = false; }
  if (jumpBuf > 0) jumpBuf--;
  coyote = P.onGround ? 6 : Math.max(0, coyote - 1);
  if (jumpBuf > 0 && coyote > 0) { P.vy = -13.5; P.onGround = false; coyote = 0; jumpBuf = 0; sfxJump(); }
  P.vy += keys.down ? 1.6 : 0.55;                    // ↓ desce mais rápido
  P.vy = Math.min(P.vy, 16);
  P.y += P.vy;

  // canos se movem
  for (const p of pipes) p.x -= speed;
  pipes = pipes.filter(p => p.x + p.w > -20);
  nextPipe -= speed;
  if (nextPipe < W + 100) spawnPipe(nextPipe);

  // chão e topo dos canos
  P.onGround = false;
  if (P.y + P.h >= GY) { P.y = GY - P.h; P.vy = 0; P.onGround = true; }
  const box = { x: P.x + 4, y: P.y + 6, w: P.w - 8, h: P.h - 6 };
  for (const p of pipes) {
    const r = { x: p.x + 3, y: GY - p.h, w: p.w - 6, h: p.h };
    if (!hit(box, r)) continue;
    const feet = P.y + P.h;
    if (P.vy >= 0 && feet - r.y < 22) { P.y = r.y - P.h; P.vy = 0; P.onGround = true; }   // pousou no cano
    else { die(); return; }
  }
  for (const p of pipes) if (!p.passed && p.x + p.w < P.x) { p.passed = true; sfxPoint(); }

  if (P.onGround) { P.ft += speed; if (P.ft > 22) { P.ft = 0; P.frame = (P.frame + 1) % 4; } }
}
function die() {
  state = 'dying'; deathT = 0; P.vy = -10; sfxDie();
  if (score > best) { best = score; try { localStorage.setItem('scr_best', best); } catch (e) {} }
}

// ---------- desenho ----------
function drawBackground() {
  const cw = 740 * K, ox = -((dist * 0.3) % cw);
  for (let x = ox; x < W; x += cw - 1) ctx.drawImage(imgs.city, x, 0, cw, 292 * K);
  const cl = [['cloud0', 60, 6], ['cloud1', 420, 16], ['cloud2', 760, 0], ['cloud0', 1050, 20], ['cloud1', 1400, 8]];
  const span = 1650;
  for (const [n, cx, cy] of cl) {
    const x = ((cx - dist * 0.12 - tick * 0.15) % span + span) % span - 200;
    ctx.drawImage(imgs[n], x, cy);
  }
  const gw = 740 * K, gh = 79 * K, gx = -(dist % gw);
  for (let x = gx; x < W; x += gw - 1) ctx.drawImage(imgs.ground, x, GY - 1, gw, gh + 2);
}
function drawPipe(p) {
  const k = p.w / 293, capSrc = 150, capH = capSrc * k, y = GY - p.h;
  ctx.drawImage(imgs.pipe, 0, 0, 293, capSrc, p.x, y, p.w, capH);
  ctx.drawImage(imgs.pipe, 0, capSrc, 293, 375 - capSrc, p.x, y + capH - 1, p.w, p.h - capH + 2);
}
function drawPlayer() {
  if (state === 'dying' || state === 'over') {
    const ow = 78, oh = ow * imgs.over.height / imgs.over.width;
    if (state === 'dying') ctx.drawImage(imgs.over, P.x + P.w / 2 - ow / 2, P.y - 6, ow, oh);
    return;
  }
  const fw = 97, fh = 120, dw = 72, dh = 89;
  const fr = P.onGround ? P.frame : 2;
  ctx.drawImage(imgs.run, fr * fw, 0, fw, fh, P.x + P.w / 2 - dw / 2 + 2, P.y + P.h + 6 - dh, dw, dh);
}
function txt(s, x, y, size = 16, col = '#fff', align = 'left') {
  ctx.font = `bold ${size}px "DejaVu Sans Mono", monospace`; ctx.textAlign = align;
  ctx.fillStyle = '#000'; ctx.fillText(s, x + 2, y + 2); ctx.fillStyle = col; ctx.fillText(s, x, y);
}
function render() {
  drawBackground();
  for (const p of pipes) drawPipe(p);
  drawPlayer();
  if (state !== 'title') {
    txt('PONTOS', 20, 24, 13); txt(String(score).padStart(6, '0'), 20, 44, 16);
    txt('RECORDE', 780, 24, 13, '#fff', 'right'); txt(String(best).padStart(6, '0'), 780, 44, 16, '#ffd23f', 'right');
  }
  if (state === 'title') {
    ctx.fillStyle = 'rgba(4,10,30,.6)'; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(imgs.run, ((tick >> 3) % 4) * 97, 0, 97, 120, W / 2 - 40, 40, 80, 99);
    txt('SUPER CORRIDA', W / 2, 180, 40, '#ffd23f', 'center');
    txt('Corra sem parar pela cidade e pule os canos!', W / 2, 225, 16, '#fff', 'center');
    txt('↑ pula  ·  ↓ desce rápido', W / 2, 255, 16, '#fff', 'center');
    if ((tick >> 5) % 2) txt('Aperte ↑ / ESPAÇO / toque para começar', W / 2, 320, 15, '#4ade80', 'center');
  }
  if (paused) { ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(0, 0, W, H); txt('PAUSA', W / 2, H / 2, 32, '#fff', 'center'); }
  if (state === 'over') {
    ctx.fillStyle = 'rgba(4,10,30,.72)'; ctx.fillRect(0, 0, W, H);
    const oh = 230, ow = oh * imgs.over.width / imgs.over.height;
    ctx.drawImage(imgs.over, W / 2 - ow - 30, H / 2 - oh / 2 + 10, ow, oh);
    txt('FIM DE JOGO', W / 2 + 10, 170, 34, '#ff4d4d');
    txt('PONTOS: ' + score, W / 2 + 10, 215, 18);
    txt('RECORDE: ' + best, W / 2 + 10, 245, 18, '#ffd23f');
    if ((tick >> 5) % 2) txt('↑ / ESPAÇO / toque: de novo', W / 2 + 10, 300, 14, '#4ade80');
  }
}
function boot() {
  let last = performance.now(), acc = 0;
  (function loop(now) {
    acc += Math.min(100, now - last); last = now;
    while (acc >= 1000 / 60) { update(); acc -= 1000 / 60; }
    render(); requestAnimationFrame(loop);
  })(last);
}
