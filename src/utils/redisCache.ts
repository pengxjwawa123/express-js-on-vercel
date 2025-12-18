import { createClient, type RedisClientType } from 'redis'

let redisClient: RedisClientType | null = null
let isConnected = false

// 初始化Redis连接
export async function initRedis(): Promise<RedisClientType | null> {
  try {
    // 如果已经连接，直接返回
    if (isConnected && redisClient) {
      return redisClient
    }

    // 从环境变量获取Redis配置，如果没有则使用本地默认值
    const redisUrl = process.env.REDIS_URL || 'redis://default:cTQLM83DSLaZY4xn1dKeqomfHV1NI3n5@redis-17471.c278.us-east-1-4.ec2.cloud.redislabs.com:17471'
    
    redisClient = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error('Failed to reconnect to Redis after 10 attempts')
            return new Error('Redis reconnection failed')
          }
          return retries * 100 // 重连延迟：100ms, 200ms, 300ms...
        },
      },
    })

    // 监听错误事件
    redisClient.on('error', (err: Error) => {
      console.error('Redis client error:', err)
      isConnected = false
    })

    redisClient.on('connect', () => {
      console.log('Redis connected')
      isConnected = true
    })

    redisClient.on('ready', () => {
      console.log('Redis ready')
    })

    redisClient.on('end', () => {
      console.log('Redis connection closed')
      isConnected = false
    })

    // 连接到Redis
    await redisClient.connect()
    isConnected = true
    console.log('Redis client initialized and connected')
    return redisClient
  } catch (error) {
    console.error('Failed to initialize Redis:', error)
    isConnected = false
    return null
  }
}

// 获取缓存值
export async function getCacheValue(key: string): Promise<string | null> {
  try {
    if (!isConnected || !redisClient) {
      console.warn('Redis not connected, cannot get cache')
      return null
    }
    const value = await redisClient.get(key)
    return value as string | null
  } catch (error) {
    console.error(`Error getting cache for key ${key}:`, error)
    return null
  }
}

// 设置缓存值（带过期时间）
export async function setCacheValue(
  key: string,
  value: string,
  expirationSeconds: number = 3600
): Promise<boolean> {
  try {
    if (!isConnected || !redisClient) {
      console.warn('Redis not connected, cannot set cache')
      return false
    }
    await redisClient.setEx(key, expirationSeconds, value)
    return true
  } catch (error) {
    console.error(`Error setting cache for key ${key}:`, error)
    return false
  }
}

// 删除缓存
export async function deleteCacheValue(key: string): Promise<boolean> {
  try {
    if (!isConnected || !redisClient) {
      console.warn('Redis not connected, cannot delete cache')
      return false
    }
    await redisClient.del(key)
    return true
  } catch (error) {
    console.error(`Error deleting cache for key ${key}:`, error)
    return false
  }
}

// 清空所有缓存
export async function clearAllCache(): Promise<boolean> {
  try {
    if (!isConnected || !redisClient) {
      console.warn('Redis not connected, cannot clear cache')
      return false
    }
    await redisClient.flushDb()
    console.log('All cache cleared')
    return true
  } catch (error) {
    console.error('Error clearing all cache:', error)
    return false
  }
}

// 检查连接状态
export function isRedisConnected(): boolean {
  return isConnected && redisClient !== null
}

// 关闭Redis连接
export async function closeRedis(): Promise<void> {
  try {
    if (redisClient) {
      await redisClient.quit()
      isConnected = false
      redisClient = null
      console.log('Redis connection closed')
    }
  } catch (error) {
    console.error('Error closing Redis connection:', error)
  }
}

// 获取缓存统计信息
export async function getCacheStats(): Promise<{
  isConnected: boolean
  dbSize: number
  info: string | null
} | null> {
  try {
    if (!isConnected || !redisClient) {
      return {
        isConnected: false,
        dbSize: 0,
        info: null,
      }
    }

    const dbSize = await redisClient.dbSize()
    const info = await redisClient.info()

    return {
      isConnected: true,
      dbSize,
      info,
    }
  } catch (error) {
    console.error('Error getting cache stats:', error)
    return null
  }
}

// 已推送消息的 Redis key 前缀
const PUSHED_MESSAGES_KEY = 'telegram:pushed_messages'

// 生成消息的唯一标识（使用链接，如果链接不可用则使用标题+链接的组合）
function getMessageId(item: { link?: string; title?: string; feedUrl?: string }): string {
  // 优先使用链接作为唯一标识
  if (item.link) {
    try {
      // 标准化 URL（移除查询参数和锚点，保留协议、主机和路径）
      const url = new URL(item.link)
      return `${url.protocol}//${url.host}${url.pathname}`.toLowerCase()
    } catch {
      // 如果 URL 解析失败，直接使用原始链接
      return item.link.toLowerCase()
    }
  }
  // 如果没有链接，使用标题+feedUrl的组合
  const title = (item.title || '').toLowerCase().trim()
  const feedUrl = (item.feedUrl || '').toLowerCase().trim()
  return `${title}:${feedUrl}`
}

