## 1. 架构设计

```mermaid
graph TD
    A["前端页面 (Next.js Client)"] --> B["API 路由 (Next.js API)"]
    B --> C{"网络请求 (fetch)"}
    C -->|请求分享链接| D["小红书页面"]
    D --> E["提取图片并去除 ? 后的参数"]
    E --> B
    C -->|如果是图片直链| F["直接去除 ? 后的参数"]
    F --> B
    B --> A
```

## 2. 技术说明
- 前端框架：Next.js (App Router, React 18)
- 样式库：Tailwind CSS (响应式、极简风格)
- 图标库：lucide-react
- 后端服务：Next.js Route Handlers (处理链接抓取和参数过滤)
- 核心功能依赖：正则表达式解析 HTML 中的初始状态 (如 `window.__INITIAL_STATE__`) 来提取图片 URL，并过滤 `?` 参数。

## 3. 路由定义

| 路由 | 目的 |
|-------|---------|
| `/` | 首页：提供分享链接输入与结果预览 |
| `/api/parse` | 核心 API：接收用户链接，解析并返回无水印图片数组 |

## 4. API 定义

### `POST /api/parse`

#### 请求参数
```typescript
interface ParseRequest {
  url: string; // 用户输入的小红书分享链接文本，可能包含文字描述
}
```

#### 响应结构
```typescript
interface ParseResponse {
  success: boolean;
  images?: string[]; // 去除水印后的原图 URL 列表
  error?: string; // 错误信息，如 "解析失败，无效的链接"
}
```

## 5. 服务端架构图

```mermaid
graph LR
    A["Client Request"] --> B["Route Handler (/api/parse)"]
    B --> C["提取有效 URL (Regex)"]
    C --> D{"URL 类型"}
    D -->|小红书短链/页面| E["Fetch HTML"]
    D -->|图片直链| F["清洗 URL"]
    E --> G["解析 __INITIAL_STATE__"]
    G --> H["提取图片列表"]
    H --> F
    F --> I["移除 ? 后面的参数"]
    I --> J["返回 JSON"]
```
