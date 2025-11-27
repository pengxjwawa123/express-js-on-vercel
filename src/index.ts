import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseOPML } from './utils/opmlParser.js'
import { fetchAllSecurityFeeds } from './utils/rssService.js'

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
    const securityItems = await fetchAllSecurityFeeds(feeds)
    
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

function renderSecurityPage(res: express.Response, items: any[], fromCache: boolean) {
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
        </div>
        <div class="items-container">
          ${items.length === 0 
            ? '<div class="no-items"><p>No security-related articles found at this time.</p></div>'
            : items.map(item => `
              <div class="item">
                <div class="item-header">
                  <h2 class="item-title">
                    <a href="${item.link}" target="_blank" rel="noopener noreferrer">
                      ${escapeHtml(item.title)}
                    </a>
                  </h2>
                  <div class="item-meta">
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
