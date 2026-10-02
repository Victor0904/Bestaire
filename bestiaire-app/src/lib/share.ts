// Image de carte à partager (1080 × 1350, format portrait des réseaux sociaux)
import { CLASS, QUAL, Species, TIERS, cote, qIndex } from '../game/species';

const TIER_HEX = ['#7b8572', '#3f7d6b', '#2e64a8', '#7a43a8', '#c9861a'];
const FRAME_HEX = (l: number) => (l >= 7 ? '#e9d8ff' : l >= 6 ? '#e7b84a' : l >= 5 ? '#c8ccd2' : l >= 3 ? '#b07a45' : null);

const loadImg = (src: string) => new Promise<HTMLImageElement>((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = src });
async function fonts() { try { await document.fonts?.ready } catch { /* polices système */ } }
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const words = text.split(' '); const lines: string[] = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > max && cur) { lines.push(cur); cur = w } else cur = t }
  if (cur) lines.push(cur); return lines.slice(0, 2);
}
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export async function cardImage(s: Species, card: { q: number; lvl: number }, pseudo?: string | null): Promise<Blob> {
  await fonts();
  const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!; const tc = TIER_HEX[s.tier]; const qi = qIndex(card.q);
  // fond
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1d251b'); g.addColorStop(1, '#0e130d'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const rg = ctx.createRadialGradient(W / 2, 420, 60, W / 2, 420, 760); rg.addColorStop(0, tc + 'aa'); rg.addColorStop(1, 'transparent'); ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
  // carte
  const cx = 90, cy = 90, cw = W - 180, ch = H - 250;
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 20; rr(ctx, cx, cy, cw, ch, 34); ctx.fillStyle = '#f8f9f2'; ctx.fill(); ctx.restore();
  const fr = FRAME_HEX(card.lvl); ctx.lineWidth = fr ? 16 : 8; ctx.strokeStyle = fr || tc; rr(ctx, cx, cy, cw, ch, 34); ctx.stroke();
  // photo (case de la planche : 5 × 8 cases de 400 × 300)
  const px = cx + 40, py = cy + 40, pw = cw - 80, ph = Math.round(pw * 0.75);
  if (s.photo) {
    try {
      const img = await loadImg(`${import.meta.env.BASE_URL}planches/p${String(s.photo[0]).padStart(2, '0')}.webp`);
      const cwImg = img.naturalWidth / 5, chImg = img.naturalHeight / 8, i = s.photo[1];
      ctx.save(); rr(ctx, px, py, pw, ph, 20); ctx.clip();
      if (qi === 0) ctx.filter = 'blur(3px)';
      ctx.drawImage(img, (i % 5) * cwImg, Math.floor(i / 5) * chImg, cwImg, chImg, px, py, pw, ph);
      ctx.restore();
    } catch { ctx.fillStyle = '#2a3324'; rr(ctx, px, py, pw, ph, 20); ctx.fill() }
  }
  // badge niveau
  if (card.lvl > 1) { ctx.fillStyle = 'rgba(0,0,0,.65)'; rr(ctx, px + 20, py + 20, 170, 64, 16); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '700 36px "Martian Mono", ui-monospace, monospace'; ctx.fillText(`Niv. ${card.lvl}`, px + 38, py + 64) }
  // textes
  let y = py + ph + 90; ctx.fillStyle = '#1d2419'; ctx.font = '800 76px "Bricolage Grotesque", system-ui, sans-serif';
  for (const l of wrap(ctx, s.nom, pw)) { ctx.fillText(l, px, y); y += 78 }
  ctx.font = 'italic 38px "Atkinson Hyperlegible", system-ui, sans-serif'; ctx.fillStyle = '#5c6656'; ctx.fillText(s.sci + (s.pays ? ` · ${s.pays}` : ''), px, y); y += 70;
  // pastilles
  const pill = (txt: string, x: number, bg: string, fg: string) => { ctx.font = '700 32px "Martian Mono", ui-monospace, monospace'; const w = ctx.measureText(txt).width + 44; ctx.fillStyle = bg; rr(ctx, x, y - 44, w, 62, 31); ctx.fill(); ctx.fillStyle = fg; ctx.fillText(txt, x + 22, y - 2); return x + w + 16 };
  let x = pill(TIERS[s.tier].toUpperCase(), px, tc, '#fff');
  x = pill(QUAL[qi], x, '#dde7d3', '#1d2419');
  pill(CLASS[s.classe], x, '#dde7d3', '#1d2419');
  // cote
  ctx.font = '800 54px "Bricolage Grotesque", system-ui, sans-serif'; ctx.fillStyle = '#d9901a'; const cs = `${cote(s, card.lvl, card.q)} plumes`;
  ctx.fillText(cs, px + pw - ctx.measureText(cs).width, cy + ch - 48);
  ctx.font = '600 28px "Martian Mono", ui-monospace, monospace'; ctx.fillStyle = '#5c6656'; ctx.fillText('cote', px, cy + ch - 56);
  // crédit photo (licence Creative Commons), dans la carte
  if (s.credit) { ctx.font = '500 24px "Atkinson Hyperlegible", system-ui, sans-serif'; ctx.fillStyle = '#7b8572'; ctx.fillText(`Photo : ${s.credit}`.slice(0, 70), px, y + 56) }
  // pied
  ctx.fillStyle = '#e7ecdf'; ctx.font = '800 54px "Bricolage Grotesque", system-ui, sans-serif'; ctx.fillText('Bestiaire', cx, H - 72);
  ctx.font = '600 26px "Martian Mono", ui-monospace, monospace'; ctx.fillStyle = '#9aa591';
  const sub = (pseudo ? `Photo de ${pseudo} · ` : '') + 'safari photo de la faune de France'; ctx.fillText(sub, cx, H - 30);

  return new Promise((ok, ko) => cv.toBlob(b => (b ? ok(b) : ko(new Error('image impossible'))), 'image/png'));
}

/** Partage natif (téléphone) ou téléchargement de l'image ; renvoie ce qui a été fait */
export async function shareCard(s: Species, card: { q: number; lvl: number }, pseudo?: string | null): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const blob = await cardImage(s, card, pseudo);
  const file = new File([blob], `bestiaire-${s.id}.png`, { type: 'image/png' });
  const url = location.origin + location.pathname;
  const text = `J'ai photographié ${s.nom} (${TIERS[s.tier]}, niveau ${card.lvl}) dans Bestiaire ! ${url}`;
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: s.nom, text }); return 'shared' } catch (e) { if ((e as Error).name === 'AbortError') return 'cancelled' }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'downloaded';
}
