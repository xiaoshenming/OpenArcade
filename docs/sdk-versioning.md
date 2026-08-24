# SDK Versioning Policy

OpenArcade 协议使用整数主版本，当前为 `openarcade:v1`。描述文件的 `sdkVersion`、浏览器 SDK 和宿主协议必须一致。

## 兼容规则

- 同一主版本只能增加可选字段、可选事件或新权限，不得改变既有事件含义。
- 删除字段、改变事件顺序、改变 sandbox 语义或要求新能力时必须发布新主版本。
- 宿主在发布 v2 后至少继续支持 v1 六个月，并在游戏列表中标记需要迁移的卡带。
- 新 SDK 不能静默模拟安全敏感能力；不支持的权限必须明确拒绝。
- 游戏必须忽略自己不认识的可选宿主命令，但不能发送描述文件未声明的能力请求。

## 生命周期

标准顺序为：`connect → ready → started → score* → completed|failed`。`request-restart` 每个会话最多接受一次。iframe 必须在 10 秒内发送 `ready`，重开后旧 MessagePort 和 channel 立即失效。

## 发布流程

1. 在 `src/sdk` 更新类型、Zod schema 和协议测试。
2. 更新 `public/sdk/openarcade-vN.js` 与 conformance fixture。
3. 保留上一主版本文件，不覆盖其行为。
4. 在接入指南中记录迁移步骤和停止支持日期。
5. 通过 `npm run check` 后才能修改宿主默认版本。

SDK 当前随 OpenArcade 发布，未来拆成 npm 包时仍遵循同一策略。
