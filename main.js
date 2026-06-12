// CoolLanding — Anti-Template Multi-World Demo
// 8 distinct visual languages, switched via header buttons.
// Each world runs its own renderer + signature mechanic.

const canvasCinematic = document.querySelector("#signal-field");
const canvasEditorial = document.querySelector("#editorial-field");
const canvasAlcove = document.querySelector("#alcove-field");
const canvasSpatial = document.querySelector("#spatial-field");
const canvasGenerative = document.querySelector("#generative-field");

const meter = document.querySelector("[data-scroll-meter]");
const cursor = document.querySelector("[data-cursor-dot]");
const cursorLabel = document.querySelector("[data-cursor-label]");
const loaderCount = document.querySelector("[data-loader-count]");
const loaderLine = document.querySelector("[data-loader-line]");
const ritualTrack = document.querySelector("[data-ritual-track]");
const frameCounter = document.querySelector("[data-frame-counter]");
const pointerReadout = document.querySelector("[data-cn-pointer]");
const timeReadout = document.querySelector("[data-cn-time]");
const uptimeReadout = document.querySelector("[data-cn-uptime]");
const audioToggle = document.querySelector("[data-audio-toggle]");
const stampStage = document.querySelector("[data-stamp-stage]");
const switcherButtons = document.querySelectorAll("[data-set-world]");

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const STORAGE_WORLD_KEY = "coollanding-world";
const STORAGE_STAMPS_KEY = "coollanding-stamps";

const VALID_WORLDS = [
  "cinematic-dark",
  "editorial-interference",
  "ritual-craft",
  "luxury-alcove",
  "spatial-architecture",
  "festival-kinetic",
  "papercraft-tactile",
  "generative-system",
];

let currentWorld = (() => {
  const stored = (() => { try { return localStorage.getItem(STORAGE_WORLD_KEY); } catch (_) { return null; } })();
  if (stored && VALID_WORLDS.includes(stored)) return stored;
  return "cinematic-dark";
})();

const pointer = {
  x: window.innerWidth * 0.5,
  y: window.innerHeight * 0.5,
  tx: window.innerWidth * 0.5,
  ty: window.innerHeight * 0.5,
};

let width = 1;
let height = 1;
let dpr = 1;
let scrollProgress = 0;
let spatialProgress = 0;
let pulse = 0;
let startedAt = performance.now();
let frame = 0;
let worldEnterTimer = null;

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const lerp = (a, b, t) => a + (b - a) * t;

function localProgress(el) {
  if (!el) return 0;
  const rect = el.getBoundingClientRect();
  const travel = Math.max(1, el.offsetHeight - window.innerHeight);
  return clamp01(-rect.top / travel);
}

function viewportProgress(el) {
  if (!el) return 0;
  const rect = el.getBoundingClientRect();
  return clamp01((window.innerHeight - rect.top) / (window.innerHeight + Math.max(1, rect.height)));
}

// ============================================================
// Cinematic Dark — GLWorlds pipeline (glworlds.js) + 2D fallback
// ============================================================
// The real renderer lives in glworlds.js: layered HDR scene (background ->
// raymarched chrome sigil -> 65k GPGPU curl-noise particles) -> multi-mip
// UnrealBloom -> anamorphic streak -> filmic composite. This file only owns
// scheduling, pointer/scroll state, and the graceful 2D fallback.
let cnPrevTime = 0;                    // for frame-rate-independent dt
let cnShock = 0;                       // click impulse, decays each frame
let heroProgress = 0;                  // scroll progress through the hero arc

function glState(world) {
  return window.GLWorlds && GLWorlds.active(world);
}

// Lazily build the GL pipeline for a world the first time it is visited, so
// secondary contexts/FBOs only exist when needed (kind to weak GPUs).
function ensureWorldPipeline(world) {
  if (!window.GLWorlds) return;
  const map = {
    "spatial-architecture": ["spatial", canvasSpatial],
    "luxury-alcove": ["luxury", canvasAlcove],
  };
  const entry = map[world];
  if (!entry) return;
  const [name, canvas] = entry;
  if (canvas && !GLWorlds.active(name)) {
    if (GLWorlds.ensure(name, canvas)) GLWorlds.resize(name);
    else resizeCanvases();   // GL failed — give the 2D fallback its context
  }
}

function glRenderState(time) {
  const tSec = (time - startedAt) * 0.001;
  const rawDt = cnPrevTime ? (time - cnPrevTime) * 0.001 : 0.016;
  cnPrevTime = time;
  const dt = Math.min(Math.max(rawDt, 0.0005), 0.05);
  cnShock *= Math.pow(0.30, dt);
  heroProgress = clamp01(window.scrollY / Math.max(1, window.innerHeight * 1.4));
  return {
    time: tSec,
    dt,
    rawDt,
    mx: width ? pointer.x / width - 0.5 : 0,
    my: height ? -(pointer.y / height - 0.5) : 0,
    heroP: heroProgress,
    scroll: scrollProgress,
    shock: Math.min(1.5, cnShock + pulse * 0.6),
    pulse,
    reduced: prefersReducedMotion,
    orbit: spatialOrbit,
  };
}

function renderCinematic(time) {
  if (window.GLWorlds && GLWorlds.render("cinematic", glRenderState(time))) return;
  // graceful fallback when WebGL2 / float targets are unavailable
  const ctx = canvasCinematic.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);
  const x = pointer.x;
  const y = pointer.y;
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, Math.max(width, height) * 0.44);
  gradient.addColorStop(0, `rgba(255,255,255,${0.65 + pulse})`);
  gradient.addColorStop(0.12, "rgba(94,251,255,0.34)");
  gradient.addColorStop(0.62, "rgba(94,251,255,0.04)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

// ============================================================
// Editorial Interference — halftone grain + cursor lens
// ============================================================
function renderEditorial(time) {
  const ctx = canvasEditorial.getContext("2d");
  ctx.clearRect(0, 0, width, height);

  // halftone dot field that tightens + heats up around the cursor (the lens)
  const cellSize = 28;
  const cols = Math.ceil(width / cellSize) + 1;
  const rows = Math.ceil(height / cellSize) + 1;
  const t = (time - startedAt) * 0.0004;
  const lensRadius = 230;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const cx = c * cellSize + cellSize * 0.5;
      const cy = r * cellSize + cellSize * 0.5;
      const dx = cx - pointer.x;
      const dy = cy - pointer.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const lens = Math.max(0, 1 - dist / lensRadius);
      const phase = (c + r) * 0.27 + t * 6;
      const wobble = 0.85 + Math.sin(phase) * 0.15;
      const radius = 1.4 + lens * 5.8 * wobble;
      ctx.fillStyle = lens > 0.02
        ? `rgba(${Math.round(16 + lens * 239)}, ${Math.round(16 + lens * 44)}, 14, ${0.18 + lens * 0.5})`
        : "rgba(16, 16, 14, 0.18)";
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // the loupe: a red baseline grid + crosshair revealed only inside the lens
  if (pointer.x > 0 && pointer.y > 0) {
    const lr = lensRadius * 0.5;
    ctx.save();
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, lr, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = "rgba(255, 60, 8, 0.22)";
    ctx.lineWidth = 1;
    const base = 14;
    const y0 = Math.floor((pointer.y - lr) / base) * base;
    for (let y = y0; y < pointer.y + lr; y += base) {
      ctx.beginPath(); ctx.moveTo(pointer.x - lr, y); ctx.lineTo(pointer.x + lr, y); ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(255, 60, 8, 0.8)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(pointer.x, pointer.y, lr, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pointer.x - 9, pointer.y); ctx.lineTo(pointer.x + 9, pointer.y);
    ctx.moveTo(pointer.x, pointer.y - 9); ctx.lineTo(pointer.x, pointer.y + 9);
    ctx.stroke();
  }
}

// ============================================================
// Luxury Alcove — gold dust particles
// ============================================================
const luxuryParticles = [];
function initLuxuryParticles() {
  luxuryParticles.length = 0;
  const count = Math.min(140, Math.floor(width * height / 12000));
  for (let i = 0; i < count; i += 1) {
    luxuryParticles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.18,
      vy: -Math.random() * 0.28 - 0.05,
      r: Math.random() * 1.8 + 0.5,
      alpha: Math.random() * 0.6 + 0.15,
      hue: Math.random() < 0.7 ? "195, 146, 87" : "243, 237, 220",
    });
  }
}

