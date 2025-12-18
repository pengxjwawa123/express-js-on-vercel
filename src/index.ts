import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import cron from 'node-cron'
import { parseOPML } from './utils/opmlParser.js'
import { fetchAllSecurityFeeds, fetchAllSecurityFeedsWithCategory } from './utils/rssService.js'
import { sendTelegramMessages, forwardTelegramMessage, extractMessageInfoFromUpdate } from './utils/telegramBot.js'
import { initRedis, filterPushedMessages, markMessagesAsPushed } from './utils/redisCache.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()

// 静态文件服务
app.use(express.static(path.join(__dirname, '..', 'public')))

// 解析 JSON body（用于接收 Telegram webhook 更新）
app.use(express.json())

// 缓存安全相关的 RSS 内容
let cachedSecurityItems: any[] = []
let lastCacheTime = 0
let isUpdating = false // 防止并发更新
let lastTelegramPushTime = 0 // 上次推送到 Telegram 的时间
const CACHE_DURATION = 2 * 60 * 60 * 1000 // 2小时缓存
const BACKGROUND_UPDATE_INTERVAL = 30 * 60 * 1000 // 30分钟后台更新一次
const TELEGRAM_PUSH_INTERVAL = 30 * 60 * 1000 // 30分钟推送一次

// 推送到 Telegram Bot（带 Redis 去重）
async function pushToTelegramBot(newItems: any[], timeRange: string) {
  const botToken = '8242493572:AAG55rSWBIyfubA6JExQAV8DYZdDAINLPY8'
  const chatIds = ['-1002807276621', '7715712244']

  try {
    if (newItems.length === 0) {
      console.log('No new items to push to Telegram')
      return
    }

    // 确保 Redis 已连接
    await initRedis()

    // 使用 Redis 过滤已推送的消息
    const unpushedItems = await filterPushedMessages(newItems)
    
    if (unpushedItems.length === 0) {
      console.log('All items have already been pushed, skipping...')
      return
    }

    console.log(`Pushing ${unpushedItems.length} new items to Telegram (${newItems.length - unpushedItems.length} already pushed) to ${chatIds.length} targets...`)
    
    // 先优化一次消息（避免对每个 chatId 重复调用 OpenAI）
    let optimizedMessage: string | undefined
    try {
      const { optimizeSecurityDataWithOpenAI } = await import('./utils/openaiOptimizer.js')
      optimizedMessage = await optimizeSecurityDataWithOpenAI(unpushedItems, timeRange)
      console.log('Message optimized with OpenAI once for all chatIds')
    } catch (error) {
      console.error('OpenAI optimization failed, will use default format for each chatId:', error)
      // 如果优化失败，optimizedMessage 保持 undefined，每个 chatId 会使用默认格式
    }
    
    let allSuccess = true
    for (const cid of chatIds) {
      try {
        // 如果已有优化消息，直接使用；否则在 sendTelegramMessages 内部优化
        const success = await sendTelegramMessages(
          botToken, 
          cid, 
          unpushedItems, 
          timeRange, 
          !optimizedMessage, // 如果已有优化消息，不再调用 OpenAI
          optimizedMessage   // 传入已优化的消息
        )
        if (success) {
          lastTelegramPushTime = Date.now()
          console.log(`Telegram push to ${cid} completed successfully`)
        } else {
          console.error(`Failed to push to Telegram chat ${cid}`)
          allSuccess = false
        }
      } catch (err) {
        console.error(`Error pushing to Telegram chat ${cid}:`, err)
        allSuccess = false
      }
    }

    // 只有所有推送都成功时，才标记为已推送
    if (allSuccess && unpushedItems.length > 0) {
      await markMessagesAsPushed(unpushedItems, 48) // 48小时后过期
      console.log(`Marked ${unpushedItems.length} messages as pushed in Redis`)
    }
  } catch (error) {
    console.error('Error pushing to Telegram Bot:', error)
  }
}

