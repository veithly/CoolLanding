# CoolLanding 参考网站拆解

这份笔记总结 CoolLanding 参考的几个网站背后的机制。目标不是复制它们，而是提炼可复用的制作方法。

## Sidewave

参考： https://sidewave.it/#origin

关键观察：

- 首屏由一个 WebGL2 canvas 承担主要视觉冲击。
- 入场像一种 loading 仪式：技术感小字、中心物体、进度线。
- 视觉语言基本是黑、白、少量冷色发光。
- 页面很安静，内容越少，中心物体越显得昂贵。
- DOM/UI 层覆盖在实时渲染层之上。

CoolLanding 的对应实现：

- 首屏 WebGL2 shader 场。
- loader 数字和进度线。
- mono 状态条和 ASCII 纹理。
- 鼠标和滚动都会改变渲染效果。

## Active Theory

参考： https://activetheory.net/

关键观察：

- 它更像互动装置，而不是普通网页文档。
- DOM 很少，画面由 WebGL2、视频和运行时资源承担。
- ticker/code/binary 纹理制造系统氛围。
- 导航极简，不抢主场景。

CoolLanding 的对应实现：

- shader-first 首屏。
- 数据云、查询链接、状态条。
- 固定极简导航。
- 滚动改变场景状态，而不只是移动内容。

## Blit Studio

参考： https://blit.studio/

关键观察：

- 白场留白非常大胆。
- 巨大的裁切字体就是布局本身，不是装饰。
- 媒体像杂志拼贴一样放置。
- 自定义光标和平滑滚动让页面更像实体。
- 红橙色作为强烈打断。

CoolLanding 的对应实现：

- 黑场之后进入白场 editorial section。
- 巨大裁切单词和压缩展示字体。
- 生成的 interference poster 加 spotlight mask。
- 自定义光标和磁吸按钮。
- 用橙色作为尖锐打断。

## Remote Rituals

参考： https://remote-rituals.framer.website/

关键观察：

- 手工感、玩具感、具体性很强。
- Framer/SVG 密度制造出“手工搭出来的小世界”。
- 高饱和色块推动体验。
- 固定全屏横向场景把日常工作变成滚动叙事。

CoolLanding 的对应实现：

- 高饱和 ritual panels。
- 生成的玩具感 3D 团队素材。
- 桌面端横向 pinned scene。
- 移动端垂直堆叠 fallback，保证可读性。

## 提炼出的规则

- 参考站用真实渲染层，就不要用静态图假装。
- loading、光标、滚动都应该是设计的一部分。
- 色彩要么极克制，要么极饱和，不要平均成平庸。
- 让字体决定构图。
- 生成素材要成为焦点，而不是填空装饰。
- 完成前必须用截图和像素检查验证。
