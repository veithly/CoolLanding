# CoolLanding

**CoolLanding 是一个开源的 WebGL 酷炫 Landing Page 参考实现，目标是让首屏像互动装置，而不是普通模板。**

它包含 shader 驱动的黑场首屏、动态排版、自定义光标、白场杂志式拼贴、本地生成素材，以及类似 Framer 作品的固定横向滚动叙事。配套的 [CoolLanding Skill](https://github.com/veithly/CoolLanding-Skill) 会把这些研究和制作流程沉淀成可复用的 Codex skill。

如果这个 skill 对你有帮助，欢迎去 [CoolLanding Skill 仓库点 Star](https://github.com/veithly/CoolLanding-Skill)。Star 越多，越容易被其他需要酷炫 Landing Page 的人看到。

[English README](README.md)

## 预览

![CoolLanding WebGL hero](docs/screenshots/coollanding-hero-desktop.png)

![CoolLanding editorial section](docs/screenshots/coollanding-editorial-desktop.png)

![CoolLanding ritual scroll section](docs/screenshots/coollanding-ritual-desktop.png)

移动端会保留视觉性格，同时避免横向溢出：

![CoolLanding mobile hero](docs/screenshots/coollanding-hero-mobile.png)

## 为什么做这个

很多 AI 生成的 Landing Page 会停在渐变、玻璃卡片、空泛文案。真正高级的参考网站不是这样做的：

- 它们把浏览器当成实时舞台。
- 它们用滚动控制场景。
- 它们让字体本身成为构图。
- 它们把留白、尺度、光标、动效和素材放进同一个系统。

CoolLanding 是一个尽量轻量、可 fork、无框架依赖的参考实现。

## 参考研究

设计和动效来自对这些网站的实看与拆解：

- [Sidewave](https://sidewave.it/#origin)：黑场、WebGL2 origin 物体、loading/progress 仪式、极少量系统文字。
- [Active Theory](https://activetheory.net/)：稀疏 DOM、WebGL2 舞台、视频和运行时资源、ASCII/data 纹理。
- [Blit Studio](https://blit.studio/)：白场 editorial 排版、巨大裁切字体、自定义光标、媒体拼贴。
- [Remote Rituals](https://remote-rituals.framer.website/)：高饱和玩具感、Framer/SVG 密度、固定横向场景。

详细拆解见 [docs/reference-analysis.zh-CN.md](docs/reference-analysis.zh-CN.md)。

## 特性

- WebGL2 fragment shader 首屏，响应鼠标和滚动。
- 高级工作室网站常见的 loader/progress 入场。
- ASCII/data 纹理和状态条。
- 文字 scramble 动效。
- 自定义光标、磁吸按钮、spotlight mask。
- 使用本地生成图片的白场 editorial 拼贴段落。
- 桌面端固定横向 ritual 场景。
- 移动端完整垂直 fallback。
- 支持 `prefers-reduced-motion`。
- 已做浏览器截图和像素级 canvas 检查。

## 项目结构

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

## 本地运行

这是一个静态网站，任意静态服务都可以：

```bash
python -m http.server 4173 --bind 127.0.0.1
```

然后打开：

```text
http://127.0.0.1:4173/
```

## 配套 Skill

网站是最终效果，skill 是可复用的制作方法。

当你想让 Codex 做一个真正有参考级视觉和动效的 Landing Page，可以使用 [CoolLanding Skill](https://github.com/veithly/CoolLanding-Skill)。

示例请求：

```text
Use the CoolLanding skill to build a landing page for my product.
Study these references, generate project-bound visuals, implement the page,
and verify it with desktop/mobile screenshots.
```

如果你觉得这个方向有用，欢迎给 skill 仓库点 Star：

```text
https://github.com/veithly/CoolLanding-Skill
```

## 验证结果

当前 QA 覆盖：

- 桌面端截图。
- 移动端截图。
- WebGL2 可用性检查。
- canvas 非空像素检查。
- 图片加载检查。
- console/page error 检查。
- 横向溢出检查。
- 可见文字溢出扫描。

最新本地结果：

```text
desktop: WebGL2 OK, canvas nonblank, images loaded, no console errors, no overflow
mobile:  WebGL2 OK, canvas nonblank, images loaded, no console errors, no overflow
```

## License

MIT.
