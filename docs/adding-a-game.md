# 游戏接入指南

OpenArcade 支持两种卡带。轻量 Web 游戏优先使用动态模块；拥有独立构建产物、WASM 或引擎运行时的游戏使用 iframe。

## 动态模块

1. 在 `src/games/<game-id>/` 创建游戏组件。
2. 组件接收 `GameModuleProps`，只通过 `emit` 报告状态。
3. 在 `GameHost.tsx` 的 `moduleRegistry` 注册动态 import。
4. 在 `platform/manifest.ts` 添加 `loader: 'module'` 的清单。

游戏事件：`ready`、`started`、`score`、`completed`、`failed`、`request-restart`。

宿主命令：`start`、`pause`、`resume`、`restart`、`mute`。

游戏不应直接读取或修改生命值、登录、订单和广告状态。这些能力属于宿主。

## iframe / Godot Web

把完整导出目录放到 `public/games/<game-id>/`，并在清单中配置：

```ts
{
  id: 'my-godot-game',
  loader: 'iframe',
  src: '/games/my-godot-game/index.html',
  // 其余展示字段
}
```

iframe 向宿主发送：

```js
parent.postMessage({
  protocol: 'openarcade:v1',
  source: 'game',
  event: { type: 'completed', score: 1200 },
}, location.origin)
```

监听宿主命令：

```js
window.addEventListener('message', (message) => {
  if (message.origin !== location.origin) return
  const payload = message.data
  if (payload?.protocol !== 'openarcade:v1' || payload?.source !== 'host') return
  if (payload.command.type === 'restart') restartGame()
})
```

Godot 4 可通过 `JavaScriptBridge.get_interface("parent")` 调用父页面的 `postMessage`，或在导出模板中放置一层 JavaScript adapter。保留协议 envelope，不要让 GDScript 依赖宿主页面 DOM。

## 清单要求

- `id` 只使用小写字母、数字和连字符，并保持永久稳定。
- 动态模块必须能被代码分割，不得把大型引擎放进主包。
- iframe 必须支持宿主同源部署，并在自己的 viewport 内响应式布局。
- 游戏必须在收到重复 `restart` 时安全重置。
- 所有用户可见素材需原创、公共领域或有兼容许可证。

## 提交前验证

```bash
npm run test
npm run lint
npm run build
```