function renderLuxury(time) {
  if (window.GLWorlds && GLWorlds.render("luxury", glRenderState(time))) return;
  const ctx = canvasAlcove.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);

  // subtle vignette of warm light from upper right
  const grad = ctx.createRadialGradient(width * 0.75, height * 0.3, 0, width * 0.75, height * 0.3, Math.max(width, height) * 0.7);
  grad.addColorStop(0, "rgba(195, 146, 87, 0.1)");
  grad.addColorStop(0.6, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < luxuryParticles.length; i += 1) {
    const p = luxuryParticles[i];
    p.x += p.vx;
    p.y += p.vy;
    if (p.y < -10) { p.y = height + 10; p.x = Math.random() * width; }
    if (p.x < -10) p.x = width + 10;
    if (p.x > width + 10) p.x = -10;
    // pointer slight attractor
    const dx = pointer.x - p.x;
    const dy = pointer.y - p.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 200) {
      p.x += (dx / d) * 0.18;
      p.y += (dy / d) * 0.18;
    }
    ctx.fillStyle = `rgba(${p.hue}, ${p.alpha})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ============================================================
// DOM kinetic director — reference-grade scroll/pointer timelines
// ============================================================
function updateKineticDirector(time = performance.now()) {
  const world = document.getElementById(currentWorld);
  if (!world) return;

  const p = localProgress(world);
  const mx = width ? pointer.x / width - 0.5 : 0;
  const my = height ? pointer.y / height - 0.5 : 0;
  const t = (time - startedAt) * 0.001;

  world.style.setProperty("--world-p", p.toFixed(4));
  world.style.setProperty("--mx", mx.toFixed(4));
  world.style.setProperty("--my", my.toFixed(4));
  world.style.setProperty("--motion-t", t.toFixed(3));

  if (currentWorld === "editorial-interference") updateEditorialMotion(world, p);
  if (currentWorld === "ritual-craft") updateRitualMotion(world);
  if (currentWorld === "luxury-alcove") updateLuxuryMotion(world);
  if (currentWorld === "spatial-architecture") updateSpatialMotion(world, p);
  if (currentWorld === "festival-kinetic") updateFestivalMotion(world);
  if (currentWorld === "papercraft-tactile") updatePapercraftMotion(world);
  if (currentWorld === "generative-system") updateGenerativeMotion(world, p);
}

function updateEditorialMotion(world, p) {
  world.style.setProperty("--ed-p", p.toFixed(4));
  const rows = world.querySelectorAll(".ed-toc-row");
  const active = Math.min(rows.length - 1, Math.floor(p * rows.length));
  rows.forEach((row, i) => row.classList.toggle("is-current", i === active));
}

function updateRitualMotion(world) {
  const trackSection = world.querySelector(".rc-track-section");
  const trackP = localProgress(trackSection);
  world.style.setProperty("--rc-track-p", trackP.toFixed(4));
  const panels = world.querySelectorAll(".rc-panel");
  const active = Math.min(panels.length - 1, Math.floor(trackP * panels.length));
  panels.forEach((panel, i) => {
    const panelP = clamp01((trackP * panels.length) - i);
    panel.style.setProperty("--panel-p", panelP.toFixed(4));
    panel.classList.toggle("is-active", i === active);
  });
}

function updateLuxuryMotion(world) {
  world.querySelectorAll(".lx-room, .lx-step").forEach((el) => {
    const p = viewportProgress(el);
    el.style.setProperty("--room-p", p.toFixed(4));
    el.classList.toggle("is-active", p > 0.35 && p < 0.82);
  });
}

function updateSpatialMotion(world, p) {
  spatialProgress = p;
  const local = localProgress(world.querySelector(".sp-hero"));
  // exposed for CSS hooks + probes; the camera dive itself happens in WebGL
  world.style.setProperty("--sp-p", local.toFixed(4));
  world.querySelectorAll(".sp-stratum").forEach((row) => {
    const rp = viewportProgress(row);
    row.style.setProperty("--row-p", rp.toFixed(4));
    row.classList.toggle("is-current", rp > 0.44 && rp < 0.62);
  });
  const spatialWaterline = world.querySelector("[data-spatial-waterline]");
  if (spatialWaterline) {
    spatialWaterline.style.setProperty("--sp-water-shift", `${(local * 82).toFixed(1)}px`);
  }
}

function updateFestivalMotion(world) {
  const heroP = localProgress(world.querySelector(".fk-hero"));
  world.style.setProperty("--fk-hero-p", heroP.toFixed(4));
  const cards = world.querySelectorAll(".fk-card");
  cards.forEach((card, i) => {
    const cp = viewportProgress(card);
    card.style.setProperty("--card-p", cp.toFixed(4));
    card.classList.toggle("is-on", cp > 0.18);
    card.style.setProperty("--card-delay", `${i * 42}ms`);
  });
  const anchors = [...world.querySelectorAll("[data-fk-jump]")];
  const chapters = [
    world.querySelector(".fk-hero"),
    world.querySelector(".fk-marquee"),
    world.querySelector(".fk-grid"),
    world.querySelector(".fk-footer"),
  ];
  let active = 0;
  chapters.forEach((chapter, i) => {
    if (!chapter) return;
    const rect = chapter.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.55) active = i;
  });
  anchors.forEach((a, i) => a.classList.toggle("is-active", i === active));
}

function updatePapercraftMotion(world) {
  const hero = world.querySelector(".pc-hero");
  const heroP = localProgress(hero);
  world.style.setProperty("--pc-hero-p", heroP.toFixed(4));
  world.querySelectorAll(".pc-card").forEach((card, i) => {
    const cp = viewportProgress(card);
    card.style.setProperty("--card-p", cp.toFixed(4));
    card.style.setProperty("--card-delay", `${i * 80}ms`);
    card.classList.toggle("is-on", cp > 0.25);
  });
}

function updateGenerativeMotion(world, p) {
  world.style.setProperty("--gs-p", p.toFixed(4));
  world.querySelectorAll(".gs-ex-card").forEach((card) => {
    const cp = viewportProgress(card);
    card.style.setProperty("--card-p", cp.toFixed(4));
    card.classList.toggle("is-on", cp > 0.22);
  });
}

// ============================================================
// Shared resize + frame loop
// ============================================================
function resizeCanvases() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  // canvases reserved for (possibly not-yet-built) WebGL pipelines: grabbing a
  // 2D context would permanently block webgl2 on them, so only the ones whose
  // GL init actually failed fall back to 2D here.
  const reserved = new Set();
  if (window.GLWorlds) {
    if (!GLWorlds.failed("cinematic")) reserved.add(canvasCinematic);
    if (!GLWorlds.failed("luxury")) reserved.add(canvasAlcove);
    if (!GLWorlds.failed("spatial")) reserved.add(canvasSpatial);
  }
  [canvasCinematic, canvasEditorial, canvasAlcove, canvasSpatial, canvasGenerative].forEach((c) => {
    if (!c) return;
    c.width = Math.floor(width * dpr);
    c.height = Math.floor(height * dpr);
    c.style.width = `${width}px`;
    c.style.height = `${height}px`;
    if (reserved.has(c)) return;
    const ctx = c.getContext("2d");
    if (ctx && typeof ctx.scale === "function") {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    }
  });
  if (window.GLWorlds) {
    GLWorlds.resize("cinematic");
    GLWorlds.resize("luxury");
    GLWorlds.resize("spatial");
  }
  initLuxuryParticles();
  seedGenerativeParticles();
}

function render(time) {
  pointer.x += (pointer.tx - pointer.x) * 0.08;
  pointer.y += (pointer.ty - pointer.y) * 0.08;
  pulse *= 0.93;
  frame += 1;
  updateKineticDirector(time);

  if (currentWorld === "cinematic-dark") {
    renderCinematic(time);
  } else if (currentWorld === "editorial-interference") {
    renderEditorial(time);
  } else if (currentWorld === "luxury-alcove") {
    renderLuxury(time);
  } else if (currentWorld === "spatial-architecture") {
    renderSpatial(time);
  } else if (currentWorld === "generative-system") {
    renderGenerative(time);
  }
  // ritual-craft, festival-kinetic, papercraft-tactile are CSS/DOM-only

  // Cinematic HUD readouts
  if (currentWorld === "cinematic-dark") {
    if (frameCounter && frame % 4 === 0) {
      frameCounter.textContent = `frame ${String(frame).padStart(4, "0")}`;
    }
    if (pointerReadout && frame % 3 === 0) {
      pointerReadout.textContent = `${String(Math.round(pointer.x)).padStart(4, "0")}, ${String(Math.round(pointer.y)).padStart(4, "0")}`;
    }
    if (timeReadout && frame % 12 === 0) {
      const elapsed = (time - startedAt) / 1000;
      const m = String(Math.floor(elapsed / 60) % 60).padStart(2, "0");
      const s = String(Math.floor(elapsed) % 60).padStart(2, "0");
      const ms = String(Math.floor((elapsed * 100) % 100)).padStart(2, "0");
      timeReadout.textContent = `${m}:${s}.${ms}`;
    }
    if (uptimeReadout && frame % 30 === 0) {
      const elapsed = (time - startedAt) / 1000;
      const m = String(Math.floor(elapsed / 60)).padStart(2, "0");
      const s = String(Math.floor(elapsed) % 60).padStart(2, "0");
      uptimeReadout.textContent = `${m}:${s}`;
    }
    if (frame % 3 === 0) updateOrbitReadout();
  }

  if (!prefersReducedMotion) requestAnimationFrame(render);
}

// ============================================================
// Cinematic — live "scroll arms the orbit" readout
// ============================================================
let orbitEls = null;
function updateOrbitReadout() {
  if (orbitEls === null) {
    orbitEls = {
      bars: document.querySelectorAll("[data-orbit-bar]"),
      vals: document.querySelectorAll("[data-orbit-val]"),
      camz: document.querySelector("[data-orbit-camz]"),
      shock: document.querySelector("[data-orbit-shock]"),
      particles: document.querySelector("[data-orbit-particles]"),
    };
    if (orbitEls.particles) orbitEls.particles.textContent = (256 * 256).toLocaleString();
  }
  const sp = heroProgress;
  const map = { orbit: sp, dolly: sp, bloom: Math.min(1, sp * 0.7 + pulse * 0.6) };
  orbitEls.bars.forEach((b) => {
    const k = b.getAttribute("data-orbit-bar");
    b.style.width = `${Math.round((map[k] || 0) * 100)}%`;
  });
  orbitEls.vals.forEach((v) => {
    const k = v.getAttribute("data-orbit-val");
    v.textContent = `${Math.round((map[k] || 0) * 100)}%`;
  });
  if (orbitEls.camz) orbitEls.camz.textContent = (3.35 - sp * 0.85).toFixed(2);
  if (orbitEls.shock) orbitEls.shock.textContent = (cnShock + pulse * 0.6).toFixed(2);
}

// ============================================================
// Count-up numbers (reusable across worlds)
// ============================================================
function setupCountUp() {
  const els = document.querySelectorAll("[data-count]");
  if (!els.length) return;
  const animate = (el) => {
    const target = parseFloat(el.getAttribute("data-count")) || 0;
    const suffix = el.getAttribute("data-count-suffix") || "";
    const dur = 1300;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      const val = Math.round(target * eased);
      el.textContent = val.toLocaleString() + suffix;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting && !e.target.dataset.counted) {
        e.target.dataset.counted = "1";
        animate(e.target);
      }
    });
  }, { threshold: 0.5 });
  els.forEach((el) => obs.observe(el));
}

// ============================================================
// World switcher
// ============================================================
function setWorld(world, options = {}) {
  if (!VALID_WORLDS.includes(world)) return;
  currentWorld = world;
  document.body.setAttribute("data-world", world);
  switcherButtons.forEach((btn) => {
    const isActive = btn.getAttribute("data-set-world") === world;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  });

  if (!options.skipPersist) {
    try { localStorage.setItem(STORAGE_WORLD_KEY, world); } catch (_) {}
  }

  // jump to top of the world section
  if (!options.skipScroll) {
    const target = document.getElementById(world);
    if (target) {
      const offset = world === "cinematic-dark" ? 0 : Math.max(0, target.offsetTop - 80);
      window.scrollTo({ top: offset, behavior: prefersReducedMotion ? "auto" : "smooth" });
    }
  }

  ensureWorldPipeline(world);
  if (world === "luxury-alcove") initLuxuryParticles();
  if (world === "spatial-architecture") { renderSpatial(performance.now()); }
  if (world === "generative-system") { seedGenerativeParticles(); renderGenerative(performance.now()); }

  document.querySelectorAll(".world.is-entering").forEach((section) => section.classList.remove("is-entering"));
  const activeSection = document.getElementById(world);
  if (activeSection) {
    activeSection.classList.add("is-entering");
    window.clearTimeout(worldEnterTimer);
    worldEnterTimer = window.setTimeout(() => activeSection.classList.remove("is-entering"), 1400);
  }
  updateKineticDirector(performance.now());

  // cursor label per world
  if (cursorLabel) {
    cursorLabel.textContent = ({
      "cinematic-dark": "",
      "editorial-interference": "lens",
      "ritual-craft": "stamp",
      "luxury-alcove": "alcove",
      "spatial-architecture": "volume",
      "festival-kinetic": "go",
      "papercraft-tactile": "fold",
      "generative-system": "seed",
    })[world] ?? "signal";
  }

  // stop audio if leaving luxury-alcove
  if (world !== "luxury-alcove" && audioCtxState.playing) toggleAudio(false);
}

function setupSwitcher() {
  switcherButtons.forEach((btn) => {
    btn.addEventListener("click", (event) => {
      // brand also has data-set-world; allow link to scroll but stay in cinematic
      const world = btn.getAttribute("data-set-world");
      if (btn.tagName === "A") {
        event.preventDefault();
      }
      setWorld(world);
    });
  });
}

// ============================================================
// Loader (cinematic-only)
// ============================================================
function bootLoader() {
  let value = 0;
  const interval = window.setInterval(() => {
    value += Math.ceil((100 - value) * 0.18);
    value = Math.min(100, value);
    if (loaderCount) loaderCount.textContent = `/${String(value).padStart(2, "0")}`;
    if (loaderLine) loaderLine.style.width = `${value}%`;
    if (value >= 100) {
      window.clearInterval(interval);
      window.setTimeout(() => {
        document.body.classList.add("is-loaded");
        if (window.GLWorlds) GLWorlds.startReveal((performance.now() - startedAt) * 0.001);
      }, 260);
      window.setTimeout(() => { pulse = 1; }, 620);
    }
  }, 70);
}

// ============================================================
// ASCII cloud (cinematic-dark only)
// ============================================================
function makeAsciiCloud() {
  const target = document.querySelector("[data-ascii]");
  if (!target) return;
  const rows = [];
  const alphabet = ["/", "/", "/", "0", "1", ">", "-", "_"];
  for (let y = 0; y < 22; y += 1) {
    let row = "";
    for (let x = 0; x < 46; x += 1) {
      const center = Math.abs(x - 23) + Math.abs(y - 11);
      const char = center < 9 && (x + y) % 3 === 0 ? alphabet[(x * 7 + y * 11) % alphabet.length] : " ";
      row += char;
    }
    rows.push(row);
  }
  target.textContent = rows.join("\n");
}

// ============================================================
// Scramble text (cinematic-dark hero)
// ============================================================
function scrambleText(element, finalText) {
  if (!element) return;
  if (prefersReducedMotion) { element.textContent = finalText; return; }
  const chars = "01/<>-_X#";
  let f = 0;
  const total = 28;
  const run = () => {
    const output = finalText.split("").map((char, index) => {
      if (char === " " || char === "/") return char;
      if (index < f / 1.6) return char;
      return chars[(index + f) % chars.length];
    }).join("");
    element.textContent = output;
    f += 1;
    if (f <= total) requestAnimationFrame(run);
    else element.textContent = finalText;
  };
  run();
}

function setupScramble() {
  const title = document.querySelector("[data-scramble]");
  if (!title) return;
  window.setTimeout(() => scrambleText(title, title.dataset.scramble), 900);
  title.addEventListener("pointerenter", () => scrambleText(title, title.dataset.scramble));
}

// ============================================================
// Reveal observer
// ============================================================
function setupReveal() {
  const items = document.querySelectorAll("[data-reveal]");
  if (!("IntersectionObserver" in window)) {
    items.forEach((item) => item.classList.add("is-visible"));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.14 });
  items.forEach((item) => observer.observe(item));
}

// ============================================================
// Scroll
// ============================================================
function updateScroll() {
  const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  scrollProgress = Math.min(1, Math.max(0, window.scrollY / max));
  if (meter) meter.style.width = `${scrollProgress * 100}%`;
  updateKineticDirector(performance.now());

  // ritual-craft pinned horizontal track
  const rituals = document.querySelector(".rc-track-section");
  if (rituals && ritualTrack && currentWorld === "ritual-craft") {
    if (window.innerWidth <= 880) {
      ritualTrack.style.transform = "none";
      return;
    }
    const rect = rituals.getBoundingClientRect();
    const travel = rituals.offsetHeight - window.innerHeight;
    const sectionProgress = Math.min(1, Math.max(0, -rect.top / Math.max(1, travel)));
    ritualTrack.style.transform = `translate3d(${-sectionProgress * 200}vw, 0, 0)`;
  }

  // papercraft-tactile: walk the paper traveler along the SVG path
  if (currentWorld === "papercraft-tactile") updatePaperPath();

  // spatial-architecture: DOM waterline mirrors the canvas horizon
  const spatialWaterline = document.querySelector("[data-spatial-waterline]");
  if (spatialWaterline && currentWorld === "spatial-architecture") {
    spatialWaterline.style.setProperty("--sp-water-shift", `${(spatialProgress * 82).toFixed(1)}px`);
  }
}

// ============================================================
// Papercraft — scroll-path character (Signature Mechanic)
// ============================================================
let paperPathLen = 0;
function updatePaperPath() {
  const section = document.querySelector("[data-paper-path]");
  const sticky = section && section.querySelector(".pc-path-sticky");
  const svg = section && section.querySelector(".pc-path-svg");
  const path = section && section.querySelector("[data-paper-line]");
  const traveler = section && section.querySelector("[data-paper-traveler]");
  if (!section || !sticky || !svg || !path || !traveler) return;

  const rect = section.getBoundingClientRect();
  const travel = section.offsetHeight - window.innerHeight;
  const p = Math.min(1, Math.max(0, -rect.top / Math.max(1, travel)));

  if (!paperPathLen) { try { paperPathLen = path.getTotalLength(); } catch (_) { paperPathLen = 0; } }
  if (!paperPathLen) return;
  const pt = path.getPointAtLength(paperPathLen * p);
  const nextPt = path.getPointAtLength(Math.min(paperPathLen, paperPathLen * p + 8));

  const svgRect = svg.getBoundingClientRect();
  const stickyRect = sticky.getBoundingClientRect();
  const vb = svg.viewBox.baseVal; // 0 0 1000 360
  const x = (svgRect.left - stickyRect.left) + (pt.x / vb.width) * svgRect.width;
  const y = (svgRect.top - stickyRect.top) + (pt.y / vb.height) * svgRect.height;
  traveler.style.left = `${x}px`;
  traveler.style.top = `${y}px`;
  const hop = Math.sin(p * Math.PI * 10) * 4;
  const angle = Math.atan2(nextPt.y - pt.y, nextPt.x - pt.x) * 180 / Math.PI;
  traveler.style.transform = `translate(-50%, calc(-86% + ${hop}px)) rotate(${(angle * 0.18).toFixed(1)}deg)`;
  traveler.style.setProperty("--pc-walk", Math.sin(p * Math.PI * 18).toFixed(4));
  traveler.classList.toggle("is-walking", p > 0.025 && p < 0.975);
  sticky.style.setProperty("--pc-p", p.toFixed(4));
  svg.style.setProperty("--pc-dash", `${(-p * 180).toFixed(1)}px`);
  svg.style.setProperty("--pc-draw", `${(paperPathLen * p).toFixed(1)}`);
  svg.style.setProperty("--pc-rest", `${(paperPathLen * (1 - p) + 1).toFixed(1)}`);

  const steps = section.querySelectorAll("[data-paper-step]");
  const active = Math.min(steps.length - 1, Math.floor(p * steps.length));
  steps.forEach((s, i) => s.classList.toggle("is-on", i === active));
}

// ============================================================
// Cursor + magnetic
// ============================================================
function setupCursor() {
  if (!cursor || window.matchMedia("(hover: none), (pointer: coarse)").matches) return;
  window.addEventListener("pointermove", (event) => {
    pointer.tx = event.clientX;
    pointer.ty = event.clientY;
    cursor.classList.add("is-active");
    if (cursorLabel) cursorLabel.classList.add("is-active");
    cursor.style.left = `${event.clientX}px`;
    cursor.style.top = `${event.clientY}px`;
    if (cursorLabel) {
      cursorLabel.style.left = `${event.clientX}px`;
      cursorLabel.style.top = `${event.clientY}px`;
    }
  });
  document.querySelectorAll("a, button, .magnetic, [data-spotlight]").forEach((target) => {
    target.addEventListener("pointerenter", () => {
      cursor.classList.add("is-hot");
      if (cursorLabel) {
        const baseLabels = {
          "cinematic-dark": "",
          "editorial-interference": "inspect",
          "ritual-craft": "tap",
          "luxury-alcove": "discover",
          "spatial-architecture": "orbit",
          "festival-kinetic": "join",
          "papercraft-tactile": "tap",
          "generative-system": "tune",
        };
        cursorLabel.textContent = baseLabels[currentWorld] || "open";
      }
    });
    target.addEventListener("pointerleave", () => {
      cursor.classList.remove("is-hot");
      if (cursorLabel) {
        const restLabels = {
          "cinematic-dark": "",
          "editorial-interference": "lens",
          "ritual-craft": "stamp",
          "luxury-alcove": "alcove",
          "spatial-architecture": "volume",
          "festival-kinetic": "go",
          "papercraft-tactile": "fold",
          "generative-system": "seed",
        };
        cursorLabel.textContent = restLabels[currentWorld] ?? "signal";
      }
    });
  });
}

function setupMagnetic() {
  if (window.matchMedia("(hover: none), (pointer: coarse)").matches) return;
  document.querySelectorAll(".magnetic").forEach((item) => {
    item.addEventListener("pointermove", (event) => {
      const rect = item.getBoundingClientRect();
      const x = event.clientX - rect.left - rect.width / 2;
      const y = event.clientY - rect.top - rect.height / 2;
      item.style.transform = `translate(${x * 0.12}px, ${y * 0.16}px)`;
    });
    item.addEventListener("pointerleave", () => {
      item.style.transform = "";
    });
  });
}

// ============================================================
// Ritual sticker stamps (Signature Mechanic for ritual-craft)
// ============================================================
const stampHistory = [];
const stampNodes = [];

function setupStickerStamps() {
  if (!stampStage) return;

  // Restore stamps from prior session (they stay put — co-authored page)
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_STAMPS_KEY) || "[]");
    if (Array.isArray(stored)) {
      stored.slice(-24).forEach((entry) => {
        if (entry && typeof entry === "object") {
          stampHistory.push(entry);
          spawnStamp(entry.label, entry.x, entry.y, entry.color, true);
        }
      });
    }
  } catch (_) {}
  updateStampCount();

  stampStage.querySelectorAll(".rc-sticker").forEach((sticker) => {
    sticker.addEventListener("click", (event) => {
      const stamp = sticker.getAttribute("data-stamp") || "yoo";
      const label = sticker.textContent.trim();
      spawnStamp(label, event.clientX, event.clientY, stamp);
      burstConfetti(event.clientX, event.clientY);
      sticker.animate(
        [
          { transform: sticker.style.transform || "rotate(0)", offset: 0 },
          { transform: "rotate(-8deg) scale(0.9)", offset: 0.4 },
          { transform: sticker.style.transform || "rotate(0)", offset: 1 },
        ],
        { duration: 360, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" }
      );
    });
  });

  const clearBtn = document.querySelector("[data-stamp-clear]");
  if (clearBtn) clearBtn.addEventListener("click", () => {
    stampNodes.splice(0).forEach((n) => n.remove());
    stampHistory.length = 0;
    try { localStorage.setItem(STORAGE_STAMPS_KEY, "[]"); } catch (_) {}
    updateStampCount();
  });

  setupRitualChecklist();
}

function spawnStamp(label, x, y, color, persistOnly = false) {
  const ritualWorld = document.getElementById("ritual-craft");
  const el = document.createElement("div");
  el.className = `rc-stamp from-${color || "yoo"}`;
  el.textContent = label;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.setProperty("--stamp-rot", `${(Math.random() * 16 - 8).toFixed(1)}deg`);
  (ritualWorld || document.body).appendChild(el);
  stampNodes.push(el);
  while (stampNodes.length > 24) { const old = stampNodes.shift(); if (old) old.remove(); }

  if (!persistOnly) {
    stampHistory.push({ label, x, y, color, ts: Date.now() });
    while (stampHistory.length > 24) stampHistory.shift();
    try { localStorage.setItem(STORAGE_STAMPS_KEY, JSON.stringify(stampHistory)); } catch (_) {}
    updateStampCount();
  }
}

function updateStampCount() {
  const el = document.querySelector("[data-stamp-count]");
  if (el) el.textContent = String(stampHistory.length);
}

function burstConfetti(x, y) {
  if (prefersReducedMotion) return;
  const ritualWorld = document.getElementById("ritual-craft");
  const layer = ritualWorld || document.body;
  const colors = ["var(--pink)", "var(--blue)", "var(--yellow)", "var(--green)", "var(--orange)"];
  for (let i = 0; i < 12; i++) {
    const bit = document.createElement("span");
    bit.className = "rc-confetti";
    bit.style.left = `${x}px`;
    bit.style.top = `${y}px`;
    bit.style.background = colors[i % colors.length];
    layer.appendChild(bit);
    const ang = Math.random() * Math.PI * 2;
    const dist = 40 + Math.random() * 90;
    const anim = bit.animate(
      [
        { transform: "translate(-50%,-50%) rotate(0deg) scale(1)", opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(ang) * dist}px), calc(-50% + ${Math.sin(ang) * dist + 50}px)) rotate(${Math.random() * 540 - 270}deg) scale(0.3)`, opacity: 0 },
      ],
      { duration: 700 + Math.random() * 400, easing: "cubic-bezier(0.16,1,0.3,1)" }
    );
    anim.onfinish = () => bit.remove();
  }
}