// 检查消息是否已推送
export async function isMessagePushed(item: { link?: string; title?: string; feedUrl?: string }): Promise<boolean> {
  try {
    if (!isConnected || !redisClient) {
      console.warn('Redis not connected, cannot check pushed messages')
      return false
    }
    
    const messageId = getMessageId(item)
    const exists = await redisClient.sIsMember(PUSHED_MESSAGES_KEY, messageId)
    return Boolean(exists)
  } catch (error) {
    console.error('Error checking if message is pushed:', error)
    return false
  }
}

// 批量检查消息是否已推送
export async function filterPushedMessages<T extends { link?: string; title?: string; feedUrl?: string }>(
  items: T[]
): Promise<T[]> {
  try {
    if (!isConnected || !redisClient) {
      console.warn('Redis not connected, cannot filter pushed messages')
      return items // 如果 Redis 不可用，返回所有消息（避免丢失）
    }
    
    const messageIds = items.map(item => getMessageId(item))
    const pushedSet = new Set<string>()
    
    // 批量检查（使用 pipeline 提高性能）
    const pipeline = redisClient.multi()
    messageIds.forEach(id => {
      pipeline.sIsMember(PUSHED_MESSAGES_KEY, id)
    })
    const results = await pipeline.exec()
    
    // 收集已推送的消息 ID
    results?.forEach((result, index) => {
      if (result && result[1] === 1) {
        pushedSet.add(messageIds[index])
      }
    })
    
    // 过滤出未推送的消息
    const unpushedItems = items.filter(item => {
      const messageId = getMessageId(item)
      return !pushedSet.has(messageId)
    })
    
    console.log(`Filtered ${items.length} items: ${unpushedItems.length} new, ${items.length - unpushedItems.length} already pushed`)
    return unpushedItems
  } catch (error) {
    console.error('Error filtering pushed messages:', error)
    return items // 出错时返回所有消息
  }
}

// 标记消息为已推送（单个）
export async function markMessageAsPushed(
  item: { link?: string; title?: string; feedUrl?: string },
  expirationHours: number = 48
): Promise<boolean> {
  try {
    if (!isConnected || !redisClient) {
      console.warn('Redis not connected, cannot mark message as pushed')
      return false
    }
    
    const messageId = getMessageId(item)
    const expirationSeconds = expirationHours * 3600
    
    // 使用 SET 存储已推送的消息 ID，并设置过期时间
    // 由于 Redis Set 不支持单个成员的过期时间，我们使用一个带过期时间的 key
    // 每次添加新成员时，更新整个 Set 的过期时间
    await redisClient.sAdd(PUSHED_MESSAGES_KEY, messageId)
    await redisClient.expire(PUSHED_MESSAGES_KEY, expirationSeconds)
    
    return true
  } catch (error) {
    console.error('Error marking message as pushed:', error)
    return false
  }
}

// 批量标记消息为已推送
export async function markMessagesAsPushed(
  items: Array<{ link?: string; title?: string; feedUrl?: string }>,
  expirationHours: number = 48
): Promise<boolean> {
  try {
    if (!isConnected || !redisClient) {
      console.warn('Redis not connected, cannot mark messages as pushed')
      return false
    }
    
    if (items.length === 0) {
      return true
    }
    
    const messageIds = items.map(item => getMessageId(item))
    const expirationSeconds = expirationHours * 3600
    
    // 批量添加到 Set
    if (messageIds.length > 0) {
      await redisClient.sAdd(PUSHED_MESSAGES_KEY, messageIds)
      // 更新过期时间
      await redisClient.expire(PUSHED_MESSAGES_KEY, expirationSeconds)
      console.log(`Marked ${messageIds.length} messages as pushed in Redis`)
    }
    
    return true
  } catch (error) {
    console.error('Error marking messages as pushed:', error)
    return false
  }
}

// 获取已推送消息的数量
export async function getPushedMessagesCount(): Promise<number> {
  try {
    if (!isConnected || !redisClient) {
      return 0
    }
    return await redisClient.sCard(PUSHED_MESSAGES_KEY)
  } catch (error) {
    console.error('Error getting pushed messages count:', error)
    return 0
  }
}

// 清空已推送消息记录（用于测试或重置）
export async function clearPushedMessages(): Promise<boolean> {
  try {
    if (!isConnected || !redisClient) {
      console.warn('Redis not connected, cannot clear pushed messages')
      return false
    }
    await redisClient.del(PUSHED_MESSAGES_KEY)
    console.log('Cleared all pushed messages from Redis')
    return true
  } catch (error) {
    console.error('Error clearing pushed messages:', error)
    return false
  }
}
