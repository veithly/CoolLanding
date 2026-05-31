# CoolLanding 参考网站拆解（8 站）

这份笔记总结 CoolLanding 参考的 8 个网站背后的机制。目标不是复制任何一个，而是把它们提炼成可复用的「风格世界 + 机制」框架。完整的机制目录在 [skill 仓库](https://github.com/veithly/CoolLanding-Skill)。

## 当前研究证据

2026-05-29 已重新用 headless Chromium 跑过参考站抓取。公开 HTML、JS、CSS
响应保存到 `research/refs/<site>/`，再扫描 GLSL、RenderTarget、滚动、音频和
资源加载信号。最强的可验证信号如下：

- Sidewave：27 个公开代码资源、1 个 WebGL2 canvas、Unity loader/framework 和 shader 创建调用。
- Active Theory：公开 app bundle 仍能扫到 `curlNoise`、`UnrealBloomPass`、`FBO`、`DataTexture`、`GLTFLoader`、`DRACO`、`Points(`。
- Blit Studio：12 个公开代码资源，含 `THREE`、`ScrollTrigger`、`lenis`、`Howl`、FBO/ping-pong 和 shader-material 信号。
- Remote Rituals：Framer runtime 资源、密集 DOM/SVG 行为、ScrollTrigger/Howler 类信号；本轮探测没有观察到自定义 WebGL canvas。
- AIR Center：公开 bundle 与之前缓存的运行时代码中有 OGL / Barba / Locomotive 类信号。
- Razorpay Sprint 26：13 个公开代码资源、44 个 canvas、页面全局有 `gsap` + `ScrollTrigger`，并有 Three/DRACO/Rive loader 信号。
- Aimee's Papercraft World：R3F、Lenis、ScrollTrigger、Reflector、fbm shader、DRACO 信号。
- Cartier Watches & Wonders：本轮探测没有拿到公开 JS/CSS bundle，所以除非后续抓取暴露资源，否则技术栈只按视觉证据处理，不伪造 bundle 结论。

设计目标是**90% 体感效果相似**，不是代码相同：工艺密度、景深、动效、材质感和具体性要接近参考站，但实现必须是原创 markup 和品牌安全机制。

## Sidewave — cinematic-dark

参考： https://sidewave.it/#origin

关键观察：

- 首屏由一个 WebGL2 canvas 承担主要视觉冲击。
- 入场像一种 loading 仪式：技术感小字、中心物体、进度线。
- 视觉语言基本是黑、白、少量冷色发光。
- 页面很安静，内容越少，中心物体越显得昂贵。
- DOM/UI 层覆盖在实时渲染层之上。

CoolLanding Demo 的对应实现（世界 01）：

- 首屏 WebGL2 shader 场，pointer/scroll/time uniforms。
- loader 数字和进度线。
- mono 状态条和 ASCII 纹理。
- 鼠标和滚动都会改变渲染效果。

## Active Theory — cinematic-dark

参考： https://activetheory.net/

关键观察：

- 它更像互动装置，而不是普通网页文档。
- DOM 很少，画面由 WebGL2、视频和运行时资源承担。
- ticker/code/binary 纹理制造系统氛围。
- 导航极简，不抢主场景。

CoolLanding 的对应：

- shader-first 首屏。
- ASCII 数据云、状态条。
- 固定极简导航。
- 滚动改变场景状态，而不只是移动内容。

## Blit Studio — editorial-interference

参考： https://blit.studio/

关键观察：

- 白场留白非常大胆。
- 巨大的裁切字体就是布局本身，不是装饰。
- 媒体像杂志拼贴一样放置。
- 自定义光标和平滑滚动让页面更像实体。
- 红橙色作为强烈打断。

CoolLanding Demo 的对应实现（世界 02）：

- 白场 editorial 段落配巨型裁切字 "FORKABLE"。
- 斜体衬线标题加 hot-orange 打断词。
- halftone canvas 配光标透镜效果。
- 不对称杂志拼贴网格。
- marquee 跑马灯。

## Remote Rituals — ritual-craft

参考： https://remote-rituals.framer.website/

关键观察：

- 手工感、玩具感、具体性很强。
- Framer/SVG 密度制造出「手工搭出来的小世界」。
- 高饱和色块推动体验。
- 固定全屏横向场景把日常工作变成滚动叙事。

CoolLanding Demo 的对应实现（世界 03）：

- 饱和粉/蓝/黄 ritual panels，固定横向滚动。
- 贴纸堆配偏移阴影 + 摆动效果。
- 桌面窗口元素当 UI 隐喻。
- **签名机制：贴纸盖章** — 点击贴纸，它会在屏幕任意位置盖一个章，并且 localStorage 持久化。
- 移动端垂直堆叠 fallback。

## AIR Center — spatial-architecture

参考： https://aircenter.space/

关键观察：

- 三栋玻璃塔成为视觉主角，体感像真的能拿在手里。
- 5 个 RenderTarget 实现 2D → 3D → 2D 无缝切换。
- 水面反射通过相机 Y 位置对比平面 Y 位置实现「水上/水下」切换。
- 「frozen wave」立面隐喻贯穿建筑和大堂。
- 用「1 分钟走路到 Mall、3 分钟走路到地铁」的真实地理索引扎根。
- 8 米倾斜柱子和玻璃波形天花板让室内是建筑的延续。

技术栈：Three.js（tree-shaken）+ GSAP + Lenis + Barba.js + 扩展自 Three.js 的 Reflector.js。

机制提炼：`webgl-3d-scene`、`2d-3d-2d-transition`、`water-reflector`、`scroll-camera-dolly`、`proximity-index`、`axonometric-overlay`、`lenis-smooth-scroll`。

CoolLanding Demo 的对应实现（世界 05）：

- axonometric canvas 场，滚动会降低水线。
- CSS 3D 堆叠体块，支持 auto-orbit / pointer-tilt 两种模式。
- 体块下方有镜像反射层。
- proximity index 和测绘坐标 chrome。

## Razorpay Sprint 26 — festival-kinetic

参考： https://razorpay.com/sprint/26

关键观察：

- 单页带 100+ scroll/click 触发的微交互。
- 章节索引（01/A, 01/B, II.）既是导航也是视觉骨架。
- 首屏开场是一个**巨大的鞋子** — 一个完全意想不到的物体来锚定一个 fintech / 支付发布。
- 每章都有高管引言用大字斜体呈现。
- 子章节产品网格：Agentic Stack → Agentic Payments → Agentic Platform → Agent Studio...
- Rive 处理人物动画，Three.js + Blender 处理 3D Hero。

技术栈：Webflow + Rive + Three.js + Blender + GSAP。两个月设计-开发 sprint。

机制提炼：`chapter-index-nav`、`rive-character-motion`、`hero-anchor-object`、`executive-quote-block`、`numbered-product-grid`、`scroll-card-reveal`。

CoolLanding Demo 的对应实现（世界 06）：

- 固定 chapter index 和高饱和编号 session grid。
- 巨型 SPRINT kinetic wordmark。
- 原创实体 pass 锚定物，随指针倾斜。
- ticket metadata、marquee pulse 和大号 quote beat。

## Aimee's Papercraft World — papercraft-tactile

参考： https://aimees-papercraft-world.com/

关键观察：

- 滚动驱动角色沿一个循环路径走过手绘 papercraft 场景。
- 笔记本纸张美学。2 色调色板（米色 + 墨色）。
- 2D 插画烘焙到 Blender 低模上，React Three Fiber 渲染。
- 循环路径（Catmull-Rom 或 Bezier）让体验可以无限重放。
- 教育 / 开源属性（GitHub 上有完整代码 + Blender 文件）。

技术栈：React Three Fiber + Blender + Krita（2D）+ Lenis。

机制提炼：`r3f-baked-illustration`、`scroll-path-character`、`paper-texture-overlay`、`lenis-smooth-scroll`、`chapter-page-flip`。

CoolLanding Demo 的对应实现（世界 07）：

- 分层 cut-paper landscape 和纸张颗粒。
- sticky scroll path，角色沿路径移动。
- chapter steps 跟随滚动进度切换。
- 带偏移阴影和 pinned 细节的触感卡片。

## Cartier Watches & Wonders — luxury-alcove

参考： https://www.cartier.com/en-fr/watchesandwonders

关键观察：

- 6 个漂浮的 3D 壁龛，每一个对应一只表。
- 滚动在房间之间穿行，像深夜博物馆。
- 每个壁龛有自己的建筑、光、材质（水、镜面、雾、金）。
- 隐藏的交互手势奖励好奇心（画圆圈旋转产品）。
- Web Audio 配乐（Mooders）作为叙事层。
- 穿越壁龛时场景会按需 dispose 和 load。

技术栈：Three.js + Blender + GSAP + Lenis + Web Audio API + Sass。

CoolLanding Demo 的对应实现（世界 04）：

- 暗色精致的 atelier，brass + ivory + oxblood 色板。
- 斜体衬线字标 + brass 分割线。
- 发光同心环壁龛 + 金色尘埃粒子。
- **Web Audio drone 配乐**开关（默认关闭，符合可访问性）。
- 三个编号壁龛房间（I. II. III.）配材质样本。

机制提炼：`r3f-alcove-rooms`、`webgl-3d-scene`、`water-reflector`、`scroll-camera-dolly`、`web-audio-score`、`hidden-gesture-reward`、`pbr-product-render`。

## 提炼出的规则

- 参考站用真实渲染层，就不要用静态图假装。
- loading、光标、滚动都应该是设计的一部分。
- 色彩要么极克制，要么极饱和，不要平均成平庸。
- 让字体决定构图。
- 生成素材要成为焦点，而不是填空装饰。
- 完成前必须用截图和像素检查验证。
- **每一个项目必须挑一个风格世界并坚持，不要把 8 个世界混成「安全平均值」**。
- **每一个项目必须发明一个签名机制——这个目录里没有的、只属于这个品牌的一个机制**。

完整的反模板规则、组合策略和审计清单见 [`skill/coollanding/references/anti-template-rules.md`](https://github.com/veithly/CoolLanding-Skill/blob/main/skill/coollanding/references/anti-template-rules.md)。
