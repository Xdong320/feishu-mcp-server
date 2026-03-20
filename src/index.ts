#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { FeishuClient, FeishuConfig } from './feishu-client.js';

// 从环境变量获取配置
const APP_ID = process.env.FEISHU_APP_ID || '';
const APP_SECRET = process.env.FEISHU_APP_SECRET || '';

if (!APP_ID || !APP_SECRET) {
  console.error('请设置环境变量 FEISHU_APP_ID 和 FEISHU_APP_SECRET', { APP_ID: !!APP_ID, APP_SECRET: !!APP_SECRET }, );
  process.exit(1);
}

const feishuConfig: FeishuConfig = {
  appId: APP_ID,
  appSecret: APP_SECRET,
};

const feishuClient = new FeishuClient(feishuConfig);

// 创建 MCP Server
const server = new Server(
  {
    name: 'feishu-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 注册工具列表
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'read_feishu_document',
        description: '读取飞书文档的内容。根据文档 ID 或完整 URL 获取文档的标题和完整文本内容。支持普通文档和知识库(Wiki)文档。',
        inputSchema: {
          type: 'object',
          properties: {
            document_id: {
              type: 'string',
              description: '飞书文档的 ID 或完整 URL。支持：1) 普通文档: https://xxx.feishu.cn/docs/abcDEF123 2) 知识库: https://xxx.feishu.cn/wiki/Bj3Jw2kfji45nhkK5MQcv3NynWe 或直接填节点 ID',
            },
          },
          required: ['document_id'],
        },
      },
      {
        name: 'get_feishu_document_meta',
        description: '获取飞书文档的元信息（标题）。根据文档 ID 或完整 URL 获取文档标题，不返回文档内容。支持普通文档和知识库(Wiki)文档。',
        inputSchema: {
          type: 'object',
          properties: {
            document_id: {
              type: 'string',
              description: '飞书文档的 ID 或完整 URL。支持普通文档和知识库文档。',
            },
          },
          required: ['document_id'],
        },
      },
    ],
  };
});

// 处理工具调用
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'read_feishu_document') {
      const { document_id } = args as { document_id: string };

      if (!document_id) {
        return {
          content: [
            {
              type: 'text',
              text: '错误: 缺少 document_id 参数',
            },
          ],
          isError: true,
        };
      }

      const result = await feishuClient.getDocumentContent(document_id);

      return {
        content: [
          {
            type: 'text',
            text: `# ${result.title}\n\n文档ID: ${result.documentId}\n\n---\n\n${result.content}`,
          },
        ],
      };
    } else if (name === 'get_feishu_document_meta') {
      const { document_id } = args as { document_id: string };

      if (!document_id) {
        return {
          content: [
            {
              type: 'text',
              text: '错误: 缺少 document_id 参数',
            },
          ],
          isError: true,
        };
      }

      const result = await feishuClient.getDocumentMeta(document_id);

      return {
        content: [
          {
            type: 'text',
            text: `文档标题: ${result.title}\n文档ID: ${document_id}`,
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: 'text',
            text: `未知工具: ${name}`,
          },
        ],
        isError: true,
      };
    }
  } catch (error: any) {
    console.error('Error:', error.message);
    return {
      content: [
        {
          type: 'text',
          text: `错误: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// 启动服务器
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('飞书文档 MCP 服务已启动');
}

main().catch((error) => {
  console.error('启动失败:', error);
  process.exit(1);
});
