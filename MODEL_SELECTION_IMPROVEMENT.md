# 模型选择逻辑优化

## 背景

用户提出需求：当前的Idle Health Check探测模型选择逻辑需要优化，应该选择支持最近使用模型的最高优先级供应商，而不是简单地按供应商优先级逐个探测。

## 需求描述

1. 找到所有供应商中最近成功请求使用的模型
2. 选择既支持这个模型又优先级最高的供应商进行探测
3. 如果没有任何供应商支持这个模型，则选择最高优先级供应商并使用该供应商的默认模型

## 实现方案

### 新增函数

**`_find_best_model_provider_pair(observability, config, router)`**

实现了新的全局模型-供应商配对选择算法：

1. **找到最近使用的模型**：遍历所有供应商，找到最近成功使用的模型（无时间戳时采用最后找到的模型）
2. **寻找最佳供应商**：按优先级从高到低检查供应商，找到第一个支持该模型的供应商
3. **Fallback逻辑**：
   - 如果无供应商支持该模型 → 使用最高优先级供应商的默认模型
   - 如果无最近模型 → 使用最高优先级供应商的默认模型

### 修改函数

**`_idle_health_check_round()`**

- 从逐个供应商探测改为使用全局最优模型-供应商配对
- 调用新的 `_find_best_model_provider_pair` 函数

**`_idle_probe_one_provider()`**

- 增加 `suggested_model` 和 `model_source` 参数
- 支持使用外部指定的模型和来源
- 保持向后兼容性

### 测试覆盖

新增3个测试用例：

1. **`test_find_best_model_provider_pair_with_recent_model`**
   - 验证能找到最近模型并选择支持该模型的最高优先级供应商

2. **`test_find_best_model_provider_pair_no_model_support_fallback`**
   - 验证当无供应商支持最近模型时的fallback行为

3. **`test_find_best_model_provider_pair_no_recent_model`**
   - 验证当无最近模型时的处理逻辑

## 选择策略对比

### 修改前
```
for provider in priority_order:
    model = pick_model_for_provider(provider)
    probe(provider, model)
    if success: break
```

### 修改后
```
model, provider, source = find_best_model_provider_pair()
if provider:
    probe(provider, model)
```

## 优势

1. **更高效**：避免在低优先级供应商上探测不相关的模型
2. **更准确**：使用实际最近成功的模型进行探测
3. **更智能**：考虑模型和供应商的兼容性
4. **保持简单**：保持原有的逐个供应商探测的简洁性，但增加了智能选择

## 测试结果

所有12个相关测试用例均通过，包括：
- 3个新添加的测试
- 9个原有测试（确保无回归）