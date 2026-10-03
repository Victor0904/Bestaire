// Effets visuels de combat dessinés sur un canvas : particules, griffures, ondes de choc, ambiance du milieu.
// Code maison, sans dépendance ni image : léger et libre de droits.
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { reduceMotion } from '../lib/fx';

export type FxKind = 'griffes' | 'impact' | 'critique' | 'poison' | 'soin' | 'bouclier' | 'etoiles' | 'nuee' | 'ultime' | 'ko' | 'esquive' | 'buff' | 'debuff' | 'charge';
export interface FxHandle { burst: (kind: FxKind, x: number, y: number, color?: string) => void }

type Shape = 'dot' | 'slash' | 'ring' | 'plus' | 'star' | 'leaf' | 'bubble' | 'ray' | 'spark';
interface P { x: number; y: number; vx: number; vy: number; g: number; life: number; max: number; size: number; grow: number; color: string; shape: Shape; rot: number; vr: number; amb?: boolean; ang?: number; len?: number }

const AMB: Record<string, { n: number; make: (w: number, h: number, night: boolean) => Partial<P> }> = {
  F: { n: 14, make: (w, h, night) => night
    ? { x: Math.random() * w, y: h * (0.3 + Math.random() * 0.6), vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.2, size: 2.2, color: '#f6e27a', shape: 'dot', max: 400 }
    : { x: Math.random() * w, y: -10, vx: 0.2 + Math.random() * 0.4, vy: 0.35 + Math.random() * 0.4, size: 5, color: ['#c98a3a', '#a5662a', '#7b9a3a'][Math.floor(Math.random() * 3)], shape: 'leaf', vr: 0.03, max: 700 } },
  P: { n: 16, make: (w, h) => ({ x: Math.random() * w, y: h * (0.2 + Math.random() * 0.7), vx: 0.3 + Math.random() * 0.4, vy: -0.05 - Math.random() * 0.1, size: 1.8, color: '#fffbe0', shape: 'dot', max: 600 }) },
  H: { n: 14, make: (w, h, night) => ({ x: Math.random() * w, y: h * (0.5 + Math.random() * 0.45), vx: (Math.random() - 0.5) * 0.2, vy: -0.15 - Math.random() * 0.15, size: night ? 2 : 3, color: night ? '#d7f57a' : 'rgba(220,240,255,.7)', shape: night ? 'dot' : 'bubble', max: 450 }) },
  L: { n: 14, make: (w, h) => ({ x: Math.random() * w, y: h * (0.55 + Math.random() * 0.4), vx: -0.6 - Math.random() * 0.6, vy: -0.1, size: 1.6, color: 'rgba(255,255,255,.8)', shape: 'dot', max: 300 }) },
  M: { n: 26, make: (w) => ({ x: Math.random() * w, y: -8, vx: -0.2 + Math.random() * 0.4, vy: 0.5 + Math.random() * 0.6, size: 1.5 + Math.random() * 1.8, color: '#ffffff', shape: 'dot', max: 700 }) },
  V: { n: 12, make: (w, h, night) => ({ x: Math.random() * w, y: h * Math.random(), vx: 0.1, vy: -0.05, size: night ? 1.6 : 1.2, color: night ? '#ffd79a' : 'rgba(255,255,255,.5)', shape: 'dot', max: 500 }) },
};

