# Dashboard JS (app.js) Engineering Refactor Plan

为了安全、有计划地拆解 251KB (5450行) 的单体 `app.js`，防止状态和依赖混乱，我们制定了以下严格的 4 步拆解计划：

## Step 1: 提取数据基建层 (State & Constants)
* **目标**: 将最顶部的全局单例 `state` 和静态常量 (`timeRanges`, `views`, 分页常量) 抽取为独立的源文件。
* **文件**: `src/state.js`, `src/constants.js`
* **操作**: 
  * 创建这些文件并使用 `export` 导出对象。
  * 在 `app.js` 中 `import` 这些变量。
  * 移除 `app.js` 顶部的 IIFE `(() => { ... })();` 闭包限制，转为标准的 ES Module 顶层作用域，以便互相 import。

## Step 2: 提取通用工具层 (Utils)
* **目标**: 抽离独立且纯粹的工具函数（DOM 操作 `el`, `qsa`、格式化函数 `formatNumber`, `formatDate`、ToolTip 逻辑等）。
* **文件**: `src/utils.js`
* **操作**: 将这些函数移入 `utils.js` 并导出，在 `app.js` 中全局引入以确保剩余代码正常运行。

## Step 3: 提取网络通信层 (API Layer)
* **目标**: 提取所有和后端交互的 `fetch` 调用（如 `validateAdminKey`, `fetchData`, 各种 CRUD 的 POST 请求）以及相关的错误处理包装逻辑。
* **文件**: `src/api.js`

## Step 4: 提取各个视图组件 (View Components)
* **目标**: 将各个独立页面的渲染逻辑彻底打散，按照模块化组织。
* **文件**: 
  * `src/views/overview.js`
  * `src/views/requests.js`
  * `src/views/providers.js`
  * `src/views/config.js`
* **最终结果**: 原有的 `app.js` 将变成一个仅包含启动流程 (`init()`) 和全局事件监听绑定的轻量级入口文件。
