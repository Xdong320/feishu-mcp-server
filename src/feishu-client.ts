import axios, { AxiosInstance } from 'axios';

export interface FeishuConfig {
  appId: string;
  appSecret: string;
}

export interface DocumentContent {
  documentId: string;
  title: string;
  content: string;
  blocks?: any[];
}

export class FeishuClient {
  private client: AxiosInstance;
  private appId: string;
  private appSecret: string;
  private tenantAccessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(config: FeishuConfig) {
    this.appId = config.appId;
    this.appSecret = config.appSecret;
    this.client = axios.create({
      baseURL: 'https://open.feishu.cn/open-apis',
      timeout: 30000,
    });
  }

  /**
   * 获取 tenant_access_token
   */
  async getTenantAccessToken(): Promise<string> {
    // 如果 token 还在有效期内，直接返回
    if (this.tenantAccessToken && Date.now() < this.tokenExpiry) {
      return this.tenantAccessToken;
    }

    const response = await this.client.post('/auth/v3/tenant_access_token/internal', {
      app_id: this.appId,
      app_secret: this.appSecret,
    });

    const data = response.data;

    if (data.code !== 0) {
      throw new Error(`获取 access_token 失败: ${data.msg} (code: ${data.code})`);
    }

    this.tenantAccessToken = data.tenant_access_token;
    // 提前 5 分钟过期，留出缓冲时间
    this.tokenExpiry = Date.now() + (data.expire - 300) * 1000;

    return data.tenant_access_token;
  }

  /**
   * 判断是否是 Wiki 节点 ID（知识库文档）
   */
  isWikiNodeId(id: string): boolean {
    // Wiki 节点 ID 是数字+字母组合，不是以 "docs" 开头
    // 普通文档 ID 通常是 obj_type 前缀，如 "obj_type:xxx" 或直接是文档 token
    // 这里通过尝试获取 wiki 节点来判断
    return /^[a-zA-Z0-9_-]+$/.test(id);
  }

  /**
   * 获取 Wiki 节点信息，解析出实际文档 ID
   */
  async getWikiNodeDocumentId(wikiNodeToken: string): Promise<string> {
    const token = await this.getTenantAccessToken();

    const response = await this.client.get('/wiki/v2/spaces/get_node', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      params: {
        token: wikiNodeToken,
      },
    });

    const data = response.data;

    if (data.code !== 0) {
      throw new Error(`获取 Wiki 节点信息失败: ${data.msg} (code: ${data.code})`);
    }

    // 从节点信息中获取实际文档 ID
    const objToken = data.data?.node?.obj_token;
    if (!objToken) {
      throw new Error('无法从 Wiki 节点获取文档 ID');
    }

    return objToken;
  }

  /**
   * 解析文档 ID，支持普通文档和 Wiki 文档
   */
  async resolveDocumentId(documentIdOrUrl: string): Promise<string> {
    // 如果是完整的 URL，提取 ID
    const urlMatch = documentIdOrUrl.match(/feishu\.cn\/([^/]+)\/([^/?]+)/);
    if (urlMatch) {
      const [, type, id] = urlMatch;
      if (type === 'wiki') {
        // Wiki 链接，需要获取实际文档 ID
        return await this.getWikiNodeDocumentId(id);
      } else if (type === 'docs') {
        return id;
      }
    }

    // 如果是纯 ID，判断是否是 wiki 节点
    if (this.isWikiNodeId(documentIdOrUrl)) {
      try {
        // 尝试作为 wiki 节点获取文档 ID
        return await this.getWikiNodeDocumentId(documentIdOrUrl);
      } catch (e) {
        // 如果失败，可能就是普通文档 ID
        return documentIdOrUrl;
      }
    }

    return documentIdOrUrl;
  }

  /**
   * 获取文档元信息
   */
  async getDocumentMeta(documentId: string): Promise<{ title: string }> {
    const token = await this.getTenantAccessToken();

    // 支持 wiki 文档
    const actualDocId = await this.resolveDocumentId(documentId);

    const response = await this.client.get(`/docx/v1/documents/${actualDocId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = response.data;

    if (data.code !== 0) {
      throw new Error(`获取文档元信息失败: ${data.msg} (code: ${data.code})`);
    }

    return {
      title: data.data.document.title,
    };
  }

  /**
   * 获取文档内容
   */
  async getDocumentContent(documentId: string): Promise<DocumentContent> {
    const token = await this.getTenantAccessToken();

    // 支持 wiki 文档
    const actualDocId = await this.resolveDocumentId(documentId);
    const meta = await this.getDocumentMeta(actualDocId);

    // 获取文档块内容
    const response = await this.client.get(`/docx/v1/documents/${actualDocId}/blocks`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      params: {
        page_size: 500,
      },
    });

    const data = response.data;

    if (data.code !== 0) {
      throw new Error(`获取文档内容失败: ${data.msg} (code: ${data.code})`);
    }

    // 解析块内容为文本
    const textContent = this.extractTextFromBlocks(data.data.items || []);

    return {
      documentId: actualDocId,
      title: meta.title,
      content: textContent,
      blocks: data.data.items,
    };
  }

  /**
   * 从块列表中提取纯文本
   */
  private extractTextFromBlocks(blocks: any[]): string {
    const lines: string[] = [];

    for (const block of blocks) {
      const text = this.extractTextFromBlock(block);
      if (text) {
        lines.push(text);
      }
    }

    return lines.join('\n');
  }

  /**
   * 从单个块中提取文本
   */
  private extractTextFromBlock(block: any): string | null {
    const blockType = block.block_type;
    const blockData = block[block.block_type] || {};

    // 不同块类型有不同的文本字段
    let textContent = '';

    switch (blockType) {
      case 'text':
        textContent = this.extractTextRuns(blockData.text_runs || []);
        break;
      case 'heading1':
      case 'heading2':
      case 'heading3':
      case 'heading4':
      case 'heading5':
      case 'heading6':
      case 'heading7':
      case 'heading8':
      case 'heading9':
        textContent = this.extractTextRuns(blockData.elements || []) || '';
        textContent = `## ${textContent}`;
        break;
      case 'paragraph':
        textContent = this.extractTextRuns(blockData.elements || []);
        break;
      case 'bullet':
      case 'ordered':
        textContent = this.extractTextRuns(blockData.elements || []);
        textContent = `• ${textContent}`;
        break;
      case 'code':
        textContent = this.extractTextRuns(blockData.elements || []);
        textContent = `\`\`\`\n${textContent}\n\`\`\``;
        break;
      case 'quote':
        textContent = this.extractTextRuns(blockData.elements || []);
        textContent = `> ${textContent}`;
        break;
      case 'divider':
        textContent = '---';
        break;
      case 'image':
        textContent = '[图片]';
        break;
      case 'table':
        textContent = '[表格]';
        break;
      case 'callout':
        textContent = this.extractTextRuns(blockData.elements || []);
        textContent = `💡 ${textContent}`;
        break;
      default:
        // 尝试通用提取
        if (blockData.elements) {
          textContent = this.extractTextRuns(blockData.elements);
        }
    }

    return textContent.trim() || null;
  }

  /**
   * 从 text_runs 数组中提取文本
   */
  private extractTextRuns(textRuns: any[]): string {
    if (!Array.isArray(textRuns)) {
      return '';
    }

    return textRuns
      .map((run) => {
        if (run.text) {
          return run.text;
        }
        return '';
      })
      .join('');
  }
}
