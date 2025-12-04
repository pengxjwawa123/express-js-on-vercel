import Parser from 'rss-parser';
const parser = new Parser({
    timeout: 5000, // 减少超时时间，快速失败
    maxRedirects: 3, // 减少重定向次数
});
// 区块链攻击相关关键词（包括钱包、公链攻击和被盗）
const BLOCKCHAIN_ATTACK_KEYWORDS = [
    // 基础区块链攻击
    'blockchain attack', '区块链攻击', '51% attack', '51%攻击',
    'double spending', '双花', 'sybil attack', 'sybil攻击',
    'eclipse attack', 'eclipse攻击', 'ddos attack', 'ddos攻击',
    'network attack', '网络攻击', 'transaction attack', '交易攻击',
    'consensus attack', '共识攻击', 'mining attack', '挖矿攻击',
    'hash rate', 'nonce attack', 'fork attack', '分叉攻击',
    'selfish mining', '自私挖矿', 'transaction malleability', '交易延展性',
    'replay attack', '重放攻击', 'finney attack', 'griefing attack',
    // 钱包相关
    'wallet hack', '钱包被黑', 'wallet compromise', '钱包被入侵',
    'wallet vulnerability', '钱包漏洞', 'wallet breach', '钱包泄露',
    'private key leak', '私钥泄露', 'seed phrase stolen', '种子短语被盗',
    'hardware wallet vulnerability', '硬件钱包漏洞', 'ledger vulnerability', 'ledger漏洞',
    'metamask vulnerability', 'metamask漏洞', 'metamask hack', 'metamask被黑',
    'trust wallet hack', 'trust wallet被黑', 'wallet draining', '钱包资金被清空',
    'mnemonic leaked', '助记词泄露', 'key extraction', '密钥提取',
    // 公链安全事件
    'ethereum attack', '以太坊攻击', 'ethereum hack', '以太坊被黑',
    'ethereum vulnerability', '以太坊漏洞', 'ethereum bug', '以太坊漏洞',
    'bitcoin attack', '比特币攻击', 'bitcoin vulnerability', '比特币漏洞',
    'bsc attack', 'bsc被黑', 'binance chain vulnerability', '币安智能链漏洞',
    'polygon attack', 'polygon被黑', 'polygon vulnerability', 'polygon漏洞',
    'solana attack', 'solana被黑', 'solana vulnerability', 'solana漏洞',
    'avalanche vulnerability', 'avalanche漏洞', 'avalanche attack', 'avalanche被黑',
    'optimism vulnerability', 'optimism漏洞', 'arbitrum vulnerability', 'arbitrum漏洞',
    'zkSync vulnerability', 'zkSync漏洞', 'starknet vulnerability', 'starknet漏洞',
    'base network vulnerability', 'base chain漏洞',
    // 被盗/损失事件
    'funds stolen', '资金被盗', 'stolen funds', '被盗资金',
    'millions stolen', '百万资金被盗', 'millions lost', '百万资金丢失',
    'bridge hack', '跨链桥接被黑', 'bridge exploit', '跨链桥接被利用',
    'bridge vulnerability', '跨链桥接漏洞', 'cross chain vulnerability', '跨链漏洞',
    'protocol hack', '协议被黑', 'protocol exploit', '协议被利用',
    'exchange hack', '交易所被黑', 'exchange vulnerability', '交易所漏洞',
    'dex vulnerability', 'dex漏洞', 'dex hack', 'dex被黑',
    'liquidity pool hack', '流动性池被黑', 'flash loan attack', '闪电贷攻击',
    'token theft', '代币被盗', 'theft', '盗窃',
    'hacked', '被黑', 'compromised', '被入侵', 'breached', '被突破',
    'stolen', '被盗',
    // 代码级别问题
    'contract audit failure', '合约审计失败', 'code vulnerability', '代码漏洞',
    'zero knowledge bug', '零知识证明漏洞', 'cryptographic flaw', '密码学缺陷',
    'implementation bug', '实现漏洞', 'logic error', '逻辑错误',
    'upgrade vulnerability', '升级漏洞', 'proxy vulnerability', '代理漏洞'
];
// 漏洞披露相关关键词
const VULNERABILITY_DISCLOSURE_KEYWORDS = [
    'vulnerability disclosure', '漏洞披露', 'cve disclosure', 'cve',
    'security advisory', '安全公告', 'security alert', '安全警报',
    'vulnerability report', '漏洞报告', 'disclosed vulnerability', '披露漏洞',
    'bug bounty', 'bug报告', 'responsible disclosure', '负责任披露',
    'vulnerability fix', '漏洞修复', 'patch', '补丁', 'security patch', '安全补丁',
    'fixed vulnerability', '修复漏洞', 'issue fixed', '问题修复',
    'vulnerability announcement', '漏洞公告', '0-day', 'zero-day', 'zero day'
];
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
];
// 利用代码相关关键词
const EXPLOIT_KEYWORDS = [
    'exploit', '漏洞利用', 'exploit code', '利用代码', 'poc', 'proof of concept',
    'working exploit', '可用利用', 'public exploit', '公开利用',
    'metasploit', 'exploit kit', 'attack tool', '攻击工具',
    'malicious code', '恶意代码', 'backdoor', '后门', 'trojan', '木马',
    'malware', '恶意软件', 'ransomware', '勒索软件', 'worm', '蠕虫'
];
// 钱包相关关键词检测
function isWalletHack(text) {
    const walletKeywords = [
        'wallet hack', '钱包被黑', 'wallet compromise', '钱包被入侵',
        'wallet vulnerability', '钱包漏洞', 'wallet breach', '钱包泄露',
        'private key leak', '私钥泄露', 'seed phrase stolen', '种子短语被盗',
        'hardware wallet', '硬件钱包', 'metamask', 'trust wallet', 'ledger',
        'mnemonic leaked', '助记词泄露', 'key extraction', '密钥提取'
    ];
    return walletKeywords.some(keyword => text.includes(keyword));
}
// 公链攻击相关关键词检测
function isPublicChainAttack(text) {
    const chainKeywords = [
        'ethereum', 'bitcoin', 'bsc', 'binance smart chain',
        'polygon', 'solana', 'avalanche', 'arbitrum', 'optimism',
        'zkSync', 'starknet', 'base network', 'base chain',
        'layer 2', 'l2', '以太坊', '比特币', '币安',
    ];
    return chainKeywords.some(keyword => text.includes(keyword));
}
// 跨链桥接被黑检测
function isBridgeHack(text) {
    const bridgeKeywords = [
        'bridge hack', 'bridge exploit', 'bridge vulnerability',
        'cross chain vulnerability', 'crosschain hack',
        '跨链桥接', 'wormhole', 'nomad', 'ronin', 'poly network',
        'bridge security', '桥接漏洞'
    ];
    return bridgeKeywords.some(keyword => text.includes(keyword));
}
// 被盗资金检测
function isStolenFunds(text) {
    const stolenKeywords = [
        'funds stolen', 'stolen funds', 'millions stolen', 'millions lost',
        'funds lost', 'liquidity pool hack', 'flash loan attack', 'token theft',
        'theft', 'hacked', 'compromised', 'breached', 'stolen',
        '资金被盗', '百万', '被黑', '被入侵', '被突破', '被盗', '漏洞'
    ];
    // 需要组合检查，避免误判
    return stolenKeywords.some(keyword => text.includes(keyword)) &&
        (text.includes('hack') || text.includes('stolen') || text.includes('lost') ||
            text.includes('被黑') || text.includes('被盗') || text.includes('丢失'));
}
// 代码级别bug检测
function isCodeBug(text) {
    const codeKeywords = [
        'code vulnerability', 'implementation bug', 'logic error',
        'zero knowledge bug', 'cryptographic flaw', 'upgrade vulnerability',
        'proxy vulnerability', 'contract audit', '代码漏洞', '实现漏洞',
        '逻辑错误', '密码学', '升级'
    ];
    return codeKeywords.some(keyword => text.includes(keyword));
}
function getSubcategory(item) {
    const combined = `${(item.title || '').toLowerCase()} ${((item.content || item.contentSnippet || '')).toLowerCase()}`;
    // 按优先级检测子分类
    if (isBridgeHack(combined))
        return 'bridge_hack';
    if (isWalletHack(combined))
        return 'wallet_hack';
    if (isStolenFunds(combined))
        return 'stolen_funds';
    if (isPublicChainAttack(combined))
        return 'public_chain_attack';
    if (isCodeBug(combined))
        return 'code_bug';
    return undefined;
}
function categorizeSecurityItem(item) {
    const title = (item.title || '').toLowerCase();
    const content = ((item.content || item.contentSnippet || '')).toLowerCase();
    const combined = `${title} ${content}`;
    // 优先级顺序：区块链攻击 > 漏洞披露 > 利用代码 > 合约漏洞
    if (BLOCKCHAIN_ATTACK_KEYWORDS.some(keyword => combined.includes(keyword.toLowerCase()))) {
        return 'blockchain_attack';
    }
    if (VULNERABILITY_DISCLOSURE_KEYWORDS.some(keyword => combined.includes(keyword.toLowerCase()))) {
        return 'vulnerability_disclosure';
    }
    if (EXPLOIT_KEYWORDS.some(keyword => combined.includes(keyword.toLowerCase()))) {
        return 'exploit';
    }
    if (SMART_CONTRACT_KEYWORDS.some(keyword => combined.includes(keyword.toLowerCase()))) {
        return 'smart_contract_bug';
    }
    return null;
}
export function isSecurityRelated(item) {
    return categorizeSecurityItem(item) !== null;
}
export async function fetchRSSFeed(feed) {
    try {
        const parsed = await parser.parseURL(feed.xmlUrl);
        const items = [];
        for (const item of parsed.items || []) {
            if (isSecurityRelated(item)) {
                const category = categorizeSecurityItem(item);
                const subcategory = getSubcategory(item);
                // 选择最合适的文章链接：优先使用 item.link / guid / enclosure.url，然后 OPML 提供的 htmlUrl，再 fallback 到 feed.xmlUrl
                const articleLink = item.link || item.guid || (item.enclosure && item.enclosure.url) || feed.htmlUrl || feed.xmlUrl || '';
                items.push({
                    title: item.title || 'Untitled',
                    link: articleLink,
                    content: item.content,
                    contentSnippet: item.contentSnippet,
                    pubDate: item.pubDate,
                    feedTitle: feed.title,
                    feedUrl: feed.xmlUrl,
                    feedHtml: feed.htmlUrl,
                    category: category || undefined,
                    subcategory: subcategory,
                });
            }
        }
        return items;
    }
    catch (error) {
        console.error(`Error fetching feed ${feed.title}:`, error);
        return [];
    }
}
export async function fetchAllSecurityFeeds(feeds) {
    return fetchAllSecurityFeedsWithCategory(feeds);
}
// 计算字符串相似度（简单的 Levenshtein 距离归一化）
function calculateSimilarity(str1, str2) {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    if (s1 === s2)
        return 1.0;
    if (s1.length === 0 || s2.length === 0)
        return 0.0;
    // 如果一个是另一个的子串，给予较高相似度
    if (s1.includes(s2) || s2.includes(s1)) {
        return Math.min(s1.length, s2.length) / Math.max(s1.length, s2.length);
    }
    // 简单的单词重叠度
    const words1 = new Set(s1.split(/\s+/));
    const words2 = new Set(s2.split(/\s+/));
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    return intersection.size / union.size;
}
// 标准化 URL（移除查询参数、锚点等）
function normalizeUrl(url) {
    try {
        const urlObj = new URL(url);
        return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`.toLowerCase();
    }
    catch {
        return url.toLowerCase();
    }
}
// 去重函数
function deduplicateItems(items) {
    if (items.length === 0)
        return items;
    const linkMap = new Map(); // 按链接索引
    const titleMap = new Map(); // 按标准化标题索引
    for (const item of items) {
        // 1. 首先按链接去重（标准化 URL）
        const normalizedLink = normalizeUrl(item.link);
        if (normalizedLink && linkMap.has(normalizedLink)) {
            // 如果链接相同，保留发布日期更早的（通常是原始来源）
            const existing = linkMap.get(normalizedLink);
            const itemDate = item.pubDate ? new Date(item.pubDate).getTime() : 0;
            const existingDate = existing.pubDate ? new Date(existing.pubDate).getTime() : 0;
            if (itemDate > 0 && (existingDate === 0 || itemDate < existingDate)) {
                // 替换为更早的版本
                linkMap.set(normalizedLink, item);
                // 同时更新标题索引
                const normalizedTitle = item.title.toLowerCase().trim();
                if (normalizedTitle) {
                    titleMap.set(normalizedTitle, item);
                }
            }
            continue;
        }
        // 2. 检查标题相似度（避免同一篇文章的不同来源）
        const normalizedTitle = item.title.toLowerCase().trim();
        let isDuplicate = false;
        if (normalizedTitle) {
            // 检查完全相同的标题
            if (titleMap.has(normalizedTitle)) {
                const existing = titleMap.get(normalizedTitle);
                const existingLink = normalizeUrl(existing.link);
                // 如果链接也相同，已经在第一步处理了，跳过
                if (normalizedLink && normalizedLink === existingLink) {
                    continue;
                }
                // 标题相同但链接不同，保留发布日期更早的
                const itemDate = item.pubDate ? new Date(item.pubDate).getTime() : 0;
                const existingDate = existing.pubDate ? new Date(existing.pubDate).getTime() : 0;
                if (itemDate > 0 && (existingDate === 0 || itemDate < existingDate)) {
                    // 替换为更早的版本
                    linkMap.delete(existingLink);
                    linkMap.set(normalizedLink || existingLink, item);
                    titleMap.set(normalizedTitle, item);
                }
                isDuplicate = true;
            }
            else {
                // 检查相似标题（相似度 > 0.85）
                for (const [existingTitle, existing] of titleMap.entries()) {
                    const similarity = calculateSimilarity(normalizedTitle, existingTitle);
                    if (similarity > 0.85) {
                        const existingLink = normalizeUrl(existing.link);
                        // 如果链接也相同，已经在第一步处理了，跳过
                        if (normalizedLink && normalizedLink === existingLink) {
                            isDuplicate = true;
                            break;
                        }
                        // 保留发布日期更早的
                        const itemDate = item.pubDate ? new Date(item.pubDate).getTime() : 0;
                        const existingDate = existing.pubDate ? new Date(existing.pubDate).getTime() : 0;
                        if (itemDate > 0 && (existingDate === 0 || itemDate < existingDate)) {
                            // 替换为更早的版本
                            linkMap.delete(existingLink);
                            linkMap.set(normalizedLink || existingLink, item);
                            titleMap.delete(existingTitle);
                            titleMap.set(normalizedTitle, item);
                        }
                        isDuplicate = true;
                        break;
                    }
                }
            }
        }
        if (!isDuplicate) {
            if (normalizedLink) {
                linkMap.set(normalizedLink, item);
            }
            if (normalizedTitle) {
                titleMap.set(normalizedTitle, item);
            }
        }
    }
    // 返回去重后的结果
    return Array.from(linkMap.values());
}
export async function fetchAllSecurityFeedsWithCategory(feeds, categoryFilter) {
    const allItems = [];
    // 并发获取，但限制并发数以避免过载
    // 减少批量大小，加快处理速度
    const batchSize = 20;
    for (let i = 0; i < feeds.length; i += batchSize) {
        const batch = feeds.slice(i, i + batchSize);
        const results = await Promise.allSettled(batch.map(feed => fetchRSSFeed(feed)));
        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                allItems.push(...result.value);
            }
            else {
                // 静默处理失败，不阻塞其他请求
                console.warn(`Failed to fetch feed ${batch[index]?.title}:`, result.reason?.message || 'Unknown error');
            }
        });
    }
    // 去重处理
    console.log(`Before deduplication: ${allItems.length} items`);
    const deduplicatedItems = deduplicateItems(allItems);
    console.log(`After deduplication: ${deduplicatedItems.length} items (removed ${allItems.length - deduplicatedItems.length} duplicates)`);
    // 按分类筛选（如果指定）
    let filteredItems = deduplicatedItems;
    if (categoryFilter) {
        filteredItems = deduplicatedItems.filter(item => item.category === categoryFilter);
    }
    // 按发布日期排序（最新的在前）
    filteredItems.sort((a, b) => {
        const dateA = a.pubDate ? new Date(a.pubDate).getTime() : 0;
        const dateB = b.pubDate ? new Date(b.pubDate).getTime() : 0;
        return dateB - dateA;
    });
    return filteredItems;
}