function setupRitualChecklist() {
  const list = document.querySelector("[data-ritual-list]");
  if (!list) return;
  const KEY = "coollanding-rituals";
  let done = {};
  try { done = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (_) {}
  const items = list.querySelectorAll("[data-ritual-item]");
  const doneOut = document.querySelector("[data-ritual-done]");
  const totalOut = document.querySelector("[data-ritual-total]");
  if (totalOut) totalOut.textContent = String(items.length);
  const refresh = () => {
    let n = 0;
    items.forEach((b) => {
      const k = b.getAttribute("data-ritual-item");
      const on = !!done[k];
      b.classList.toggle("is-done", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
      if (on) n += 1;
    });
    if (doneOut) doneOut.textContent = String(n);
  };
  items.forEach((b) => {
    b.addEventListener("click", () => {
      const k = b.getAttribute("data-ritual-item");
      done[k] = !done[k];
      try { localStorage.setItem(KEY, JSON.stringify(done)); } catch (_) {}
      b.animate(
        [{ transform: "scale(1)" }, { transform: "scale(0.94) rotate(-1.5deg)" }, { transform: "scale(1)" }],
        { duration: 280, easing: "cubic-bezier(0.34,1.56,0.64,1)" }
      );
      if (done[k]) {
        const r = b.getBoundingClientRect();
        burstConfetti(r.left + 22, r.top + r.height / 2);
      }
      refresh();
    });
  });
  refresh();
}

// ============================================================
// Luxury audio toggle (Signature Mechanic seed)
// ============================================================
const audioCtxState = { ctx: null, playing: false, gain: null, osc: null, lfo: null };

function toggleAudio(forceState) {
  const next = typeof forceState === "boolean" ? forceState : !audioCtxState.playing;
  if (!audioToggle) return;
  if (next) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtxState.ctx) {
        const ctx = new AudioCtx();
        const gain = ctx.createGain();
        gain.gain.value = 0.0001;
        gain.connect(ctx.destination);

        // drone made of two detuned sines + slow LFO
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        osc1.type = "sine";
        osc2.type = "sine";
        osc1.frequency.value = 110; // A2
        osc2.frequency.value = 110 * 1.5; // perfect 5th
        lfo.frequency.value = 0.15;
        lfoGain.gain.value = 4;
        lfo.connect(lfoGain).connect(osc1.frequency);
        osc1.connect(gain);
        osc2.connect(gain);
        osc1.start();
        osc2.start();
        lfo.start();

        audioCtxState.ctx = ctx;
        audioCtxState.gain = gain;
        audioCtxState.osc = [osc1, osc2, lfo];
      }
      audioCtxState.gain.gain.cancelScheduledValues(audioCtxState.ctx.currentTime);
      audioCtxState.gain.gain.linearRampToValueAtTime(0.06, audioCtxState.ctx.currentTime + 2);
      audioCtxState.playing = true;
      audioToggle.setAttribute("aria-pressed", "true");
      audioToggle.querySelector(".lx-audio-label").textContent = "score on";
    } catch (_) { /* ignore */ }
  } else {
    if (audioCtxState.gain && audioCtxState.ctx) {
      audioCtxState.gain.gain.cancelScheduledValues(audioCtxState.ctx.currentTime);
      audioCtxState.gain.gain.linearRampToValueAtTime(0.0001, audioCtxState.ctx.currentTime + 1.2);
    }
    audioCtxState.playing = false;
    audioToggle.setAttribute("aria-pressed", "false");
    audioToggle.querySelector(".lx-audio-label").textContent = "enable the score";
  }
}

