# 模型实际写出的卡片

[English](README.md) | 中文

六次真实生成，作为 `scripts/replay-stream.ts` 与 `scripts/compile-cards.ts` 的固定输入保留。它们在这里，是因为合起来覆盖了 2026-08-22 新增的全部运行时规则：

| 卡片 | 覆盖内容 |
| --- | --- |
| `2048.ui4a.tsx` | AutoPlay——递归的 `setTimeout`，其清理同时取消并清除 |
| `piano.ui4a.tsx` | 在首次点击中构建的 `AudioContext`，未 await `resume()` |
| `metro.ui4a.tsx` | `clearInterval` 加待处理的 timeout、一个独立的卸载 effect、提前调度 |
| `regex-tester.ui4a.tsx` | 向读者展示的正则模式，由 `REGEX-IN-JSX-TEXT` 负责筛查 |
| `band-names.ui4a.tsx` | `$dsh/ai` 流式、贯穿其中的 `AbortController`、`aria-live`，以及会告知读者的失败 |
| `pick-one.ui4a.tsx` | `$dsh/chat`——一次点击本身就是回复，既记录到状态也发送出去 |

它们都能挂载并绘制，回放也很干净：没有可见的重新挂载，没有编译失败的帧。最后两张是 2026-08-24 为覆盖此前没有其他用例涉及的构造而加入的——在它们之前，没有任何参考卡片使用 `$dsh/ai`、`$dsh/chat` 或 `AbortController`，因此三项能力与整套过期响应模式在固定集合中都没有代表。

请重新生成而不是编辑——重点在于它们未经修饰的输出。
