# 在其他模型上运行 fixture

[English](README.md) | 中文

`scripts/eval.sh` 遵循 `DSH_HOME`，因此换第二个模型需要独立的 dsh home，而不是去改用户自己的 `~/.dsh/settings.yaml`——那是全局设置，会改变每个会话的默认值。

```sh
mkdir -p /tmp/dsh-venti/profiles
cp -R ~/.dsh/profiles/headless /tmp/dsh-venti/profiles/
cp profiles/venti.patch.yml /tmp/dsh-venti/profiles/headless/cordis.patch.yml
cat > /tmp/dsh-venti/settings.yaml <<'YAML'
agent-default-model:
  provider: litellm-24000
  model: macaron-v1-venti
agent-presets:
  default: code
YAML

DSH_HOME=/tmp/dsh-venti LITELLM_24000_API_KEY=<key> ./scripts/eval.sh '帮我算下房贷'
```

有两处各会多花一轮：

- 单靠 patch 层不够。`agent-default-model` 也出现在**用户**层（`settings.yaml`），而用户层最后应用，所以指定了不同 provider 的 patch 会被静默覆盖——那次运行仍然去了 DeepSeek，并报出它的配额错误。
- `reasoningEffort: high` 会被手工声明的路由直接拒绝，除非模型声明了 `reasoningEfforts`。网关无论如何都会丢弃该参数，所以省略它。

`UNSUPPORTED_REASONING_EFFORT` 中指出新 provider，就是该路由已生效的第一个信号。
