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
  category?: 'blockchain_attack' | 'vulnerability_disclosure' | 'exploit' | 'smart_contract_bug'
}

// 区块链攻击相关关键词
const BLOCKCHAIN_ATTACK_KEYWORDS = [
  'blockchain attack', '区块链攻击', '51% attack', '51%攻击',
  'double spending', '双花', 'sybil attack', 'sybil攻击',
  'eclipse attack', 'eclipse攻击', 'ddos attack', 'ddos攻击',
  'network attack', '网络攻击', 'transaction attack', '交易攻击',
  'consensus attack', '共识攻击', 'mining attack', '挖矿攻击',
  'hash rate', 'nonce attack', 'fork attack', '分叉攻击',
  'selfish mining', '自私挖矿', 'transaction malleability', '交易延展性',
  'replay attack', '重放攻击', 'finney attack', 'griefing attack'
]

// 漏洞披露相关关键词
const VULNERABILITY_DISCLOSURE_KEYWORDS = [
  'vulnerability disclosure', '漏洞披露', 'cve disclosure', 'cve',
  'security advisory', '安全公告', 'security alert', '安全警报',
  'vulnerability report', '漏洞报告', 'disclosed vulnerability', '披露漏洞',
  'bug bounty', 'bug报告', 'responsible disclosure', '负责任披露',
  'vulnerability fix', '漏洞修复', 'patch', '补丁', 'security patch', '安全补丁',
  'fixed vulnerability', '修复漏洞', 'issue fixed', '问题修复',
  'vulnerability announcement', '漏洞公告', '0-day', 'zero-day', 'zero day'
]

// 合约漏洞相关关键词
const SMART_CONTRACT_KEYWORDS = [
  'smart contract vulnerability', '智能合约漏洞', 'contract bug', '合约漏洞',
  'reentrancy', '重入攻击', 'overflow', '溢出', 'underflow', '下溢',
  'access control', '访问控制', 'authorization', '授权问题',
  'privilege escalation', '权限提升', 'logic bug', '逻辑漏洞',
  'unchecked external call', '未检查外部调用', 'front-running', '抢跑',
  'gas limit dependency', 'timestamp dependency', 'delegatecall', '委托调用',
  'contract audit', '合约审计', 'solidity bug', 'solidity漏洞',
  'smart contract security', '智能合约安全', 'evm bug', 'contract flaw'
]

// 利用代码相关关键词
const EXPLOIT_KEYWORDS = [
  'exploit', '漏洞利用', 'exploit code', '利用代码', 'poc', 'proof of concept',
  'working exploit', '可用利用', 'public exploit', '公开利用',
  'metasploit', 'exploit kit', 'attack tool', '攻击工具',
  'malicious code', '恶意代码', 'backdoor', '后门', 'trojan', '木马',
  'malware', '恶意软件', 'ransomware', '勒索软件', 'worm', '蠕虫'
]

type ItemCategory = 'blockchain_attack' | 'vulnerability_disclosure' | 'exploit' | 'smart_contract_bug' | null

function categorizeSecurityItem(item: any): ItemCategory {
  const title = (item.title || '').toLowerCase()
  const content = ((item.content || item.contentSnippet || '')).toLowerCase()
  const combined = `${title} ${content}`
  
  // 优先级顺序：区块链攻击 > 漏洞披露 > 利用代码 > 合约漏洞
  if (BLOCKCHAIN_ATTACK_KEYWORDS.some(keyword => combined.includes(keyword.toLowerCase()))) {
    return 'blockchain_attack'
  }
  if (VULNERABILITY_DISCLOSURE_KEYWORDS.some(keyword => combined.includes(keyword.toLowerCase()))) {
    return 'vulnerability_disclosure'
  }
  if (EXPLOIT_KEYWORDS.some(keyword => combined.includes(keyword.toLowerCase()))) {
    return 'exploit'
  }
  if (SMART_CONTRACT_KEYWORDS.some(keyword => combined.includes(keyword.toLowerCase()))) {
    return 'smart_contract_bug'
  }
  
  return null
}

export function isSecurityRelated(item: any): boolean {
  return categorizeSecurityItem(item) !== null
}

export async function fetchRSSFeed(feed: RSSFeed): Promise<RSSItem[]> {
  try {
    const parsed = await parser.parseURL(feed.xmlUrl)
    const items: RSSItem[] = []
    
    for (const item of parsed.items || []) {
      if (isSecurityRelated(item)) {
        const category = categorizeSecurityItem(item)
        items.push({
          title: item.title || 'Untitled',
          link: item.link || feed.htmlUrl || '',
          content: item.content,
          contentSnippet: item.contentSnippet,
          pubDate: item.pubDate,
          feedTitle: feed.title,
          feedUrl: feed.xmlUrl,
          category: category || undefined,
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
  return fetchAllSecurityFeedsWithCategory(feeds)
}

export async function fetchAllSecurityFeedsWithCategory(
  feeds: RSSFeed[],
  categoryFilter?: 'blockchain_attack' | 'vulnerability_disclosure' | 'exploit' | 'smart_contract_bug'
): Promise<RSSItem[]> {
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
  
  // 按分类筛选（如果指定）
  let filteredItems = allItems
  if (categoryFilter) {
    filteredItems = allItems.filter(item => item.category === categoryFilter)
  }
  
  // 按发布日期排序（最新的在前）
  filteredItems.sort((a, b) => {
    const dateA = a.pubDate ? new Date(a.pubDate).getTime() : 0
    const dateB = b.pubDate ? new Date(b.pubDate).getTime() : 0
    return dateB - dateA
  })
  
  return filteredItems
}

