# OpenArcade

一个为她而建、也向所有人开放的可插拔微游戏厅。

OpenArcade 把游戏门户与具体游戏彻底分开。宿主统一管理游戏列表、生命值、最高分、暂停、重开和未来的商业化适配；小游戏可以使用 React/Canvas/Phaser 动态加载，也可以把 Godot、Unity 等 Web 导出物放进 sandbox iframe，通过同一套版本化协议通信。

## 当前内容

- **琉璃分色**：可玩的倒水排序逻辑游戏，展示动态模块接入、状态机、撤销、计分和胜利事件。
- **星点节拍**：可玩的 iframe 街机游戏，展示隔离运行与 postMessage Bridge。
- **花笺成双**：预留卡带，展示未发布游戏状态。
- **宿主能力**：本地生命值、最高分、暂停、静音、全屏、重试耗尽和模拟激励奖励。

## 技术栈

- React 19 + TypeScript + Vite 8
- Zod 运行时清单与消息校验
- Lucide 图标
- Vitest + Testing Library
- 原生 CSS 响应式设计，无运行时样式依赖

## 快速开始

要求 Node.js 22.19+。

```bash
npm install
npm run dev
```

常用检查：

```bash
npm run test
npm run lint
npm run build
npm run preview
```

## 架构

```text
src/platform/manifest.ts     游戏清单和展示元数据
src/platform/types.ts        GameManifest、事件和命令类型
src/platform/protocol.ts     openarcade:v1 iframe 消息协议
src/platform/storage.ts      可替换的本地玩家数据适配器
src/components/GameHost.tsx  dynamic import / iframe 双加载器
src/games/                   与宿主解耦的原生游戏模块
public/games/                Godot/Unity/独立 HTML 构建产物
```

接入细节和 Godot 示例见 [游戏接入指南](docs/adding-a-game.md)。贡献前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 商业化边界

当前生命值与奖励只用于展示完整产品流程，数据保存在 localStorage，奖励按钮只播放本地模拟流程。正式接入广告或支付前，应把账户、次数扣减、订单和广告服务商回调迁移到可信服务端，并确保接口幂等、签名可验证。

## 版权说明

开源不等于免除版权责任。玩法机制通常与具体代码、素材、商标的保护边界不同，但本项目不接收从商业游戏提取的代码、美术、音频、名称或关卡数据。每个贡献者必须拥有所提交内容的权利，或提供清晰、兼容的开源许可证来源。

## License

[MIT](LICENSE) © OpenArcade contributors
