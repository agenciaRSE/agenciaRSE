// Genera dist/faro.svg y dist/faro-dark.svg: la Torre de Hércules barre con su haz
// el calendario de contribuciones, que hace de mar. Sin dependencias (Node 20+).
// Uso: GITHUB_TOKEN=... node scripts/faro.mjs <usuario> [carpeta-salida]
import { mkdirSync, writeFileSync } from "node:fs";

const [user = "agenciaRSE", out = "dist"] = process.argv.slice(2);
const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error("Falta GITHUB_TOKEN");

const query = `query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{
  totalContributions weeks{contributionDays{date contributionCount contributionLevel}}}}}}`;
const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json", "User-Agent": "faro-svg" },
  body: JSON.stringify({ query, variables: { login: user } }),
});
const json = await res.json();
if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors ?? json));
const cal = json.data.user.contributionsCollection.contributionCalendar;

const LEVEL = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Lienzo y geometría
const W = 1000, H = 300;
const LAMP = { x: 104, y: 92 };
const CELL = 11, GAP = 3, GX = 232, GY = 168;
const ROT = 16; // segundos por vuelta; dos haces opuestos -> cada casilla se ilumina cada ROT/2
const P = ROT / 2;

const cells = [];
const monthLabels = [];
cal.weeks.forEach((w, col) => {
  w.contributionDays.forEach((d) => {
    const date = new Date(d.date + "T00:00:00Z");
    const row = date.getUTCDay();
    const x = GX + col * (CELL + GAP), y = GY + row * (CELL + GAP);
    // Instante en que el haz (gira en sentido horario desde las 3 en punto) pasa por la casilla
    const ang = (Math.atan2(y + CELL / 2 - LAMP.y, x + CELL / 2 - LAMP.x) * 180) / Math.PI;
    const t = (((ang / 360) * ROT) % P + P) % P;
    cells.push({ col, x, y, lvl: LEVEL[d.contributionLevel] ?? 0, n: d.contributionCount, date: d.date, delay: (t - P).toFixed(3) });
    if (date.getUTCDate() === 1 && col < cal.weeks.length - 1) monthLabels.push({ x, m: MONTHS[date.getUTCMonth()] });
  });
});

// Gorila: baja de la torre, cruza el calendario comiéndose una columna en cada paso
// y crece según las contribuciones que se come. Todo con CSS: GitHub no ejecuta JS en SVG.
const NCOL = cal.weeks.length;
const CYCLE = 36; // segundos por pasada completa
const FEET = GY + 7 * (CELL + GAP) + 2;
const MAX_SCALE = 4.2;
const colSum = Array(NCOL).fill(0);
cells.forEach((k) => (colSum[k.col] += k.n));
const total = colSum.reduce((a, b) => a + b, 0) || 1;
const WALK0 = 12, WALK1 = 80, REGROW = 93; // % del ciclo
const colPct = (c) => WALK0 + ((WALK1 - WALK0) * c) / Math.max(NCOL - 1, 1);
const kf = [];
const at = (pct, x, y, sc, op = 1) => kf.push(`${pct.toFixed(2)}%{transform:translate(${x}px,${y}px) scale(${sc.toFixed(3)});opacity:${op}}`);
at(0, 126, 128, 0.7, 0);
at(1.5, 126, 128, 0.7);
at(8, 130, 246, 0.7); // trepa hacia abajo por la cara de la torre
at(10, 180, 222, 0.75); // salto desde la roca
let cum = 0;
for (let c = 0; c < NCOL; c++) {
  const x = GX + c * (CELL + GAP) + CELL / 2;
  if (c === 0) at(WALK0, x, FEET, 0.8);
  cum += colSum[c];
  at(colPct(c) + 0.01, x, FEET, 0.8 + (MAX_SCALE - 0.8) * Math.sqrt(cum / total));
}
const xEnd = W - 14 * MAX_SCALE - 12; // que el gigante quepa entero
for (const [pct, dy] of [[82, 0], [84, -14], [86, 0], [88, -14], [90, 0]]) at(pct, xEnd, FEET + dy, MAX_SCALE);
at(93, xEnd, FEET, MAX_SCALE, 0);
at(100, 126, 128, 0.7, 0);
const colKf = Array.from({ length: NCOL }, (_, c) => {
  const e = colPct(c), r = REGROW + (4 * c) / NCOL;
  return `@keyframes e${c}{0%,${e.toFixed(2)}%{transform:scale(1);opacity:1}${(e + 0.6).toFixed(2)}%,${r.toFixed(2)}%{transform:scale(0);opacity:0}${(r + 1.5).toFixed(2)}%,100%{transform:scale(1);opacity:1}}.e${c}{animation:e${c} ${CYCLE}s linear infinite}`;
}).join("");