function setupAudio() {
  if (!audioToggle) return;
  audioToggle.addEventListener("click", () => toggleAudio());
}

// ============================================================
// Spatial Architecture — axonometric field + waterline reflection
// ============================================================
let spatialOrbit = true;

function drawSpatialGrid(ctx, cx, horizon, alpha) {
  ctx.save();
  ctx.strokeStyle = `rgba(134,216,232,${0.16 * alpha})`;
  ctx.lineWidth = 1;
  const bottom = height;
  const cols = 22;
  for (let i = -cols; i <= cols; i++) {
    const fx = cx + (i / cols) * width * 1.4;
    ctx.globalAlpha = Math.max(0, 1 - Math.abs(i) / cols) * alpha;
    ctx.beginPath();
    ctx.moveTo(cx + i * 6, horizon);
    ctx.lineTo(fx, bottom);
    ctx.stroke();
  }
  const rows = 16;
  for (let j = 1; j <= rows; j++) {
    const f = j / rows;
    const y = horizon + Math.pow(f, 2.2) * (bottom - horizon);
    ctx.globalAlpha = (1 - f) * 0.55 * alpha;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawSpatialOrb(ctx, x, y, t) {
  const r = Math.min(width, height) * 0.05;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6);
  g.addColorStop(0, "rgba(160,224,238,0.85)");
  g.addColorStop(0.45, "rgba(134,216,232,0.22)");
  g.addColorStop(1, "rgba(134,216,232,0)");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(240,163,90,0.7)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 1.6, r * 0.5, t * 0.4, 0, Math.PI * 2);
  ctx.stroke();
}

