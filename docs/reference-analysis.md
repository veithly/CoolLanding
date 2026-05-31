# CoolLanding Reference Analysis (8 sites)

This note summarizes the mechanisms behind the 8 reference sites that shaped CoolLanding. The goal is not to clone any of them, but to distill them into a reusable **Style Worlds + Mechanics** framework. The full mechanics catalog lives in the [companion skill](https://github.com/veithly/CoolLanding-Skill).

## Current Research Evidence

On 2026-05-29 the reference harvester was re-run with headless Chromium. Public HTML,
JS and CSS responses were saved under `research/refs/<site>/`, then scanned for GLSL,
render-target, scroll, audio and asset-loader signals. The strongest verified signals:

- Sidewave: 27 public code assets, 1 WebGL2 canvas, Unity loader/framework and shader creation calls.
- Active Theory: public app bundle still scans for `curlNoise`, `UnrealBloomPass`, `FBO`, `DataTexture`, `GLTFLoader`, `DRACO` and `Points(`.
- Blit Studio: 12 public code assets with `THREE`, `ScrollTrigger`, `lenis`, `Howl`, FBO/ping-pong and shader-material signals.
- Remote Rituals: Framer runtime assets, dense DOM/SVG behavior, ScrollTrigger/Howler-style signals, no custom WebGL canvas observed in the probe.
- AIR Center: OGL / Barba / Locomotive style signals from public bundles and earlier cached runtime files.
- Razorpay Sprint 26: 13 public code assets, 44 canvases, live `gsap` + `ScrollTrigger`, Three/DRACO/Rive loader signals.
- Aimee's Papercraft World: R3F, Lenis, ScrollTrigger, Reflector, fbm shader and DRACO signals.
- Cartier Watches & Wonders: current probe returned no public JS/CSS bundles, so the tech row is treated as visual-only evidence unless a later run exposes assets.

The design target is **90% perceived effect parity**, not code parity: same level of
craft, depth, motion, materiality and specificity, implemented with original markup and
brand-safe mechanics.

## Sidewave — cinematic-dark

Reference: https://sidewave.it/#origin

What stood out:

- One WebGL2 canvas owns the first impression.
- The page opens with a loading ritual: tiny technical copy, centered object, progress line.
- The visual language is mostly black, white, and a small amount of cold glow.
- The interface is quiet. The absence of content makes the central object feel more expensive.
- DOM/UI layers sit above a real-time render layer.

CoolLanding demo response (world 01):

- WebGL2 shader field in the hero, pointer/scroll/time uniforms.
- Loader count and progress line.
- Sparse mono status strip and ASCII texture.
- Scramble headlines.

## Active Theory — cinematic-dark

Reference: https://activetheory.net/

What stood out:

- The site behaves more like an interactive installation than a document.
- DOM is sparse; the screen is carried by WebGL2, video, and runtime assets.
- Ticker/code marks and binary-like texture create a system atmosphere.
- Navigation is minimal and does not compete with the scene.

CoolLanding response:

- Shader-first first viewport.
- ASCII data cloud, status strips.
- Minimal fixed navigation with high contrast.
- Scroll modifies the scene rather than only moving content.

## Blit Studio — editorial-interference

Reference: https://blit.studio/

What stood out:

- White space is used aggressively.
- Huge cropped typography is the layout, not decoration.
- Media is placed like editorial collage.
- A custom cursor and smooth-scroll behavior make the page feel physical.
- Red/orange accents interrupt the page with confidence.

CoolLanding demo response (world 02):

- Paper-white editorial section with giant cropped "FORKABLE" wordmark.
- Italic serif headline with hot-orange interruption words.
- Halftone canvas with a cursor lens effect.
- Asymmetric magazine collage grid.
- Marquee ticker.

## Remote Rituals — ritual-craft

Reference: https://remote-rituals.framer.website/

What stood out:

- It feels handmade, playful, and highly specific.
- Framer/SVG density creates a crafted toy-world feeling.
- Saturated color panels drive the experience.
- Full-viewport pinned/horizontal scenes turn daily work into a scroll narrative.

CoolLanding demo response (world 03):

- Saturated pink/blue/yellow ritual panels in a pinned horizontal track.
- Sticker stack with offset shadows + wobble.
- Desktop-window furniture as UI metaphor.
- **Signature mechanic: sticker stamping** — clicking a sticker stamps it on the page; the stamp persists via localStorage.
- Mobile vertical fallback.

## AIR Center — spatial-architecture

Reference: https://aircenter.space/

What stood out:

- Three glass towers as visual protagonist; you feel like you could hold them.
- Five RenderTarget layers stitched into seamless 2D → 3D → 2D transitions.
- Water reflector that swaps "above water" / "underwater" based on camera Y vs. plane Y.
- "Frozen wave" motif cascades from facade to lobby.
- Proximity index — "1 min walk to mall, 3 min to metro" — grounds the fantasy.
- 8m inclined columns and glass wave ceilings continue the architecture indoors.

Stack: Three.js (tree-shaken) + GSAP + Lenis + Barba.js + Reflector.js (extended from Three.js).

Mechanics distilled: `webgl-3d-scene`, `2d-3d-2d-transition`, `water-reflector`, `scroll-camera-dolly`, `proximity-index`, `axonometric-overlay`, `lenis-smooth-scroll`.

CoolLanding demo response (world 05):

- Axonometric canvas field with a scroll-lowered waterline.
- CSS 3D stacked volume with auto-orbit / pointer-tilt modes.
- Mirrored reflection layer under the volume.
- Proximity index and surveyed coordinate chrome.

## Razorpay Sprint 26 — festival-kinetic

Reference: https://razorpay.com/sprint/26

What stood out:

- Single page with 100+ scroll/click micro-interactions.
- Chapter index (01/A, 01/B, II.) is both navigation and visual skeleton.
- The hero opens with a **giant shoe** — an unexpected anchor object for a fintech / payments launch.
- Each chapter has executive quotes set in large italic.
- Numbered product grids: Agentic Stack → Agentic Payments → Agentic Platform → Agent Studio…
- Rive handles character animation; Three.js + Blender handles the 3D hero.

Stack: Webflow + Rive + Three.js + Blender + GSAP. Two-month design-dev sprint.

Mechanics distilled: `chapter-index-nav`, `rive-character-motion`, `hero-anchor-object`, `executive-quote-block`, `numbered-product-grid`, `scroll-card-reveal`.

CoolLanding demo response (world 06):

- Fixed chapter index and saturated numbered session grid.
- Huge kinetic SPRINT wordmark.
- Original physical pass anchor object that tilts with the pointer.
- Ticket metadata, marquee pulse, and oversized quote beat.

## Aimee's Papercraft World — papercraft-tactile

Reference: https://aimees-papercraft-world.com/

What stood out:

- Scroll-driven character walking a loop path through hand-drawn papercraft scenes.
- Notebook-paper aesthetic. Two-color palette (cream + ink).
- 2D illustrations baked onto low-poly Blender meshes, rendered with React Three Fiber.
- Loop path (Catmull-Rom or Bezier) lets the experience replay infinitely.
- Educational/open-source posture — full code + Blender file on GitHub.

Stack: React Three Fiber + Blender + Krita (2D) + Lenis.

Mechanics distilled: `r3f-baked-illustration`, `scroll-path-character`, `paper-texture-overlay`, `lenis-smooth-scroll`, `chapter-page-flip`.

CoolLanding demo response (world 07):

- Layered cut-paper landscape and paper grain.
- Sticky scroll path with a traveler character.
- Active chapter steps tied to scroll progress.
- Tactile cards with offset shadows and pinned details.

## Cartier Watches & Wonders — luxury-alcove

Reference: https://www.cartier.com/en-fr/watchesandwonders

What stood out:

- Six floating 3D alcoves, each holding a watch.
- Scrolling moves between rooms like a late-night museum walk.
- Each alcove has its own architecture, light, and material (water, mirror, mist, gold).
- Hidden gestures reward curiosity (draw a circle to spin the product).
- Web Audio score (Mooders) as a narrative layer.
- Scenes dispose/load on demand as the user moves through.

Stack: Three.js + Blender + GSAP + Lenis + Web Audio API + Sass.

CoolLanding demo response (world 04):

- Dark, refined atelier; brass + ivory + oxblood palette.
- Italic serif wordmark + brass dividers.
- Glowing concentric ring alcove + gold dust particles.
- **Web Audio drone score** toggle (off by default for accessibility).
- Three numbered alcove rooms (I. II. III.) with material swatches.

Mechanics distilled: `r3f-alcove-rooms`, `webgl-3d-scene`, `water-reflector`, `scroll-camera-dolly`, `web-audio-score`, `hidden-gesture-reward`, `pbr-product-render`.

## Practical Rules Extracted

- Use a real render layer when the reference uses one.
- Make loading, cursor, and scroll part of the art direction.
- Choose either extreme restraint or extreme saturation. Never the safe middle.
- Let typography make layout decisions.
- Use generated assets as focal material, not filler.
- Verify with screenshots and pixel checks before calling the page done.
- **Every project must pick one Style World and commit to it. Never average across worlds for safety.**
- **Every project must invent one Signature Mechanic — something not in the library, only this brand could ship.**

The full anti-template rules, composition strategy, and audit checklist live in [`skill/coollanding/references/anti-template-rules.md`](https://github.com/veithly/CoolLanding-Skill/blob/main/skill/coollanding/references/anti-template-rules.md).
