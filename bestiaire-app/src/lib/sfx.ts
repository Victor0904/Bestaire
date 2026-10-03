// Sons du jeu, synthétisés à la volée avec Web Audio (aucun fichier à télécharger, aucun droit d'auteur).
const KEY = 'bestiaire.son';
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let on = (() => { try { return localStorage.getItem(KEY) !== '0' } catch { return true } })();

export const sonActif = () => on;
export function setSon(v: boolean) { on = v; try { localStorage.setItem(KEY, v ? '1' : '0') } catch { /* stockage indisponible */ } }

function ac(): AudioContext | null {
  if (!on) return null;
  try {
    if (!ctx) {
      const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!C) return null;
      ctx = new C(); master = ctx.createGain(); master.gain.value = 0.35; master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null }
}

type Wave = OscillatorType;
function tone(f0: number, f1: number, dur: number, type: Wave = 'sine', vol = 0.6, delay = 0) {
  const c = ac(); if (!c || !master) return;
  const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur: number, vol = 0.5, fc = 1800, q = 0.8, delay = 0, sweepTo?: number) {
  const c = ac(); if (!c || !master) return;
  const t = c.currentTime + delay, n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = buf; f.type = 'bandpass'; f.frequency.setValueAtTime(fc, t); if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur); f.Q.value = q;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t);
}

export const sfx = {
  tap: () => tone(660, 880, 0.06, 'triangle', 0.25),
  coup: () => { noise(0.12, 0.7, 900, 0.9); tone(180, 60, 0.12, 'square', 0.25) },
  griffe: () => { noise(0.09, 0.6, 3500, 2, 0, 1200); noise(0.09, 0.5, 3000, 2, 0.06, 1000) },
  critique: () => { noise(0.2, 0.9, 700, 0.7); tone(120, 40, 0.25, 'sawtooth', 0.35); tone(900, 1400, 0.12, 'square', 0.15, 0.03) },
  esquive: () => noise(0.18, 0.35, 2500, 1, 0, 600),
  soin: () => { tone(523, 784, 0.18, 'sine', 0.35); tone(784, 1046, 0.22, 'sine', 0.3, 0.12) },
  bouclier: () => { tone(300, 600, 0.2, 'triangle', 0.35); tone(600, 900, 0.25, 'sine', 0.2, 0.05) },
  poison: () => { for (let i = 0; i < 3; i++) tone(300 + i * 60, 180, 0.12, 'sine', 0.25, i * 0.07) },
  etourdi: () => { for (let i = 0; i < 4; i++) tone(1200 - i * 150, 900 - i * 150, 0.08, 'triangle', 0.2, i * 0.06) },
  buff: () => tone(400, 900, 0.25, 'triangle', 0.3),
  ko: () => { tone(400, 60, 0.6, 'sawtooth', 0.3); noise(0.4, 0.4, 400, 0.6, 0.1) },
  ultime: () => { tone(110, 440, 0.5, 'sawtooth', 0.35); noise(0.6, 0.6, 400, 0.5, 0.2, 3000); tone(880, 1760, 0.3, 'square', 0.12, 0.45) },
  victoire: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, f, 0.22, 'triangle', 0.35, i * 0.12)),
  defaite: () => [392, 330, 262].forEach((f, i) => tone(f, f * 0.97, 0.3, 'triangle', 0.3, i * 0.18)),
  etoile: (i = 0) => tone(880 + i * 220, 1320 + i * 220, 0.18, 'triangle', 0.3),
  niveau: () => [523, 784, 1046, 1568].forEach((f, i) => tone(f, f, 0.16, 'square', 0.12, i * 0.08)),
};
