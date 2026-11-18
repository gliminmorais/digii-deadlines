// See LICENSE-KUBAI.txt for the Kubai Icons License.
(() => {
// Copyright (c) 2026 Kubai087. Licensed under the Kubai Icons License; see LICENSE.
// Kubai Icons: colour derivation, motion, geometry, gradients and filters, and the
// runtime that mounts, paints and animates an icon. Loaded before icons.js and app.js.

// ---------- Color: the same tint rule as Lumno's tintFolderColor ----------
const REF = [83, 147, 255];
const hex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function tint(src, sel) {
  const s = rgb(src);
  return hex([0, 1, 2].map((i) => {
    const amt = i === 2 ? (s[0] - REF[0]) / (255 - REF[0]) : (s[i] - REF[i]) / (255 - REF[i]);
    return amt >= 0 ? sel[i] + (255 - sel[i]) * amt : sel[i] * (1 + amt);
  }));
}

// ---------- Motion: 460ms, cubic-bezier(.22,1,.36,1), number by number ----------
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x;
      if (Math.abs(e) < 1e-5) break;
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    return sy(t);
  };
}
const EASE = bezier(0.22, 1, 0.36, 1);
const DUR = 460;
let REDUCED = false;
try { REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
function interp(a, b, t) {
  if (typeof b === 'number') return typeof a === 'number' ? a + (b - a) * t : b;
  if (Array.isArray(b)) return b.map((v, i) => interp(a ? a[i] : v, v, t));
  if (b && typeof b === 'object') {
    const o = {};
    for (const k in b) o[k] = interp(a ? a[k] : undefined, b[k], t);
    return o;
  }
  return b;
}

// ---------- Geometry. Canvas 31×29, live area x 4–27 / y 2–23, baseline y=23. ----------
// Fill radii. Outside strokes add 1, so the corner you see is 3.2, the folder's.
const KR = 2.2, CR = 1.2;
const f = (n) => +n.toFixed(3);
const R = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
// `full` lets a corner use a whole edge when its neighbour on that edge is small.
function rp(pts, r, full) {
  const n = pts.length;
  let d = '';
  for (let i = 0; i < n; i++) {
    const v = pts[i], a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
    const ri = Array.isArray(r) ? r[i] : r;
    const la = Math.hypot(a[0] - v[0], a[1] - v[1]) || 1e-6;
    const lb = Math.hypot(b[0] - v[0], b[1] - v[1]) || 1e-6;
    const lim = full ? 1 : 0.5;
    const k1 = Math.min(ri, la * lim) / la, k2 = Math.min(ri, lb * lim) / lb;
    d += (i ? 'L' : 'M') + f(v[0] + (a[0] - v[0]) * k1) + ' ' + f(v[1] + (a[1] - v[1]) * k1)
      + 'Q' + f(v[0]) + ' ' + f(v[1]) + ' ' + f(v[0] + (b[0] - v[0]) * k2) + ' ' + f(v[1] + (b[1] - v[1]) * k2);
  }
  return d + 'Z';
}
const rr = (x, y, w, h, r) => rp(R(x, y, w, h), r);
// Counter-clockwise, while R() runs clockwise: overlapping the two in one path punches a hole.
const circ = (cx, cy, r) => `M${f(cx - r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx + r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx - r)} ${f(cy)}Z`;
const poly = (pts) => 'M' + pts.map((p) => f(p[0]) + ' ' + f(p[1])).join('L');
// Content lines, 3 apart: few and thick so they still read at 24px.
const lines = (x, y, widths) => widths.map((w, i) => `M${f(x)} ${f(y + i * 3)}H${f(x + w)}`).join('');
function star(r1, r2) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? r2 : r1;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return rp(pts, 0.2);
}
function gear(teeth, rOut, rIn) {
  const pts = [], step = 360 / teeth, rad = (d) => d * Math.PI / 180;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    [[rIn, a - step * 0.3], [rOut, a - step * 0.17], [rOut, a + step * 0.17], [rIn, a + step * 0.3]].forEach(([r, d]) => {
      pts.push([15.5 + r * Math.sin(rad(d)), 12.5 - r * Math.cos(rad(d))]);
    });
  }
  return rp(pts, 0.8);
}
function cross(a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy);
  const l = (a[2] * a[2] - b[2] * b[2] + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, a[2] * a[2] - l * l));
  const mx = a[0] + dx * l / d, my = a[1] + dy * l / d;
  const p1 = [mx + h * dy / d, my - h * dx / d], p2 = [mx - h * dy / d, my + h * dx / d];
  return p1[1] < p2[1] ? p1 : p2;
}
function arc(c, from, to) {
  let dl = Math.atan2(to[1] - c[1], to[0] - c[0]) - Math.atan2(from[1] - c[1], from[0] - c[0]);
  while (dl < 0) dl += Math.PI * 2;
  return `A${f(c[2])} ${f(c[2])} 0 ${dl > Math.PI ? 1 : 0} 1 ${f(to[0])} ${f(to[1])}`;
}
function cloud(L, T, Rc) {
  const s = [L[0], L[1] + L[2]], i1 = cross(L, T), i2 = cross(T, Rc), e = [Rc[0], Rc[1] + Rc[2]];
  return `M${f(s[0])} ${f(s[1])}${arc(L, s, i1)}${arc(T, i1, i2)}${arc(Rc, i2, e)}Z`;
}
// The part of a round shape below y=c: left side on circle A, right side on circle B,
// flat bottom between their lowest points. Its top corners are rounded by rc, like the
// folder's front panel, so the back shows at the corners.
function frontPiece(A, B, c, rc) {
  const xl = A[0] - Math.sqrt(A[2] ** 2 - (c - A[1]) ** 2), xr = B[0] + Math.sqrt(B[2] ** 2 - (c - B[1]) ** 2);
  const aL = Math.atan2(c - A[1], xl - A[0]) - rc / A[2];
  const aR = Math.atan2(c - B[1], xr - B[0]) + rc / B[2];
  const bL = [A[0] + A[2] * Math.cos(aL), A[1] + A[2] * Math.sin(aL)];
  const bR = [B[0] + B[2] * Math.cos(aR), B[1] + B[2] * Math.sin(aR)];
  return `M${f(xl + rc)} ${f(c)}Q${f(xl)} ${f(c)} ${f(bL[0])} ${f(bL[1])}`
    + `A${f(A[2])} ${f(A[2])} 0 0 0 ${f(A[0])} ${f(A[1] + A[2])}L${f(B[0])} ${f(B[1] + B[2])}`
    + `A${f(B[2])} ${f(B[2])} 0 0 0 ${f(bR[0])} ${f(bR[1])}Q${f(xr)} ${f(c)} ${f(xr - rc)} ${f(c)}Z`;
}
const sector = (base, sw, r) => {
  const p = (a) => [15.5 + r * Math.sin(a * Math.PI / 180), 12.5 - r * Math.cos(a * Math.PI / 180)];
  const a = p(base), b = p(base + sw);
  return `M15.5 12.5L${f(a[0])} ${f(a[1])}A${r} ${r} 0 ${sw > 180 ? 1 : 0} 1 ${f(b[0])} ${f(b[1])}Z`;
};
const at = (el, o) => { if (el) for (const k in o) el.setAttribute(k, o[k]); };
// The clock rests at 10:08, the pose that reads as a clock at any size.
const CLOCK_MINUTES = 10 * 60 + 8;


