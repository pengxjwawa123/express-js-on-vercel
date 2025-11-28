import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseOPML } from './utils/opmlParser.js'
import { fetchAllSecurityFeedsWithCategory } from './utils/rssService.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()

// 静态文件服务
app.use(express.static(path.join(__dirname, '..', 'public')))

// 缓存安全相关的 RSS 内容
let cachedSecurityItems: any[] = []
let lastCacheTime = 0
const CACHE_DURATION = 30 * 60 * 1000 // 30分钟缓存

// Home route - HTML
app.get('/', (req, res) => {
  res.type('html').send(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8"/>
        <title>Express on Vercel</title>
        <link rel="stylesheet" href="/style.css" />
      </head>
      <body>
        <nav>
          <a href="/">Home</a>
          <a href="/about">About</a>
          <a href="/api-data">API Data</a>
          <a href="/security">Web3 Security</a>
          <a href="/healthz">Health</a>
        </nav>
        <h1>Welcome to Express on Vercel 🚀</h1>
        <p>This is a minimal example without a database or forms.</p>
        <img src="/logo.png" alt="Logo" width="120" />
      </body>
    </html>
  `)
})

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
app.get('/security', async (req, res) => {
  try {
    const now = Date.now()
    
    // 检查缓存是否有效
    if (cachedSecurityItems.length > 0 && (now - lastCacheTime) < CACHE_DURATION) {
      return renderSecurityPage(res, cachedSecurityItems, true)
    }
    
    // 解析 OPML 并获取所有 feeds
    const feeds = parseOPML()
    console.log(`Found ${feeds.length} RSS feeds`)
    
    // 获取所有安全相关的内容
    const securityItems = await fetchAllSecurityFeedsWithCategory(feeds)
    
    // 更新缓存
    cachedSecurityItems = securityItems
    lastCacheTime = now
    
    renderSecurityPage(res, securityItems, false)
  } catch (error) {
    console.error('Error fetching security feeds:', error)
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

// API endpoint - 只获取漏洞披露数据
app.get('/api/security/vulnerabilities', async (req, res) => {
  try {
    const feeds = parseOPML()
    const items = await fetchAllSecurityFeedsWithCategory(feeds, 'vulnerability_disclosure')
    
    res.json({
      count: items.length,
      category: 'vulnerability_disclosure',
      items,
    })
  } catch (error) {
    console.error('Error in /api/security/vulnerabilities:', error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

function renderSecurityPage(res: express.Response, items: any[], fromCache: boolean) {
  const blockchainAttacks = items.filter(i => i.category === 'blockchain_attack')
  const vulnerabilityDisclosures = items.filter(i => i.category === 'vulnerability_disclosure')
  const exploits = items.filter(i => i.category === 'exploit')
  const contractBugs = items.filter(i => i.category === 'smart_contract_bug')
  
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
          nav {
            margin-bottom: 2rem;
            padding-bottom: 1rem;
            border-bottom: 2px solid #e0e0e0;
          }
          nav a {
            margin-right: 1.5rem;
            text-decoration: none;
            color: #0066cc;
            font-weight: 500;
          }
          nav a:hover {
            text-decoration: underline;
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
        <nav>
          <a href="/">Home</a>
          <a href="/about">About</a>
          <a href="/api-data">API Data</a>
          <a href="/security">Web3 Security</a>
          <a href="/healthz">Health</a>
        </nav>
        <div class="header">
          <h1>Web3 Security & Vulnerabilities Feed</h1>
          <div class="meta">
            Latest security-related news and vulnerabilities from Web3 RSS feeds
            ${fromCache ? '<span class="cache-badge">Cached</span>' : ''}
          </div>
        </div>
        <div class="stats">
          Found <strong>${items.length}</strong> security-related articles
          <div class="stats-breakdown">
            <div class="stat-item blockchain_attack">
              <div class="stat-item-label">Blockchain Attacks</div>
              <div class="stat-item-count">${blockchainAttacks.length}</div>
            </div>
            <div class="stat-item vulnerability_disclosure">
              <div class="stat-item-label">Vulnerability Disclosures</div>
              <div class="stat-item-count">${vulnerabilityDisclosures.length}</div>
            </div>
            <div class="stat-item exploit">
              <div class="stat-item-label">Exploits</div>
              <div class="stat-item-count">${exploits.length}</div>
            </div>
            <div class="stat-item smart_contract_bug">
              <div class="stat-item-label">Smart Contract Bugs</div>
              <div class="stat-item-count">${contractBugs.length}</div>
            </div>
          </div>
        </div>
        <div class="items-container">
          ${items.length === 0 
            ? '<div class="no-items"><p>No security-related articles found at this time.</p></div>'
            : items.map(item => `
              <div class="item ${item.category || ''}">
                <div class="item-header">
                  <h2 class="item-title">
                    <a href="${item.link}" target="_blank" rel="noopener noreferrer">
                      ${escapeHtml(item.title)}
                    </a>
                  </h2>
                  <div class="item-meta">
                    ${item.category ? `<span class="item-category-badge ${item.category}">${getCategoryLabel(item.category)}</span>` : ''}
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

export default app
