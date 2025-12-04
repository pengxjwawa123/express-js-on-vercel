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
    // 构建条目信息摘要（不插入任何占位符或原始链接）
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
      return `${index + 1}. [${category}] ${item.title} (${date})`
    }).join('\n')

    const prompt = `你是一个专业的 Web3 安全分析师。请对以下安全资讯进行总结和优化，生成一份清晰、专业的 Telegram 消息。

要求：
1. 使用中文回复
2. 按照重要性和紧急程度排序
3. 突出关键信息（攻击类型、受影响项目、损失金额等）
4. 使用 emoji 增强可读性
5. 格式化为 Telegram HTML 格式（支持 <b>、<i>、<a> 等标签）
6. 每条资讯包含：标题、时间、分类、链接。**重要**：不要在最终输出中附加原始数据清单或重复原始信息；仅返回经过优化的摘要和（如需要）适当的链接表示。
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
      // 如果模型在输出中使用了 example.com 或占位链接，替换为原始 items 中的真实链接（按顺序匹配），
      // 但不要在末尾附加原始链接清单。
      const validLinks = items.slice(0, 20).map(it => it.link || '').filter(Boolean)
      if (validLinks.length > 0) {
        // 1) 替换 href 中的 example.com 链接
        let linkIndex = 0
        optimizedContent = optimizedContent.replace(/href\s*=\s*"([^"]*example\.com[^"]*)"/gi, (_m, _p1) => {
          const replacement = validLinks[linkIndex++] || ''
          if (replacement) return `href="${replacement.replace(/"/g, '%22')}"`
          return 'href="#"'
        })

        // 2) 替换裸露的 example.com URL（例如 https://example.com/...）为 HTML 链接
        optimizedContent = optimizedContent.replace(/https?:\/\/(?:www\.)?example\.com\/?\S*/gi, () => {
          const replacement = validLinks.shift() || ''
          if (replacement) {
            const safeUrl = replacement.replace(/"/g, '%22')
            return `<a href="${safeUrl}">${safeUrl}</a>`
          }
          return '链接不可用'
        })
      } else {
        // 如果没有可用链接，移除明显的 example.com 文本，避免发送占位链接
        optimizedContent = optimizedContent.replace(/https?:\/\/(?:www\.)?example\.com\/?\S*/gi, '链接不可用')
        optimizedContent = optimizedContent.replace(/example\.com/gi, '链接不可用')
      }
      console.log('DeepSeek optimization completed successfully')

      // 不再保留或附加原始信息：直接返回模型生成的优化内容

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


