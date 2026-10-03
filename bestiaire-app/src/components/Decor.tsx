// Décors de combat dessinés en SVG (aucune image) : un paysage par milieu, éclairé selon l'heure.
const CIEL: Record<string, [string, string]> = {
  jour: ['#7cc4f0', '#dff1fb'], aube: ['#f2a48e', '#ffe2b0'], 'crépuscule': ['#4b3d7d', '#f0956a'], nuit: ['#0b1430', '#26386a'],
};
const VOILE: Record<string, string> = { jour: 'rgba(0,0,0,0)', aube: 'rgba(255,170,120,.12)', 'crépuscule': 'rgba(90,40,110,.22)', nuit: 'rgba(8,14,40,.48)' };

export function Decor({ biome, ph }: { biome: string; ph: string }) {
  const [c1, c2] = CIEL[ph] || CIEL.jour, nuit = ph === 'nuit';
  return (
    <svg className="decor" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="dc-ciel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c1} /><stop offset="1" stopColor={c2} /></linearGradient>
        <radialGradient id="dc-astre"><stop offset="0" stopColor={nuit ? '#fffbe8' : '#fff7c0'} /><stop offset="1" stopColor={nuit ? '#fffbe8' : '#ffd36a'} stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="400" height="300" fill="url(#dc-ciel)" />
      {nuit && Array.from({ length: 40 }, (_, i) => <circle key={i} className="et" cx={(i * 97) % 400} cy={(i * 53) % 150} r={(i % 3) * 0.4 + 0.5} fill="#fff" style={{ animationDelay: `${(i % 7) * 0.5}s` }} />)}
      <circle cx={ph === 'aube' ? 70 : ph === 'crépuscule' ? 330 : 300} cy={ph === 'jour' ? 50 : ph === 'nuit' ? 45 : 120} r="38" fill="url(#dc-astre)" />
      <circle cx={ph === 'aube' ? 70 : ph === 'crépuscule' ? 330 : 300} cy={ph === 'jour' ? 50 : ph === 'nuit' ? 45 : 120} r={nuit ? 11 : 15} fill={nuit ? '#f4f1e1' : '#fff3b0'} />
      {!nuit && <g className="nuages" fill="#fff" opacity=".75"><ellipse cx="80" cy="60" rx="34" ry="9" /><ellipse cx="100" cy="54" rx="20" ry="9" /><ellipse cx="260" cy="85" rx="40" ry="8" /><ellipse cx="240" cy="80" rx="18" ry="8" /></g>}
      <Paysage b={biome} nuit={nuit} />
      <rect width="400" height="300" fill={VOILE[ph] || VOILE.jour} />
    </svg>
  );
}

