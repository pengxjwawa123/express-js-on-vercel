import { createClient } from 'redis';
let redisClient = null;
let isConnected = false;
// 初始化Redis连接
export async function initRedis() {
    try {
        // 如果已经连接，直接返回
        if (isConnected && redisClient) {
            return redisClient;
        }
        // 从环境变量获取Redis配置，如果没有则使用本地默认值
        const redisUrl = process.env.REDIS_URL || 'redis://default:cTQLM83DSLaZY4xn1dKeqomfHV1NI3n5@redis-17471.c278.us-east-1-4.ec2.cloud.redislabs.com:17471';
        redisClient = createClient({
            url: redisUrl,
            socket: {
                reconnectStrategy: (retries) => {
                    if (retries > 10) {
                        console.error('Failed to reconnect to Redis after 10 attempts');
                        return new Error('Redis reconnection failed');
                    }
                    return retries * 100; // 重连延迟：100ms, 200ms, 300ms...
                },
            },
        });
        // 监听错误事件
        redisClient.on('error', (err) => {
            console.error('Redis client error:', err);
            isConnected = false;
        });
        redisClient.on('connect', () => {
            console.log('Redis connected');
            isConnected = true;
        });
        redisClient.on('ready', () => {
            console.log('Redis ready');
        });
        redisClient.on('end', () => {
            console.log('Redis connection closed');
            isConnected = false;
        });
        // 连接到Redis
        await redisClient.connect();
        isConnected = true;
        console.log('Redis client initialized and connected');
        return redisClient;
    }
    catch (error) {
        console.error('Failed to initialize Redis:', error);
        isConnected = false;
        return null;
    }
}
// 获取缓存值
export async function getCacheValue(key) {
    try {
        if (!isConnected || !redisClient) {
            console.warn('Redis not connected, cannot get cache');
            return null;
        }
        const value = await redisClient.get(key);
        return value;
    }
    catch (error) {
        console.error(`Error getting cache for key ${key}:`, error);
        return null;
    }
}
// 设置缓存值（带过期时间）
export async function setCacheValue(key, value, expirationSeconds = 3600) {
    try {
        if (!isConnected || !redisClient) {
            console.warn('Redis not connected, cannot set cache');
            return false;
        }
        await redisClient.setEx(key, expirationSeconds, value);
        return true;
    }
    catch (error) {
        console.error(`Error setting cache for key ${key}:`, error);
        return false;
    }
}
// 删除缓存
export async function deleteCacheValue(key) {
    try {
        if (!isConnected || !redisClient) {
            console.warn('Redis not connected, cannot delete cache');
            return false;
        }
        await redisClient.del(key);
        return true;
    }
    catch (error) {
        console.error(`Error deleting cache for key ${key}:`, error);
        return false;
    }
}
// 清空所有缓存
export async function clearAllCache() {
    try {
        if (!isConnected || !redisClient) {
            console.warn('Redis not connected, cannot clear cache');
            return false;
        }
        await redisClient.flushDb();
        console.log('All cache cleared');
        return true;
    }
    catch (error) {
        console.error('Error clearing all cache:', error);
        return false;
    }
}
// 检查连接状态
export function isRedisConnected() {
    return isConnected && redisClient !== null;
}
// 关闭Redis连接
export async function closeRedis() {
    try {
        if (redisClient) {
            await redisClient.quit();
            isConnected = false;
            redisClient = null;
            console.log('Redis connection closed');
        }
    }
    catch (error) {
        console.error('Error closing Redis connection:', error);
    }
}
// 获取缓存统计信息
export async function getCacheStats() {
    try {
        if (!isConnected || !redisClient) {
            return {
                isConnected: false,
                dbSize: 0,
                info: null,
            };
        }
        const dbSize = await redisClient.dbSize();
        const info = await redisClient.info();
        return {
            isConnected: true,
            dbSize,
            info,
        };
    }
    catch (error) {
        console.error('Error getting cache stats:', error);
        return null;
    }
}
