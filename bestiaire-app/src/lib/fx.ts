export const reduceMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const buzz = (p: number | number[]) => { try { navigator.vibrate?.(p) } catch { /* ignoré */ } };
/** Pluie de confettis sur un conteneur (canvas temporaire) */
export function confetti(host: HTMLElement | null, colors: string[], n = 140, delay = 550) {
  if (!host || reduceMotion) return;
  if (delay) { setTimeout(() => confetti(host, colors, n, 0), delay); return }
  const cv = document.createElement('canvas'); cv.className = 'confetti'; host.append(cv);
  const dpr = devicePixelRatio || 1, W = (cv.width = host.clientWidth * dpr), H = (cv.height = host.clientHeight * dpr), ctx = cv.getContext('2d')!;
  const ps = Array.from({ length: n }, () => ({ x: W / 2, y: H * 0.42, vx: (Math.random() - 0.5) * W * 0.03, vy: -Math.random() * H * 0.025 - H * 0.008, r: (3 + Math.random() * 5) * dpr, c: colors[Math.floor(Math.random() * colors.length)], a: Math.random() * 6, va: (Math.random() - 0.5) * 0.3 }));
  const t0 = performance.now();
  const f = (t: number) => {
    ctx.clearRect(0, 0, W, H);
    for (const p of ps) { p.vy += H * 0.0006; p.x += p.vx; p.y += p.vy; p.a += p.va; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); ctx.restore() }
    if (t - t0 < 2600) requestAnimationFrame(f); else cv.remove();
  };
  requestAnimationFrame(f);
}
export const fmtLeft = (ms: number) => { if (ms <= 0) return 'terminée'; const m = Math.ceil(ms / 60000); return m >= 120 ? Math.round(m / 60) + ' h' : m >= 60 ? '1 h ' + (m - 60) + ' min' : m + ' min' };
export const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
