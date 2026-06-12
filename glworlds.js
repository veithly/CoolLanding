// GLWorlds — reference-grade WebGL2 pipelines for the CoolLanding demo.
//
// Architecture ported from the *verified* reference stacks (see
// research/refs/activetheory/shaders/ — 174 production shaders captured from
// the live site, plus the Hydra engine bundle scan):
//
//   layered scene (background → raymarched anchor object → GPGPU particles)
//     → HDR bright-pass → multi-mip separable gaussian bloom (UnrealBloom)
//     → anamorphic lens streak (HydraLensStreak)
//     → filmic composite (RGB-shift CA, contrast, corner gradient glows,
//       vignette, film grain — GlobalComposite.fs recipe)
//
// Three worlds get a real pipeline:
//   cinematic-dark      → "the signal ring": chrome torus sigil + 65k GPGPU particles
//   spatial-architecture→ "glass louvre tower": raymarched slab tower + water reflection
//   luxury-alcove       → "mécanique №01": gold ring + onyx mirror floor + dust motes
//
// Everything is dependency-free WebGL2. Each world feature-detects and the
// caller falls back to the old 2D-canvas renderers when unavailable.

(function () {
  "use strict";

  // ----------------------------------------------------------------
  // GLKit — tiny shared helpers (compile, targets, fullscreen pass)
  // ----------------------------------------------------------------
  const SCREEN_VS = `#version 300 es
in vec2 a_p; out vec2 v_uv;
void main(){ v_uv = a_p * 0.5 + 0.5; gl_Position = vec4(a_p, 0.0, 1.0); }`;

  function makeKit(canvas, opts = {}) {
    const gl = canvas.getContext("webgl2", {
      alpha: false, antialias: false, premultipliedAlpha: true,
      powerPreference: "high-performance", ...opts,
    });
    if (!gl) return null;
    if (!gl.getExtension("EXT_color_buffer_float")) return null;
    gl.getExtension("OES_texture_float_linear");
    // device tier: software rasterisers (CI, VMs) start at the lowest rung
    let software = false;
    try {
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      const renderer = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || "");
      software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer);
    } catch (_) { /* renderer string unavailable — assume hardware */ }

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    function compile(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s);
        throw new Error("shader: " + log + "\n" + src.split("\n").slice(0, 8).join("\n"));
      }
      return s;
    }
    function program(vs, fs, uniforms) {
      const p = gl.createProgram();
      gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("link: " + gl.getProgramInfoLog(p));
      const u = {};
      (uniforms || []).forEach((n) => { u[n] = gl.getUniformLocation(p, n); });
      return { p, u, aPos: gl.getAttribLocation(p, "a_p") };
    }
    // HDR color target (RGBA16F is renderable everywhere incl. SwiftShader)
    function target(w, h, filter) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (!ok) throw new Error("fbo incomplete");
      return { tex, fbo, w, h };
    }
    function freeTarget(t) {
      if (!t) return;
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fbo);
    }
    function blit(info) {
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(info.aPos);
      gl.vertexAttribPointer(info.aPos, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function bindTex(unit, tex, loc) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(loc, unit);
    }
    return { gl, canvas, program, target, freeTarget, blit, bindTex, software };
  }

  // ----------------------------------------------------------------
  // Shared GLSL chunks
  // ----------------------------------------------------------------
  // Hash / value noise / fbm.
  const NOISE = `
float hash11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vnoise2(vec2 x){
  vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  float a = hash12(i), b = hash12(i + vec2(1, 0)), c = hash12(i + vec2(0, 1)), d = hash12(i + vec2(1, 1));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm2(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise2(p); p = p * 2.03 + 19.7; a *= 0.5; }
  return v;
}
vec3 hsv2rgb(vec3 c){
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}`;

  // Analytic-derivative curl noise — the production technique from the
  // reference engine (sinusoidal potentials, Bridson SIGGRAPH'07 method,
  // analytic partials = no extra potential evaluations). Own constants.
  const CURL = `
float pA(vec3 v){
  return sin(v.x * 1.7 + v.z * 2.9) + sin(v.x * 4.4 + v.z * 4.1) + sin(v.x * -6.2 + v.z * 1.26) +
         sin(v.y * -0.52 + v.z * 5.1) + sin(v.y * 2.4 + v.z * 4.9) + sin(v.y * 3.9 + v.z * 2.2);
}
float pB(vec3 v){
  return sin(v.y * 1.7 + v.x * 2.9 - 2.4) + sin(v.y * 4.4 + v.x * 4.1 + 67.1) + sin(v.y * -6.2 + v.x * 1.26 - 211.6) +
         sin(v.z * -0.52 + v.x * 5.1 - 113.2) + sin(v.z * 2.4 + v.x * 4.9 + 14.8) + sin(v.z * 3.9 + v.x * 2.2 + 132.4);
}
float pC(vec3 v){
  return sin(v.z * 1.7 + v.y * 2.9 - 176.1) + sin(v.z * 4.4 + v.y * 4.1 - 91.7) + sin(v.z * -6.2 + v.y * 1.26 - 712.3) +
         sin(v.x * -0.52 + v.y * 5.1 - 654.9) + sin(v.x * 2.4 + v.y * 4.9 - 421.2) + sin(v.x * 3.9 + v.y * 2.2 + 11.6);
}
float dCdY(vec3 v){
  return 2.9 * cos(v.z * 1.7 + v.y * 2.9 - 176.1) + 4.1 * cos(v.z * 4.4 + v.y * 4.1 - 91.7) + 1.26 * cos(v.z * -6.2 + v.y * 1.26 - 712.3) +
         5.1 * cos(v.x * -0.52 + v.y * 5.1 - 654.9) + 4.9 * cos(v.x * 2.4 + v.y * 4.9 - 421.2) + 2.2 * cos(v.x * 3.9 + v.y * 2.2 + 11.6);
}
float dBdZ(vec3 v){
  return -0.52 * cos(v.z * -0.52 + v.x * 5.1 - 113.2) + 2.4 * cos(v.z * 2.4 + v.x * 4.9 + 14.8) + 3.9 * cos(v.z * 3.9 + v.x * 2.2 + 132.4);
}
float dAdZ(vec3 v){
  return 2.9 * cos(v.x * 1.7 + v.z * 2.9) + 4.1 * cos(v.x * 4.4 + v.z * 4.1) + 1.26 * cos(v.x * -6.2 + v.z * 1.26) +
         5.1 * cos(v.y * -0.52 + v.z * 5.1) + 4.9 * cos(v.y * 2.4 + v.z * 4.9) + 2.2 * cos(v.y * 3.9 + v.z * 2.2);
}
float dCdX(vec3 v){
  return -0.52 * cos(v.x * -0.52 + v.y * 5.1 - 654.9) + 2.4 * cos(v.x * 2.4 + v.y * 4.9 - 421.2) + 3.9 * cos(v.x * 3.9 + v.y * 2.2 + 11.6);
}
float dBdX(vec3 v){
  return 2.9 * cos(v.y * 1.7 + v.x * 2.9 - 2.4) + 4.1 * cos(v.y * 4.4 + v.x * 4.1 + 67.1) + 1.26 * cos(v.y * -6.2 + v.x * 1.26 - 211.6) +
         5.1 * cos(v.z * -0.52 + v.x * 5.1 - 113.2) + 4.9 * cos(v.z * 2.4 + v.x * 4.9 + 14.8) + 2.2 * cos(v.z * 3.9 + v.x * 2.2 + 132.4);
}
float dAdY(vec3 v){
  return -0.52 * cos(v.y * -0.52 + v.z * 5.1) + 2.4 * cos(v.y * 2.4 + v.z * 4.9) + 3.9 * cos(v.y * 3.9 + v.z * 2.2);
}
vec3 curlNoise(vec3 p){
  float x = dCdY(p) - dBdZ(p);
  float y = dAdZ(p) - dCdX(p);
  float z = dBdX(p) - dAdY(p);
  return normalize(vec3(x, y, z) + 1e-6);
}`;

  // Bright pass — luminosity threshold with soft knee (UnrealBloomLuminosity).
  const BRIGHT_FS = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
uniform sampler2D u_tex; uniform float u_threshold; uniform float u_knee;
void main(){
  vec3 c = texture(u_tex, v_uv).rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  float k = smoothstep(u_threshold, u_threshold + u_knee, l);
  o = vec4(c * k, 1.0);
}`;

  // Separable gaussian (UnrealBloomGaussian — gaussianPdf weights, radius via define).
  function gaussianFS(radius) {
    return `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
