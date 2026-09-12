# 卡带创作契约(权威文档)

新增一款游戏 = 在 `src/games/<id>/` 下创建一个自包含目录。宿主通过 glob 自动发现,无需修改中央清单。

## 目录文件

```text
src/games/<id>/
├── game.json      # manifest,Zod 严格校验
├── assets.json    # 资产登记(CI 校验 SHA-256)
├── <id>.css       # 游戏样式(深色街机风)
├── logic.ts       # 纯函数规则核心(必须可单测)
├── levels.ts      # 关卡系统(生成或手写表)
├── Game.tsx       # default 导出组件,只准这一个导出
└── logic.test.ts  # ≥5 个测试(可与 levels.test.ts 合并)
```

## game.json schema(超限即构建失败)

- `id`:与目录名完全一致,`/^[a-z0-9-]+$/`
- `sdkVersion`: 1;`gameVersion`:`^\d+\.\d+\.\d+$`;`owner`:`@xiaoshenming`;`license`: "MIT"
- `title` ≤40 字;`shortTitle` ≤12 字;`description` ≤160 字
- `category`: 'logic' | 'arcade' | 'cozy';`accent`: `#RRGGBB`;`order`: 唯一整数
- `status`: "ready";`levelCount`: 1–500
- `instructions`: 2–6 条,每条 4–80 字;`highlights`: 1–8 个,每个 2–30 字
- `scorePolicy`: `{ max ≤ 1e9, eventsPerSecond 1–120 }`
- `loader`: "module";`isolation`: "trusted-module"(不要 permissions 字段)

## assets.json

登记目录内每个 css 文件(CI 校验存在性 + SHA-256 + SPDX 白名单):

```json
{ "assets": [{ "path": "src/games/<id>/<id>.css", "author": "OpenArcade contributors", "license": "MIT", "source": "original", "sha256": "<sha256sum 实测>" }] }
```

改动 css 后必须重算 sha256 更新此文件。

## Game.tsx 契约

```tsx
import { useEffect, useMemo, useState } from 'react'
import type { GameModuleProps } from '../../platform/types'
import { createGameAudio } from '../../platform/game-audio'
import { mulberry32, seedFor } from '../../platform/rng'
import './<id>.css'

export default function ExampleGame({ paused, muted, emit, level = 1 }: GameModuleProps) { ... }
```

- 挂载时 `emit({ type: 'ready' })` + `emit({ type: 'started' })`(useEffect 依赖 [emit])
- `level`(1..levelCount)驱动关卡内容;**宿主拥有解锁,游戏永远不能请求切关**,完成只报 `emit({ type: 'completed', score })`
- `paused=true` 必须冻结所有计时器与输入;`muted` 接 `createGameAudio().setMuted`(至少 2 个 cue:select/step/match/mismatch/win/lose)
- 事件仅限:`ready` `started` `score{score}` `completed{score}` `failed{score}` `request-restart`
- 计分模式(参考 water-sort):`scoreFor = max(100, base − penalty×超耗)`,上限取 scorePolicy.max;每次状态推进 emit score
- 深度要求:≥60 关;≥4 个章节机制且高章节组合叠加(参考 water-sort rules.ts);关卡确定性可重放;构造性保证可解(从终态逆推,或生成后经校验器验证并重生成)
- 重开:内部重置本关即可(宿主 sessionKey 变化会重挂载组件,一切状态归零)

## 样式

- 深色街机风:面板 #151a2d/#0d1122、文字 #eef1fb/#8b96b8、霓虹 #ff5f7e/#2fd6b8/#ffc94d
- 可引用全局令牌:`--ease-standard/--ease-spring/--ease-exit`、`--dur-fast/base/slow`、`--grain/--brushed`、`--coral/--teal/--gold/--ink/--muted/--surface/--line`
- 动画只准 transform/opacity/filter;640px 适配;交互触控目标 ≥44px

## 测试要求(≥5)

核心规则不变量;全关卡确定性(同 level 两次生成一致);构造性可解或公平性校验;难度曲线 sanity(后章不松于前章);边界输入。

## 自检命令

```bash
npx vitest run src/games/<id>        # 全绿
npx eslint src/games/<id> --max-warnings 0
# 每个文件 ≤300 行(手数或 wc -l)
```