// ---------- Instances ----------
const BAND = 1.2;
const grad = (id, stops) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}" data-t="stop-color:${c}"/>`).join('')}</linearGradient>`;
// Gradient fills for one icon; banded ones are made per shape height so the band stays 1.2 units.
function makeU(k) {
  const grads = new Map();
  grads.set(`loS-${k}`, [[0, '#93BBFF'], [1, '#7FAEFF']]);
  grads.set(`upS-${k}`, [[0, '#CCDFFF'], [1, '#ADCBFF']]);
  const banded = (kind, h) => {
    const o = f(Math.max(0.5, 1 - BAND / h));
    const id = `${kind}-${k}-${Math.round(o * 1000)}`;
    if (!grads.has(id)) {
      grads.set(id, kind === 'lo'
        ? [[0, '#93BBFF'], [o, '#81B0FF'], [f(o + 0.0001), '#4389FF'], [1, '#97BEFF']]
        : [[0, '#CCDFFF'], [o, '#B2CEFF'], [f(o + 0.0001), '#89B5FF'], [1, '#97BEFF']]);
    }
    return `url(#${id})`;
  };
  // A solid fill that a soft palette turns into a white-to-colour gradient.
  const pure = (src) => {
    const id = `pure-${k}-${src.slice(1)}`;
    if (!grads.has(id)) grads.set(id, { pure: src });
    return `url(#${id})`;
  };
  return {
    grads, pure,
    lo: (h) => banded('lo', h), up: (h) => banded('up', h),
    loS: `url(#loS-${k})`, upS: `url(#upS-${k})`,
    sh: `url(#sh-${k})`, hi: `url(#hi-${k})`, id: (n) => `${n}-${k}`
  };
}
const defs = (k, grads) => `<defs>${[...grads].map(([id, stops]) => stops.pure
  ? `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" data-pure="0" data-src="${stops.pure}"/><stop offset="1" data-pure="1" data-src="${stops.pure}"/></linearGradient>`
  : grad(id, stops)).join('')}
  <filter id="sh-${k}" x="-40%" y="-40%" width="180%" height="190%" color-interpolation-filters="sRGB">
    <feGaussianBlur in="SourceAlpha" stdDeviation="2"/><feOffset dy="2" result="o"/>
    <feColorMatrix in="o" type="matrix" data-sh values="0 0 0 0 0.54 0 0 0 0 0.71 0 0 0 0 1 0 0 0 0.21 0"/>
    <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <filter id="hi-${k}" x="-10%" y="-10%" width="120%" height="130%" color-interpolation-filters="sRGB">
    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="a"/>
    <feOffset in="a" dy="0.7"/><feGaussianBlur stdDeviation="0.35"/>
    <feComposite in2="a" operator="arithmetic" k2="-1" k3="1"/>
    <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.5 0"/>
    <feBlend in2="SourceGraphic" mode="overlay"/>
  </filter></defs>`;


// ---------- Palettes ----------
const soften = (h, k) => hex(rgb(h).map((v) => v + (255 - v) * k));
// Pulls a colour toward its own grey by `sat`, then darkens it by `dark`.
const mute = (h, sat, dark) => {
  const c = rgb(h), g = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  return hex(c.map((v) => (v + (g - v) * sat) * (1 - dark)));
};
// One colour for every icon.
const flatTone = (name, base, n) => ({ name, colors: Array(n).fill(base) });
// A clear tone from one base colour: fills lifted a little toward white, outlines and deep
// marks a step deeper, and white marks turned deep so they stay legible on the light body.
// Another base gives the same treatment in another hue.
const clearTone = (name, base, n) => ({
  name,
  colors: Array(n).fill(soften(base, 0.1)),
  edges: Array(n).fill(mute(base, 0, 0.16)),
  deepMarks: true
});

// ---------- Runtime ----------
const SVG_NS = 'http://www.w3.org/2000/svg';
const ICON_VIEWBOX = '0 -2 31 29';
const runtime = { palette: null };

// Builds one icon inside `host` and returns its live instance.
function mountIcon(icon, i, host) {
  const k = 'i' + i;
  const u = makeU(k);
  const body = icon.svg(u);
  host.innerHTML = `<svg viewBox="${ICON_VIEWBOX}" fill="none" aria-hidden="true">${defs(k, u.grads)}${body}</svg>`;
  const svg = host.querySelector('svg');
  const E = {};
  svg.querySelectorAll('[data-n]').forEach((el) => { E[el.dataset.n] = el; });
  const tints = [...svg.querySelectorAll('[data-t]')].map((el) => { const [attr, src] = el.dataset.t.split(':'); return [el, attr, src]; });
  // Outside strokes: each 2-unit outline is masked by its own shape, so only the outer
  // 1 unit shows and the fill keeps its full size.
  const defsEl = svg.querySelector('defs');
  const clips = [...svg.querySelectorAll('.ol')].map((el, j) => {
    const mask = document.createElementNS(SVG_NS, 'mask');
    mask.id = `ol-${k}-${j}`;
    at(mask, { maskUnits: 'userSpaceOnUse', x: -40, y: -40, width: 111, height: 109 });
    mask.innerHTML = '<rect x="-40" y="-40" width="111" height="109" fill="#fff"/>';
    const shape = document.createElementNS(SVG_NS, 'path');
    shape.setAttribute('fill', '#000');
    shape.setAttribute('fill-rule', el.getAttribute('fill-rule') || 'nonzero');
    mask.appendChild(shape);
    defsEl.appendChild(mask);
    el.setAttribute('mask', `url(#${mask.id})`);
    return [el, shape];
  });
  const inst = {
    icon, i, E, tints, clips,
    whites: [...svg.querySelectorAll('[data-w]')],
    pures: [...svg.querySelectorAll('[data-pure]')],
    shadow: svg.querySelector('[data-sh]'),
    s: {}, raf: 0, painted: '', hover: 0
  };
  inst.cur = targetOf(inst);
  render(inst);
  return inst;
}

