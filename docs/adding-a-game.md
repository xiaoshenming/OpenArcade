# 游戏接入指南

## 选择运行时

未知贡献者和独立 HTML 游戏必须选择 `opaque-origin` iframe。只有维护者审核过、确实需要最低延迟的轻量游戏才能选择 `trusted-module`。Godot/WASM 若无法在 opaque origin 下通过 CORS 加载资源，可申请 `trusted-same-origin`，但需要额外安全审查。

## 创建描述文件

新增 `src/games/<id>/game.json`。Vite 会自动发现，无需修改中央清单或加载器。

```json
{
  "id": "my-game",
  "sdkVersion": 1,
  "gameVersion": "1.0.0",
  "owner": "@github-name",
  "license": "MIT",
  "title": "游戏名称",
  "shortTitle": "短名称",
  "description": "一句玩法说明。",
  "category": "arcade",
  "accent": "#12aabb",
  "order": 10,
  "status": "ready",
  "levelCount": 30,
  "instructions": ["规则说明一。", "规则说明二。"],
  "highlights": ["入门章节", "终局试炼"],
  "scorePolicy": { "max": 10000, "eventsPerSecond": 30 },
  "loader": "iframe",
  "entry": "/games/my-game/index.html",
  "isolation": "opaque-origin",
  "permissions": []
}
```

描述文件会校验目录名、重复 ID、SDK 版本、颜色、文本长度、权限和分数策略。可选的 `instructions`（2–6 条）和 `highlights`（1–8 条）用于宿主游戏大厅；旧卡带省略时使用兼容文案。

## 登记素材

同目录必须提供 `assets.json`：

```json
{
  "assets": [
    {
      "path": "public/games/my-game/assets/click.ogg",
      "author": "Author",
      "license": "CC0-1.0",
      "source": "https://example.com/source",
      "sha256": "完整的 SHA-256 十六进制摘要"
    }
  ]
}
```

路径从仓库根目录开始。CI 会校验文件存在、SHA-256、SPDX allowlist，并要求 public 游戏目录里的每个文件都被登记。只使用原创、MIT、Apache-2.0 或 CC0-1.0 内容。

## trusted-module

创建严格命名的 `Game.tsx`，默认导出接收 `GameModuleProps` 的组件。游戏只通过 `emit` 报告事件：

- `ready`、`started`
- `score`、`completed`、`failed`
- `request-restart`

组件必须处理 `paused`、`muted` 和重新挂载。渐进游戏通过可选的 `level` prop 读取宿主锁定的当前关卡；完成事件只报告分数，不能报告或解锁关卡。它与宿主共享 DOM 和主线程，不是安全沙箱。

## opaque iframe

把静态产物放到 `public/games/<id>/`，在 HTML 中加载宿主提供的 SDK：

```html
<script src="/sdk/openarcade-v1.js"></script>
<script src="/games/my-game/app.js"></script>
```

```js
const sdk = OpenArcade.createSdk({ onCommand(command) {
  if (command.type === 'pause') pauseGame()
  if (command.type === 'restart') restartGame()
  if (command.type === 'load-level') { loadLevel(command.level); sdk.started() }
} })
sdk.ready()
sdk.score(100)
sdk.complete(800)
```

`levelCount` 是可选字段，省略时兼容为单关游戏。渐进 iframe 在 `ready` 后等待宿主发送一次 `load-level`，暂停和静音不能重载关卡。宿主拥有选关、解锁与“下一关”；游戏不能请求切关。SDK 会排队早期事件，在随机 channel 握手成功后转移专属 MessagePort。不要访问 `parent.document`，不要自己实现生命值、广告或支付。

## Godot

Godot Web adapter 应把 GDScript 事件转发给同一 SDK。优先将构建部署到具备正确 CORS/CORP 头的独立游戏源；确需同源 WASM 加载时声明 `trusted-same-origin` 并由维护者审查。

## 提交验证

```bash
npm run check
```

PR 还必须附带桌面和移动端截图，并说明包体积变化。
