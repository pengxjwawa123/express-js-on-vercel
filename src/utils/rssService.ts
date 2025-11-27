import Parser from 'rss-parser'
import { RSSFeed } from './opmlParser.js'

const parser = new Parser({
  timeout: 10000,
  maxRedirects: 5,
})

export interface RSSItem {
  title: string
  link: string
  content?: string
  contentSnippet?: string
  pubDate?: string
  feedTitle: string
  feedUrl: string
}

// 安全相关的关键词
const SECURITY_KEYWORDS = [
  'security', 'vulnerability', 'vulnerabilities', 'exploit', 'exploits',
  'hack', 'hacked', 'hacking', 'breach', 'breaches', 'attack', 'attacks',
  'bug', 'bugs', 'exploit', 'exploits', 'audit', 'audits', 'audited',
  'secure', 'insecurity', 'risk', 'risks', 'threat', 'threats',
  'malicious', 'malware', 'phishing', 'scam', 'scams', 'fraud',
  'zero-day', 'zero day', 'cve', 'cve-', 'security issue', 'security issues',
  'security flaw', 'security flaws', 'security bug', 'security bugs',
  'smart contract', 'smart contracts', 'contract vulnerability',
  'reentrancy', 'overflow', 'underflow', 'access control',
  '安全', '漏洞', '攻击', '黑客', '审计', '风险', '威胁', '恶意',
  '钓鱼', '诈骗', '漏洞利用', '安全漏洞', '安全风险'
]

export function isSecurityRelated(item: any): boolean {
  const title = (item.title || '').toLowerCase()
  const content = ((item.content || item.contentSnippet || '')).toLowerCase()
  const combined = `${title} ${content}`
  
  return SECURITY_KEYWORDS.some(keyword => 
    combined.includes(keyword.toLowerCase())
  )
}

export async function fetchRSSFeed(feed: RSSFeed): Promise<RSSItem[]> {
  try {
    const parsed = await parser.parseURL(feed.xmlUrl)
    const items: RSSItem[] = []
    
    for (const item of parsed.items || []) {
      if (isSecurityRelated(item)) {
        items.push({
          title: item.title || 'Untitled',
          link: item.link || feed.htmlUrl || '',
          content: item.content,
          contentSnippet: item.contentSnippet,
          pubDate: item.pubDate,
          feedTitle: feed.title,
          feedUrl: feed.xmlUrl,
        })
      }
    }
    
    return items
  } catch (error) {
    console.error(`Error fetching feed ${feed.title}:`, error)
    return []
  }
}

export async function fetchAllSecurityFeeds(feeds: RSSFeed[]): Promise<RSSItem[]> {
  const allItems: RSSItem[] = []
  
  // 并发获取，但限制并发数以避免过载
  const batchSize = 10
  for (let i = 0; i < feeds.length; i += batchSize) {
    const batch = feeds.slice(i, i + batchSize)
    const results = await Promise.all(
      batch.map(feed => fetchRSSFeed(feed))
    )
    
    results.forEach(items => {
      allItems.push(...items)
    })
  }
  
  // 按发布日期排序（最新的在前）
  allItems.sort((a, b) => {
    const dateA = a.pubDate ? new Date(a.pubDate).getTime() : 0
    const dateB = b.pubDate ? new Date(b.pubDate).getTime() : 0
    return dateB - dateA
  })
  
  return allItems
}