// Estrellas con semilla fija: el cielo no cambia de un día a otro
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const stars = Array.from({ length: 70 }, () => ({
  x: (rnd() * W).toFixed(1), y: (rnd() * 140).toFixed(1), r: (0.4 + rnd() * 1.1).toFixed(2),
  d: (rnd() * 6).toFixed(2), s: (3 + rnd() * 4).toFixed(2),
}));

const THEMES = {
  dark: {
    sky: ["#070a1f", "#141a46", "#2a1f5c"], star: "#ffffff", text: "#e0e7ff", sub: "#a5b4fc",
    levels: ["#151a3d", "#2e2a6b", "#4f46e5", "#7c3aed", "#a855f7"],
    lit: "#fde68a", beam: "#fef3c7", beamOp: 0.32, rock: "#0b0d24", tower: "#2a2f5a", towerHi: "#3b4178", ramp: "#1c2048", glass: "#fde68a", fur: "#3a2f45", furDark: "#1f1828", face: "#c9a27e",
  },
  light: {
    sky: ["#c7d2fe", "#e0e7ff", "#f5f3ff"], star: "#ffffff", text: "#1e1b4b", sub: "#4f46e5",
    levels: ["#dfe3fb", "#c4b5fd", "#8b5cf6", "#6d28d9", "#4c1d95"],
    lit: "#f59e0b", beam: "#fbbf24", beamOp: 0.28, rock: "#5b5f8a", tower: "#9ca3c9", towerHi: "#b9bfe0", ramp: "#7c82b0", glass: "#fbbf24", fur: "#3a2f45", furDark: "#1f1828", face: "#c9a27e",
  },
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const fmt = new Intl.NumberFormat("es-ES");

function svg(th) {
  const c = THEMES[th];
  const beam = (rot) => `<path d="M${LAMP.x} ${LAMP.y} L${LAMP.x + 1150} ${LAMP.y - 60} L${LAMP.x + 1150} ${LAMP.y + 60} Z" fill="url(#beam)" transform="rotate(${rot} ${LAMP.x} ${LAMP.y})"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="t d">
<title id="t">El faro de mis contribuciones</title>
<desc id="d">La Torre de Hércules de A Coruña, de noche, barre con su haz el calendario de contribuciones de GitHub de ${esc(user)}: ${fmt.format(cal.totalContributions)} contribuciones en el último año. Cada día se ilumina al pasar la luz, más cuanto más trabajo hubo.</desc>
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${c.sky[0]}"/><stop offset=".55" stop-color="${c.sky[1]}"/><stop offset="1" stop-color="${c.sky[2]}"/>
  </linearGradient>
  <linearGradient id="beam" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${c.beam}" stop-opacity="${c.beamOp + 0.25}"/>
    <stop offset=".45" stop-color="${c.beam}" stop-opacity="${c.beamOp / 2}"/>
    <stop offset="1" stop-color="${c.beam}" stop-opacity="0"/>
  </linearGradient>
  <radialGradient id="halo"><stop offset="0" stop-color="${c.beam}" stop-opacity=".9"/><stop offset="1" stop-color="${c.beam}" stop-opacity="0"/></radialGradient>
  <clipPath id="frame"><rect width="${W}" height="${H}" rx="18"/></clipPath>
</defs>
<style>
  .sans{font-family:"Segoe UI",Inter,"Helvetica Neue",Arial,sans-serif}
  .mono{font-family:"Cascadia Code","SFMono-Regular",Consolas,Menlo,monospace}
  .rot{animation:spin ${ROT}s linear infinite;transform-origin:${LAMP.x}px ${LAMP.y}px}
  .lit{opacity:0;animation:flash ${P}s linear infinite}
  .st{animation:tw ease-in-out infinite alternate}
  .halo{animation:pulse ${P}s ease-in-out infinite;transform-origin:${LAMP.x}px ${LAMP.y}px}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes flash{0%{opacity:1}11%{opacity:0}98.5%{opacity:0}100%{opacity:1}}
  @keyframes tw{from{opacity:.15}to{opacity:.9}}
  @keyframes pulse{0%,100%{transform:scale(1);opacity:.85}50%{transform:scale(1.25);opacity:.55}}
  .col{transform-box:fill-box;transform-origin:center}
  .ape{transform-box:view-box;transform-origin:0 0;opacity:0;animation:ape ${CYCLE}s linear infinite}
  .bob{animation:bob .32s ease-in-out infinite alternate}
  .arm{animation:arm .32s ease-in-out infinite alternate;transform-box:view-box}
  .armL{transform-origin:-7px -14px}.armR{transform-origin:7px -14px;animation-direction:alternate-reverse}
  .mouth{animation:chomp .16s steps(2) infinite;transform-box:fill-box;transform-origin:center}
  @keyframes ape{${kf.join("")}}
  @keyframes bob{to{transform:translateY(-1.5px)}}
  @keyframes arm{from{transform:rotate(-18deg)}to{transform:rotate(18deg)}}
  @keyframes chomp{to{transform:scaleY(2.2)}}
  ${colKf}
  @media (prefers-reduced-motion:reduce){.rot,.lit,.st,.halo,.col,.bob,.arm,.mouth{animation:none}.lit,.ape{opacity:0;animation:none}}
</style>
<g clip-path="url(#frame)">
<rect width="${W}" height="${H}" fill="url(#sky)"/>
${stars.map((s) => `<circle class="st" cx="${s.x}" cy="${s.y}" r="${s.r}" fill="${c.star}" style="animation-duration:${s.s}s;animation-delay:-${s.d}s"/>`).join("")}
<g class="rot">${beam(0)}${beam(180)}</g>
${Array.from({ length: NCOL }, (_, col) => {
  const cs = cells.filter((k) => k.col === col);
  return `<g class="col e${col}">${cs.map((k) => `<rect x="${k.x}" y="${k.y}" width="${CELL}" height="${CELL}" rx="2.5" fill="${c.levels[k.lvl]}"><title>${k.date}: ${k.n} contribuciones</title></rect>`).join("")}${cs.map((k) => `<rect class="lit" x="${k.x}" y="${k.y}" width="${CELL}" height="${CELL}" rx="2.5" fill="${c.lit}" fill-opacity="${(0.32 + 0.16 * k.lvl).toFixed(2)}" style="animation-delay:${k.delay}s"/>`).join("")}</g>`;
}).join("\n")}
${monthLabels.map((m) => `<text class="mono" x="${m.x}" y="${GY + 7 * (CELL + GAP) + 12}" font-size="10" fill="${c.sub}">${m.m}</text>`).join("")}
<!-- Torre de Hércules: base cuadrada con la rampa en diagonal, cuerpo alto, linterna y cúpula -->
<path d="M0 300 L0 252 Q40 236 70 240 Q110 232 150 246 Q185 252 205 300 Z" fill="${c.rock}"/>
<path d="M80 244 L84 128 L124 128 L128 244 Z" fill="${c.tower}"/>
<path d="M104 128 L124 128 L128 244 L108 244 Z" fill="${c.towerHi}"/>
<g stroke="${c.ramp}" stroke-width="3" stroke-linecap="round">
  <path d="M82 232 L126 214"/><path d="M83 204 L125 186"/><path d="M83 176 L124 158"/><path d="M84 148 L124 132"/>
</g>
<rect x="90" y="108" width="28" height="20" fill="${c.tower}"/>
<rect x="88" y="104" width="32" height="4" fill="${c.towerHi}"/>
<rect x="95" y="86" width="18" height="18" rx="1" fill="${c.glass}"/>
<path d="M92 86 Q104 70 116 86 Z" fill="${c.towerHi}"/>
<circle class="halo" cx="${LAMP.x}" cy="${LAMP.y + 3}" r="26" fill="url(#halo)"/>
<!-- Gorila (diseño propio). Los pies están en (0,0) para que crezca hacia arriba -->
<g class="ape"><g class="bob">
  <g stroke="${c.fur}" stroke-linecap="round" fill="none">
    <path d="M-4 -5 L-5 0" stroke-width="4"/><path d="M4 -5 L5 0" stroke-width="4"/>
    <path class="arm armL" d="M-7 -14 Q-12 -9 -11 -1" stroke-width="4.5"/>
    <path class="arm armR" d="M7 -14 Q12 -9 11 -1" stroke-width="4.5"/>
  </g>
  <ellipse cx="0" cy="-10" rx="8.5" ry="7.5" fill="${c.fur}"/>
  <ellipse cx="0" cy="-9" rx="4.5" ry="4" fill="${c.face}" opacity=".55"/>
  <circle cx="0" cy="-19" r="6" fill="${c.fur}"/>
  <ellipse cx="0" cy="-17.5" rx="4.2" ry="3.4" fill="${c.face}"/>
  <rect x="-4.6" y="-22.2" width="9.2" height="2.2" rx="1.1" fill="${c.furDark}"/>
  <circle cx="-1.8" cy="-19.2" r="1" fill="#fff"/><circle cx="1.8" cy="-19.2" r="1" fill="#fff"/>
  <circle cx="-1.6" cy="-19" r=".5" fill="#111"/><circle cx="2" cy="-19" r=".5" fill="#111"/>
  <ellipse class="mouth" cx="0" cy="-15.6" rx="1.8" ry="1" fill="#3b0d0d"/>
</g></g>
<text class="sans" x="${W - 24}" y="44" text-anchor="end" font-size="22" font-weight="700" fill="${c.text}">${fmt.format(cal.totalContributions)} contribuciones</text>
<text class="mono" x="${W - 24}" y="66" text-anchor="end" font-size="12" fill="${c.sub}">último año · faro de Hércules · A Coruña</text>
</g>
</svg>`;
}

mkdirSync(out, { recursive: true });
writeFileSync(`${out}/faro.svg`, svg("light"));
writeFileSync(`${out}/faro-dark.svg`, svg("dark"));
console.log(`OK ${user}: ${cal.totalContributions} contribuciones, ${cells.length} días`);
