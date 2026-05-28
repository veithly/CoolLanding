# CoolLanding

**CoolLanding is an open-source, WebGL-driven landing page reference built for people who want the first screen to feel like an interactive installation, not a template.**

It combines a shader-based dark hero, kinetic typography, a custom cursor, editorial white-space collision, generated local assets, and a pinned ritual-style scroll section. The companion [CoolLanding Skill](https://github.com/veithly/CoolLanding-Skill) turns the research and build process into reusable Codex instructions.

If the skill helps you build a better landing page, please [star the skill repo](https://github.com/veithly/CoolLanding-Skill). It makes the signal easier for other builders to find.

[Live demo](https://veithly.github.io/CoolLanding/) · [Skill repo](https://github.com/veithly/CoolLanding-Skill) · [中文 README](README.zh-CN.md)

## Preview

![CoolLanding WebGL hero](docs/screenshots/coollanding-hero-desktop.png)

![CoolLanding editorial section](docs/screenshots/coollanding-editorial-desktop.png)

![CoolLanding ritual scroll section](docs/screenshots/coollanding-ritual-desktop.png)

Mobile keeps the same personality without horizontal overflow:

![CoolLanding mobile hero](docs/screenshots/coollanding-hero-mobile.png)

## Why This Exists

Most generated landing pages stop at gradients, glass cards, and a vague hero sentence. The reference sites that inspired CoolLanding do something different:

- They use the browser as a real-time stage.
- They treat scroll as a scene controller.
- They make typography carry the composition.
- They use silence, scale, cursor behavior, and generated/curated media as part of one system.

CoolLanding is a compact open-source example of that approach, with no framework required.

## Reference Study

The design was informed by a hands-on inspection of:

- [Sidewave](https://sidewave.it/#origin): black void, WebGL2 origin object, loading/progress ritual, tiny system text.
- [Active Theory](https://activetheory.net/): sparse DOM, WebGL2 stage, video/runtime asset loading, ASCII/data texture.
- [Blit Studio](https://blit.studio/): editorial white space, huge cropped type, custom cursor, video/media collisions.
- [Remote Rituals](https://remote-rituals.framer.website/): saturated toy-like world, Framer/SVG density, pinned horizontal scenes.

Read the deeper breakdown in [docs/reference-analysis.md](docs/reference-analysis.md).

## Features

- WebGL2 fragment shader hero with pointer and scroll uniforms.
- Loader/progress sequence inspired by high-end studio sites.
- ASCII/data texture and status strip for a system-like feel.
- Kinetic display type with scramble interaction.
- Custom cursor, magnetic buttons, and spotlight mask.
- Editorial white-field section using generated local imagery.
- Pinned horizontal ritual section on desktop.
- Mobile fallback that stacks scenes cleanly.
- `prefers-reduced-motion` support.
- Browser QA screenshots and pixel checks.

## Project Structure

```text
CoolLanding/
├── index.html
├── styles.css
├── main.js
├── assets/
│   └── generated/
│       ├── interference-poster.png
│       └── ritual-platform.png
├── docs/
│   ├── reference-analysis.md
│   ├── reference-analysis.zh-CN.md
│   └── screenshots/
├── README.md
├── README.zh-CN.md
└── LICENSE
```

## Run Locally

This is a static site. Any local static server works:

```bash
python -m http.server 4173 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:4173/
```

## Companion Skill

The website is the artifact. The skill is the repeatable process.

Use [CoolLanding Skill](https://github.com/veithly/CoolLanding-Skill) when you want Codex to build a cinematic landing page with real research, generated assets, WebGL/canvas effects, kinetic typography, scroll choreography, and visual QA.

```text
Use the CoolLanding skill to build a landing page for my product.
Study these references, generate project-bound visuals, implement the page,
and verify it with desktop/mobile screenshots.
```

Please star the skill repo if you want more builders to discover it:

```text
https://github.com/veithly/CoolLanding-Skill
```

## Verification

Current QA checks:

- Desktop screenshot capture.
- Mobile screenshot capture.
- WebGL2 availability check.
- Canvas nonblank pixel check.
- Image load check.
- Console/page error check.
- Horizontal overflow check.
- Visible text overflow scan.

Latest local result:

```text
desktop: WebGL2 OK, canvas nonblank, images loaded, no console errors, no overflow
mobile:  WebGL2 OK, canvas nonblank, images loaded, no console errors, no overflow
```

## License

MIT.
