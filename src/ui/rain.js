'use strict';

// Background "file rain": columns of tiny file, folder, image, music and code
// glyphs fall like a terminal rain, each stream led by a brighter glyph.
// Drawn on a canvas behind the main pane; cheap (30 fps, sprites cached,
// paused when hidden) and still for people who prefer reduced motion.

(() => {
  const canvas = document.getElementById('rain');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const CELL = 18;          // grid step, CSS px
  const GLYPH = 11;         // glyph size, CSS px
  const FPS = 30;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const dark = matchMedia('(prefers-color-scheme: dark)');

  // Each glyph is a tiny line drawing on a 12x12 grid.
  const SHAPES = {
    file(c) { c.moveTo(3, 1); c.lineTo(8, 1); c.lineTo(10, 3); c.lineTo(10, 11); c.lineTo(3, 11); c.closePath(); c.moveTo(5, 6); c.lineTo(8, 6); c.moveTo(5, 8.5); c.lineTo(8, 8.5); },
    folder(c) { c.moveTo(1, 3); c.lineTo(5, 3); c.lineTo(6, 4.5); c.lineTo(11, 4.5); c.lineTo(11, 10); c.lineTo(1, 10); c.closePath(); },
    image(c) { c.rect(1.5, 2.5, 9, 7); c.moveTo(1.5, 8); c.lineTo(4.5, 5.5); c.lineTo(7, 8); c.lineTo(8.5, 6.5); c.lineTo(10.5, 8.5); },
    note(c) { c.moveTo(5, 9); c.lineTo(5, 2); c.lineTo(10, 1); c.lineTo(10, 8); c.moveTo(5, 9); c.arc(3.6, 9, 1.4, 0, Math.PI * 2); c.moveTo(10, 8); c.arc(8.6, 8, 1.4, 0, Math.PI * 2); },
    code(c) { c.moveTo(4, 3); c.lineTo(1.5, 6); c.lineTo(4, 9); c.moveTo(8, 3); c.lineTo(10.5, 6); c.lineTo(8, 9); },
    zip(c) { c.rect(2.5, 1, 7, 10); c.moveTo(6, 1); c.lineTo(6, 3); c.moveTo(6, 4); c.lineTo(6, 5); c.moveTo(6, 6); c.lineTo(6, 7); },
    game(c) { c.moveTo(3, 4); c.lineTo(9, 4); c.quadraticCurveTo(11.5, 4, 11.5, 7); c.quadraticCurveTo(11.5, 9.5, 9.5, 9); c.lineTo(8, 7.5); c.lineTo(4, 7.5); c.lineTo(2.5, 9); c.quadraticCurveTo(0.5, 9.5, 0.5, 7); c.quadraticCurveTo(0.5, 4, 3, 4); c.moveTo(3.5, 5); c.lineTo(3.5, 7); c.moveTo(2.5, 6); c.lineTo(4.5, 6); },
  };
  const NAMES = Object.keys(SHAPES);

  let dpr = 1;
  let cols = 0;
  let rows = 0;
  let streams = [];
  let sprites = {};
  let last = 0;
  let raf = 0;

  // Pre-rendered glyphs: "head" (bright) and "body" (dim) for each shape.
  function buildSprites() {
    const isDark = dark.matches;
    const body = isDark ? 'rgba(110,175,255,1)' : 'rgba(26,124,255,1)';
    const head = isDark ? 'rgba(220,238,255,1)' : 'rgba(10,80,200,1)';
    sprites = {};
    for (const name of NAMES) {
      for (const [kind, color] of [['body', body], ['head', head]]) {
        const s = document.createElement('canvas');
        s.width = s.height = Math.ceil(GLYPH * dpr);
        const c = s.getContext('2d');
        c.scale(s.width / 12, s.height / 12);
        c.strokeStyle = color;
        c.lineWidth = kind === 'head' ? 1.3 : 1.1;
        c.lineJoin = c.lineCap = 'round';
        c.beginPath();
        SHAPES[name](c);
        c.stroke();
        sprites[`${name}:${kind}`] = s;
      }
    }
  }

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = () => NAMES[(Math.random() * NAMES.length) | 0];

  function newStream(x, scatter) {
    const length = (rand(10, 26)) | 0;
    return {
      x,
      y: scatter ? rand(-rows, rows) : rand(-length * 2, -length), // head row, fractional
      speed: rand(3, 9),                                           // rows per second
      length,
      glyphs: Array.from({ length: rows + length + 2 }, pick),
      flicker: rand(0.02, 0.08),
    };
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    cols = Math.ceil(rect.width / CELL);
    rows = Math.ceil(rect.height / CELL);
    // Not every column rains: sparse streams read as texture, not noise.
    streams = [];
    for (let x = 0; x < cols; x++) if (Math.random() < 0.8) streams.push(newStream(x, true));
    buildSprites();
    draw(0);
  }

  function draw(dt) {
    const isDark = dark.matches;
    const base = isDark ? 0.30 : 0.15;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const size = GLYPH * dpr;
    const step = CELL * dpr;
    const offset = (step - size) / 2;

    for (const s of streams) {
      s.y += s.speed * dt;
      if (s.y - s.length > rows) Object.assign(s, newStream(s.x, false));
      if (Math.random() < s.flicker) s.glyphs[(Math.random() * s.glyphs.length) | 0] = pick();

      const headRow = Math.floor(s.y);
      for (let i = 0; i < s.length; i++) {
        const row = headRow - i;
        if (row < 0 || row >= rows) continue;
        const name = s.glyphs[(row + s.glyphs.length) % s.glyphs.length];
        const isHead = i === 0;
        ctx.globalAlpha = isHead ? Math.min(1, base * 2.4) : base * (1 - i / s.length);
        ctx.drawImage(sprites[`${name}:${isHead ? 'head' : 'body'}`], s.x * step + offset, row * step + offset, size, size);
      }
    }
    ctx.globalAlpha = 1;
  }

  function frame(t) {
    raf = requestAnimationFrame(frame);
    if (t - last < 1000 / FPS) return;
    const dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
    last = t;
    draw(dt);
  }

  function start() {
    cancelAnimationFrame(raf);
    last = 0;
    if (reduced.matches || document.hidden) draw(0);
    else raf = requestAnimationFrame(frame);
  }

  new ResizeObserver(resize).observe(canvas);
  dark.addEventListener('change', () => { buildSprites(); draw(0); });
  reduced.addEventListener('change', start);
  document.addEventListener('visibilitychange', start);
  resize();
  start();
})();