function Paysage({ b, nuit }: { b: string; nuit: boolean }) {
  switch (b) {
    case 'F': return <g>
      <path d="M0 170 Q100 130 200 160 T400 150 V300 H0Z" fill="#3d6a45" opacity=".55" />
      {Array.from({ length: 14 }, (_, i) => { const x = i * 31 - 10, h = 70 + ((i * 37) % 40); return <path key={i} d={`M${x} ${200} L${x + 18} ${200 - h} L${x + 36} 200Z`} fill={i % 2 ? '#24472c' : '#2d5634'} /> })}
      {Array.from({ length: 9 }, (_, i) => { const x = i * 50 + 5; return <g key={i}><rect x={x + 16} y="205" width="7" height="30" fill="#4a3424" /><circle cx={x + 20} cy="200" r="24" fill={i % 2 ? '#2f6b39' : '#3a7a42'} /></g> })}
      <rect y="232" width="400" height="68" fill="#3f5f2e" /><path d="M0 232 Q200 222 400 232" fill="#4d7236" />
    </g>;
    case 'P': return <g>
      <path d="M0 175 Q120 140 240 170 T400 160 V300 H0Z" fill="#8fbf5a" opacity=".7" />
      <path d="M0 205 Q150 180 300 205 T400 200 V300 H0Z" fill="#79ad48" />
      <rect y="235" width="400" height="65" fill="#6c9d3d" />
      {Array.from({ length: 40 }, (_, i) => <circle key={i} cx={(i * 47) % 400} cy={215 + ((i * 29) % 70)} r="2.2" fill={['#ffffff', '#ffe066', '#ff8fb0', '#c9a0ff'][i % 4]} />)}
      {Array.from({ length: 30 }, (_, i) => { const x = (i * 61) % 400, y = 240 + ((i * 17) % 55); return <path key={i} className="herbe" d={`M${x} ${y} q2 -10 0 -16 M${x + 3} ${y} q2 -8 4 -13`} stroke="#517f2c" strokeWidth="1.6" fill="none" /> })}
    </g>;
    case 'H': return <g>
      <path d="M0 180 Q120 160 240 178 T400 172 V300 H0Z" fill="#5e8a6a" opacity=".6" />
      <rect y="205" width="400" height="95" fill={nuit ? '#1f4a5a' : '#3f8c9c'} />
      {Array.from({ length: 8 }, (_, i) => <path key={i} className="vague" d={`M${i * 55 - 20} ${222 + (i % 3) * 22} q14 -5 28 0 t28 0`} stroke="rgba(255,255,255,.35)" strokeWidth="1.5" fill="none" style={{ animationDelay: `${i * 0.4}s` }} />)}
      {Array.from({ length: 22 }, (_, i) => { const x = (i * 37) % 400, h = 30 + ((i * 13) % 30); return <g key={i}><path d={`M${x} 215 q3 -${h / 2} 1 -${h}`} stroke="#3e6a2a" strokeWidth="2.4" fill="none" /><ellipse cx={x + 1} cy={215 - h} rx="2.2" ry="6" fill="#6b4a2a" /></g> })}
      {Array.from({ length: 6 }, (_, i) => <ellipse key={i} cx={40 + i * 65} cy={258 + (i % 2) * 18} rx="13" ry="4" fill="#4f8a3c" />)}
    </g>;
    case 'L': return <g>
      <rect y="165" width="400" height="80" fill={nuit ? '#123a5c' : '#2f7fc0'} />
      {Array.from({ length: 10 }, (_, i) => <path key={i} className="vague" d={`M${i * 44 - 20} ${178 + (i % 4) * 15} q11 -5 22 0 t22 0`} stroke="rgba(255,255,255,.55)" strokeWidth="1.6" fill="none" style={{ animationDelay: `${i * 0.3}s` }} />)}
      <path d="M0 240 Q100 225 200 238 T400 232 V300 H0Z" fill="#e2cf9a" />
      <path d="M300 240 l18 -40 l22 -8 l20 30 l20 18Z" fill="#6b6a6a" /><path d="M20 250 l14 -22 l20 -4 l14 26Z" fill="#7a7878" />
    </g>;
    case 'M': return <g>
      <path d="M-20 220 L60 90 L120 170 L190 60 L260 160 L320 80 L420 210 V300 H-20Z" fill="#7d8798" />
      <path d="M60 90 L80 122 L68 118 L54 128 L44 116Z M190 60 L214 100 L200 96 L186 108 L172 92Z M320 80 L344 116 L330 112 L316 124 L306 106Z" fill="#ffffff" />
      <path d="M-20 240 L80 170 L160 220 L240 165 L330 215 L420 185 V300 H-20Z" fill="#5f6b5c" />
      <rect y="250" width="400" height="50" fill="#5b6a4a" />
    </g>;
    case 'V': return <g>
      {Array.from({ length: 12 }, (_, i) => { const x = i * 34, h = 60 + ((i * 41) % 70); return <g key={i}><rect x={x} y={215 - h} width="30" height={h} fill={nuit ? '#1d2338' : '#6a6f82'} />
        {Array.from({ length: Math.floor(h / 14) }, (_, j) => <g key={j}><rect x={x + 5} y={222 - h + j * 14} width="6" height="7" fill={nuit && (i + j) % 3 ? '#ffd88a' : nuit ? '#2a3150' : '#c9d6e8'} /><rect x={x + 18} y={222 - h + j * 14} width="6" height="7" fill={nuit && (i * j) % 4 === 1 ? '#ffd88a' : nuit ? '#2a3150' : '#c9d6e8'} /></g>)}</g> })}
      <rect y="215" width="400" height="85" fill={nuit ? '#2c2c34' : '#5d5d66'} />
      <rect y="250" width="400" height="4" fill={nuit ? '#4a4a52' : '#8a8a92'} />
      {[60, 200, 340].map(x => <g key={x}><rect x={x} y="185" width="3" height="65" fill="#333" /><circle cx={x + 1.5} cy="185" r="5" fill={nuit ? '#ffe7a0' : '#ccc'} /></g>)}
    </g>;
    default: return <rect y="220" width="400" height="80" fill="#6c8d4a" />;
  }
}
