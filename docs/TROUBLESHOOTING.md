# 生产故障排查与诊断手册 (Production Troubleshooting Guide)

> 本手册汇集生产环境中最常见的报错码、现象、根本原因及标准排查处置清单。

---

## 1. 常见报错排查决策树（Quick Diagnostic Matrix）

| 错误码 / 错误信息 | 常见根本原因 | 标准处置步骤 |
| :--- | :--- | :--- |
| **503 `no_eligible_candidate`**<br>(跳过 N 个候选，密钥不支持该模型) | 1. 目标模型没有可用的供应商支持<br>2. 手动配置的原始模型名与上游实际注册的模型 ID 字面不一致<br>3. 供应商的所有 Key 均处于冷却（Cooldown）或禁用期 | 1. 执行 `诊断命令 1` 查看该模型在各供应商的原始 ID<br>2. 检查 `runtime_config.json` 中的 `provider_model_map` 名称是否拼写准确<br>3. 在供应商添加 `static_models` 临时解禁 |
| **502 `all attempts failed`**<br>(All upstream providers unavailable) | 1. 选中的所有上游供应商接口均返回了网络超时、401、403 或 5xx<br>2. 模型的输出全部为 `reasoning_content`，没有 visible content (`empty_visible_output`) | 1. 查看 `docker logs` 中每轮 attempt 失败的真实 HTTP Status<br>2. 检查 Key 余额是否耗尽或被封禁<br>3. 调大客户端 `max_tokens` 参数 |
| **404 `unknown_model`** | 客户端请求的模型未在 `/v1/models` 中注册，且全局未开启 `assume_supports_unknown_models` | 1. 在控制台检查模型是否被误设为 disabled<br>2. 检查后台是否成功从供应商拉取到 `/v1/models` |
| **400 `Bad Request` / `URL Not Found`** | 上游 Base URL 拼接错误（例如多拼或少拼了 `/v1` 或 `/chat/completions`） | 1. 检查供应商 `base_url` 是否带有尾部斜杠 `/`<br>2. 尾部带 `/` 触发前缀模式，尾部不带 `/` 触发标准追加模式 |
| **429 `rate_limited`** | 上游供应商触发并发限制或 RPM/TPM 限额 | 代理会自动将触发 429 的 Key 加入冷却梯子并 failover 到下一个 Key/供应商 |

---

## 2. 生产环境快速诊断命令速查 (VPS CLI Toolkit)

在拥有 SSH 访问权限的宿主机或终端中执行：

### 诊断 1：查看当前生效的模型映射与真实上游 ID
```bash
# 查询供应商实际发现的模型列表（以 requesty 为例）
docker exec litellm-proxy python3 -c "
import json
state = json.load(open('/app/tmp/router_state.json'))
caps = state.get('provider_model_capabilities', {}).get('requesty', {})
print('Status:', caps.get('status'))
print('Total models:', len(caps.get('models', [])))
print('DeepSeek models:', [m for m in caps.get('models', []) if 'deepseek' in m.lower()])
"
```

### 诊断 2：查询特定供应商及 Key 的实时冷却状态
```bash
docker exec litellm-proxy python3 -c "
import json, time
state = json.load(open('/app/tmp/router_state.json'))
now = time.time()
r_state = state.get('router', {})
for (p, idx), ks in r_state.get('keys_state', {}).items():
    cd = ks.get('cooldown_until', 0) - now
    if cd > 0 or ks.get('fails', 0) > 0:
        print(f'{p} key[{idx}]: cooldown={int(cd)}s, fails={ks.get(\"fails\")}, credential_fails={ks.get(\"credential_fails\")}')
"
```

### 诊断 3：端到端模拟指定模型的路由尝试
```bash
docker exec litellm-proxy python3 -c "
import json, config_loader
from router import UpstreamRouter
from config_manager import RuntimeConfigManager

mgr = RuntimeConfigManager(config_loader.load_config(), overlay_path='/app/runtime_config.json')
r = UpstreamRouter(mgr.config)
state = json.load(open('/app/tmp/router_state.json'))
r.load_state(state.get('router', {}))

model = 'deepseek-v4-flash-plus'
attempts = list(r.iter_attempts(model, False, 'diag-req'))
print(f'Model: {model} -> Yielded {len(attempts)} candidates:')
for a in attempts:
    print(f'  Provider: {a.provider}, Key: {a.key_index}, RawModel: {a.provider_model}, URL: {a.url}')
"
```

---

## 3. Base URL 拼接规则速查

系统使用 `join_base_url(base_url, path)` 处理所有上游地址拼接：

| 输入 `base_url` | 默认 `path` | 实际请求完整 URL | 模式说明 |
| :--- | :--- | :--- | :--- |
| `https://api.openai.com/v1` | `/v1/chat/completions` | `https://api.openai.com/v1/chat/completions` | **标准模式**（自动合并末尾） |
| `https://qianfan.baidubce.com/v2/tokenplan/personal/` | `/v1/chat/completions` | `https://qianfan.baidubce.com/v2/tokenplan/personal/chat/completions` | **前缀模式**（末尾带 `/` 时剥离多余 `v1/`） |
| `https://my-gateway.com/custom/` | `/v1/messages` | `https://my-gateway.com/custom/messages` | **前缀模式**（保留自定义根路径） |

---

## 4. 运行时重置与紧急恢复

如遇状态污染或需强制重置全部冷却状态：

```bash
# 1. 优雅重启容器（重新加载配置并清空内存易失缓存）
docker restart litellm-proxy

# 2. 紧急重置：清空冷却状态文件（恢复所有被冷却的 Key）
docker exec litellm-proxy rm -f /app/tmp/router_state.json
docker restart litellm-proxy
```
