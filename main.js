const canvas = document.querySelector("#signal-field");
const meter = document.querySelector("[data-scroll-meter]");
const cursor = document.querySelector("[data-cursor-dot]");
const cursorLabel = document.querySelector("[data-cursor-label]");
const loaderCount = document.querySelector("[data-loader-count]");
const loaderLine = document.querySelector("[data-loader-line]");
const ritualTrack = document.querySelector("[data-ritual-track]");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
let pulse = 0;
let startedAt = performance.now();
let glState = null;

const vertexSource = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const fragmentSource = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform float u_time;
uniform float u_scroll;
uniform float u_pulse;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float lineField(vec2 uv, float t) {
  float a = atan(uv.y, uv.x);
  float d = length(uv);
  float f = sin(a * 9.0 + t * 0.9 + noise(uv * 2.0 + t * 0.06) * 4.0);
  float g = sin((uv.x * 6.0 - uv.y * 3.5) + t * 0.7);
  return smoothstep(0.98, 1.0, abs(f * g)) * smoothstep(1.4, 0.05, d);
}

void main() {
  vec2 res = u_resolution;
  vec2 uv = (gl_FragCoord.xy * 2.0 - res) / min(res.x, res.y);
  vec2 mouse = (u_mouse * 2.0 - res) / min(res.x, res.y);
  uv -= mouse * 0.08;

  float t = u_time;
  float d = length(uv);
  float angle = atan(uv.y, uv.x);
  float n = noise(uv * 3.8 + t * 0.08);
  float n2 = noise(vec2(angle * 2.0, d * 5.0 - t * 0.22));

  float core = smoothstep(0.22, 0.02, d + sin(angle * 5.0 + t) * 0.018 + n * 0.035);
  float shell = smoothstep(0.42, 0.16, abs(d - 0.34 + n * 0.06));
  float ring = smoothstep(0.014, 0.0, abs(sin(d * 28.0 - t * 1.8 + n2 * 2.0)) * 0.025);
  float filament = lineField(uv, t);
  float scan = smoothstep(0.996, 1.0, sin((uv.y + t * 0.07) * 340.0)) * 0.18;
  float stars = smoothstep(0.992, 1.0, noise(uv * 94.0 + t * 0.018)) * smoothstep(1.8, 0.1, d);
  float voidMask = smoothstep(1.55, 0.08, d);
  float pulse = u_pulse * smoothstep(0.9, 0.08, d);
  float scrollHeat = clamp(u_scroll, 0.0, 1.0);

  vec3 cyan = vec3(0.28, 0.98, 1.0);
  vec3 orange = vec3(1.0, 0.22, 0.03);
  vec3 acid = vec3(0.78, 1.0, 0.16);
  vec3 color = vec3(0.0);

  color += cyan * shell * 0.9;
  color += cyan * ring * 0.45;
  color += cyan * filament * 0.32;
  color += vec3(1.0) * core * (1.2 + pulse * 1.8);
  color += acid * stars * 0.7;
  color += mix(cyan, orange, scrollHeat) * scan * voidMask;
  color += orange * pulse * 0.25;
  color *= 1.0 - smoothstep(0.62, 1.6, d) * 0.64;

  float alpha = clamp(core + shell * 0.7 + ring * 0.6 + filament * 0.7 + stars + scan, 0.0, 1.0);
  outColor = vec4(color, alpha);
}`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "Shader failed");
  }
  return shader;
}

function initWebGL() {
  const gl = canvas.getContext("webgl2", { alpha: true, antialias: true, preserveDrawingBuffer: true });
  if (!gl) {
    return null;
  }

  const program = gl.createProgram();
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "Program failed");
  }

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  const position = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  return {
    gl,
    program,
    uniforms: {
      resolution: gl.getUniformLocation(program, "u_resolution"),
      mouse: gl.getUniformLocation(program, "u_mouse"),
      time: gl.getUniformLocation(program, "u_time"),
      scroll: gl.getUniformLocation(program, "u_scroll"),
      pulse: gl.getUniformLocation(program, "u_pulse"),
    },
  };
}

function resizeCanvas() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  if (glState) {
    glState.gl.viewport(0, 0, canvas.width, canvas.height);
  }
}

function render2DFallback(time) {
  const ctx = canvas.getContext("2d");
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
  ctx.strokeStyle = "rgba(94,251,255,0.38)";
  for (let i = 0; i < 9; i += 1) {
    ctx.beginPath();
    ctx.ellipse(x, y, 100 + i * 48, 32 + i * 22, time * 0.0004 + i, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function render(time) {
  pointer.x += (pointer.tx - pointer.x) * 0.08;
  pointer.y += (pointer.ty - pointer.y) * 0.08;
  pulse *= 0.93;

  if (glState) {
    const { gl, program, uniforms } = glState;
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    gl.uniform2f(uniforms.mouse, pointer.x * dpr, (height - pointer.y) * dpr);
    gl.uniform1f(uniforms.time, (time - startedAt) * 0.001);
    gl.uniform1f(uniforms.scroll, scrollProgress);
    gl.uniform1f(uniforms.pulse, pulse);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  } else {
    render2DFallback(time);
  }

  if (!prefersReducedMotion) {
    requestAnimationFrame(render);
  }
}

function bootLoader() {
  let value = 0;
  const interval = window.setInterval(() => {
    value += Math.ceil((100 - value) * 0.18);
    value = Math.min(100, value);
    loaderCount.textContent = `/${String(value).padStart(2, "0")}`;
    loaderLine.style.width = `${value}%`;
    if (value >= 100) {
      window.clearInterval(interval);
      window.setTimeout(() => document.body.classList.add("is-loaded"), 260);
      window.setTimeout(() => pulse = 1, 620);
    }
  }, 70);
}

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

function scrambleText(element, finalText) {
  if (prefersReducedMotion) {
    element.textContent = finalText;
    return;
  }
  const chars = "01/<>-_";
  let frame = 0;
  const total = 22;
  const run = () => {
    const output = finalText.split("").map((char, index) => {
      if (char === " ") return " ";
      if (index < frame / 1.4) return char;
      return chars[(index + frame) % chars.length];
    }).join("");
    element.textContent = output;
    frame += 1;
    if (frame <= total) requestAnimationFrame(run);
    else element.textContent = finalText;
  };
  run();
}

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

function updateScroll() {
  const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  scrollProgress = Math.min(1, Math.max(0, window.scrollY / max));
  meter.style.width = `${scrollProgress * 100}%`;

  const rituals = document.querySelector("#rituals");
  if (rituals && ritualTrack) {
    if (window.innerWidth <= 720) {
      ritualTrack.style.transform = "none";
      return;
    }
    const rect = rituals.getBoundingClientRect();
    const travel = rituals.offsetHeight - window.innerHeight;
    const sectionProgress = Math.min(1, Math.max(0, -rect.top / Math.max(1, travel)));
    ritualTrack.style.transform = `translate3d(${-sectionProgress * 200}vw, 0, 0)`;
  }
}

function setupCursor() {
  if (!cursor || window.matchMedia("(hover: none), (pointer: coarse)").matches) return;

  window.addEventListener("pointermove", (event) => {
    pointer.tx = event.clientX;
    pointer.ty = event.clientY;
    cursor.classList.add("is-active");
    cursorLabel.classList.add("is-active");
    cursor.style.left = `${event.clientX}px`;
    cursor.style.top = `${event.clientY}px`;
    cursorLabel.style.left = `${event.clientX}px`;
    cursorLabel.style.top = `${event.clientY}px`;
  });

  document.querySelectorAll("a, button, .magnetic, .spotlight").forEach((target) => {
    target.addEventListener("pointerenter", () => {
      cursor.classList.add("is-hot");
      cursorLabel.textContent = target.matches("a,button") ? "open" : "inspect";
    });
    target.addEventListener("pointerleave", () => {
      cursor.classList.remove("is-hot");
      cursorLabel.textContent = "signal";
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

function setupSpotlight() {
  document.querySelectorAll("[data-spotlight]").forEach((item) => {
    item.addEventListener("pointermove", (event) => {
      const rect = item.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 100;
      const y = ((event.clientY - rect.top) / rect.height) * 100;
      item.style.setProperty("--spot-x", `${x}%`);
      item.style.setProperty("--spot-y", `${y}%`);
    });
  });
}

function setupPulse() {
  const pulseButton = document.querySelector("[data-pulse]");
  if (!pulseButton) return;
  pulseButton.addEventListener("click", () => {
    pulse = 1;
    scrambleText(document.querySelector("[data-scramble]"), "COOL LANDING");
  });
}

function setupScramble() {
  const title = document.querySelector("[data-scramble]");
  if (!title) return;
  window.setTimeout(() => scrambleText(title, title.dataset.scramble), 900);
  title.addEventListener("pointerenter", () => scrambleText(title, title.dataset.scramble));
}

function init() {
  resizeCanvas();
  try {
    glState = initWebGL();
  } catch (error) {
    console.warn("WebGL shader fallback:", error.message);
    glState = null;
  }
  resizeCanvas();
  makeAsciiCloud();
  setupReveal();
  setupCursor();
  setupMagnetic();
  setupSpotlight();
  setupPulse();
  setupScramble();
  updateScroll();
  bootLoader();
  render(performance.now());
}

window.addEventListener("resize", () => {
  resizeCanvas();
  updateScroll();
});
window.addEventListener("scroll", updateScroll, { passive: true });
window.addEventListener("pointermove", (event) => {
  pointer.tx = event.clientX;
  pointer.ty = event.clientY;
}, { passive: true });

init();