function targetOf(inst) {
  const pal = runtime.palette;
  const h = Boolean(inst.hover > 0 || inst.pin || inst.demo);
  const t = inst.icon.target(h, inst.s);
  t.c = rgb(pal.colors[inst.i]);
  t.e = rgb((pal.edges || pal.colors)[inst.i]);
  return t;
}

function render(inst) {
  const p = inst.cur;
  inst.icon.draw(p, inst.E, inst);
  for (const [el, shape] of inst.clips) {
    const d = el.getAttribute('d');
    if (d && shape.getAttribute('d') !== d) shape.setAttribute('d', d);
  }
  const deep = Boolean(runtime.palette.deepMarks);
  const key = hex(p.c) + hex(p.e) + deep;
  if (inst.painted === key) return;
  inst.painted = key;
  // Gradients and light marks follow the fill colour; outlines and deep marks follow the
  // edge colour, which stays strong when the fill is lifted.
  const pick = (src) => (rgb(src)[0] <= REF[0] ? p.e : p.c);
  for (const [el, attr, src] of inst.tints) el.setAttribute(attr, tint(src, el.tagName !== 'stop' ? pick(src) : p.c));
  // White marks sit on mid-tone bodies; on a light body they turn deep to stay legible.
  for (const el of inst.whites) el.setAttribute(el.dataset.w, deep ? tint('#2F6FE0', p.e) : '#fff');
  // Large solid fills: solid normally; a light palette fades them from near-white at the top.
  for (const stop of inst.pures) {
    const base = tint(stop.dataset.src, pick(stop.dataset.src));
    stop.setAttribute('stop-color', deep && stop.dataset.pure === '0' ? soften(base, 0.72) : base);
  }
  const sh = rgb(tint('#8AB6FF', p.c));
  inst.shadow.setAttribute('values', `0 0 0 0 ${f(sh[0] / 255)} 0 0 0 0 ${f(sh[1] / 255)} 0 0 0 0 ${f(sh[2] / 255)} 0 0 0 0.21 0`);
}