// 后台更新缓存（异步，不阻塞请求）
async function updateCacheInBackground() {
  if (isUpdating) {
    console.log('Cache update already in progress, skipping...')
    return
  }
  
  isUpdating = true
  try {
    console.log('Starting background cache update...')
    
    // 确保 Redis 已连接
    await initRedis()
    
    const feeds = parseOPML()
    const securityItems = await fetchAllSecurityFeeds(feeds)
    
    // 获取上次推送后的新数据
    const now = Date.now()
    const cutoffTime = lastTelegramPushTime > 0 ? lastTelegramPushTime : now - TELEGRAM_PUSH_INTERVAL
    
    // 过滤出新的数据（基于发布时间）
    const timeBasedNewItems = securityItems.filter(item => {
      if (!item.pubDate) return false
      const itemTime = new Date(item.pubDate).getTime()
      return itemTime > cutoffTime
    })
    
    cachedSecurityItems = securityItems
    lastCacheTime = now
    
    console.log(`Cache updated successfully: ${securityItems.length} items (${timeBasedNewItems.length} new by time)`)
    
    // 如果有新数据，推送到 Telegram（pushToTelegramBot 内部会进行 Redis 去重）
    if (timeBasedNewItems.length > 0) {
      const timeRange = lastTelegramPushTime > 0
        ? `过去 ${Math.floor((now - lastTelegramPushTime) / 60000)} 分钟`
        : '最近 30 分钟'
      await pushToTelegramBot(timeBasedNewItems, timeRange)
    } else {
      console.log('No new items by time, skipping Telegram push')
    }
  } catch (error) {
    console.error('Error updating cache in background:', error)
  } finally {
    isUpdating = false
  }
}