function drawSpatialAtmosphere(ctx, cx, horizon, t) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const rays = 7;
  for (let i = 0; i < rays; i++) {
    const off = (i - (rays - 1) / 2) * width * 0.105 + Math.sin(t * 0.28 + i) * 18;
    const alpha = 0.035 + (1 - Math.abs(i - 3) / 3.5) * 0.045;
    const g = ctx.createLinearGradient(cx + off, 0, cx + off * 0.25, horizon + height * 0.34);
    g.addColorStop(0, `rgba(134,216,232,${alpha})`);
    g.addColorStop(0.45, `rgba(134,216,232,${alpha * 0.42})`);
    g.addColorStop(1, "rgba(134,216,232,0)");
    ctx.strokeStyle = g;
    ctx.lineWidth = 18 + i * 3;
    ctx.beginPath();
    ctx.moveTo(cx + off, -40);
    ctx.bezierCurveTo(cx + off * 0.7, horizon * 0.35, cx - off * 0.12, horizon * 0.62, cx + off * 0.18, horizon + height * 0.28);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSpatialGlassPlanes(ctx, cx, horizon, t) {
  const p = spatialProgress;
  const baseY = horizon - height * (0.12 - p * 0.045);
  const drift = (pointer.x / Math.max(1, width) - 0.5) * 42;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 5; i++) {
    const f = i / 4;
    const w = width * (0.11 + f * 0.075);
    const h = height * (0.040 + f * 0.018);
    const x = cx + drift * (1 - f * 0.42) + (i - 2) * width * 0.045;
    const y = baseY + f * height * 0.052 + Math.sin(t * 0.45 + i) * 5;
    const skew = width * (0.035 + f * 0.020);
    ctx.globalAlpha = 0.36 - f * 0.045;
    ctx.fillStyle = "rgba(134,216,232,0.045)";
    ctx.strokeStyle = `rgba(134,216,232,${0.25 - f * 0.025})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.55 + skew, y - h);
    ctx.lineTo(x + w * 0.55 + skew, y - h * 0.48);
    ctx.lineTo(x + w * 0.42 - skew, y + h);
    ctx.lineTo(x - w * 0.66 - skew, y + h * 0.42);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawSpatialWater(ctx, cx, horizon, t) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, horizon, width, height - horizon);
  ctx.clip();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 26; i++) {
    const y = horizon + 10 + i * 11;
    const amp = 18 + i * 2.6;
    const alpha = Math.max(0, 0.12 - i * 0.0035);
    ctx.strokeStyle = `rgba(134,216,232,${alpha})`;
    ctx.lineWidth = i % 5 === 0 ? 1.6 : 0.8;
    ctx.beginPath();
    for (let x = -40; x <= width + 40; x += 34) {
      const yy = y + Math.sin(x * 0.012 + t * 0.8 + i * 0.55) * (2.2 + i * 0.055);
      if (x === -40) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy + Math.sin((x - cx) * 0.006) * amp * 0.012);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function renderSpatial(time) {
  if (window.GLWorlds && GLWorlds.render("spatial", glRenderState(time))) return;
  const ctx = canvasSpatial && canvasSpatial.getContext("2d");
  if (!ctx) return;
  const t = time * 0.001;
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, "#0e1418");
  bg.addColorStop(1, "#0a0f12");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const cx = width * 0.5 + (pointer.x - width * 0.5) * 0.03;
  const horizon = height * (0.43 + spatialProgress * 0.2);

  drawSpatialAtmosphere(ctx, cx, horizon, t);
  drawSpatialGrid(ctx, cx, horizon, 1);
  drawSpatialGlassPlanes(ctx, cx, horizon, t);

  const glow = ctx.createRadialGradient(cx, horizon, 0, cx, horizon, width * 0.55);
  glow.addColorStop(0, "rgba(134,216,232,0.24)");
  glow.addColorStop(1, "rgba(134,216,232,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(134,216,232,0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, horizon); ctx.lineTo(width, horizon); ctx.stroke();

  const objY = horizon - height * (0.2 - spatialProgress * 0.04);
  drawSpatialOrb(ctx, cx, objY, t);
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.translate(0, horizon * 2);
  ctx.scale(1, -1);
  drawSpatialOrb(ctx, cx, objY, t);
  ctx.restore();
  drawSpatialWater(ctx, cx, horizon, t);
}

function setupSpatial() {
  // the tower lives in WebGL now — this only wires the HUD chrome
  const orbitBtn = document.querySelector("[data-spatial-orbit]");
  const tiltOut = document.querySelector("[data-spatial-tilt]");
  const clock = document.querySelector("[data-spatial-clock]");
  window.addEventListener("pointermove", (e) => {
    if (currentWorld !== "spatial-architecture" || !tiltOut) return;
    const dx = (e.clientX / window.innerWidth - 0.5);
    const dy = (e.clientY / window.innerHeight - 0.5);
    tiltOut.textContent = `${(dx * 40).toFixed(1)}°, ${(dy * 17).toFixed(1)}°`;
  }, { passive: true });
  if (orbitBtn) {
    orbitBtn.addEventListener("click", () => {
      spatialOrbit = !spatialOrbit;
      orbitBtn.textContent = `auto-orbit: ${spatialOrbit ? "on" : "off"}`;
      orbitBtn.setAttribute("aria-pressed", spatialOrbit ? "true" : "false");
    });
  }
  if (clock) {
    const tick = () => {
      const d = new Date();
      clock.textContent = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    };
    tick(); setInterval(tick, 1000 * 20);
  }
}

// ============================================================
// Luxury Alcove — slow pointer parallax on the product (reflection world)
// ============================================================
function setupLuxuryParallax() {
  const fig = document.querySelector("[data-lx-parallax]");
  if (!fig) return;
  window.addEventListener("pointermove", (e) => {
    if (currentWorld !== "luxury-alcove") return;
    const dx = (e.clientX / window.innerWidth - 0.5);
    const dy = (e.clientY / window.innerHeight - 0.5);
    fig.style.setProperty("--lx-px", `${(dx * 18).toFixed(1)}px`);
    fig.style.setProperty("--lx-py", `${(dy * 14).toFixed(1)}px`);
  }, { passive: true });
}

// ============================================================
// Festival Kinetic — chapter index + kinetic anchor object
// ============================================================
function setupFestival() {
  document.querySelectorAll("[data-fk-jump]").forEach((a) => {
    a.addEventListener("click", (e) => {
      const href = a.getAttribute("href");
      if (href && href.startsWith("#")) {
        e.preventDefault();
        const el = document.querySelector(href);
        if (el) el.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
      }
    });
  });
  const anchor = document.querySelector("[data-fk-anchor]");
  if (anchor) {
    window.addEventListener("pointermove", (e) => {
      if (currentWorld !== "festival-kinetic") return;
      const dx = (e.clientX / window.innerWidth - 0.5);
      const dy = (e.clientY / window.innerHeight - 0.5);
      anchor.style.setProperty("--fk-ry", `${-14 + dx * 20}deg`);
      anchor.style.setProperty("--fk-rx", `${9 - dy * 14}deg`);
    });
  }
}

// ============================================================
// Generative System — seeded flow-field (Signature Mechanic)
// ============================================================
let genParticles = [];
let genSeed = 0;
let genRng = null;
let genNoise = null;
const genParams = { density: 60, flow: 50, turbulence: 35, hue: 190 };
let genFpsLast = performance.now();
let genFpsFrames = 0;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(seed) {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  const rng = mulberry32(seed);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + t * (b - a);
  const grad = (h, x, y) => ((h & 1) ? x : -x) + ((h & 2) ? y : -y);
  return function (x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const a = perm[X] + Y, b = perm[X + 1] + Y;
    return lerp(lerp(grad(perm[a], x, y), grad(perm[b], x - 1, y), u),
      lerp(grad(perm[a + 1], x, y - 1), grad(perm[b + 1], x - 1, y - 1), u), v);
  };
}

function seedGenerativeParticles() {
  if (!canvasGenerative) return;
  const seed = (genSeed >>> 0) || 1;
  genRng = mulberry32(seed);
  genNoise = makeNoise(seed);
  const count = Math.round(genParams.density * 26);
  genParticles = new Array(count);
  for (let i = 0; i < count; i++) {
    genParticles[i] = { x: genRng() * width, y: genRng() * height, h: genRng() };
  }
  const ctx = canvasGenerative.getContext("2d");
  if (ctx) { ctx.fillStyle = "#06070a"; ctx.fillRect(0, 0, width, height); }
  const countOut = document.querySelector("[data-gen-count]");
  if (countOut) countOut.textContent = String(count);
}

function renderGenerative(time) {
  const ctx = canvasGenerative && canvasGenerative.getContext("2d");
  if (!ctx || !genNoise) return;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(6,7,10,0.055)";
  ctx.fillRect(0, 0, width, height);
  const px = pointer.x > 0 ? pointer.x : width * 0.54;
  const py = pointer.y > 0 ? pointer.y : height * 0.48;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const aura = ctx.createRadialGradient(px, py, 0, px, py, Math.max(width, height) * (0.18 + pulse * 0.05));
  aura.addColorStop(0, `rgba(94,251,255,${0.16 + pulse * 0.12})`);
  aura.addColorStop(0.24, `rgba(168,80,255,${0.07 + pulse * 0.12})`);
  aura.addColorStop(1, "rgba(94,251,255,0)");
  ctx.fillStyle = aura;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
  ctx.globalCompositeOperation = "lighter";

  const speed = 0.6 + (genParams.flow / 100) * 2.4;
  const turb = 0.4 + (genParams.turbulence / 100) * 4.2;
  const scale = 0.0014 + (genParams.turbulence / 100) * 0.0022;
  const t = time * 0.00006 * speed * 1000 * scale; // smooth field drift
  const baseHue = genParams.hue;

  for (let i = 0; i < genParticles.length; i++) {
    const pcl = genParticles[i];
    const n = genNoise(pcl.x * scale, pcl.y * scale + t);
    const dx = pcl.x - pointer.x;
    const dy = pcl.y - pointer.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const lens = pointer.x > 0 && pointer.y > 0 ? Math.max(0, 1 - dist / 260) : 0;
    const swirl = Math.atan2(dy, dx) + Math.PI * 0.5;
    const ang = n * Math.PI * turb + lens * swirl * 0.75 + pulse * 0.35;
    const localSpeed = speed * (1 + lens * 1.9);
    const nx = pcl.x + Math.cos(ang) * localSpeed;
    const ny = pcl.y + Math.sin(ang) * localSpeed;
    const hue = (baseHue + pcl.h * 60 + n * 50 + 360) % 360;
    ctx.strokeStyle = `hsla(${hue + lens * 90}, 92%, ${62 + lens * 16}%, ${0.44 + lens * 0.38})`;
    ctx.lineWidth = 1 + lens * 1.35;
    ctx.beginPath();
    ctx.moveTo(pcl.x, pcl.y);
    ctx.lineTo(nx, ny);
    ctx.stroke();
    pcl.x = nx; pcl.y = ny;
    if (pcl.x < -2 || pcl.x > width + 2 || pcl.y < -2 || pcl.y > height + 2) {
      pcl.x = genRng() * width; pcl.y = genRng() * height;
    }
  }
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = `rgba(94,251,255,${0.16 + pulse * 0.24})`;
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const rr = 42 + i * 34 + pulse * 38;
    ctx.beginPath();
    ctx.ellipse(px, py, rr * 1.55, rr * 0.42, time * 0.00045 + i * 0.8, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalCompositeOperation = "source-over";

  genFpsFrames += 1;
  if (time - genFpsLast > 500) {
    const fps = Math.round((genFpsFrames * 1000) / (time - genFpsLast));
    genFpsFrames = 0; genFpsLast = time;
    const fpsOut = document.querySelector("[data-gen-fps]");
    if (fpsOut) fpsOut.textContent = String(fps);
  }
}

function updateGenSeedLabels() {
  const s = String(genSeed >>> 0).padStart(8, "0");
  document.querySelectorAll("[data-gen-seed]").forEach((el) => { el.textContent = s; });
}

function pushGenSeedToUrl() {
  try { const u = new URL(location.href); u.searchParams.set("seed", String(genSeed >>> 0)); history.replaceState(null, "", u); } catch (_) {}
}

function setupGenerative() {
  if (!canvasGenerative) return;
  const urlSeed = new URLSearchParams(location.search).get("seed");
  genSeed = (urlSeed && /^\d+$/.test(urlSeed)) ? (parseInt(urlSeed, 10) >>> 0) : (Math.floor(Math.random() * 1e8) >>> 0);
  updateGenSeedLabels();

  document.querySelectorAll("[data-gen-param]").forEach((input) => {
    const key = input.getAttribute("data-gen-param");
    genParams[key] = parseFloat(input.value);
    const out = document.querySelector(`[data-gen-out="${key}"]`);
    input.addEventListener("input", () => {
      genParams[key] = parseFloat(input.value);
      if (out) out.textContent = input.value;
      if (key === "density") seedGenerativeParticles();
    });
  });

  const shuffle = document.querySelector("[data-gen-shuffle]");
  if (shuffle) shuffle.addEventListener("click", () => {
    genSeed = (Math.floor(Math.random() * 1e8) >>> 0);
    updateGenSeedLabels(); pushGenSeedToUrl(); seedGenerativeParticles();
  });

  const copyBtn = document.querySelector("[data-gen-copy]");
  if (copyBtn) copyBtn.addEventListener("click", async () => {
    pushGenSeedToUrl();
    try { await navigator.clipboard.writeText(location.href); copyBtn.textContent = "copied!"; }
    catch (_) { copyBtn.textContent = "seed in URL"; }
    setTimeout(() => { copyBtn.textContent = "copy link"; }, 1400);
  });

  const saveBtn = document.querySelector("[data-gen-save]");
  if (saveBtn) saveBtn.addEventListener("click", () => {
    try {
      const link = document.createElement("a");
      link.download = `coollanding-seed-${genSeed >>> 0}.png`;
      link.href = canvasGenerative.toDataURL("image/png");
      link.click();
    } catch (_) {}
  });

  pushGenSeedToUrl();
  seedGenerativeParticles();
}

// ============================================================
// Boot
// ============================================================
function init() {
  // Acquire the WebGL2 context BEFORE anything grabs a 2D context on the same
  // canvas — once a canvas has a 2D context, getContext('webgl2') returns null.
  // only the active world keeps a GL context alive (weak GPUs choke on three)
  if (window.GLWorlds) {
    if (!GLWorlds.ensure("cinematic", canvasCinematic)) console.warn("WebGL shader fallback: cinematic");
  }
  ensureWorldPipeline(currentWorld);
  resizeCanvases();
  makeAsciiCloud();
  setupReveal();
  setupCursor();
  setupMagnetic();
  setupScramble();
  setupSwitcher();
  setupStickerStamps();
  setupAudio();
  setupSpatial();
  setupFestival();
  setupGenerative();
  setupCountUp();
  setWorld(currentWorld, { skipScroll: true, skipPersist: true });
  updateScroll();
  bootLoader();
  render(performance.now());
}

window.addEventListener("resize", () => {
  resizeCanvases();
  updateScroll();
});
window.addEventListener("scroll", updateScroll, { passive: true });
window.addEventListener("pointermove", (event) => {
  pointer.tx = event.clientX;
  pointer.ty = event.clientY;
}, { passive: true });
// click = inject a shock impulse into the active render layer
window.addEventListener("pointerdown", () => {
  if (currentWorld === "cinematic-dark") { cnShock = 1; pulse = 1; }
  if (currentWorld === "spatial-architecture") { cnShock = 1; pulse = 0.6; }   // water ripple
  if (currentWorld === "luxury-alcove") { cnShock = 0.8; pulse = 0.5; }        // candle surge
  if (currentWorld === "generative-system") pulse = 1;
}, { passive: true });

init();