// Starts from what is on screen, so reversing mid-way carries on smoothly.
function go(inst) {
  const to = targetOf(inst);
  cancelAnimationFrame(inst.raf);
  if (REDUCED) { inst.cur = to; render(inst); return; }
  const from = inst.cur, t0 = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - t0) / DUR);
    inst.cur = interp(from, to, EASE(t));
    render(inst);
    if (t < 1) inst.raf = requestAnimationFrame(tick);
  };
  inst.raf = requestAnimationFrame(tick);
}

// Copyright (c) 2026 Kubai087. Licensed under the Kubai Icons License; see LICENSE.
const OL = 'class="ol" data-t="stroke:#5393FF"';
const ACC = 'class="ln" data-t="stroke:#5393FF"';
const DEEP = 'data-t="fill:#2F6FE0"';
const DEEPS = 'data-t="stroke:#2F6FE0"';
const alarmClock = {
    name: '闹钟',
    // An alarm clock with twin bells on two feet. On hover it rings: it rocks on its feet,
    // the swings die away and it comes to rest upright again.
    svg: (u) => {
      const body = circ(15.5, 13.4, 9.8), bells = circ(8.7, 6.6, 4.2) + circ(22.3, 6.6, 4.2);
      return `
      <g data-n="r0"><path d="M11.2 20.4L8.4 23.4M19.8 20.4L22.6 23.4" fill="none" stroke-width="2.2" stroke-linecap="round" ${DEEPS}/></g>
      <g filter="${u.sh}"><g filter="${u.hi}"><g data-n="r1"><path d="${bells}" fill="${u.upS}"/></g></g></g>
      <g data-n="r2"><path d="${bells}" ${OL}/></g>
      <g filter="${u.sh}"><g filter="${u.hi}"><g data-n="r3"><path d="${body}" fill="${u.loS}"/></g></g></g>
      <g data-n="r4"><path d="${body}" ${OL}/>
        <path d="${circ(15.5, 13.4, 7.4)}" fill="#fff"/>
        <path d="M15.5 13.4V9.6" transform="rotate(${CLOCK_MINUTES / 2} 15.5 13.4)" stroke-width="2.6" stroke-linecap="round" data-t="stroke:#89B5FF"/>
        <path d="M15.5 13.4V9" transform="rotate(${(CLOCK_MINUTES * 6) % 360} 15.5 13.4)" stroke-width="2" stroke-linecap="round" ${DEEPS}/>
        <circle cx="15.5" cy="13.4" r="1.7" ${DEEP}/></g>`;
    },
    target: (h) => ({ o: h ? 1 : 0 }),
    draw(p, E) {
      // One 0→1 progress drives a damped rattle that starts and ends upright.
      const o = Math.max(0, Math.min(1, p.o));
      const a = 12 * (1 - o) * Math.sin(5 * Math.PI * o);
      const t = `rotate(${f(a)} 15.5 23.4)`;
      ['r0', 'r1', 'r2', 'r3', 'r4'].forEach((n) => at(E[n], { transform: t }));
    }
  };
