// Telegram Bot 推送工具

export interface TelegramMessage {
  chat_id: string | number
  text: string
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2'
  disable_web_page_preview?: boolean
}

// 转发单条 Telegram 消息 到指定 chatId
export async function forwardTelegramMessage(
  botToken: string,
  fromChatId: string | number,
  messageId: number,
  toChatId: string | number
): Promise<boolean> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/forwardMessage`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: toChatId,
        from_chat_id: fromChatId,
        message_id: messageId,
      }),
    })

    const result = await response.json()
    if (result.ok) {
      console.log('Message forwarded to', toChatId)
      return true
    }
    console.error('Failed to forward message:', result)
    return false
  } catch (error) {
    console.error('Error forwarding Telegram message:', error)
    return false
  }
}

// 从 Telegram update 对象中提取 message 信息（兼容 message / edited_message / channel_post）
export function extractMessageInfoFromUpdate(update: any) {
  const msg = update?.message || update?.edited_message || update?.channel_post || update?.edited_channel_post
  if (!msg) return null
  return {
    fromChatId: msg.chat?.id,
    messageId: msg.message_id,
    text: msg.text || msg.caption || '',
    fromUser: msg.from || null,
  }
}


// 发送消息到 Telegram Bot
export async function sendTelegramMessage(
  botToken: string,
  chatId: string | number,
  message: string,
  parseMode: 'HTML' | 'Markdown' | 'MarkdownV2' = 'HTML'
): Promise<boolean> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: parseMode,
        disable_web_page_preview: false,
      }),
    })

    const result = await response.json()
    
    if (result.ok) {
      console.log('Telegram message sent successfully')
      return true
    } else {
      console.error('Failed to send Telegram message:', result)
      return false
    }
  } catch (error) {
    console.error('Error sending Telegram message:', error)
    return false
  }
}

// 格式化安全数据为 Telegram 消息
export function formatSecurityDataForTelegram(
  items: any[],
  timeRange: string
): string {
  const lines: string[] = []
  
  lines.push(`🔒 <b>Web3 安全动态更新</b>`)
  lines.push(`📅 <b>时间范围</b>: ${timeRange}`)
  lines.push(`📊 <b>发现 ${items.length} 条新的安全相关资讯</b>`)
  lines.push('')

  // 按分类分组
  const byCategory: Record<string, any[]> = {
    blockchain_attack: [],
    vulnerability_disclosure: [],
    exploit: [],
    smart_contract_bug: [],
  }

  items.forEach(item => {
    if (item.category && byCategory[item.category]) {
      byCategory[item.category].push(item)
    }
  })

  const categoryLabels: Record<string, string> = {
    blockchain_attack: '🔴 区块链攻击',
    vulnerability_disclosure: '⚠️ 漏洞披露',
    exploit: '💥 漏洞利用',
    smart_contract_bug: '🐛 智能合约漏洞',
  }

  // 为每个分类添加内容
  Object.entries(byCategory).forEach(([category, categoryItems]) => {
    if (categoryItems.length > 0) {
      lines.push(`\n<b>${categoryLabels[category]} (${categoryItems.length}条)</b>`)
      lines.push('')

      // 只显示前5条，避免消息过长
      const displayItems = categoryItems.slice(0, 5)
      displayItems.forEach((item: any, index: number) => {
        const date = item.pubDate 
          ? new Date(item.pubDate).toLocaleString('zh-CN', { 
              year: 'numeric',
              month: '2-digit', 
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            })
          : '未知时间'
        
        // 转义 HTML 特殊字符
        const title = item.title
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
        
        lines.push(`${index + 1}. <b>${title}</b>`)
        lines.push(`   📅 ${date}`)

        // 验证链接有效性，避免占位链接或空链接被发送
        const isValidUrl = (s: string | undefined) => {
          if (!s) return false
          try {
            const u = new URL(s)
            return (u.protocol === 'http:' || u.protocol === 'https:') && !/example\.com/.test(u.host)
          } catch {
            return false
          }
        }

        const safeLink = isValidUrl(item.link)
          ? item.link
          : (isValidUrl(item.feedHtml) ? item.feedHtml : (isValidUrl(item.feedUrl) ? item.feedUrl : null))
        if (safeLink) {
          lines.push(`   🔗 <a href="${safeLink}">查看详情</a>`)
        } else {
          lines.push(`   🔗 链接不可用`)
        }
        lines.push('')
      })

      if (categoryItems.length > 5) {
        lines.push(`<i>还有 ${categoryItems.length - 5} 条未显示...</i>`)
        lines.push('')
      }
    }
  })

  lines.push('─'.repeat(20))
  lines.push('')
  lines.push('💡 查看完整列表和更多信息')

  return lines.join('\n')
}

// 发送多条消息（如果内容太长，Telegram 会限制单条消息长度）
export async function sendTelegramMessages(
  botToken: string,
  chatId: string | number,
  items: any[],
  timeRange: string,
  useOpenAI: boolean = true
): Promise<boolean> {
  try {
    // Telegram 消息最大长度为 4096 字符
    const MAX_MESSAGE_LENGTH = 4000
    
    let fullMessage: string
    
    // 如果启用 AI 优化，先优化内容（使用 DeepSeek）
    if (useOpenAI) {
      try {
        const { optimizeSecurityDataWithOpenAI } = await import('./openaiOptimizer.js')
        fullMessage = await optimizeSecurityDataWithOpenAI(items, timeRange)

        // 保留模型返回的内容（假设 openaiOptimizer 已确保占位符 [[LINK_n]] 将被替换为原始链接）
      } catch (error) {
        console.error('DeepSeek optimization failed, using default format:', error)
        fullMessage = formatSecurityDataForTelegram(items, timeRange)
      }
    } else {
      fullMessage = formatSecurityDataForTelegram(items, timeRange)
    }
    
    // 如果消息太长，需要分割
    if (fullMessage.length <= MAX_MESSAGE_LENGTH) {
      return await sendTelegramMessage(botToken, chatId, fullMessage)
    } else {
      // 分割消息
      const parts: string[] = []
      const lines = fullMessage.split('\n')
      let currentPart = ''
      
      for (const line of lines) {
        if (currentPart.length + line.length + 1 > MAX_MESSAGE_LENGTH) {
          parts.push(currentPart)
          currentPart = line + '\n'
        } else {
          currentPart += line + '\n'
        }
      }
      
      if (currentPart) {
        parts.push(currentPart)
      }
      
      // 发送所有部分
      for (const part of parts) {
        const success = await sendTelegramMessage(botToken, chatId, part)
        if (!success) {
          return false
        }
        // 短暂延迟，避免发送过快
        await new Promise(resolve => setTimeout(resolve, 500))
      }
      
      return true
    }
  } catch (error) {
    console.error('Error sending Telegram messages:', error)
    return false
  }
}

