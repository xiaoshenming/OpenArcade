# OpenArcade Threat Model

## 资产

宿主需要保护玩家状态、未来的账户和订单、页面控制权、其他游戏的数据、平台可用性以及发行品牌。游戏代码与游戏上报的数据都不能默认信任。

## 运行时等级

### trusted-module

动态模块提供最小包体和最低通信开销，但运行在宿主 JavaScript realm。它可以访问 DOM、网络、存储和主线程，因此必须由 CODEOWNERS 审核，不能作为未知贡献者的安全沙箱。

### opaque-origin

默认社区运行时。iframe 仅获得 `allow-scripts`，浏览器为它创建 opaque origin。宿主同时验证精确的 `contentWindow`、随机 channel、SDK 协议和消息结构。每次重开都会创建新 channel，使旧会话消息失效。

### trusted-same-origin

仅供 Godot/WASM 等需要同源加载资源的审核后构建。`allow-scripts allow-same-origin` 会显著弱化沙箱，必须经过维护者安全审查；不能用于未经信任的 PR。

## 防护

- SDK v1 和 Zod 严格校验协议与描述文件。
- iframe 必须在 10 秒内发送 ready，否则进入可恢复失败状态。
- 宿主状态机限制事件顺序、分数、重复结算和每秒事件数量。
- 权限必须在描述文件中显式列出，并转换为 iframe Permissions Policy。
- CI 强制测试、Lint、构建、300 行限制、资产登记和 gzip 预算。
- CSP 禁止对象、跨源连接、表单提交和非项目脚本。

## 剩余风险

opaque iframe 仍与宿主共享主线程调度，恶意忙循环可能消耗 CPU。浏览器无法对 iframe 设置硬 CPU 配额，因此未知二进制游戏仍需审查，未来可部署到独立游戏子域并增加运行遥测。商业分数、奖励与支付必须由服务端再次验证。
