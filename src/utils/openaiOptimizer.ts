// DeepSeek 数据优化工具

export interface SecurityItem {
  title: string
  link: string
  pubDate?: string
  category?: string
  subcategory?: string
  description?: string
}

// 使用 DeepSeek 优化安全数据摘要
export async function optimizeSecurityDataWithOpenAI(
  items: SecurityItem[],
  timeRange: string
): Promise<string> {
  const apiKey = 'sk-3028e4a6841a4efd8d360e7d344e62c0'

  try {
    // 构建提示词
    // 为了确保模型返回原始链接，我们为每条 item 插入一个不可变的占位符 [[LINK_i]]
    // 模型须在对应位置包含该占位符，后续我们会把占位符替换为原始链接
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
      const linkToken = `[[LINK_${index}]]`
      return `${index + 1}. [${category}] ${item.title} ${linkToken} (${date})`
    }).join('\n')

    const prompt = `你是一个专业的 Web3 安全分析师。请对以下安全资讯进行总结和优化，生成一份清晰、专业的 Telegram 消息。

要求：
1. 使用中文回复
2. 按照重要性和紧急程度排序
3. 突出关键信息（攻击类型、受影响项目、损失金额等）
4. 使用 emoji 增强可读性
5. 格式化为 Telegram HTML 格式（支持 <b>、<i>、<a> 等标签）
6. 每条资讯包含：标题、时间、分类、链接。**重要**：当你在消息中插入链接时，请使用传入文本中的占位符 token `[[LINK_n]]`（例如 `[[LINK_0]]`、`[[LINK_1]]`），并**不要**修改这些 token 的文本。稍后程序会把这些 token 替换为对应条目的原始链接。
7. 如果资讯数量较多，进行分组展示
8. 总长度控制在 3500 字符以内

时间范围：${timeRange}
资讯数量：${items.length} 条

原始数据：
${itemsSummary}

请生成优化后的 Telegram 消息内容（直接返回消息内容，不要包含其他说明）：`

    // 调用 DeepSeek API
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
            content: '你是一个专业的 Web3 安全资讯分析师，擅长总结和格式化安全相关的新闻和漏洞信息。'
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
      console.log('DeepSeek optimization completed successfully')

      // 用原始链接替换占位符 [[LINK_i]]。优先使用 item.link，然后使用 item.link 本身的回退（若无则空）
      items.slice(0, 20).forEach((item, index) => {
        const token = `[[LINK_${index}]]`
        const originalLink = item.link || item.link || ''
        // 如果原始链接是可用的 URL，则用 HTML 链接替换占位符；否则替换为空字符串
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

      // 若模型没有使用任何占位符（或遗漏），在内容末尾附加原始链接清单以保证链接可访问
      const hasAnyToken = /\[\[LINK_\d+\]\]/.test(optimizedContent)
      if (!hasAnyToken) {
        const linksList = items.slice(0, 20).map((item, index) => {
          const url = item.link || item.link || ''
          return `${index + 1}. ${item.title} - ${url || '链接不可用'}`
        }).join('\n')
        optimizedContent += `\n\n原始链接列表：\n${linksList}`
      }

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