// 共享的安全内容处理函数
async function handleSecurityFeed(req: express.Request, res: express.Response) {
  try {
    const category = req.query.category as string | undefined
    const validCategories = ['blockchain_attack', 'vulnerability_disclosure', 'exploit', 'smart_contract_bug']
    const categoryFilter = category && validCategories.includes(category) 
      ? category as 'blockchain_attack' | 'vulnerability_disclosure' | 'exploit' | 'smart_contract_bug'
      : undefined
    
    const now = Date.now()
    const cacheAge = now - lastCacheTime
    const isCacheValid = cachedSecurityItems.length > 0 && cacheAge < CACHE_DURATION
    const needsBackgroundUpdate = cacheAge > BACKGROUND_UPDATE_INTERVAL
    
    // 如果有有效缓存，立即返回
    if (isCacheValid) {
      // 如果缓存较旧，在后台更新（不阻塞响应）
      if (needsBackgroundUpdate && !isUpdating) {
        updateCacheInBackground().catch(err => 
          console.error('Background update failed:', err)
        )
      }
      return renderSecurityPage(res, cachedSecurityItems, true, categoryFilter)
    }
    
    // 如果缓存过期但有旧数据，先返回旧数据，后台更新
    if (cachedSecurityItems.length > 0) {
      console.log('Cache expired, returning stale data and updating in background...')
      // 后台更新（不等待）
      if (!isUpdating) {
        updateCacheInBackground().catch(err => 
          console.error('Background update failed:', err)
        )
      }
      // 立即返回旧数据
      return renderSecurityPage(res, cachedSecurityItems, true, categoryFilter)
    }
    
    // 如果没有缓存，必须等待数据加载（首次访问）
    console.log('No cache available, fetching data...')
    const feeds = parseOPML()
    console.log(`Found ${feeds.length} RSS feeds`)
    
    const securityItems = await fetchAllSecurityFeeds(feeds)
    
    // 更新缓存
    cachedSecurityItems = securityItems
    lastCacheTime = now
    
    // 首次加载时，如果有 Telegram 配置，推送新数据
    // pushToTelegramBot 内部会进行 Redis 去重，避免重复推送
    const cutoffTime = lastTelegramPushTime > 0 ? lastTelegramPushTime : now - TELEGRAM_PUSH_INTERVAL
    const newItems = securityItems.filter(item => {
      if (!item.pubDate) return false
      const itemTime = new Date(item.pubDate).getTime()
      return itemTime > cutoffTime
    })
    
    if (newItems.length > 0) {
      const timeRange = lastTelegramPushTime > 0
        ? `过去 ${Math.floor((now - lastTelegramPushTime) / 60000)} 分钟`
        : '最近 30 分钟'
      // 异步推送，不阻塞响应（内部会进行 Redis 去重）
      pushToTelegramBot(newItems, timeRange).catch(err => 
        console.error('Telegram push failed:', err)
      )
    }
    
    renderSecurityPage(res, securityItems, false, categoryFilter)
  } catch (error) {
    console.error('Error fetching security feeds:', error)
    
    // 即使出错，如果有旧缓存，也返回旧数据
    if (cachedSecurityItems.length > 0) {
      console.log('Error occurred, returning stale cache data...')
      const category = req.query.category as string | undefined
      const validCategories = ['blockchain_attack', 'vulnerability_disclosure', 'exploit', 'smart_contract_bug']
      const fallbackCategoryFilter = category && validCategories.includes(category) 
        ? category as 'blockchain_attack' | 'vulnerability_disclosure' | 'exploit' | 'smart_contract_bug'
        : undefined
      return renderSecurityPage(res, cachedSecurityItems, true, fallbackCategoryFilter)
    }
    
    res.status(500).type('html').send(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8"/>
          <title>Error - Web3 Security</title>
          <link rel="stylesheet" href="/style.css" />
        </head>
        <body>
          <nav>
            <a href="/">Home</a>
            <a href="/security">Web3 Security</a>
          </nav>
          <h1>Error Loading Security Feeds</h1>
          <p>An error occurred while fetching security-related RSS feeds. Please try again later.</p>
          <p>Error: ${error instanceof Error ? error.message : 'Unknown error'}</p>
        </body>
      </html>
    `)
  }
}

// Home route - 直接展示安全内容
app.get('/', handleSecurityFeed)

app.get('/about', function (req, res) {
  res.sendFile(path.join(__dirname, '..', 'components', 'about.htm'))
})

// Example API endpoint - JSON
app.get('/api-data', (req, res) => {
  res.json({
    message: 'Here is some sample API data',
    items: ['apple', 'banana', 'cherry'],
  })
})

// Web3 Security RSS Feed
app.get('/security', handleSecurityFeed)

// Telegram webhook endpoint - 接收来自 Telegram 的 update 并转发到工作群
app.post('/api/telegram/webhook', async (req, res) => {
  try {
    // 可选的 webhook secret 验证
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET
    if (secret) {
      const header = req.headers['x-telegram-bot-api-secret-token'] as string | undefined
      if (header !== secret) {
        return res.status(401).send('Unauthorized')
      }
    }

    const update = req.body
    const info = extractMessageInfoFromUpdate(update)
    if (!info) {
      return res.status(400).json({ success: false, error: 'No message in update' })
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN || '8242493572:AAG55rSWBIyfubA6JExQAV8DYZdDAINLPY8'
    const forwardChatId = '-1002807276621'

    // 不要无限转发自己发出的消息：如果来自目标群，忽略
    if (info.fromChatId && String(info.fromChatId) === String(forwardChatId)) {
      console.log('Received message from forward target, ignoring to avoid loops')
      return res.status(200).json({ success: true, ignored: true })
    }

    const forwarded = await forwardTelegramMessage(botToken, info.fromChatId, info.messageId, forwardChatId)
    if (forwarded) {
      return res.status(200).json({ success: true })
    }
    return res.status(500).json({ success: false, error: 'Forward failed' })
  } catch (error) {
    console.error('Error in telegram webhook:', error)
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' })
  }
})

// API endpoint - 按分类获取安全数据
app.get('/api/security', async (req, res) => {
  try {
    const category = req.query.category as any
    const feeds = parseOPML()
    
    const securityItems = await fetchAllSecurityFeedsWithCategory(feeds, category)
    
    res.json({
      count: securityItems.length,
      category: category || 'all',
      items: securityItems,
    })
  } catch (error) {
    console.error('Error in /api/security:', error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// API endpoint - 只获取区块链攻击数据
app.get('/api/security/blockchain-attacks', async (req, res) => {
  try {
    const feeds = parseOPML()
    const items = await fetchAllSecurityFeedsWithCategory(feeds, 'blockchain_attack')
    
    res.json({
      count: items.length,
      category: 'blockchain_attack',
      items,
    })
  } catch (error) {
    console.error('Error in /api/security/blockchain-attacks:', error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// API endpoint - 只获取钱包被黑数据
app.get('/api/security/wallet-hacks', async (req, res) => {
  try {
    const feeds = parseOPML()
    const items = await fetchAllSecurityFeedsWithCategory(feeds, 'blockchain_attack')
    const walletHacks = items.filter(item => item.subcategory === 'wallet_hack')
    
    res.json({
      count: walletHacks.length,
      subcategory: 'wallet_hack',
      items: walletHacks,
    })
  } catch (error) {
    console.error('Error in /api/security/wallet-hacks:', error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// API endpoint - 只获取公链安全事件数据
app.get('/api/security/public-chain-attacks', async (req, res) => {
  try {
    const feeds = parseOPML()
    const items = await fetchAllSecurityFeedsWithCategory(feeds, 'blockchain_attack')
    const chainAttacks = items.filter(item => item.subcategory === 'public_chain_attack')
    
    res.json({
      count: chainAttacks.length,
      subcategory: 'public_chain_attack',
      items: chainAttacks,
    })
  } catch (error) {
    console.error('Error in /api/security/public-chain-attacks:', error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// API endpoint - 只获取跨链桥接被黑数据
app.get('/api/security/bridge-hacks', async (req, res) => {
  try {
    const feeds = parseOPML()
    const items = await fetchAllSecurityFeedsWithCategory(feeds, 'blockchain_attack')
    const bridgeHacks = items.filter(item => item.subcategory === 'bridge_hack')
    
    res.json({
      count: bridgeHacks.length,
      subcategory: 'bridge_hack',
      items: bridgeHacks,
    })
  } catch (error) {
    console.error('Error in /api/security/bridge-hacks:', error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// API endpoint - 只获取被盗资金数据
app.get('/api/security/stolen-funds', async (req, res) => {
  try {
    const feeds = parseOPML()
    const items = await fetchAllSecurityFeedsWithCategory(feeds, 'blockchain_attack')
    const stolenFunds = items.filter(item => item.subcategory === 'stolen_funds')
    
    res.json({
      count: stolenFunds.length,
      subcategory: 'stolen_funds',
      items: stolenFunds,
    })
  } catch (error) {
    console.error('Error in /api/security/stolen-funds:', error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// API endpoint - 只获取代码级别bug数据
app.get('/api/security/code-bugs', async (req, res) => {
  try {
    const feeds = parseOPML()
    const items = await fetchAllSecurityFeedsWithCategory(feeds, 'blockchain_attack')
    const codeBugs = items.filter(item => item.subcategory === 'code_bug')
    
    res.json({
      count: codeBugs.length,
      subcategory: 'code_bug',
      items: codeBugs,
    })
  } catch (error) {
    console.error('Error in /api/security/code-bugs:', error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

function renderSecurityPage(
  res: express.Response, 
  items: any[], 
  fromCache: boolean,
  categoryFilter?: 'blockchain_attack' | 'vulnerability_disclosure' | 'exploit' | 'smart_contract_bug'
) {
  // 确定要使用的数据源（优先使用缓存）
  const allItems = fromCache ? cachedSecurityItems : items
  
  // 根据筛选条件过滤数据
  const filteredItems = categoryFilter 
    ? allItems.filter(i => i.category === categoryFilter)
    : allItems
  
  // 统计各分类的数量（使用全部数据）
  const blockchainAttacks = allItems.filter(i => i.category === 'blockchain_attack')
  const vulnerabilityDisclosures = allItems.filter(i => i.category === 'vulnerability_disclosure')
  const exploits = allItems.filter(i => i.category === 'exploit')
  const contractBugs = allItems.filter(i => i.category === 'smart_contract_bug')
  
  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Web3 Security & Vulnerabilities</title>
        <link rel="stylesheet" href="/style.css" />
        <style>
          body {
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #333;
          }
          .header {
            margin-bottom: 2rem;
          }
          .header h1 {
            color: #1a1a1a;
            margin-bottom: 0.5rem;
          }
          .header .meta {
            color: #666;
            font-size: 0.9rem;
          }
          .cache-badge {
            display: inline-block;
            background: #e8f5e9;
            color: #2e7d32;
            padding: 0.25rem 0.75rem;
            border-radius: 12px;
            font-size: 0.85rem;
            margin-left: 1rem;
          }
          .category-filters {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
            margin-bottom: 2rem;
          }
          .category-card {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 1.5rem;
            border-radius: 8px;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
            text-decoration: none;
            border: none;
          }
          .category-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 16px rgba(0,0,0,0.2);
          }
          .category-card.blockchain {
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
          }
          .category-card.vulnerability {
            background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
          }
          .category-card.exploit {
            background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
          }
          .category-card.contract {
            background: linear-gradient(135deg, #30cfd0 0%, #330867 100%);
          }
          .category-card h3 {
            margin: 0 0 0.5rem 0;
            font-size: 1.1rem;
          }
          .category-card .count {
            font-size: 2rem;
            font-weight: bold;
          }
          .items-container {
            display: grid;
            gap: 1.5rem;
          }
          .item {
            background: #fff;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            padding: 1.5rem;
            transition: box-shadow 0.2s;
            position: relative;
          }
          .item::before {
            content: '';
            position: absolute;
            left: 0;
            top: 0;
            bottom: 0;
            width: 4px;
            border-radius: 8px 0 0 8px;
            background: #0066cc;
          }
          .item.blockchain_attack::before {
            background: #f5576c;
          }
          .item.vulnerability_disclosure::before {
            background: #00f2fe;
          }
          .item.exploit::before {
            background: #fee140;
          }
          .item.smart_contract_bug::before {
            background: #30cfd0;
          }
          .item:hover {
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          }
          .item-header {
            margin-bottom: 0.75rem;
          }
          .item-title {
            font-size: 1.25rem;
            font-weight: 600;
            margin: 0 0 0.5rem 0;
          }
          .item-title a {
            color: #1a1a1a;
            text-decoration: none;
          }
          .item-title a:hover {
            color: #0066cc;
            text-decoration: underline;
          }
          .item-meta {
            font-size: 0.85rem;
            color: #666;
            margin-bottom: 0.75rem;
          }
          .item-category-badge {
            display: inline-block;
            padding: 0.25rem 0.75rem;
            border-radius: 12px;
            font-size: 0.75rem;
            font-weight: 600;
            margin-right: 0.75rem;
            background: #f0f0f0;
            color: #666;
          }
          .item-category-badge.blockchain_attack {
            background: #fce4ec;
            color: #c2185b;
          }
          .item-category-badge.vulnerability_disclosure {
            background: #e0f7fa;
            color: #00838f;
          }
          .item-category-badge.exploit {
            background: #fff3e0;
            color: #e65100;
          }
          .item-category-badge.smart_contract_bug {
            background: #e0f2f1;
            color: #004d40;
          }
          .item-meta .feed-name {
            color: #0066cc;
            font-weight: 500;
          }
          .item-meta .date {
            margin-left: 1rem;
          }
          .item-content {
            color: #555;
            line-height: 1.6;
            margin-left: 12px;
          }
          .item-content p {
            margin: 0.5rem 0;
          }
          .item-content a {
            color: #0066cc;
            text-decoration: none;
          }
          .item-content a:hover {
            text-decoration: underline;
          }
          .no-items {
            text-align: center;
            padding: 3rem;
            color: #666;
          }
          .loading {
            text-align: center;
            padding: 3rem;
            color: #666;
          }
          .stats {
            background: #f5f5f5;
            padding: 1rem;
            border-radius: 8px;
            margin-bottom: 2rem;
            font-size: 0.9rem;
            color: #666;
          }
          .stats-breakdown {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 1rem;
            margin-top: 1rem;
          }
          .stat-item {
            background: white;
            padding: 0.75rem;
            border-radius: 4px;
            border-left: 3px solid #0066cc;
            cursor: pointer;
            transition: all 0.2s;
            text-decoration: none;
            display: block;
            color: inherit;
          }
          .stat-item:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
            background: #fafafa;
          }
          .stat-item.active {
            background: #f0f7ff;
            border-left-width: 4px;
          }
          .stat-item.blockchain_attack {
            border-left-color: #f5576c;
          }
          .stat-item.vulnerability_disclosure {
            border-left-color: #00f2fe;
          }
          .stat-item.exploit {
            border-left-color: #fee140;
          }
          .stat-item.smart_contract_bug {
            border-left-color: #30cfd0;
          }
          .stat-item-label {
            font-size: 0.75rem;
            color: #999;
            text-transform: uppercase;
          }
          .stat-item-count {
            font-size: 1.5rem;
            font-weight: bold;
            color: #333;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Web3 Security & Vulnerabilities Feed</h1>
          <div class="meta">
            Latest security-related news and vulnerabilities from Web3 RSS feeds
            ${fromCache ? '<span class="cache-badge">Cached</span>' : ''}
          </div>
        </div>
        <div class="stats">
          ${categoryFilter 
            ? `<div style="margin-bottom: 0.5rem;">
                <a href="/" style="color: #0066cc; text-decoration: none; font-size: 0.9rem;">← Back to All</a>
                <span style="margin: 0 0.5rem; color: #999;">|</span>
                <span style="color: #666;">Filtered by: <strong>${getCategoryLabel(categoryFilter)}</strong></span>
              </div>`
            : ''
          }
          Found <strong>${filteredItems.length}</strong> security-related articles
          ${categoryFilter ? ` (${allItems.length} total)` : ''}
          <div class="stats-breakdown">
            <a href="/" class="stat-item ${!categoryFilter ? 'active' : ''}" style="border-left-color: #333;">
              <div class="stat-item-label">All</div>
              <div class="stat-item-count">${allItems.length}</div>
            </a>
            <a href="/?category=blockchain_attack" class="stat-item blockchain_attack ${categoryFilter === 'blockchain_attack' ? 'active' : ''}">
              <div class="stat-item-label">Blockchain Attacks</div>
              <div class="stat-item-count">${blockchainAttacks.length}</div>
            </a>
            <a href="/?category=vulnerability_disclosure" class="stat-item vulnerability_disclosure ${categoryFilter === 'vulnerability_disclosure' ? 'active' : ''}">
              <div class="stat-item-label">Vulnerability Disclosures</div>
              <div class="stat-item-count">${vulnerabilityDisclosures.length}</div>
            </a>
            <a href="/?category=exploit" class="stat-item exploit ${categoryFilter === 'exploit' ? 'active' : ''}">
              <div class="stat-item-label">Exploits</div>
              <div class="stat-item-count">${exploits.length}</div>
            </a>
            <a href="/?category=smart_contract_bug" class="stat-item smart_contract_bug ${categoryFilter === 'smart_contract_bug' ? 'active' : ''}">
              <div class="stat-item-label">Smart Contract Bugs</div>
              <div class="stat-item-count">${contractBugs.length}</div>
            </a>
          </div>
        </div>
        <div class="items-container">
          ${filteredItems.length === 0 
            ? `<div class="no-items"><p>No ${categoryFilter ? getCategoryLabel(categoryFilter).toLowerCase() : 'security-related'} articles found at this time.</p></div>`
            : filteredItems.map(item => `
              <div class="item ${item.category || ''}">
                <div class="item-header">
                  <h2 class="item-title">
                    <a href="${item.link}" target="_blank" rel="noopener noreferrer">
                      ${escapeHtml(item.title)}
                    </a>
                  </h2>
                  <div class="item-meta">
                    ${item.category ? `<span class="item-category-badge ${item.category}">${getCategoryLabel(item.category)}</span>` : ''}
                    ${item.subcategory ? `<span class="item-category-badge" style="background: #e8eaf6; color: #3f51b5;">${getSubcategoryLabel(item.subcategory)}</span>` : ''}
                    <span class="feed-name">${escapeHtml(item.feedTitle)}</span>
                    ${item.pubDate ? `<span class="date">${formatDate(item.pubDate)}</span>` : ''}
                  </div>
                </div>
                <div class="item-content">
                  ${item.contentSnippet 
                    ? `<p>${escapeHtml(item.contentSnippet.substring(0, 300))}${item.contentSnippet.length > 300 ? '...' : ''}</p>`
                    : item.content
                    ? `<p>${escapeHtml(item.content.substring(0, 300))}${item.content.length > 300 ? '...' : ''}</p>`
                    : '<p>No preview available</p>'
                  }
                </div>
              </div>
            `).join('')
          }
        </div>
      </body>
    </html>
  `
  
  res.type('html').send(html)
}

function escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return text.replace(/[&<>"']/g, m => map[m])
}

function getCategoryLabel(category: string): string {
  const labels: { [key: string]: string } = {
    'blockchain_attack': '🔴 Blockchain Attack',
    'vulnerability_disclosure': '🔵 Vulnerability Disclosure',
    'exploit': '🟡 Exploit',
    'smart_contract_bug': '🟢 Smart Contract Bug',
  }
  return labels[category] || category
}

function getSubcategoryLabel(subcategory: string): string {
  const labels: { [key: string]: string } = {
    'wallet_hack': '💼 Wallet Hack',
    'public_chain_attack': '⛓️ Public Chain Attack',
    'bridge_hack': '🌉 Bridge Hack',
    'stolen_funds': '💰 Stolen Funds',
    'code_bug': '🐛 Code Bug',
  }
  return labels[subcategory] || subcategory
}

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateString
  }
}

// Health check
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Vercel Cron Job endpoint - 每30分钟被 Vercel 自动调用
app.get('/api/cron/update-cache', async (req, res) => {
  // 验证请求来自 Vercel Cron（可选，但推荐）
  const authHeader = req.headers.authorization
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    console.log('Cron job triggered: updating cache and pushing to Telegram...')
    await updateCacheInBackground()
    res.status(200).json({ 
      success: true, 
      message: 'Cache updated and pushed to Telegram',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Cron job failed:', error)
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    })
  }
})

