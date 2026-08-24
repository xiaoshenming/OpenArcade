# Contributing

感谢为 OpenArcade 制作新卡带。所有贡献都要经过自动门禁和维护者审核；通过 CI 不代表可以绕过版权或安全审查。

## 基本流程

1. 新建 issue，说明玩法、运行时、包体预估和素材来源。
2. 一个 PR 只加入一个游戏或一个明确的平台能力。
3. 按 [游戏接入指南](docs/adding-a-game.md) 创建独立目录。
4. 填写 PR 模板，附桌面/移动端截图和构建体积变化。
5. 提交前运行 `npm run check`。

## 运行时规则

- 未知贡献者默认只能使用 `opaque-origin` iframe。
- `trusted-module` 和 `trusted-same-origin` 必须由 CODEOWNERS 审核。
- 游戏不得读取宿主 DOM、localStorage、账户、订单或广告状态。
- 不能通过新增全局依赖绕过 SDK；确需依赖时在 PR 中说明体积与许可证。
- 每个手写 TS、TSX、JS、CSS、HTML 文件不得超过 300 行，复杂功能按职责拆分。

## 原创与许可证

不得提交反编译代码、抓取素材、商业游戏名称或 Logo、未经许可的音效与关卡数据。每个游戏必须包含 `assets.json`，逐项提供路径、作者、来源和 SPDX 许可证。当前允许 MIT、Apache-2.0 和 CC0-1.0；其他许可证需先由维护者评估兼容性。

贡献即表示你有权按项目 MIT 许可证提供对应代码，第三方素材仍按各自许可证分发。无法确认授权的内容不会合并。

## Review 标准

Review 优先检查信任边界、主线程和包体影响、协议顺序、重复结算、移动端布局、键盘可用性、失败恢复和素材授权。评分标准见 [架构 Review](docs/architecture-review.md)。