export const FxLayer = forwardRef<FxHandle, { biome: string; ph: string }>(function FxLayer({ biome, ph }, ref) {
  const cv = useRef<HTMLCanvasElement>(null);
  const parts = useRef<P[]>([]);
  const shake = useRef(0);

  const add = (p: Partial<P>) => parts.current.push({ x: 0, y: 0, vx: 0, vy: 0, g: 0, life: 0, max: 40, size: 3, grow: 0, color: '#fff', shape: 'dot', rot: 0, vr: 0, ...p });

  useImperativeHandle(ref, () => ({
    burst(kind, x, y, color) {
      const lite = reduceMotion; const n = (k: number) => (lite ? Math.ceil(k / 3) : k);
      const R = (a: number, b: number) => a + Math.random() * (b - a);
      switch (kind) {
        case 'griffes': for (let i = 0; i < 3; i++) add({ x: x - 30 + i * 18, y: y - 34, shape: 'slash', len: 70, ang: 1.05, max: 18, size: 5, color: color || '#ffffff', life: -i * 3 });
          for (let i = 0; i < n(10); i++) add({ x, y, vx: R(-3, 3), vy: R(-3, 2), g: 0.15, max: 26, size: R(2, 3.5), color: '#ffd4a8', shape: 'spark' }); break;
        case 'impact': add({ x, y, shape: 'ring', size: 8, grow: 3.2, max: 16, color: color || '#ffffff' });
          for (let i = 0; i < n(14); i++) { const a = R(0, Math.PI * 2), v = R(2, 5); add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0.12, max: R(18, 30), size: R(2, 4), color: color || '#ffe9b0', shape: 'spark' }) } break;
        case 'critique': shake.current = lite ? 0 : 12; add({ x, y, shape: 'ring', size: 10, grow: 5, max: 20, color: '#ffcf4a' }); add({ x, y, shape: 'ring', size: 4, grow: 3.5, max: 24, color: '#ff6a3a', life: -4 });
          for (let i = 0; i < n(26); i++) { const a = R(0, Math.PI * 2), v = R(3, 8); add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0.15, max: R(22, 36), size: R(2.5, 5), color: ['#ffcf4a', '#ff8a3a', '#ffffff'][i % 3], shape: 'spark' }) } break;
        case 'poison': for (let i = 0; i < n(16); i++) add({ x: x + R(-30, 30), y: y + R(-10, 25), vy: R(-1.6, -0.6), vx: R(-0.4, 0.4), max: R(30, 55), size: R(3, 7), color: ['#8fd14f', '#5fae3a', '#b7e86a'][i % 3], shape: 'bubble' }); break;
        case 'soin': for (let i = 0; i < n(14); i++) add({ x: x + R(-35, 35), y: y + R(-5, 30), vy: R(-1.8, -0.8), max: R(34, 55), size: R(5, 9), color: i % 2 ? '#9ff0a8' : '#ffffff', shape: 'plus' });
          add({ x, y, shape: 'ring', size: 20, grow: 1.6, max: 28, color: '#9ff0a8' }); break;
        case 'bouclier': add({ x, y, shape: 'ring', size: 46, grow: 0.4, max: 34, color: '#7cc8ff' }); add({ x, y, shape: 'ring', size: 30, grow: 0.9, max: 26, color: '#c7e8ff', life: -5 });
          for (let i = 0; i < n(10); i++) { const a = R(0, Math.PI * 2); add({ x: x + Math.cos(a) * 46, y: y + Math.sin(a) * 46, max: 24, size: 2.5, color: '#c7e8ff', shape: 'spark' }) } break;
        case 'etoiles': for (let i = 0; i < 5; i++) add({ x, y: y - 50, ang: (i / 5) * Math.PI * 2, len: 26, max: 60, size: 6, color: '#ffe05a', shape: 'star', vr: 0.12 }); break;
        case 'nuee': for (let i = 0; i < n(30); i++) add({ x: x + R(-120, -60), y: y + R(-40, 40), vx: R(4, 7), vy: R(-1, 1), max: R(20, 32), size: R(1.5, 2.8), color: '#3a2a14', shape: 'dot' }); break;
        case 'ultime': shake.current = lite ? 0 : 18;
          for (let i = 0; i < 16; i++) add({ x, y, shape: 'ray', ang: (i / 16) * Math.PI * 2, len: 0, grow: 14, max: 26, size: 4, color: color || '#ffd56a' });
          add({ x, y, shape: 'ring', size: 10, grow: 7, max: 26, color: '#ffffff' }); add({ x, y, shape: 'ring', size: 6, grow: 5, max: 32, color: color || '#ffd56a', life: -6 });
          for (let i = 0; i < n(40); i++) { const a = R(0, Math.PI * 2), v = R(3, 10); add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0.1, max: R(26, 44), size: R(2, 5), color: [color || '#ffd56a', '#ffffff', '#ff9a4a'][i % 3], shape: 'spark' }) } break;
        case 'charge': for (let i = 0; i < n(18); i++) { const a = R(0, Math.PI * 2), d = R(60, 110); add({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: -Math.cos(a) * d / 22, vy: -Math.sin(a) * d / 22, max: 22, size: R(2, 3.5), color: color || '#ffd56a', shape: 'spark' }) } break;
        case 'ko': for (let i = 0; i < n(14); i++) add({ x: x + R(-30, 30), y: y + R(0, 30), vx: R(-0.8, 0.8), vy: R(-1.4, -0.4), max: R(40, 60), size: R(10, 18), grow: 0.4, color: 'rgba(200,200,200,.35)', shape: 'dot' }); break;
        case 'esquive': for (let i = 0; i < 3; i++) add({ x: x + 20 + i * 10, y: y - 20 + i * 18, shape: 'slash', len: 40, ang: 0, max: 14, size: 2, color: 'rgba(255,255,255,.8)', life: -i * 2 }); break;
        case 'buff': for (let i = 0; i < n(10); i++) add({ x: x + R(-30, 30), y: y + R(0, 30), vy: R(-2.2, -1.2), max: 30, size: R(2, 3), color: '#ffd56a', shape: 'spark' }); break;
        case 'debuff': for (let i = 0; i < n(10); i++) add({ x: x + R(-30, 30), y: y - R(10, 30), vy: R(1, 2), max: 30, size: R(2, 3), color: '#c48bff', shape: 'spark' }); break;
      }
    },
  }), []);

  useEffect(() => {
    const c = cv.current; if (!c) return; const g = c.getContext('2d'); if (!g) return;
    let raf = 0, w = 0, h = 0; const dpr = Math.min(2, window.devicePixelRatio || 1);
    const fit = () => { const r = c.getBoundingClientRect(); w = r.width; h = r.height; c.width = w * dpr; c.height = h * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0) };
    fit(); const ro = new ResizeObserver(fit); ro.observe(c);
    const night = ph === 'nuit', amb = AMB[biome];
    const frame = () => {
      // ambiance
      if (amb && !reduceMotion) { const nAmb = parts.current.filter(p => p.amb).length; if (nAmb < amb.n && Math.random() < 0.08) add({ ...amb.make(w, h, night), amb: true }) }
      g.clearRect(0, 0, w, h);
      const sx = shake.current ? (Math.random() - 0.5) * shake.current : 0, sy = shake.current ? (Math.random() - 0.5) * shake.current : 0;
      if (shake.current) { shake.current *= 0.85; if (shake.current < 0.5) shake.current = 0; c.parentElement?.style.setProperty('--shx', `${sx}px`); c.parentElement?.style.setProperty('--shy', `${sy}px`) }
      else c.parentElement?.style.setProperty('--shx', '0px');
      const next: P[] = [];
      for (const p of parts.current) {
        p.life++; if (p.life < 0) { next.push(p); continue }
        if (p.life > p.max) continue;
        p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.size += p.grow;
        if (p.amb && p.shape === 'leaf') p.vx += Math.sin(p.life / 20) * 0.02;
        const t = p.life / p.max, a = p.amb ? Math.min(1, Math.min(p.life, p.max - p.life) / 40) : 1 - t;
        g.globalAlpha = Math.max(0, a); g.fillStyle = p.color; g.strokeStyle = p.color;
        switch (p.shape) {
          case 'dot': g.beginPath(); g.arc(p.x, p.y, p.size, 0, 7); g.fill(); break;
          case 'spark': g.beginPath(); g.arc(p.x, p.y, p.size * (1 - t * 0.6), 0, 7); g.fill(); break;
          case 'bubble': g.lineWidth = 1.5; g.beginPath(); g.arc(p.x, p.y, p.size, 0, 7); g.stroke(); break;
          case 'ring': g.lineWidth = 3 * (1 - t) + 1; g.beginPath(); g.arc(p.x, p.y, p.size, 0, 7); g.stroke(); break;
          case 'plus': g.lineWidth = 2.5; g.beginPath(); g.moveTo(p.x - p.size / 2, p.y); g.lineTo(p.x + p.size / 2, p.y); g.moveTo(p.x, p.y - p.size / 2); g.lineTo(p.x, p.y + p.size / 2); g.stroke(); break;
          case 'leaf': g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.beginPath(); g.ellipse(0, 0, p.size, p.size / 2.2, 0, 0, 7); g.fill(); g.restore(); break;
          case 'slash': { const k = Math.min(1, p.life / 5), L = (p.len || 60) * k; g.lineCap = 'round'; g.lineWidth = p.size * (1 - t * 0.7);
            g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + Math.cos(p.ang || 0) * L, p.y + Math.sin(p.ang || 0) * L); g.stroke(); break }
          case 'ray': { const L = p.life * (p.grow || 10); g.lineWidth = p.size * (1 - t); g.beginPath();
            g.moveTo(p.x + Math.cos(p.ang!) * L * 0.3, p.y + Math.sin(p.ang!) * L * 0.3); g.lineTo(p.x + Math.cos(p.ang!) * L, p.y + Math.sin(p.ang!) * L); g.stroke(); break }
          case 'star': { const an = (p.ang || 0) + p.life * (p.vr || 0.1), cx = p.x + Math.cos(an) * (p.len || 24), cy = p.y + Math.sin(an) * (p.len || 24) * 0.4;
            g.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? p.size / 2.4 : p.size, aa = (i / 10) * Math.PI * 2 - Math.PI / 2; g.lineTo(cx + Math.cos(aa) * r, cy + Math.sin(aa) * r) } g.closePath(); g.fill(); break }
        }
        if (!p.amb || (p.y > -20 && p.y < h + 20 && p.x > -20 && p.x < w + 20)) next.push(p);
      }
      g.globalAlpha = 1; parts.current = next;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect() };
  }, [biome, ph]);

  return <canvas ref={cv} className="fx-layer" aria-hidden="true" />;
});