// 本地开发时的定时任务（仅在非 serverless 环境中运行）
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  console.log('Setting up local scheduled task: update and push every 30 minutes...')
  cron.schedule('*/30 * * * *', async () => {
    console.log('Local scheduled task triggered: updating cache and pushing to Telegram...')
    await updateCacheInBackground()
  })
}

// 启动时立即执行一次（可选，用于初始化）
// updateCacheInBackground().catch(err => console.error('Initial update failed:', err))

// 手动触发 Telegram 推送（带 Redis 去重）
app.get('/api/telegram/push', async (req, res) => {
  try {
    console.log('Manual Telegram push triggered...')
    
    // 确保 Redis 已连接
    await initRedis()
    
    // 获取最新数据
    const feeds = parseOPML()
    const allItems = await fetchAllSecurityFeeds(feeds)
    
    // 获取最近的数据（最近30分钟或最近10条）
    const now = Date.now()
    const cutoffTime = now - (30 * 60 * 1000) // 最近30分钟
    
    const recentItems = allItems
      .filter(item => {
        if (!item.pubDate) return false
        const itemTime = new Date(item.pubDate).getTime()
        return itemTime > cutoffTime
      })
      .slice(0, 10) // 最多10条
    
    // 如果没有最近的数据，使用最新的10条
    const itemsToPush = recentItems.length > 0 ? recentItems : allItems.slice(0, 10)
    
    const timeRange = recentItems.length > 0 
      ? '最近 30 分钟'
      : '最新数据'
    
    // 使用 pushToTelegramBot 函数，它会自动进行 Redis 去重
    await pushToTelegramBot(itemsToPush, timeRange)
    
    // 获取实际推送的数量（通过再次过滤）
    const unpushedItems = await filterPushedMessages(itemsToPush)
    const actuallyPushedCount = itemsToPush.length - unpushedItems.length
    
    res.json({ 
      success: true, 
      itemsCount: itemsToPush.length,
      actuallyPushedCount,
      skippedCount: unpushedItems.length,
      timeRange 
    })
  } catch (error) {
    console.error('Error in manual Telegram push:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

export default app