uniform sampler2D u_tex; uniform vec2 u_dir; uniform vec2 u_texel;
float pdf(float x, float s){ return 0.39894 * exp(-0.5 * x * x / (s * s)) / s; }
void main(){
  float sigma = float(${radius}) * 0.5;
  float wsum = pdf(0.0, sigma);
  vec3 c = texture(u_tex, v_uv).rgb * wsum;
  for (int i = 1; i < ${radius}; i++) {
    float x = float(i);
    float w = pdf(x, sigma);
    vec2 off = u_dir * u_texel * x;
    c += (texture(u_tex, v_uv + off).rgb + texture(u_tex, v_uv - off).rgb) * w;
    wsum += 2.0 * w;
  }
  o = vec4(c / wsum, 1.0);
}`;
  }

  // Anamorphic streak — long horizontal taps with falloff (HydraLensStreak).
  const STREAK_FS = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
uniform sampler2D u_tex; uniform float u_stretch; uniform vec2 u_texel;
void main(){
  vec3 c = vec3(0.0);
  float wsum = 0.0;
  for (int i = -10; i <= 10; i++) {
    float fi = float(i);
    float w = exp(-abs(fi) * 0.28);
    c += texture(u_tex, v_uv + vec2(u_texel.x * fi * u_stretch, 0.0)).rgb * w;
    wsum += w;
  }
  o = vec4(c / wsum, 1.0);
}`;

  // Multi-mip bloom + streak chain. nMips=3 gaussian mips (UnrealBloom layout),
  // composite factors lerped by radius like the reference composite.
  function makeBloomChain(kit, w, h) {
    const { gl } = kit;
    const chain = {
      bright: kit.program(SCREEN_VS, BRIGHT_FS, ["u_tex", "u_threshold", "u_knee"]),
      blurs: [
        kit.program(SCREEN_VS, gaussianFS(4), ["u_tex", "u_dir", "u_texel"]),
        kit.program(SCREEN_VS, gaussianFS(6), ["u_tex", "u_dir", "u_texel"]),
        kit.program(SCREEN_VS, gaussianFS(9), ["u_tex", "u_dir", "u_texel"]),
      ],
      streakP: kit.program(SCREEN_VS, STREAK_FS, ["u_tex", "u_stretch", "u_texel"]),
      mips: [], streakA: null, streakB: null, brightRT: null,
    };
    chain.alloc = (cw, ch) => {
      chain.mips.forEach((m) => { kit.freeTarget(m.a); kit.freeTarget(m.b); });
      kit.freeTarget(chain.brightRT); kit.freeTarget(chain.streakA); kit.freeTarget(chain.streakB);
      chain.mips = [];
      let mw = Math.max(2, cw >> 1), mh = Math.max(2, ch >> 1);
      chain.brightRT = kit.target(mw, mh, gl.LINEAR);
      for (let i = 0; i < 3; i++) {
        mw = Math.max(2, mw >> 1); mh = Math.max(2, mh >> 1);
        chain.mips.push({ a: kit.target(mw, mh, gl.LINEAR), b: kit.target(mw, mh, gl.LINEAR) });
      }
      const sw = Math.max(2, cw >> 2), sh = Math.max(2, ch >> 2);
      chain.streakA = kit.target(sw, sh, gl.LINEAR);
      chain.streakB = kit.target(sw, sh, gl.LINEAR);
    };
    chain.alloc(w, h);
    // Renders bright + 3 blur mips + streak from sceneTex. Returns textures.
    chain.render = (sceneTex, threshold, knee, streakStretch) => {
      gl.disable(gl.BLEND);
      // bright
      gl.bindFramebuffer(gl.FRAMEBUFFER, chain.brightRT.fbo);
      gl.viewport(0, 0, chain.brightRT.w, chain.brightRT.h);
      gl.useProgram(chain.bright.p);
      kit.bindTex(0, sceneTex, chain.bright.u.u_tex);
      gl.uniform1f(chain.bright.u.u_threshold, threshold);
      gl.uniform1f(chain.bright.u.u_knee, knee);
      kit.blit(chain.bright);
      // mips
      let src = chain.brightRT;
      for (let i = 0; i < 3; i++) {
        const m = chain.mips[i];
        const bp = chain.blurs[i];
        gl.useProgram(bp.p);
        gl.bindFramebuffer(gl.FRAMEBUFFER, m.a.fbo);
        gl.viewport(0, 0, m.a.w, m.a.h);
        kit.bindTex(0, src.tex, bp.u.u_tex);
        gl.uniform2f(bp.u.u_texel, 1 / m.a.w, 1 / m.a.h);
        gl.uniform2f(bp.u.u_dir, 1, 0);
        kit.blit(bp);
        gl.bindFramebuffer(gl.FRAMEBUFFER, m.b.fbo);
        kit.bindTex(0, m.a.tex, bp.u.u_tex);
        gl.uniform2f(bp.u.u_dir, 0, 1);
        kit.blit(bp);
        src = m.b;
      }
      // anamorphic streak (two passes for long tails)
      gl.useProgram(chain.streakP.p);
      gl.bindFramebuffer(gl.FRAMEBUFFER, chain.streakA.fbo);
      gl.viewport(0, 0, chain.streakA.w, chain.streakA.h);
      kit.bindTex(0, chain.brightRT.tex, chain.streakP.u.u_tex);
      gl.uniform2f(chain.streakP.u.u_texel, 1 / chain.streakA.w, 1 / chain.streakA.h);
      gl.uniform1f(chain.streakP.u.u_stretch, streakStretch);
      kit.blit(chain.streakP);
      gl.bindFramebuffer(gl.FRAMEBUFFER, chain.streakB.fbo);
      kit.bindTex(0, chain.streakA.tex, chain.streakP.u.u_tex);
      gl.uniform1f(chain.streakP.u.u_stretch, streakStretch * 2.2);
      kit.blit(chain.streakP);
      return { mip0: chain.mips[0].b.tex, mip1: chain.mips[1].b.tex, mip2: chain.mips[2].b.tex, streak: chain.streakB.tex };
    };
    return chain;
  }

  // Filmic composite — GlobalComposite.fs recipe: angled RGB-shift CA, bloom
  // mips with lerped factors, tinted streak, contrast, vignette, film grain.
  const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
