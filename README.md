# dsh-fork-inbox-guard

DeepSeek Harness Host 插件: 分叉会话时丢掉子会话从源会话继承来的待领提示词, 让子会话第一个回合回答的是你刚发的那条.

## 现象

源会话有一个回合正在跑 (或有排队消息) 时点 Fork, 然后在子会话里发一条新提示词, 子会话会先把**源会话**那条还没被消费的提示词执行一遍, 你自己的提示词被推到下一轮. 同一条命令可能被跑两次.

两个入口都会出现: 侧边栏会话行的 Fork session, 消息菜单的 Branch into a new conversation.

## 原因

Fork 用源会话日志的一段前缀给子会话做 seed. 切点从边界的 `turn/end` 往后扫到下一个 `turn/start`, 于是 `agent/inbox/spliced` 的"插入"落进了 seed, 而把它取走的"领取"发生在下一个 `turn/start` 之后, 留在源会话里. 子会话的 inbox 投影就认为那条消息还挂着.

待领输入描述的是"某个 Agent 接下来要跑什么", 而那个 Agent 是源会话. 所以它是活状态, 不是历史, 不该跟着 seed 走.

## 做法

插件在 `agent/session-start` 上判断: 这次启动是不是 `startup` (即 `agents.create()`, fork 的两条路径都走它), 会话头是不是带 seed (`isSeeded`), 以及 inbox 里是不是真有待领消息. 三条都成立才调一次 `inbox.clear()`, 并记一行 info 日志.

- 没有待领消息时不写任何事件, 是真正的空操作.
- 有待领消息时会写一条带 `outcome: 'canceled'` 的 `agent/inbox/spliced`, 子会话日志里留下"继承了但已作废"的记录, 而不是无声抹掉.
- `resume` 不动: 那些消息本来就是排给这个会话的, 是它自己的工作.
- 没 seed 的新会话不动: 那时 inbox 里的东西是它自己的第一句提示词.

覆盖的入口: 侧边栏 Fork, 消息菜单 Branch, subagent 的 fork provider, agent-team 的 `context: 'fork'` 队友, 以及裸 `sessions.fork()` 之后建起来的 agent.

## 安装

在插件目录:

```shell
dsh plugin --profile web add "link:$(pwd)"
```

装完重启 `dsh web`. 卸载:

```shell
dsh plugin --profile web remove dsh-fork-inbox-guard
```

只影响 Host 半区, 不注册 Client 模块, 不需要重新构建前端.

## 怎么确认它生效了

最可靠的信号在子会话日志里: 分叉出来的会话会出现一条 `agent/inbox/spliced`, `outcome` 是 `canceled`, `removedCount` 是 `1`. 那条就是被丢掉的继承消息, 之后子会话第一个回合的 `user/message` 就是你新发的那句.

插件同时通过 `ctx.logger` 记一行:

```
fork-inbox-guard: dropped the pending inbox of seeded session "session-xxxx"
```

默认的 web profile 不装 console logger, 这一行不会打到终端; 需要看到它的话, 自行挂载 `@deepseek-ai/cordis-plugin-logger-console`. 没有这行说明这次分叉没有可丢的东西, 是正常的.

## 已知边界

- 只对新建的子会话生效, 不会反向修好已经建坏的历史会话.
- 不改 fork 的切点算法, 所以子会话日志里仍会先出现源会话那条 insert, 紧跟一条 canceled 的 splice.
- 依赖 `agent/session-start` 的 `source` 取值, `Agent.inbox` 和 `SessionHeader.isSeeded`. Harness 的公开 API 在 1.0 之前不保证稳定, 升级 dsh 后请重跑 `just test`.
- 上游若在 fork 里直接清空子会话 inbox, 本插件会因为 inbox 已空而什么都不做, 不会与之冲突.
