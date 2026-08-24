# Security Policy

## 报告漏洞

请不要为可利用漏洞创建公开 issue。通过 GitHub Security Advisory 的 Private vulnerability reporting 向维护者提交报告，包含复现步骤、影响范围和建议修复。

维护者会在 72 小时内确认收到，并在完成修复和发布后协调披露。

## 信任边界

- `trusted-module` 与宿主共享 DOM、存储和主线程，只允许维护者审核过的代码。
- 社区游戏默认使用没有 `allow-same-origin` 的 `opaque-origin` iframe。
- `trusted-same-origin` 仅用于确实需要同源 WASM 资源的已审核引擎构建。
- 游戏提交的分数和生命周期事件全部视为不可信输入。
- 广告、支付、账户和奖励必须由服务端验证，不能依赖当前本地演示状态。

完整模型见 [docs/threat-model.md](docs/threat-model.md)。
