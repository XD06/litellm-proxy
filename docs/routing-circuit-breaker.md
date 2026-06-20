# 路由与熔断机制

本文说明当前默认路由、key 重试、冷却和禁用规则。目标是：优先使用高优先级供应商，失败时不打断客户端，并把故障尽量限制在单个 key 上。

## 默认行为

默认推荐配置：

```json
{
  "routing": {
    "provider_select": "priority_failover",
    "max_attempts": 6
  },
  "retry": {
    "same_key_retries": 1,
    "key_failure_ladder_s": [10, 60, 3600],
    "failure_policies": {
      "server_error": { "cooldown_scope": "key", "cooldown_s": 10 },
      "network_error": { "cooldown_scope": "key", "cooldown_s": 10 },
      "rate_limited": { "cooldown_scope": "key", "cooldown_s": 30 },
      "quota_or_balance": { "cooldown_scope": "key", "cooldown_s": 3600 },
      "key_invalid": { "cooldown_scope": "key", "cooldown_s": 3600, "disables_key": true }
    }
  }
}
```

执行顺序：

1. 先按 provider priority 选择最高优先级供应商。
2. 同一个供应商有多个 key 时，按配置顺序优先使用第一把可用 key，不做成功请求轮换。
3. 5xx、timeout、网络错误会先同 key 重试 1 次。
4. 同 key 仍失败后，冷却当前 key，不默认冷却整个供应商。
5. 当前供应商还有其他可用 key 时，本次请求继续试同供应商后续 key。
6. 当前供应商没有可用 key 时，才切换到下一个能提供同模型的供应商。
7. 低优先级供应商或后续 key 只是本次请求救急。下一次请求会重新从最高优先级 provider 的第一把可用 key 开始，只要它没有 cooldown 或 disabled。

## Key 失败阶梯

`retry.key_failure_ladder_s` 只作用于可恢复的 transient 错误：

- `server_error`
- `network_error`
- `unknown`

默认阶梯是：

```json
"key_failure_ladder_s": [10, 60, 3600]
```

含义：

- 第 1 次连续失败：冷却 10 秒。
- 第 2 次连续失败：冷却 60 秒。
- 第 3 次连续失败：冷却 3600 秒。
- 第 4 次连续失败：把 key 标记为 disabled，需要手动清理 key 状态或重新启用。

成功请求会清零该 key 的失败计数、cooldown 和 disabled 状态。

## 不同错误的处理

`key_invalid`：

- 典型来源：401、403。
- 认为 key 本身不可用。
- 不做同 key 重试。
- 默认 disabled 当前 key 3600 秒，并继续尝试其他 key/provider。

`quota_or_balance`：

- 典型来源：402、余额不足。
- 不做同 key 重试。
- 默认冷却当前 key 3600 秒。
- 这类问题通常需要充值或换 key；冷却只是避免每次请求都先撞同一个坏 key。

`rate_limited`：

- 典型来源：429。
- 默认冷却当前 key 30 秒。
- 如果上游提供 `Retry-After` 且 `respect_retry_after=true`，以 `Retry-After` 为准。

`server_error` / `network_error`：

- 典型来源：5xx、timeout、连接错误。
- 默认同 key 重试 1 次。
- 仍失败后按 key 阶梯冷却。
- 默认不冷却 provider，避免一个 key 的网络抖动影响同供应商其他 key。

`provider_compat`：

- 典型来源：格式/工具调用/思考内容兼容问题。
- 不冷却 key。
- 继续尝试其他格式或供应商。

## 路由模式搭配

`priority_failover`：

- 生产推荐。
- 固定优先级最高的供应商作为主力。
- 其他供应商只在主力供应商没有可用 key 时接管。
- 适合想保持缓存、稳定账单和稳定输出风格的场景。

`round_robin`：

- 在供应商之间轮换。
- 会更平均分散流量。
- 可能破坏供应商侧缓存，也更容易让不同供应商输出风格混在一起。

`weighted_rr`：

- 按 route weight 做加权轮换。
- 适合明确想按比例分流，例如 80% 给 A、20% 给 B。
- 仍可能牺牲缓存稳定性。

`random`：

- 按请求稳定随机。
- 适合测试或压测，不推荐作为生产默认。

## 固定自定义路由

供应商级 priority：

```json
{
  "providers": {
    "deepseek": { "priority": 100 },
    "sensen": { "priority": 60 },
    "opencode": { "priority": 40 }
  }
}
```

模型级 route 可以覆盖供应商默认 priority：

```json
{
  "models": {
    "routes": {
      "deepseek-v4-flash": {
        "provider_select": "priority_failover",
        "providers": [
          { "name": "deepseek", "priority": 100 },
          { "name": "sensen", "priority": 80 },
          { "name": "opencode", "priority": 40 }
        ]
      }
    }
  }
}
```

真实上游模型名不同的供应商需要保留 provider model map：

```json
{
  "models": {
    "provider_model_map": {
      "modelscope": {
        "deepseek-v4-flash": "deepseek-ai/DeepSeek-V4-Flash"
      }
    }
  }
}
```

这个 map 只改变发给上游的模型名，不改变客户端请求的 canonical model。
