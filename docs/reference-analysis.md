# CoolLanding Reference Analysis

This note summarizes the mechanisms behind the reference sites that shaped CoolLanding. The goal is not to clone any of them, but to preserve the production lessons.

## Sidewave

Reference: https://sidewave.it/#origin

What stood out:

- One WebGL2 canvas owns the first impression.
- The page opens with a loading ritual: tiny technical copy, centered object, progress line.
- The visual language is mostly black, white, and a small amount of cold glow.
- The interface is quiet. The absence of content makes the central object feel more expensive.
- DOM/UI layers sit above a real-time render layer.

CoolLanding response:

- WebGL2 shader field in the hero.
- Loader count and progress line.
- Sparse mono status strip and ASCII texture.
- Pointer and scroll uniforms that change the rendered field.

## Active Theory

Reference: https://activetheory.net/

What stood out:

- The site behaves more like an interactive installation than a document.
- DOM is sparse; the screen is carried by WebGL2, video, and runtime assets.
- Ticker/code marks and binary-like texture create a system atmosphere.
- Navigation is minimal and does not compete with the scene.

CoolLanding response:

- Shader-first first viewport.
- Data cloud, query links, status strips.
- Minimal fixed navigation with high contrast.
- Scroll modifies the scene rather than only moving content.

## Blit Studio

Reference: https://blit.studio/

What stood out:

- White space is used aggressively.
- Huge cropped typography is the layout, not decoration.
- Media is placed like editorial collage.
- A custom cursor and smooth-scroll behavior make the page feel physical.
- Red/orange accents interrupt the page with confidence.

CoolLanding response:

- White editorial section after the black hero.
- Huge cropped word and compressed display type.
- Generated interference poster with spotlight mask.
- Custom cursor and magnetic controls.
- Orange accent used as a sharp interruption.

## Remote Rituals

Reference: https://remote-rituals.framer.website/

What stood out:

- It feels handmade, playful, and highly specific.
- Framer/SVG density creates a crafted toy-world feeling.
- Saturated color panels drive the experience.
- Full-viewport pinned/horizontal scenes turn daily work into a scroll narrative.

CoolLanding response:

- Saturated ritual panels.
- Generated toy-like 3D team asset.
- Horizontal pinned scene on desktop.
- Mobile stacked fallback to preserve readability.

## Practical Rules Extracted

- Use a real render layer when the reference uses one.
- Make loading, cursor, and scroll part of the art direction.
- Choose either extreme restraint or extreme saturation.
- Let typography make layout decisions.
- Use generated assets as focal material, not filler.
- Verify with screenshots and pixel checks before calling the page done.