uniform sampler2D u_scene, u_mip0, u_mip1, u_mip2, u_streak;
uniform float u_bloomStrength, u_bloomRadius, u_ca, u_time, u_grain, u_vig;
uniform vec2 u_res;
uniform vec3 u_bloomTint, u_streakTint, u_lift;
${NOISE}
vec3 getRGB(sampler2D t, vec2 uv, float angle, float amount){
  vec2 off = vec2(cos(angle), sin(angle)) * amount;
  return vec3(texture(t, uv + off).r, texture(t, uv).g, texture(t, uv - off).b);
}
float bloomFactor(float f, float r){ return mix(f, 1.2 - f, r); }
float filmNoise(vec2 uv, float t){
  float x = uv.x * uv.y * t * 1000.0;
  x = mod(x, 13.0) * mod(x, 123.0);
  return clamp(0.1 + mod(x, 0.01) * 100.0, 0.0, 1.0);
}
void main(){
  vec2 uv = v_uv;
  vec2 d = uv - 0.5;
  float r2 = dot(d, d);
  float amount = u_ca * (0.35 + r2 * 3.0);
  vec3 scene = getRGB(u_scene, uv, 2.2, amount);
  vec3 bloom =
    texture(u_mip0, uv).rgb * bloomFactor(1.0, u_bloomRadius) +
    texture(u_mip1, uv).rgb * bloomFactor(0.6, u_bloomRadius) +
    texture(u_mip2, uv).rgb * bloomFactor(0.35, u_bloomRadius);
  vec3 streak = texture(u_streak, uv).rgb;
  vec3 col = scene + bloom * u_bloomTint * u_bloomStrength + streak * u_streakTint;
  col = max(col, 0.0);
  col = col / (1.0 + col);                       // Reinhard
  col = pow(col, vec3(0.91));
  col = mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, 1.12);  // saturation
  col = (col - 0.5) * 1.05 + 0.5 + u_lift;       // contrast + lift
  col *= smoothstep(1.35, u_vig, length(d) * 1.42);
  float g = filmNoise(uv, fract(u_time) + 1.0);
  col += (g - 0.5) * u_grain;
  col += (hash12(uv * u_res + u_time * 60.0) - 0.5) * 0.012;  // dither
  o = vec4(max(col, 0.0), 1.0);
}`;

  function makeComposite(kit) {
    return kit.program(SCREEN_VS, COMPOSITE_FS, [
      "u_scene", "u_mip0", "u_mip1", "u_mip2", "u_streak",
      "u_bloomStrength", "u_bloomRadius", "u_ca", "u_time", "u_grain", "u_vig",
      "u_res", "u_bloomTint", "u_streakTint", "u_lift",
    ]);
  }

  function drawComposite(kit, comp, sceneTex, bl, params) {
    const { gl } = kit;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, kit.canvas.width, kit.canvas.height);
    gl.disable(gl.BLEND);
    gl.useProgram(comp.p);
    kit.bindTex(0, sceneTex, comp.u.u_scene);
    kit.bindTex(1, bl.mip0, comp.u.u_mip0);
    kit.bindTex(2, bl.mip1, comp.u.u_mip1);
    kit.bindTex(3, bl.mip2, comp.u.u_mip2);
    kit.bindTex(4, bl.streak, comp.u.u_streak);
    gl.uniform1f(comp.u.u_bloomStrength, params.bloomStrength);
    gl.uniform1f(comp.u.u_bloomRadius, params.bloomRadius);
    gl.uniform1f(comp.u.u_ca, params.ca);
    gl.uniform1f(comp.u.u_time, params.time);
    gl.uniform1f(comp.u.u_grain, params.grain);
    gl.uniform1f(comp.u.u_vig, params.vig);
    gl.uniform2f(comp.u.u_res, kit.canvas.width, kit.canvas.height);
    gl.uniform3fv(comp.u.u_bloomTint, params.bloomTint);
    gl.uniform3fv(comp.u.u_streakTint, params.streakTint);
    gl.uniform3fv(comp.u.u_lift, params.lift);
    kit.blit(comp);
  }

  // ----------------------------------------------------------------
  // GPGPU particle module — FBO ping-pong, families decided in-shader
  // ----------------------------------------------------------------
  function makeParticles(kit, side, simFS, pointsVS, pointsFS, simUniforms, pointUniforms) {
    const { gl } = kit;
    const sim = kit.program(SCREEN_VS, simFS, ["u_pos", "u_dt", "u_time"].concat(simUniforms));
    const pts = kit.program(pointsVS, pointsFS, ["u_pos", "u_proj", "u_view", "u_sizeK", "u_time"].concat(pointUniforms));
    const ref = new Float32Array(side * side * 2);
    let k = 0;
    for (let y = 0; y < side; y++) {
      for (let x = 0; x < side; x++) { ref[k++] = (x + 0.5) / side; ref[k++] = (y + 0.5) / side; }
    }
    const refBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, refBuf);
    gl.bufferData(gl.ARRAY_BUFFER, ref, gl.STATIC_DRAW);
    const mk = () => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, side, side, 0, gl.RGBA, gl.HALF_FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { tex, fbo, w: side, h: side };
    };
    const state = { sim, pts, refBuf, pos: [mk(), mk()], side, aRef: gl.getAttribLocation(pts.p, "a_ref") };
    state.step = (dt, time, setSimUniforms) => {
      const read = state.pos[0], write = state.pos[1];
      gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
      gl.viewport(0, 0, side, side);
      gl.disable(gl.BLEND);
      gl.useProgram(sim.p);
      kit.bindTex(0, read.tex, sim.u.u_pos);
      gl.uniform1f(sim.u.u_dt, dt);
      gl.uniform1f(sim.u.u_time, time);
      if (setSimUniforms) setSimUniforms(sim.u);
      kit.blit(sim);
      state.pos[0] = write; state.pos[1] = read;
    };
    state.fraction = 1;
    state.draw = (proj, view, sizeK, time, setPointUniforms) => {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(pts.p);
      kit.bindTex(0, state.pos[0].tex, pts.u.u_pos);
      gl.uniformMatrix4fv(pts.u.u_proj, false, proj);
      gl.uniformMatrix4fv(pts.u.u_view, false, view);
      gl.uniform1f(pts.u.u_sizeK, sizeK);
      gl.uniform1f(pts.u.u_time, time);
      if (setPointUniforms) setPointUniforms(pts.u);
      gl.bindBuffer(gl.ARRAY_BUFFER, state.refBuf);
      gl.enableVertexAttribArray(state.aRef);
      gl.vertexAttribPointer(state.aRef, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.POINTS, 0, Math.floor(side * side * state.fraction));
      gl.disable(gl.BLEND);
    };
    return state;
  }

  // ----------------------------------------------------------------
  // Matrices
  // ----------------------------------------------------------------
  function perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0,
    ]);
  }
  function lookAtView(eye, at, up) {
    const z = norm3(sub3(eye, at));
    const x = norm3(cross3(up, z));
    const y = cross3(z, x);
    return new Float32Array([
      x[0], y[0], z[0], 0,
      x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0,
      -dot3(x, eye), -dot3(y, eye), -dot3(z, eye), 1,
    ]);
  }
  const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

  // ================================================================
  // WORLD 01 — CINEMATIC DARK : "the signal ring"
  // ================================================================
  const CN_BG_FS = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
uniform vec2 u_res; uniform float u_time, u_scroll, u_reveal;
uniform vec2 u_anchor;
${NOISE}
void main(){
  vec2 uv = v_uv;
  vec2 sq = (uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
  // deep navy stage — never flat black (reference: home scene base)
  vec3 col = mix(vec3(0.012, 0.014, 0.030), vec3(0.022, 0.026, 0.055), uv.y);
  col += vec3(0.010, 0.012, 0.026) * fbm2(sq * 1.4 + u_time * 0.008);
  // corner gradient glows — hue drifts slowly via noise (GlobalComposite recipe)
  vec3 glowA = hsv2rgb(vec3(0.58 + vnoise2(sq * 0.6 + u_time * 0.02) * 0.07, 0.75, 1.0));
  vec3 glowB = hsv2rgb(vec3(0.07 + vnoise2(sq * 0.5 - u_time * 0.015) * 0.05, 0.65, 1.0));
  col += glowA * 0.034 * smoothstep(1.35, 0.1, length(sq - vec2(-1.10, 0.80)));
  col += glowB * 0.040 * smoothstep(1.30, 0.05, length(sq - vec2(1.05, -0.78)));
  // nebula dust field — faint, behind everything
  float neb = fbm2(sq * 2.1 + vec2(u_time * 0.012, -u_time * 0.007));
  col += vec3(0.05, 0.10, 0.16) * pow(neb, 3.0) * 0.55;
  col += vec3(0.13, 0.08, 0.04) * pow(fbm2(sq * 1.7 - u_time * 0.009 + 31.7), 3.5) * 0.5;
  // horizontal lens band through the anchor — gives the void a horizon
  vec2 rel = sq - u_anchor;
  float band = exp(-abs(rel.y + rel.x * 0.06) * 9.0);
  col += vec3(0.10, 0.22, 0.38) * band * 0.20 * (0.7 + 0.3 * sin(u_time * 0.4)) * u_reveal;
  // starfield — two layers of tiny pin stars
  vec2 g = sq * 34.0;
  vec2 cell = floor(g);
  float star = step(0.992, hash12(cell)) * pow(hash12(cell + 7.0), 2.0);
  col += vec3(0.55, 0.75, 1.0) * star * (0.25 + 0.2 * sin(u_time * (1.0 + hash12(cell) * 3.0) + hash12(cell) * 40.0)) * 0.35;
  o = vec4(col, 1.0);
}`;

  // Raymarched chrome torus sigil + emissive core. Writes premult color, alpha = coverage.
  const CN_RING_FS = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
