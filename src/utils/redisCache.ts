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
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
    
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
    return value
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