const notebook = {
    name: '笔记本',
    // A spiral notebook. On hover the cover turns over on its rings and folds away behind,
    // leaving the lined first page.
    svg: (u) => {
      const back = rr(6.3, 1, 18.4, 23, KR);
      const rings = [5.5, 10.2, 14.8, 19.5].map((y) => rr(3.8, y - 1.2, 7.4, 2.4, 1.2)).join('');
      return `
      <g filter="${u.sh}"><g filter="${u.hi}"><path d="${back}" fill="${u.loS}"/></g></g>
      <path d="${back}" ${OL}/>
      <path d="${rr(9.4, 3, 13.3, 19, CR)}" fill="#fff"/>
      <path d="${lines(13.4, 8.4, [7.4, 5])}" ${ACC}/>
      <g data-n="cvG"><g filter="${u.hi}"><path data-n="cv" fill="${u.upS}"/></g>
        <path data-n="shade" ${DEEP} opacity="0"/>
        <path data-n="cvO" ${OL}/>
        <g data-n="label"><path d="${lines(13.4, 7.4, [7])}" class="ln" ${DEEPS} stroke-opacity=".55"/></g></g>
      <path d="${rings}" ${DEEP}/>`;
    },
    target: (h) => ({ o: h ? 1 : 0 }),
    draw(p, E) {
      // The cover's width shrinks to its hinge on the rings, darkening as it faces away; at
      // the end it has gone round behind the back.
      const o = Math.max(0, Math.min(1, p.o));
      const s = Math.cos(o * Math.PI / 2), w = 15.3 * s;
      const d = rp(R(9.4, 1, w, 23), [1.6, KR, KR, 1.6]);
      at(E.cv, { d }); at(E.cvO, { d }); at(E.shade, { d, opacity: f(0.4 * Math.sin(o * Math.PI / 2)) });
      at(E.label, { transform: `translate(9.4 0) scale(${f(Math.max(0.001, s))} 1) translate(-9.4 0)` });
      at(E.cvG, { opacity: o > 0.985 ? 0 : 1 });
    }
  };
const calendarCheck = {
  svg(u) {
    const body = rr(5.2, 3.4, 20.6, 19.4, KR);
    const paper = rr(7.8, 8.6, 15.4, 11.7, CR);
    const header = rp(R(5.2, 3.4, 20.6, 5.2), [KR, KR, 0, 0]);
    const rings = rr(10.1, 1.6, 2.4, 3.7, 1.2) + rr(18.5, 1.6, 2.4, 3.7, 1.2);
    return `
      <g filter="${u.sh}"><path d="${body}" fill="${u.loS}"/></g>
      <path d="${paper}" fill="#fff"/><path d="${body}" ${OL}/>
      <g filter="${u.hi}"><path d="${header}" fill="${u.upS}"/></g>
      <path d="${header}" ${OL}/>
      <path d="${rings}" fill="#fff"/><path d="${rings}" ${OL}/>
      <path d="M11.7 14.5l2.6 2.5 5-5" fill="none" stroke-width="2.2"
        stroke-linecap="round" stroke-linejoin="round" ${DEEPS}/>`;
  },
  target: () => ({}),
  draw() {}
};
const slots = [
  ['#upcoming-view .tab-icon', alarmClock],
  ['#past-view .tab-icon', notebook],
  ['.empty-icon', calendarCheck]
];
const paletteForTheme = () => clearTone('Digii',
  document.documentElement.dataset.theme === 'dark' ? '#719BD9' : '#9A6E4D', slots.length);
runtime.palette = paletteForTheme();
const mounted = slots.map(([selector, icon], index) => {
  const host = document.querySelector(selector);
  const instance = mountIcon(icon, index, host);
  const button = host.closest('button');
  const update = () => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    instance.hover = Number(button.matches(':hover, :focus-visible'));
    go(instance);
  };
  if (button) {
    for (const event of ['pointerenter', 'pointerleave', 'focus', 'blur']) {
      button.addEventListener(event, update);
    }
  }
  return instance;
});
new MutationObserver(() => {
  runtime.palette = paletteForTheme();
  mounted.forEach(go);
}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

})();
