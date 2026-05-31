# CoolLanding

**CoolLanding is an open-source live demo and anti-template framework for building cinematic landing pages that are unique to each brand, not stamped out of a template.**

The site is a **multi-world switcher** — switch the nav at the top between eight completely different visual languages and watch the entire page transform: palette, type, motion, background renderer, cursor, signature mechanic. It exists to prove the companion [CoolLanding Skill](https://github.com/veithly/CoolLanding-Skill) is a framework, not a template.

If the skill helps you build a better launch page, please [star the skill repo](https://github.com/veithly/CoolLanding-Skill). It makes the signal easier for other builders to find.

[Live demo](https://veithly.github.io/CoolLanding/) · [Skill repo](https://github.com/veithly/CoolLanding-Skill) · [中文 README](README.zh-CN.md)

## Preview

World 01 — **Cinematic Dark** (Sidewave / Active Theory):

![Cinematic Dark world](docs/screenshots/coollanding-hero-desktop.png)

World 02 — **Editorial Interference** (Blit Studio):

![Editorial Interference world](docs/screenshots/coollanding-editorial-desktop.png)

World 03 — **Ritual Craft** (Remote Rituals):

![Ritual Craft world](docs/screenshots/coollanding-ritual-desktop.png)

World 04 — **Luxury Alcove** (Cartier Watches & Wonders):

![Luxury Alcove world](docs/screenshots/coollanding-luxury-desktop.png)

Mobile keeps each world's personality without horizontal overflow:

![CoolLanding mobile hero](docs/screenshots/coollanding-hero-mobile.png)

## Why This Exists

Most generated landing pages stop at gradient blobs, glass cards, and a vague hero sentence. The reference sites that inspired CoolLanding do something different:

- They use the browser as a real-time stage.
- They treat scroll as a scene controller.
- They make typography carry the composition.
- They use silence, scale, cursor behavior, and generated/curated media as part of one system.
- They each pick **one** strong visual language and commit. Not the average of three.

CoolLanding is a compact open-source example of that approach, with no framework required. The demo is a runtime proof that one skill can yield eight totally different worlds.

## The Eight Style Worlds (all live in the demo)

The companion skill defines eight Style Worlds. All eight are implemented as live switchable demos in this site:

| # | World | Live in demo? | Inspired by |
|---|-------|---------------|-------------|
| 01 | cinematic-dark | yes | Sidewave, Active Theory |
| 02 | editorial-interference | yes | Blit Studio |
| 03 | ritual-craft | yes | Remote Rituals |
| 04 | luxury-alcove | yes | Cartier Watches & Wonders |
| 05 | spatial-architecture | yes | AIR Center |
| 06 | festival-kinetic | yes | Razorpay Sprint 26 |
| 07 | papercraft-tactile | yes | Aimee's Papercraft World |
| 08 | generative-system | yes | custom |

Read the full catalog in the skill repo's [`style-worlds.md`](https://github.com/veithly/CoolLanding-Skill/blob/main/skill/coollanding/references/style-worlds.md). Each world has its own color logic, type system, motion grammar, layout grammar, asset strategy, and recommended mechanic shortlist.

## Reference Study (8 sites)

The design framework was informed by hands-on inspection of:

- [Sidewave](https://sidewave.it/#origin) — black void, WebGL2 origin object, loading ritual, tiny system text.
- [Active Theory](https://activetheory.net/) — sparse DOM, WebGL2 stage, video/runtime asset loading, ASCII/data texture.
- [Blit Studio](https://blit.studio/) — editorial white space, huge cropped type, custom cursor, video/media collisions.
- [Remote Rituals](https://remote-rituals.framer.website/) — saturated toy-like world, Framer/SVG density, pinned horizontal scenes.
- [AIR Center](https://aircenter.space/) — 2D↔3D↔2D RenderTarget transitions, water reflector, panoramic glass.
- [Razorpay Sprint 26](https://razorpay.com/sprint/26) — 100+ scroll/click triggers, chapter index (01/A...), B2B-as-consumer.
- [Aimee's Papercraft World](https://aimees-papercraft-world.com/) — scrollytelling along a character path through baked 2D-on-3D scenes.
- [Cartier Watches & Wonders](https://www.cartier.com/en-fr/watchesandwonders) — six dreamlike 3D alcoves, hidden gestures, Web Audio score.

Read the deeper breakdown in [docs/reference-analysis.md](docs/reference-analysis.md) and in the skill's [`reference-sites.md`](https://github.com/veithly/CoolLanding-Skill/blob/main/skill/coollanding/references/reference-sites.md).

## Features in this demo

- **Switchable worlds** via top nav: 8 completely different visual languages share one DOM.
- **World 01 — Cinematic Dark**: WebGL2 fragment shader with pointer/scroll/time uniforms, loader ritual, ASCII data overlay, scramble title, system status strip.
- **World 02 — Editorial Interference**: paper field, huge cropped "FORKABLE" wordmark, italic serif headline with hot-orange interrupt, halftone canvas + cursor lens, asymmetric magazine tile grid, marquee ticker.
- **World 03 — Ritual Craft**: saturated pink/blue/yellow panels, sticker stack with offset shadows + wobble, **signature sticker stamp** (click a sticker, it stamps the screen and persists across reloads), pinned horizontal scroll panels with desktop-window UI metaphor.
- **World 04 — Luxury Alcove**: dark refined atelier, brass + ivory + oxblood palette, italic serif type, glowing alcove with concentric rings, golden dust particle field, **Web Audio drone score** toggle, three numbered alcove rooms (I., II., III.) with material swatches.
- **World 05 — Spatial Architecture**: axonometric field canvas, CSS 3D stacked volume, scroll-driven waterline, mirrored reflection layer, proximity index, pointer tilt / auto-orbit toggle.
- **World 06 — Festival Kinetic**: chapter index, huge kinetic type, physical pass anchor object with pointer tilt, ticket-stub metadata, quote beat, saturated numbered card grid.
- **World 07 — Papercraft Tactile**: layered paper landscape, sticky scroll path, character traveler, paper texture, pinned chapter steps, tactile cards.
- **World 08 — Generative System**: seeded canvas flow-field, parameter sidebar, URL seed state, shuffle/copy/export controls, live particle/FPS readout.
- Custom cursor that adapts to each world (mix-blend-mode difference / orange lens / yellow stamp / brass dot).
- World persistence via `localStorage`, audio off by default per accessibility.
- `prefers-reduced-motion` support across all worlds.
- Mobile fallback that stacks scenes cleanly per world.

## Project Structure

```text
CoolLanding/
├── index.html              # multi-world DOM
├── styles.css              # base + per-world themes
├── main.js                 # world switcher + canvas/WebGL renderers + signature mechanics
├── assets/
│   └── generated/          # bitmap/photo assets used by worlds
├── docs/
│   ├── reference-analysis.md
│   └── screenshots/
├── README.md
├── README.zh-CN.md
└── LICENSE
```

## Run Locally

```bash
python -m http.server 5174 --bind 127.0.0.1
```

Open `http://127.0.0.1:5174/` and click the world buttons in the top nav.

## Companion Skill

The website is the artifact. The skill is the repeatable process.

Use [CoolLanding Skill](https://github.com/veithly/CoolLanding-Skill) when you want an agent to compose a unique cinematic landing page: diagnose the brand, pick one Style World, mix 2–4 mechanics that fit, invent a Signature Mechanic, generate project-bound assets, implement it, audit against the anti-template checklist.

```text
Use CoolLanding to build a launch page for <brand>.
Diagnose the brand, pick exactly one Style World, compose 2-4 mechanics that fit,
invent a Signature Mechanic only this brand could ship, generate project-bound
visuals, implement, then run the anti-template audit before finishing.
```

Please star the skill repo if you want more builders to discover it:

```text
https://github.com/veithly/CoolLanding-Skill
```

## Verification

Current QA checks:

- Desktop and mobile screenshot capture per world.
- World switcher functional and persistent across reload.
- WebGL2 cinematic-dark renderer: canvas nonblank pixel check.
- Editorial halftone canvas: cursor lens visible on hover.
- Ritual sticker stamps: spawn on click + animate + persist in localStorage.
- Luxury Web Audio score: starts on user gesture, ramps cleanly.
- No console errors, no horizontal overflow, no text overlap.
- `prefers-reduced-motion` disables heavy animation across all worlds.

Latest local result (visually verified in headless browser at 1024px desktop + 414px mobile):

```text
world 01 (cinematic-dark)        ok  WebGL2 shader, ASCII cloud, cool landing wordmark, no copy/title overlap
world 02 (editorial-interference) ok  paper field, FORKABLE ghost, cursor lens, marquee, 3 meta columns
world 03 (ritual-craft)           ok  5 stickers, wobble on click, sticker-stamp signature mechanic, persists 9s
world 04 (luxury-alcove)          ok  3 concentric rings + brass core, audio toggle, 3 alcove rooms (I/II/III)
world 05 (spatial-architecture)   ok  axonometric canvas, mirrored volume, waterline, proximity index
world 06 (festival-kinetic)       ok  chapter index, kinetic pass anchor, marquee, quote, numbered cards
world 07 (papercraft-tactile)     ok  layered paper scene, scroll-path traveler, active chapter steps
world 08 (generative-system)      ok  seeded flow field, controls, URL state, PNG export
persistence                       ok  data-world restored from localStorage after reload
mobile (414x896)                  ok  no horizontal overflow, content wraps, switcher collapses to numbers
console                           ok  no errors, no warnings
```

## License

MIT.