uniform vec2 u_res; uniform float u_time, u_reveal, u_shock, u_scroll;
uniform vec2 u_mouse;       // lerped, -0.5..0.5
uniform vec2 u_anchor;      // ndc-ish anchor of the ring
uniform mat3 u_ringMat;     // ring orientation (tilt + precession)
${NOISE}
float sdTorus(vec3 p, vec2 t){ vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }
float sdSphere(vec3 p, float r){ return length(p) - r; }
vec2 mapScene(vec3 p){
  vec3 q = u_ringMat * p;
  float ring = sdTorus(q, vec2(1.0, 0.135));
  float inner = sdTorus(u_ringMat * (p * vec3(1.0) + vec3(0.0)), vec2(0.56, 0.022));
  float core = sdSphere(p, 0.135 + u_shock * 0.05);
  float d = ring; float id = 1.0;
  if (inner < d) { d = inner; id = 2.0; }
  if (core < d) { d = core; id = 3.0; }
  return vec2(d, id);
}
vec3 calcN(vec3 p){
  const vec2 e = vec2(0.0022, 0.0);
  return normalize(vec3(
    mapScene(p + e.xyy).x - mapScene(p - e.xyy).x,
    mapScene(p + e.yxy).x - mapScene(p - e.yxy).x,
    mapScene(p + e.yyx).x - mapScene(p - e.yyx).x));
}
// stylized studio environment for the chrome — vertical gradient + 2 stripe lights
vec3 envLight(vec3 r, float t){
  vec3 sky = mix(vec3(0.030, 0.040, 0.085), vec3(0.55, 0.78, 1.05), smoothstep(-0.45, 0.95, r.y));
  float stripeA = pow(max(dot(r, normalize(vec3(0.6, 0.75, 0.3))), 0.0), 18.0);
  float stripeB = pow(max(dot(r, normalize(vec3(-0.7, 0.35, -0.4))), 0.0), 26.0);
  float stripeC = pow(max(dot(r, normalize(vec3(0.1, -0.9, 0.2))), 0.0), 12.0);
  vec3 col = sky * 0.62 + vec3(0.028, 0.034, 0.062);
  col += vec3(1.7, 2.0, 2.4) * stripeA;
  col += vec3(1.3, 0.8, 0.45) * stripeB * 0.9;
  col += vec3(0.2, 0.38, 0.6) * stripeC * 0.6;
  return col;
}
vec3 rainbowFresnel(float f, float t){
  return hsv2rgb(vec3(fract(f * 0.55 + t * 0.015 + 0.52), 0.75, 1.0));
}
void main(){
  vec2 sq = (v_uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
  vec2 px = sq - u_anchor;
  float scale = mix(0.4, 1.0, smoothstep(0.0, 1.0, u_reveal));
  // camera
  vec3 ro = vec3(0.0, 0.0, 4.15 - u_scroll * 1.05);
  vec3 rd = normalize(vec3(px / scale, -1.42));
  vec4 acc = vec4(0.0);
  // screen-space window: the sigil only ever occupies the anchor neighbourhood,
  // so most pixels skip the sphere-traced loop entirely (big win on slow GPUs)
  float tt = 0.0; float id = 0.0; bool hit = false;
  if (length(px) / max(scale, 1e-3) < 0.78) {
    for (int i = 0; i < 56; i++) {
      vec3 p = ro + rd * tt;
      vec2 dm = mapScene(p);
      if (dm.x < 0.0025) { hit = true; id = dm.y; break; }
      tt += dm.x * 0.92;
      if (tt > 7.0) break;
    }
  }
  if (hit) {
    vec3 p = ro + rd * tt;
    vec3 n = calcN(p);
    vec3 r = reflect(rd, n);
    float fre = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
    if (id == 3.0) {
      // emissive core — HDR white-cyan, pulsing
      float pulse = 0.85 + 0.15 * sin(u_time * 2.2);
      vec3 core = vec3(2.6, 3.4, 4.4) * (pulse + u_shock * 1.1);
      acc = vec4(core, 1.0);
    } else {
      vec3 env = envLight(r, u_time);
      // surface engraving — fine rotating ridges catch the stripes
      vec3 q = u_ringMat * p;
      float ang = atan(q.z, q.x);
      float engrave = 0.85 + 0.15 * sin(ang * 64.0 + u_time * 0.6);
      vec3 col = env * mix(0.30, 1.02, fre) * engrave;
      col += rainbowFresnel(fre, u_time) * fre * 0.42;
      // energised inner edge — a cyan current runs along the torus
      float edge = smoothstep(0.10, 0.02, abs(length(q.xz) - 0.88));
      col += vec3(0.25, 0.9, 1.5) * edge * (0.5 + 0.5 * sin(ang * 3.0 - u_time * 1.4)) * 0.8;
      // entrance highlight sweep
      float sweep = smoothstep(0.06, 0.0, abs(q.y + q.x * 0.4 - mix(-1.6, 1.6, u_reveal)));
      col += vec3(2.2, 2.6, 3.0) * sweep * (1.0 - u_reveal * 0.65);
      col += vec3(1.2, 1.7, 2.4) * u_shock * fre;
      if (id == 2.0) col = col * 0.7 + vec3(0.35, 0.85, 1.3) * 0.45;  // inner ring runs hotter cyan
      acc = vec4(col, 1.0);
    }
  }
  // core halo (always, even on miss) — light has presence beyond geometry
  float dCenter = length(px) / max(scale, 1e-3);
  float halo = exp(-dCenter * 8.5) * 0.36 + exp(-dCenter * 2.6) * 0.06;
  vec3 haloCol = vec3(0.35, 0.75, 1.25) * (halo * (0.85 + u_shock * 0.9)) * u_reveal;
  acc.rgb += haloCol * (1.0 - acc.a * 0.55);
  acc.a = max(acc.a, min(1.0, halo * 1.2) * 0.85);
  o = acc;
}`;

  const CN_SIM_FS = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
uniform sampler2D u_pos;
uniform float u_dt, u_time, u_shock, u_scroll, u_attract;
uniform vec3 u_mouse3, u_ringAxis;
${NOISE}
${CURL}
vec3 bezier(float t){
  vec3 p0 = vec3(-3.0, -1.7, -0.9), p1 = vec3(-0.9, -1.4, 0.8);
  vec3 p2 = vec3(1.0, 1.1, -1.0), p3 = vec3(3.1, 1.9, 0.3);
  float u = 1.0 - t;
  return u*u*u*p0 + 3.0*u*u*t*p1 + 3.0*u*t*t*p2 + t*t*t*p3;
}
void main(){
  vec4 data = texture(u_pos, v_uv);
  vec3 pos = data.xyz;
  float life = data.w;
  float h0 = hash12(v_uv * 311.7);
  float h1 = hash12(v_uv * 97.3 + 5.1);
  float h2 = hash12(v_uv * 53.9 + 11.7);
  float family = h0 < 0.46 ? 0.0 : (h0 < 0.78 ? 1.0 : 2.0);

  if (family < 1.5) {
    // integrate
    vec3 vel = vec3(0.0);
    vec3 curl = curlNoise(pos * 0.62 + vec3(0.0, 0.0, u_time * 0.05));
    if (family < 0.5) {
      // RING STREAM — orbit the sigil's tilted plane, spring to radius 1.0
      vec3 a = normalize(u_ringAxis);
      vec3 radial = pos - a * dot(pos, a);
      float rl = length(radial) + 1e-4;
      vec3 tangent = normalize(cross(a, radial));
      float targetR = 1.0 + (h1 - 0.5) * 0.34 + u_scroll * 0.35;
      vel += tangent * (0.55 + h2 * 0.35 + u_scroll * 0.45);
      vel += (radial / rl) * (targetR - rl) * 2.4;
      vel -= a * dot(pos, a) * 1.6;
      vel += curl * 0.16;
    } else {
      // NEBULA DUST — slow drift in a wide shell, breathing
      vel += curl * 0.115;
      vel += vec3(0.012, 0.02, 0.0);
      float r = length(pos);
      if (r > 3.6) vel -= (pos / r) * (r - 3.6) * 1.4;
      if (r < 1.35) vel += (pos / r) * (1.35 - r) * 1.1;
    }
    // pointer attractor + click shock (radial)
    vec3 toM = u_mouse3 - pos;
    float dM = length(toM) + 1e-4;
    vel += (toM / dM) * u_attract * smoothstep(2.2, 0.0, dM) * 0.8;
    vel += normalize(pos + 1e-4) * u_shock * 2.1 * smoothstep(2.4, 0.0, length(pos));
    pos += vel * u_dt;
    life -= u_dt * (family < 0.5 ? 0.10 : 0.05);
    if (life <= 0.0) {
      if (family < 0.5) {
        float a0 = h1 * 6.2831853 + u_time * 0.1;
        float rr = 1.0 + (h2 - 0.5) * 0.3;
        vec3 a = normalize(u_ringAxis);
        vec3 b1 = normalize(abs(a.y) < 0.9 ? cross(a, vec3(0,1,0)) : cross(a, vec3(1,0,0)));
        vec3 b2 = cross(a, b1);
        pos = (b1 * cos(a0) + b2 * sin(a0)) * rr + a * (h0 - 0.5) * 0.10;
        life = 0.6 + h2 * 0.7;
      } else {
        float th = h1 * 6.2831853, ph = acos(2.0 * h2 - 1.0);
        float rr = 1.6 + pow(hash11(h0 * 91.0 + u_time), 1.6) * 2.0;
        pos = vec3(sin(ph) * cos(th), sin(ph) * sin(th) * 0.62, cos(ph)) * rr + vec3(0.25, 0.05, -0.3);
        life = 0.8 + h1 * 0.55;
      }
    }
  } else {
    // STREAMER — deterministic flow along a swooping bezier under the ring
    float speed = 0.052 * (0.6 + h1 * 0.8) * (1.0 + u_scroll * 0.9);
    float t = fract(h2 + u_time * speed);
    vec3 base = bezier(t);
    vec3 off = vec3(h1 - 0.5, h2 - 0.5, fract(h1 * 7.3) - 0.5) * 0.34;
    pos = base + off + curlNoise(base * 1.4 + h0 * 9.0) * 0.085;
    // streamers dodge the pointer slightly
    vec3 toM = pos - u_mouse3;
    float dM = length(toM) + 1e-4;
    pos += (toM / dM) * smoothstep(0.9, 0.0, dM) * 0.18;
    life = 0.25 + 0.75 * sin(t * 3.14159);  // fade in/out along the path
  }
  o = vec4(pos, life);
}`;

  const CN_PTS_VS = `#version 300 es
in vec2 a_ref;
uniform sampler2D u_pos;
uniform mat4 u_proj, u_view;
uniform float u_sizeK, u_time;
out vec3 v_col;
out float v_alpha;
out float v_spark;
float hash12(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
void main(){
  vec4 data = texture(u_pos, a_ref);
  float life = data.w;
  float h0 = hash12(a_ref * 311.7);
  float h1 = hash12(a_ref * 97.3 + 5.1);
  float h2 = hash12(a_ref * 53.9 + 11.7);
  float family = h0 < 0.46 ? 0.0 : (h0 < 0.78 ? 1.0 : 2.0);
  vec4 viewPos = u_view * vec4(data.xyz, 1.0);
  vec4 clip = u_proj * viewPos;
  gl_Position = clip;
  float dist = max(0.001, -viewPos.z);
  float twinkle = 0.62 + 0.38 * sin(u_time * (2.0 + h1 * 4.0) + h2 * 41.0);
  float base; float lifeCurve = smoothstep(0.0, 0.2, life) * (0.55 + 0.45 * smoothstep(1.6, 0.9, life));
  if (family < 0.5) { base = 1.9 + h1 * 2.0; v_col = mix(vec3(0.18, 0.65, 1.15), vec3(0.75, 1.0, 1.25), h2); }
  else if (family < 1.5) { base = 1.2 + h1 * 1.5; v_col = mix(vec3(1.05, 0.62, 0.22), vec3(1.15, 0.92, 0.55), h2) * 0.8; }
  else { base = 2.4 + h1 * 2.8; v_col = mix(vec3(0.55, 0.95, 1.35), vec3(1.0, 1.1, 1.3), h2) * 1.25; }
  v_spark = family > 1.5 ? 1.0 : 0.0;
  gl_PointSize = clamp(base * u_sizeK / dist * (0.5 + lifeCurve * 0.8) * twinkle, 0.75, 30.0);
  v_alpha = lifeCurve * twinkle * (0.55 + 0.45 / max(dist * 0.4, 1.0));
}`;

  const CN_PTS_FS = `#version 300 es
precision highp float;
in vec3 v_col; in float v_alpha; in float v_spark;
out vec4 o;
void main(){
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  float core = exp(-r2 * 5.0);
  float star = 0.0;
  if (v_spark > 0.5) {
    star = (smoothstep(0.16, 0.0, abs(c.x) * abs(c.y) * 4.0)) * smoothstep(1.0, 0.2, r2) * 0.7;
  }
  float a = max(core, star) * v_alpha;
  vec3 col = v_col * (core * 1.25 + star * 1.6);
  col += vec3(1.0) * pow(core, 5.0) * 0.8;
  o = vec4(col * a, a);
}`;

  function makeCinematic(canvas) {
    const kit = makeKit(canvas);
    if (!kit) return null;
    const { gl } = kit;
    const world = { kit };
    world.bg = kit.program(SCREEN_VS, CN_BG_FS, ["u_res", "u_time", "u_scroll", "u_reveal", "u_anchor"]);
    world.ring = kit.program(SCREEN_VS, CN_RING_FS, ["u_res", "u_time", "u_reveal", "u_shock", "u_scroll", "u_mouse", "u_anchor", "u_ringMat"]);
    world.parts = makeParticles(kit, 256, CN_SIM_FS, CN_PTS_VS, CN_PTS_FS,
      ["u_shock", "u_scroll", "u_attract", "u_mouse3", "u_ringAxis"], []);
    world.comp = makeComposite(kit);
    world.scene = null;
    world.bloom = null;
    world.renderScale = 1;
    world.alloc = () => {
      kit.freeTarget(world.scene);
      const w = Math.max(2, Math.floor(canvas.width * world.renderScale));
      const h = Math.max(2, Math.floor(canvas.height * world.renderScale));
      world.scene = kit.target(w, h, gl.LINEAR);
      if (!world.bloom) world.bloom = makeBloomChain(kit, w, h);
      else world.bloom.alloc(w, h);
    };
    world.alloc();

    world.render = (st) => {
      const t = st.time;
      // ring orientation: slow precession + pointer tilt + scroll lean
      const rx = -0.46 + st.my * 0.16 + st.heroP * 0.42 + Math.sin(t * 0.07) * 0.05;
      const rz = 0.16 * Math.sin(t * 0.05) + st.mx * 0.10;
      const cx = Math.cos(rx), sx = Math.sin(rx), cz = Math.cos(rz), sz = Math.sin(rz);
      // mat3 = Rx * Rz (column-major)
      const m = [
        cz, cx * sz, sx * sz,
        -sz, cx * cz, sx * cz,
        0, -sx, cx,
      ];
      // ring plane normal in world space = R^T * (0,1,0) — second row of m
      const ax = [m[1], m[4], m[7]];

      const anchorX = 0.26 - st.heroP * 0.08;
      const anchorY = 0.055 + st.heroP * 0.075;

      // 1. background into scene RT
      gl.bindFramebuffer(gl.FRAMEBUFFER, world.scene.fbo);
      gl.viewport(0, 0, world.scene.w, world.scene.h);
      gl.disable(gl.BLEND);
      gl.useProgram(world.bg.p);
      gl.uniform2f(world.bg.u.u_res, world.scene.w, world.scene.h);
      gl.uniform1f(world.bg.u.u_time, t);
      gl.uniform1f(world.bg.u.u_scroll, st.heroP);
      gl.uniform1f(world.bg.u.u_reveal, st.reveal);
      gl.uniform2f(world.bg.u.u_anchor, anchorX, anchorY);
      kit.blit(world.bg);

      // 2. raymarched ring, blended over bg
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(world.ring.p);
      gl.uniform2f(world.ring.u.u_res, world.scene.w, world.scene.h);
      gl.uniform1f(world.ring.u.u_time, t);
      gl.uniform1f(world.ring.u.u_reveal, st.reveal);
      gl.uniform1f(world.ring.u.u_shock, st.shock);
      gl.uniform1f(world.ring.u.u_scroll, st.heroP);
      gl.uniform2f(world.ring.u.u_mouse, st.mx, st.my);
      gl.uniform2f(world.ring.u.u_anchor, anchorX, anchorY);
      gl.uniformMatrix3fv(world.ring.u.u_ringMat, false, m);
      kit.blit(world.ring);
      gl.disable(gl.BLEND);

      // 3. simulate + draw particles (camera matches ring projection)
      world.parts.step(st.dt, t, (u) => {
        gl.uniform1f(u.u_shock, st.shock);
        gl.uniform1f(u.u_scroll, st.heroP);
        gl.uniform1f(u.u_attract, 0.55 + st.heroP * 0.5);
        gl.uniform3f(u.u_mouse3, st.mx * 3.0, st.my * 2.0, 0.3);
        gl.uniform3f(u.u_ringAxis, ax[0], ax[1], ax[2]);
      });
      gl.bindFramebuffer(gl.FRAMEBUFFER, world.scene.fbo);
      gl.viewport(0, 0, world.scene.w, world.scene.h);
      const aspect = world.scene.w / world.scene.h;
      // match the ring raymarch projection: focal 1.42 in half-height units
      const proj = perspective(2 * Math.atan(0.5 / 1.42), aspect, 0.1, 30);
      const scale = 0.4 + 0.6 * Math.min(1, st.reveal * 1.4);
      const dist = (4.15 - st.heroP * 1.05) / scale;
      // place the world origin so it projects exactly at the ring anchor
      const ox = -anchorX * dist / 1.42 + Math.sin(t * 0.05) * 0.10;
      const oy = -anchorY * dist / 1.42 + Math.cos(t * 0.043) * 0.07;
      const view = lookAtView([ox, oy, dist], [ox, oy, 0], [0, 1, 0]);
      world.parts.draw(proj, view, world.scene.h * 0.0021, t, null);

      // 4. bloom + streak, 5. composite
      const bl = world.bloom.render(world.scene.tex, 0.42, 0.32, 1.6 + st.heroP * 1.2);
      drawComposite(kit, world.comp, world.scene.tex, bl, {
        bloomStrength: 0.88 + st.pulse * 0.25 + st.heroP * 0.3,
        bloomRadius: 0.76,
        ca: 0.0016 + st.heroP * 0.0022 + st.shock * 0.004,
        time: t,
        grain: 0.055,
        vig: 0.30,
        bloomTint: [0.92, 1.0, 1.14],
        streakTint: [0.30, 0.62, 1.05],
        lift: [0.004, 0.006, 0.014],
      });
    };
    return world;
  }

  // ================================================================
  // WORLD 05 — SPATIAL ARCHITECTURE : "glass louvre tower"
  // ================================================================
  const SP_SCENE_FS = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
uniform vec2 u_res; uniform float u_time, u_scroll, u_shock, u_reveal, u_orbit;
uniform vec2 u_mouse;
${NOISE}
const int SLABS = 15;
float sdRBox(vec3 p, vec3 b, float r){
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}
mat2 rot2(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float towerD(vec3 p, float t){
  // helical louvre stack: slabs twist with height, breathe slowly
  float slabH = 0.17;
  float d = 1e9;
  float fi = clamp(floor(p.y / slabH + 0.5), 0.0, float(SLABS - 1));
  for (int k = -1; k <= 1; k++) {
    float i = clamp(fi + float(k), 0.0, float(SLABS - 1));
    vec3 q = p;
    q.y -= i * slabH;
    float ang = i * 0.235 + sin(t * 0.22 + i * 0.42) * 0.045;
    q.xz = rot2(ang) * q.xz;
    q.x -= sin(i * 0.52) * 0.085;
    float w = 0.78 - abs(i - 7.0) * 0.022;
    d = min(d, sdRBox(q, vec3(w, 0.030, 0.46), 0.024));
  }
  // frosted core mast
  float core = max(length(p.xz) - 0.20, abs(p.y - 1.25) - 1.32);
  return min(d, core);
}
vec3 towerN(vec3 p, float t){
  const vec2 e = vec2(0.004, 0.0);
  return normalize(vec3(
    towerD(p + e.xyy, t) - towerD(p - e.xyy, t),
    towerD(p + e.yxy, t) - towerD(p - e.yxy, t),
    towerD(p + e.yyx, t) - towerD(p - e.yyx, t)));
}
vec3 skyEnv(vec3 rd, vec3 sunDir, float t){
  float horizon = smoothstep(-0.08, 0.55, rd.y);
  vec3 sky = mix(vec3(0.96, 0.94, 0.88), vec3(0.52, 0.70, 0.88), horizon);
  float sd = max(dot(rd, sunDir), 0.0);
  float sun = smoothstep(0.9965, 0.9985, sd);
  float corona = pow(sd, 24.0);
  float glow = pow(sd, 5.0);
  sky += vec3(1.9, 1.6, 1.15) * sun * 2.2;
  sky += vec3(1.1, 0.85, 0.55) * corona * 0.85;
  sky += vec3(0.55, 0.46, 0.30) * glow * 0.85;
  // horizon haze band + soft vertical sun pillar
  sky += vec3(0.40, 0.36, 0.28) * exp(-abs(rd.y - 0.04) * 14.0) * 0.30;
  float pillar = pow(max(dot(normalize(vec3(rd.x, 0.0, rd.z)), normalize(vec3(sunDir.x, 0.0, sunDir.z))), 0.0), 60.0);
  sky += vec3(0.9, 0.78, 0.55) * pillar * smoothstep(0.45, 0.0, abs(rd.y)) * 0.35;
  float clouds = fbm2(rd.xz / max(rd.y, 0.06) * 0.5 + t * 0.004 + 13.7);
  sky += vec3(0.06) * smoothstep(0.5, 0.85, clouds) * horizon;
  return sky;
}
vec3 shade(vec3 p, vec3 n, vec3 rd, vec3 sunDir, float t){
  float dif = max(dot(n, sunDir), 0.0);
  float skyAmb = 0.45 + 0.55 * max(n.y, 0.0);
  float fre = pow(1.0 - max(dot(n, -rd), 0.0), 4.0);
  // slab AO — distance probe along normal
  float ao = clamp(towerD(p + n * 0.07, t) / 0.07, 0.25, 1.0);
  vec3 base = vec3(0.93, 0.94, 0.92);
  vec3 col = base * (0.46 * skyAmb + 0.62 * dif) * ao;
  col += vec3(0.13, 0.17, 0.22) * (1.0 - dif) * 0.62;            // cool shadow fill
  col += vec3(1.35, 1.22, 0.98) * pow(max(dot(reflect(rd, n), sunDir), 0.0), 36.0) * 1.3;
  col += vec3(0.85, 0.95, 1.1) * fre * 0.75;
  return col;
}
void main(){
  vec2 sq = (v_uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
  float t = u_time;
  vec3 sunDir = normalize(vec3(-0.50, 0.34, -0.78));
  // camera orbit; scroll dives toward the waterline
  float az = 0.30 + u_mouse.x * 0.70 + t * 0.020 * u_orbit;
  float camY = mix(1.30, 0.18, u_scroll) + u_mouse.y * 0.30;
  float rad = 6.6 - u_scroll * 1.7;
  vec3 ro = vec3(sin(az) * rad, camY, cos(az) * rad);
  vec3 at = vec3(-0.80, mix(1.18, 0.52, u_scroll), 0.0);
  vec3 f = normalize(at - ro);
  vec3 ri = normalize(cross(f, vec3(0, 1, 0)));
  vec3 up = cross(ri, f);
  vec3 rd = normalize(f * 1.55 + ri * sq.x + up * sq.y);

  vec3 col;
  // bounding sphere around the tower: rays that miss skip the 88-step march
  vec3 toc = ro - vec3(0.0, 1.3, 0.0);
  float tb = dot(toc, rd);
  float tc2 = dot(toc, toc) - 4.84;
  bool towerPossible = !(tc2 > 0.0 && (tb > 0.0 || tb * tb < tc2));
  float tt = 0.0; bool hit = false;
  if (towerPossible) {
    tt = max(0.0, -tb - sqrt(max(tb * tb - tc2, 0.0)));
    for (int i = 0; i < 88; i++) {
      vec3 p = ro + rd * tt;
      float d = towerD(p, t);
      if (d < 0.004) { hit = true; break; }
      tt += d * 0.9;
      if (tt > 14.0) break;
    }
  }
  float waterT = rd.y < -0.001 ? -(ro.y - 0.0) / rd.y : 1e9;
  if (hit && tt < waterT) {
    vec3 p = ro + rd * tt;
    vec3 n = towerN(p, t);
    col = shade(p, n, rd, sunDir, t);
    col = mix(col, skyEnv(rd, sunDir, t), smoothstep(5.0, 13.0, tt));  // aerial fog
  } else if (waterT < 1e8) {
    // water — reflect and march again
    vec3 wp = ro + rd * waterT;
    float rip = fbm2(wp.xz * 2.6 + t * 0.20) - 0.5;
    float rip2 = fbm2(wp.xz * 5.2 - t * 0.13 + 41.0) - 0.5;
    // click ripple ring
    float shockR = (1.0 - u_shock) * 3.5;
    float ring = exp(-abs(length(wp.xz) - shockR) * 3.0) * u_shock * 0.5;
    vec3 wn = normalize(vec3(rip * 0.24 + ring * 0.4, 1.0, rip2 * 0.24));
    vec3 rrd = reflect(rd, wn);
    rrd.y = abs(rrd.y) * 0.96 + 0.02;
    float rt = 0.0; bool rhit = false;
    vec3 rro = wp + vec3(0.0, 0.01, 0.0);
    vec3 roc = rro - vec3(0.0, 1.3, 0.0);
    float rb = dot(roc, rrd);
    float rc2 = dot(roc, roc) - 4.84;
    if (!(rc2 > 0.0 && (rb > 0.0 || rb * rb < rc2))) {
      rt = max(0.0, -rb - sqrt(max(rb * rb - rc2, 0.0)));
      for (int i = 0; i < 48; i++) {
        vec3 p = rro + rrd * rt;
        float d = towerD(p, t);
        if (d < 0.008) { rhit = true; break; }
        rt += d * 0.95;
        if (rt > 12.0) break;
      }
    }
    vec3 refl;
    if (rhit) {
      vec3 p = rro + rrd * rt;
      vec3 n = towerN(p, t);
      refl = shade(p, n, rrd, sunDir, t);
    } else {
      refl = skyEnv(rrd, sunDir, t);
    }
    float fre = pow(1.0 - max(dot(wn, -rd), 0.0), 2.2);
    vec3 deep = vec3(0.07, 0.13, 0.16);
    col = mix(deep, refl * vec3(0.84, 0.91, 0.97), 0.32 + 0.60 * fre);
    float glint = pow(max(dot(reflect(rd, wn), sunDir), 0.0), 240.0);
    col += vec3(1.6, 1.4, 1.0) * glint * 2.1;
    float distFade = smoothstep(13.0, 3.0, waterT);
    col = mix(skyEnv(vec3(rd.x, 0.02, rd.z), sunDir, t), col, distFade);
  } else {
    col = skyEnv(rd, sunDir, t);
  }
  // entrance: brightness blooms in
  col *= 0.35 + 0.65 * u_reveal;
  o = vec4(col, 1.0);
}`;

  function makeSpatial(canvas) {
    const kit = makeKit(canvas);
    if (!kit) return null;
    const { gl } = kit;
    const world = { kit };
    world.sceneP = kit.program(SCREEN_VS, SP_SCENE_FS, ["u_res", "u_time", "u_scroll", "u_shock", "u_reveal", "u_mouse", "u_orbit"]);
    world.comp = makeComposite(kit);
    world.scene = null;
    world.bloom = null;
    world.renderScale = 1;
    world.alloc = () => {
      kit.freeTarget(world.scene);
      const w = Math.max(2, Math.floor(canvas.width * 0.8 * world.renderScale));
      const h = Math.max(2, Math.floor(canvas.height * 0.8 * world.renderScale));
      world.scene = kit.target(w, h, gl.LINEAR);
      if (!world.bloom) world.bloom = makeBloomChain(kit, w, h);
      else world.bloom.alloc(w, h);
    };
    world.alloc();
    world.render = (st) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, world.scene.fbo);
      gl.viewport(0, 0, world.scene.w, world.scene.h);
      gl.disable(gl.BLEND);
      gl.useProgram(world.sceneP.p);
      gl.uniform2f(world.sceneP.u.u_res, world.scene.w, world.scene.h);
      gl.uniform1f(world.sceneP.u.u_time, st.time);
      gl.uniform1f(world.sceneP.u.u_scroll, st.heroP);
      gl.uniform1f(world.sceneP.u.u_shock, st.shock);
      gl.uniform1f(world.sceneP.u.u_reveal, st.reveal);
      gl.uniform2f(world.sceneP.u.u_mouse, st.mx, st.my);
      gl.uniform1f(world.sceneP.u.u_orbit, st.orbit ? 1 : 0);
      kit.blit(world.sceneP);
      const bl = world.bloom.render(world.scene.tex, 0.78, 0.25, 1.1);
      drawComposite(kit, world.comp, world.scene.tex, bl, {
        bloomStrength: 0.42 + st.pulse * 0.3,
        bloomRadius: 0.8,
        ca: 0.0009,
        time: st.time,
        grain: 0.040,
        vig: 0.42,
        bloomTint: [1.0, 0.98, 0.92],
        streakTint: [0.5, 0.55, 0.6],
        lift: [0.012, 0.014, 0.016],
      });
    };
    return world;
  }

  // ================================================================
  // WORLD 04 — LUXURY ALCOVE : "mécanique №01" (gold ring, onyx floor)
  // ================================================================
  const LX_SCENE_FS = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
uniform vec2 u_res; uniform float u_time, u_scroll, u_shock, u_reveal;
uniform vec2 u_mouse;
${NOISE}
mat2 rot2(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float sdTorus(vec3 p, vec2 t){ vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }
vec2 ringMap(vec3 p, float t, vec2 m){
  vec3 q = p - vec3(0.62, 0.74 + sin(t * 0.5) * 0.03, 0.0);
  q.yz = rot2(0.42 + m.y * 0.12) * q.yz;
  q.xy = rot2(-0.25 + sin(t * 0.18) * 0.10 + m.x * 0.18) * q.xy;
  q.xz = rot2(t * 0.14) * q.xz;
  float band = sdTorus(q, vec2(0.34, 0.082));
  // gem: small sphere riding the band
  vec3 g = q - vec3(0.34, 0.0, 0.0);
  float gem = length(g) - 0.058;
  float d = band; float id = 1.0;
  if (gem < d) { d = gem; id = 2.0; }
  return vec2(d, id);
}
vec3 ringN(vec3 p, float t, vec2 m){
  const vec2 e = vec2(0.0025, 0.0);
  return normalize(vec3(
    ringMap(p + e.xyy, t, m).x - ringMap(p - e.xyy, t, m).x,
    ringMap(p + e.yxy, t, m).x - ringMap(p - e.yxy, t, m).x,
    ringMap(p + e.yyx, t, m).x - ringMap(p - e.yyx, t, m).x));
}
vec3 alcoveBG(vec3 rd, float t){
  // candle-lit niche: warm arch glow upper right, deep umber elsewhere
  vec3 col = vec3(0.030, 0.020, 0.014);
  vec3 keyDir = normalize(vec3(0.5, 0.55, -0.6));
  float arch = pow(max(dot(rd, keyDir), 0.0), 3.2);
  col += vec3(0.42, 0.26, 0.11) * arch * 0.85;
  col += vec3(0.16, 0.07, 0.03) * pow(max(dot(rd, normalize(vec3(-0.6, 0.2, -0.4))), 0.0), 4.0) * 0.4;
  float flicker = 0.92 + 0.08 * sin(t * 3.1) * sin(t * 1.7 + 2.0);
  return col * flicker;
}
vec3 goldShade(vec3 p, vec3 n, vec3 rd, float t){
  vec3 keyDir = normalize(vec3(0.55, 0.65, -0.45));
  vec3 fillDir = normalize(vec3(-0.6, 0.25, 0.55));
  vec3 base = vec3(0.86, 0.60, 0.26);
  float dif = max(dot(n, keyDir), 0.0);
  vec3 r = reflect(rd, n);
  // brushed anisotropy — bands across the reflected key highlight
  float aniso = 0.78 + 0.22 * sin(atan(n.y, n.x) * 26.0 + t * 0.4);
  float spec = pow(max(dot(r, keyDir), 0.0), 52.0) * 2.6 * aniso;
  float spec2 = pow(max(dot(r, fillDir), 0.0), 10.0) * 0.30;
  float fre = pow(1.0 - max(dot(n, -rd), 0.0), 3.5);
  vec3 col = base * (0.13 + dif * 0.75);
  col += vec3(1.45, 1.05, 0.55) * spec;
  col += vec3(0.45, 0.40, 0.42) * spec2;
  col += vec3(1.15, 0.95, 0.70) * fre * 0.55;
  return col;
}
vec3 traceScene(vec3 ro, vec3 rd, float t, vec2 m, out float hitT){
  // bounding sphere early-out: skip the march when the ray misses the jewel
  vec3 oc = ro - vec3(0.62, 0.74, 0.0);
  float ob = dot(oc, rd);
  float oc2 = dot(oc, oc) - 0.36;
  if (oc2 > 0.0 && (ob > 0.0 || ob * ob < oc2)) { hitT = -1.0; return alcoveBG(rd, t); }
  float tt = 0.0; float id = 0.0; bool hit = false;
  for (int i = 0; i < 64; i++) {
    vec3 p = ro + rd * tt;
    vec2 dm = ringMap(p, t, m);
    if (dm.x < 0.003) { hit = true; id = dm.y; break; }
    tt += dm.x * 0.92;
    if (tt > 9.0) break;
  }
  hitT = hit ? tt : -1.0;
  if (!hit) return alcoveBG(rd, t);
  vec3 p = ro + rd * tt;
  vec3 n = ringN(p, t, m);
  if (id > 1.5) {
    // the gem — deep oxblood with a hot sparkle
    float fre = pow(1.0 - max(dot(n, -rd), 0.0), 2.0);
    vec3 r = reflect(rd, n);
    float spark = pow(max(dot(r, normalize(vec3(0.55, 0.65, -0.45))), 0.0), 160.0);
    vec3 col = vec3(0.30, 0.04, 0.05) * (0.4 + fre * 0.8);
    col += vec3(3.2, 2.4, 1.8) * spark;
    col += vec3(0.9, 0.2, 0.25) * fre * 0.5;
    return col;
  }
  return goldShade(p, n, rd, t);
}
void main(){
  vec2 sq = (v_uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
  float t = u_time;
  vec2 m = u_mouse;
  // camera: shoulder-height, drifting; scroll sinks gaze slightly
  vec3 ro = vec3(m.x * 0.26, 0.74 - u_scroll * 0.22 + m.y * 0.10, 3.10);
  vec3 at = vec3(0.50, 0.60 - u_scroll * 0.16, 0.0);
  vec3 f = normalize(at - ro);
  vec3 ri = normalize(cross(f, vec3(0, 1, 0)));
  vec3 up = cross(ri, f);
  vec3 rd = normalize(f * 1.75 + ri * sq.x + up * sq.y);

  float hitT;
  vec3 col;
  float floorT = rd.y < -0.001 ? -(ro.y - 0.0) / rd.y : 1e9;
  float sceneT;
  vec3 direct = traceScene(ro, rd, t, m, sceneT);
  if (sceneT > 0.0 && (sceneT < floorT || floorT > 1e8)) {
    col = direct;
  } else if (floorT < 1e8) {
    // polished onyx floor: dark base + blurred mirror of the ring + caustics
    vec3 fp = ro + rd * floorT;
    vec3 wn = normalize(vec3(0.0, 1.0, 0.0) + vec3(fbm2(fp.xz * 3.0) - 0.5, 0.0, fbm2(fp.xz * 3.0 + 9.1) - 0.5) * 0.012);
    vec3 rrd = reflect(rd, wn);
    float rT;
    vec3 refl = traceScene(fp + vec3(0, 0.005, 0), rrd, t, m, rT);
    float fre = pow(1.0 - max(dot(wn, -rd), 0.0), 2.0);
    vec3 onyx = vec3(0.022, 0.016, 0.013);
    col = onyx + refl * (0.24 + 0.50 * fre);
    // warm caustic shimmer under the ring
    float caust = pow(fbm2(fp.xz * 5.0 + t * 0.10), 4.0) * exp(-length(fp.xz - vec2(0.62, 0.0)) * 1.8);
    col += vec3(0.60, 0.37, 0.13) * caust * 1.7;
    col = mix(alcoveBG(vec3(rd.x, 0.0, rd.z), t), col, smoothstep(8.0, 2.0, floorT));
  } else {
    col = direct;
  }
  // floating dust motes — procedural, drifting up through the key light
  for (int i = 0; i < 2; i++) {
    vec2 duv = sq * (3.0 + float(i) * 2.0) + vec2(t * 0.012 * (float(i) + 1.0), t * 0.03);
    vec2 cell = floor(duv);
    vec2 fr = fract(duv) - 0.5;
    float h = hash12(cell + float(i) * 17.0);
    vec2 jitter = vec2(hash12(cell + 3.1), hash12(cell + 5.7)) - 0.5;
    float d = length(fr - jitter * 0.6);
    float mote = exp(-d * d * 240.0) * step(0.86, h);
    float lightCone = smoothstep(1.2, 0.2, length(sq - vec2(0.45, 0.25)));
    col += vec3(1.0, 0.78, 0.45) * mote * lightCone * (0.20 - float(i) * 0.07) * (0.7 + 0.3 * sin(t * 2.0 + h * 30.0));
  }
  col *= 0.25 + 0.75 * u_reveal;
  col *= 1.0 + u_shock * 0.35;   // click = candle surge
  o = vec4(col, 1.0);
}`;

  function makeLuxury(canvas) {
    const kit = makeKit(canvas);
    if (!kit) return null;
    const { gl } = kit;
    const world = { kit };
    world.sceneP = kit.program(SCREEN_VS, LX_SCENE_FS, ["u_res", "u_time", "u_scroll", "u_shock", "u_reveal", "u_mouse"]);
    world.comp = makeComposite(kit);
    world.scene = null;
    world.bloom = null;
    world.renderScale = 1;
    world.alloc = () => {
      kit.freeTarget(world.scene);
      const w = Math.max(2, Math.floor(canvas.width * 0.8 * world.renderScale));
      const h = Math.max(2, Math.floor(canvas.height * 0.8 * world.renderScale));
      world.scene = kit.target(w, h, gl.LINEAR);
      if (!world.bloom) world.bloom = makeBloomChain(kit, w, h);
      else world.bloom.alloc(w, h);
    };
    world.alloc();
    world.render = (st) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, world.scene.fbo);
      gl.viewport(0, 0, world.scene.w, world.scene.h);
      gl.disable(gl.BLEND);
      gl.useProgram(world.sceneP.p);
      gl.uniform2f(world.sceneP.u.u_res, world.scene.w, world.scene.h);
      gl.uniform1f(world.sceneP.u.u_time, st.time);
      gl.uniform1f(world.sceneP.u.u_scroll, st.heroP);
      gl.uniform1f(world.sceneP.u.u_shock, st.shock);
      gl.uniform1f(world.sceneP.u.u_reveal, st.reveal);
      gl.uniform2f(world.sceneP.u.u_mouse, st.mx, st.my);
      kit.blit(world.sceneP);
      const bl = world.bloom.render(world.scene.tex, 0.50, 0.30, 1.4);
      drawComposite(kit, world.comp, world.scene.tex, bl, {
        bloomStrength: 0.85 + st.pulse * 0.4,
        bloomRadius: 0.88,
        ca: 0.0012,
        time: st.time,
        grain: 0.060,
        vig: 0.18,
        bloomTint: [1.18, 0.98, 0.72],
        streakTint: [0.85, 0.55, 0.25],
        lift: [0.006, 0.004, 0.002],
      });
    };
    return world;
  }

  // ----------------------------------------------------------------
  // Public API
  // ----------------------------------------------------------------
  // Adaptive quality — the same ladder the reference engines use: when frames
  // run long (weak GPUs, software GL in CI) we drop internal resolution and
  // particle budget instead of dropping the effect.
  const QUALITY = {
    cinematic: { scales: [1.0, 0.78, 0.6, 0.45], fractions: [1.0, 0.55, 0.3, 0.18] },
    spatial: { scales: [1.0, 0.78, 0.6, 0.45], fractions: [1, 1, 1, 1] },
    luxury: { scales: [1.0, 0.78, 0.6, 0.45], fractions: [1, 1, 1, 1] },
  };
  function adapt(world, name, dt) {
    const ladder = QUALITY[name];
    let q = world.q;
    if (!q) {
      q = world.q = { level: 0, bad: 0, good: 0 };
      if (world.kit.software) {
        q.level = ladder.scales.length - 1;
        world.renderScale = ladder.scales[q.level];
        if (world.parts) world.parts.fraction = ladder.fractions[q.level];
        world.alloc();
      }
    }
    if (dt > 0.09 && q.level < ladder.scales.length - 1) {
      q.good = 0;
      if (++q.bad >= 3) {
        q.bad = 0;
        q.level += 1;
        world.renderScale = ladder.scales[q.level];
        if (world.parts) world.parts.fraction = ladder.fractions[q.level];
        world.alloc();
      }
    } else if (dt < 0.024 && q.level > 0) {
      q.bad = 0;
      if (++q.good >= 110) {
        q.good = 0;
        q.level -= 1;
        world.renderScale = ladder.scales[q.level];
        if (world.parts) world.parts.fraction = ladder.fractions[q.level];
        world.alloc();
      }
    } else {
      q.bad = Math.max(0, q.bad - 1);
    }
  }

  const worlds = { cinematic: null, spatial: null, luxury: null };
  const tried = { cinematic: false, spatial: false, luxury: false };
  let revealStart = -1;

  window.GLWorlds = {
    // Lazily create each pipeline; returns false if WebGL2/float unavailable.
    ensure(name, canvas) {
      if (worlds[name]) return true;
      if (tried[name]) return false;
      tried[name] = true;
      try {
        if (name === "cinematic") worlds.cinematic = makeCinematic(canvas);
        else if (name === "spatial") worlds.spatial = makeSpatial(canvas);
        else if (name === "luxury") worlds.luxury = makeLuxury(canvas);
      } catch (err) {
        console.warn("GLWorlds " + name + " unavailable:", err.message);
        worlds[name] = null;
      }
      return !!worlds[name];
    },
    resize(name) {
      if (worlds[name]) worlds[name].alloc();
    },
    startReveal(time) { revealStart = time; },
    render(name, st) {
      const w = worlds[name];
      if (!w) return false;
      if (revealStart < 0) revealStart = st.time;
      st.reveal = st.reduced ? 1 : Math.min(1, Math.max(0, (st.time - revealStart) / 1.9));
      w.render(st);
      adapt(w, name, st.rawDt || st.dt);
      return true;
    },
    active(name) { return !!worlds[name]; },
    failed(name) { return tried[name] && !worlds[name]; },
  };
})();
