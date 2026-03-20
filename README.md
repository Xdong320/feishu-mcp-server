# 飞书文档 MCP 服务

一个用于读取飞书文档内容的 MCP (Model Context Protocol) 服务。

## 功能

- `read_feishu_document`: 读取飞书文档的完整内容
- `get_feishu_document_meta`: 获取文档元信息（标题）
- **支持普通文档和知识库（Wiki）文档**

## 前置要求

1. 飞书自建应用 credentials
2. 已开通文档读取权限
3. Node.js >= 18

## 安装

```bash
npm install
npm run build
```

## 配置

1. 复制 `.env.example` 为 `.env`
2. 填写你的飞书应用凭证：

```bash
FEISHU_APP_ID=your_app_id
FEISHU_APP_SECRET=your_app_secret
```

## 飞书开放平台配置

1. 创建自建应用：https://open.feishu.cn/
2. 获取 App ID 和 App Secret
3. 开通权限：
   - `docx:document:readonly`
   - `docx:document:read`
   - `wiki:wiki:readonly`（知识库文档需要）
4. 发布应用（或使用调试模式）

## 使用方式

### 直接运行

```bash
# 设置环境变量
export FEISHU_APP_ID=your_app_id
export FEISHU_APP_SECRET=your_app_secret

# 运行
npm start
```

### Claude Code 配置

在 `claude_desktop_config.json` 中添加：

```json
{
  "mcpServers": {
    "feishu": {
      "command": "node",
      "args": ["/path/to/feishu-mcp-server/dist/index.js"],
      "env": {
        "FEISHU_APP_ID": "your_app_id",
        "FEISHU_APP_SECRET": "your_app_secret"
      }
    }
  }
}
```

## 文档 ID 获取

支持三种输入方式：

### 1. 普通文档
```
https://xxx.feishu.cn/docs/abcDEF123
```
文档 ID：`abcDEF123`

### 2. 知识库文档（Wiki）
```
https://xxx.feishu.cn/wiki/Bj3Jw2kfji45nhkK5MQcv3NynWe
```
直接传入完整 URL 或 Wiki 节点 ID：`Bj3Jw2kfji45nhkK5MQcv3NynWe`

### 3. 直接传入 ID
工具会自动识别是普通文档还是 Wiki 节点，并自动解析。
