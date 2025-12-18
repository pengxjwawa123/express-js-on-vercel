// DeepSeek 数据优化工具

export interface SecurityItem {
  title: string
  link: string
  pubDate?: string
  category?: string
  subcategory?: string
  description?: string
  content?: string
  contentSnippet?: string
}

// 使用 DeepSeek 优化安全数据摘要（同时进行过滤和优化）
export async function optimizeSecurityDataWithOpenAI(
  items: SecurityItem[],
  timeRange: string
): Promise<string> {
  const apiKey = 'sk-3028e4a6841a4efd8d360e7d344e62c0'
  
  if (items.length === 0) {
    const { formatSecurityDataForTelegram } = await import('./telegramBot.js')
    return formatSecurityDataForTelegram(items, timeRange)
  }

  try {
    // 构建条目信息摘要（包含标题和内容，用于 AI 判断和优化）
    const itemsSummary = items.slice(0, 20).map((item, index) => {
      const category = item.category || 'unknown'
      const date = item.pubDate 
        ? new Date(item.pubDate).toLocaleString('zh-CN', { 
            month: '2-digit', 
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          })
        : '未知时间'
      const content = item.contentSnippet || item.content || item.description || ''
      const contentPreview = content.length > 150 ? content.substring(0, 150) + '...' : content
      const linkToken = `[[LINK_${index}]]`
      return `${index + 1}. [${category}] ${item.title} ${linkToken} (${date})\n   内容: ${contentPreview || '无内容'}`
    }).join('\n\n')

    const prompt = `你是一个专业的 Web3 安全分析师。请对以下安全资讯进行过滤、总结和优化，生成一份清晰、专业的 Telegram 消息。

**重要：过滤要求**
请只处理和返回真正的区块链攻击相关事件，忽略以下内容：
- 普通的漏洞披露（没有实际攻击或资金损失）
- 代码审计报告（没有实际攻击）
- 理论研究、学术论文
- 项目更新、产品发布等非安全事件
- 一般性的安全建议或教育内容

**区块链攻击包括**：
- 钱包被黑、私钥泄露、资金被盗
- 公链/主网攻击（如以太坊、比特币、BSC、Polygon、Solana等）
- 跨链桥接被黑
- DeFi 协议被攻击、流动性池被利用
- 交易所被黑
- 智能合约漏洞导致的资金损失
- 51% 攻击、双花攻击等共识层攻击
- 闪电贷攻击、重入攻击等

**优化要求**：
1. 使用中文回复
2. 按照重要性和紧急程度排序
3. 突出关键信息（攻击类型、受影响项目、损失金额等）
4. 使用 emoji 增强可读性
5. 格式化为 Telegram HTML 格式（**只支持以下标签**：<b>、<strong>、<i>、<em>、<u>、<ins>、<s>、<strike>、<del>、<a>、<code>、<pre>）
6. **禁止使用**：<hr>、<br>、<div>、<span>、<p>、<h1>-<h6>、<ul>、<ol>、<li> 等 Telegram 不支持的标签。如需分隔，使用换行符或分隔线字符（如 ─）
7. 每条资讯包含：标题、时间、分类、链接。**重要**：在你生成的消息中，请在对应条目位置保留传入的占位符 token [[LINK_n]]（例如 [[LINK_0]]、[[LINK_1]]），并**不要**改变这些 token 的文本。程序会在发送前把这些 token 替换为对应条目的原始链接；不要在内容末尾附加原始链接清单或重复原始信息。
8. 如果资讯数量较多，进行分组展示
9. 总长度控制在 3500 字符以内
10. **只包含区块链攻击相关的事件，忽略其他内容**

时间范围：${timeRange}
资讯数量：${items.length} 条（请过滤后只处理区块链攻击相关事件）

原始数据：
${itemsSummary}

请生成优化后的 Telegram 消息内容（直接返回消息内容，不要包含其他说明，只包含区块链攻击相关事件）：`

    // 调用 DeepSeek API（一次调用同时完成过滤和优化）
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat', // DeepSeek 聊天模型
        messages: [
          {
            role: 'system',
            content: '你是一个专业的 Web3 安全资讯分析师，擅长识别真正的区块链攻击事件，并总结和格式化安全相关的新闻和漏洞信息。只处理和返回区块链攻击相关的事件。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    })

    const result = await response.json()
    
    if (result.choices && result.choices[0] && result.choices[0].message) {
      let optimizedContent = result.choices[0].message.content.trim()
      
      // 用稳定的占位符 [[LINK_n]] 精确替换为对应条目的原始链接
      items.slice(0, 20).forEach((item, index) => {
        const token = `[[LINK_${index}]]`
        const originalLink = item.link || ''
        try {
          if (originalLink && (originalLink.startsWith('http://') || originalLink.startsWith('https://'))) {
            const safeUrl = originalLink.replace(/"/g, '%22')
            optimizedContent = optimizedContent.split(token).join(`<a href="${safeUrl}">${safeUrl}</a>`)
          } else {
            optimizedContent = optimizedContent.split(token).join('链接不可用')
          }
        } catch (e) {
          optimizedContent = optimizedContent.split(token).join(originalLink || '链接不可用')
        }
      })
      
      // 清理任何残留的 example.com 占位链接，避免发送占位内容
      optimizedContent = optimizedContent.replace(/https?:\/\/(?:www\.)?example\.com\/?\S*/gi, '链接不可用')
      optimizedContent = optimizedContent.replace(/example\.com/gi, '链接不可用')
      
      // 清理 Telegram 不支持的 HTML 标签
      // Telegram 只支持: <b>, <strong>, <i>, <em>, <u>, <ins>, <s>, <strike>, <del>, <a>, <code>, <pre>
      // 移除不支持的标签，如 <hr>, <br>, <div>, <span>, <p> 等
      optimizedContent = optimizedContent.replace(/<hr\s*\/?>/gi, '\n─'.repeat(20) + '\n') // 用分隔线替换
      optimizedContent = optimizedContent.replace(/<br\s*\/?>/gi, '\n') // 换行标签替换为换行符
      optimizedContent = optimizedContent.replace(/<\/?(div|span|p|section|article|header|footer|nav|main)\b[^>]*>/gi, '') // 移除块级标签
      optimizedContent = optimizedContent.replace(/<\/?(h[1-6]|ul|ol|li|table|tr|td|th|thead|tbody)\b[^>]*>/gi, '') // 移除其他不支持的标签
      
      console.log('DeepSeek optimization and filtering completed successfully')

      return optimizedContent
    } else {
      console.error('DeepSeek API returned unexpected format:', result)
      const { formatSecurityDataForTelegram } = await import('./telegramBot.js')
      return formatSecurityDataForTelegram(items, timeRange)
    }
  } catch (error) {
    console.error('Error optimizing with DeepSeek:', error)
    // 如果 DeepSeek 调用失败，返回原始格式
    const { formatSecurityDataForTelegram } = await import('./telegramBot.js')
    return formatSecurityDataForTelegram(items, timeRange)
  }
}


