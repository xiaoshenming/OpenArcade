# OpenArcade

一个为她而建、也向所有人开放的可插拔微游戏厅。

OpenArcade 将门户、宿主策略和具体游戏分开。宿主管理卡带发现、生命周期、生命值、最高分和未来商业化；游戏通过 SDK v1 接入，不直接接触宿主状态。

## 当前卡带

- **琉璃分色**：可信动态模块，展示倒水状态机、撤销、计分和胜利事件。
- **星点节拍**：opaque iframe，展示 sandbox、随机 channel 和 MessagePort 通信。
- **花笺成双**：预留卡带，展示未发布状态。

## 技术基线

- React 19、TypeScript 6、Vite 8
- Zod 描述文件和协议校验
- 自动游戏发现与代码分割
- Vitest、ESLint、CodeQL、GitHub Actions
- CSP、Permissions Policy、CODEOWNERS 和性能预算

## 快速开始

要求 Node.js 22.19.x 与 npm 11.6.2。

```bash
npm install
npx playwright install chromium
npm run dev
```

合并前运行唯一完整门禁：

```bash
npm run check
```

它依次执行 24 个单元/集成测试、零警告 Lint、TypeScript 生产构建、300 行与资产哈希/许可证/包体门禁，以及桌面和移动 Chromium 的 6 个浏览器测试。

## 插件模型

每个游戏只拥有自己的目录：

```text
src/games/my-game/
├── game.json       # 自动发现的元数据、权限、版本和分数策略
├── assets.json   # 作者、来源和 SPDX 许可证
└── Game.tsx      # 仅 trusted-module 需要
```

运行时分为两级：

- `trusted-module`：性能最高，与宿主共享 JavaScript realm，必须经过 CODEOWNERS 审核。
- `opaque-origin`：社区默认。仅允许脚本，使用随机 channel 建立专属 MessagePort，不拥有同源访问权。
- `trusted-same-origin`：仅供审核后的 Godot/WASM 构建，不能用于未知贡献者。

接入方式见 [游戏接入指南](docs/adding-a-game.md)，视觉原则见 [UI 方向](docs/ui-direction.md)，兼容规则见 [SDK 版本策略](docs/sdk-versioning.md)，安全边界见 [威胁模型](docs/threat-model.md)，量化结果见 [架构 Review](docs/architecture-review.md)。

## 性能预算

- 主站入口 JavaScript：不超过 130 KB gzip
- 单个动态卡带：不超过 500 KB gzip
- 单个 iframe 资源文件：不超过 5 MB
- 所有手写 TS、TSX、JS、CSS、HTML：不超过 300 行

当前构建主包约 87 KB gzip，琉璃分色卡带约 1.4 KB gzip。

## 商业化边界

当前生命值和模拟奖励保存在 localStorage，只用于演示。正式广告、订单、账户、竞争分数和奖励必须由可信服务端完成签名验证、幂等处理与风控，不能相信浏览器或游戏上报。

## 版权

开源不会免除版权责任。本项目不接受提取的商业游戏代码、美术、音频、名称、Logo 或关卡数据。每个游戏必须提交机器可读的 `assets.json`，CI 会拒绝缺失作者、来源或许可证的贡献。

## License

[MIT](LICENSE) © OpenArcade contributors
