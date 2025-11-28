import cron from 'node-cron'
import { parseOPML } from './opmlParser.js'
import { fetchAllSecurityFeeds } from './rssService.js'
import { setCacheValue, isRedisConnected } from './redisCache.js'

let cronTask: cron.ScheduledTask | null = null
let isSchedulerRunning = false

/**
 * 执行RSS数据抓取和缓存
 */
export async function fetchAndCacheRSSData() {
  try {
    console.log(`[Scheduler] Starting RSS data fetch at ${new Date().toISOString()}`)
    
    const feeds = parseOPML()
    console.log(`[Scheduler] Found ${feeds.length} RSS feeds`)
    
    const securityItems = await fetchAllSecurityFeeds(feeds)
    console.log(`[Scheduler] Fetched ${securityItems.length} security items`)
    
    // 存储到Redis
    if (isRedisConnected()) {
      const redisKey = 'security_feeds:all'
      const success = await setCacheValue(redisKey, JSON.stringify(securityItems), 60 * 60) // 1小时过期
      
      if (success) {
        console.log(`[Scheduler] ✅ Successfully cached ${securityItems.length} items to Redis`)
      } else {
        console.error('[Scheduler] ❌ Failed to cache data to Redis')
      }
    } else {
      console.warn('[Scheduler] ⚠️ Redis not connected, skipping cache update')
    }
    
    console.log(`[Scheduler] Completed at ${new Date().toISOString()}`)
  } catch (error) {
    console.error('[Scheduler] Error during RSS fetch and cache:', error)
  }
}

/**
 * 启动定时任务（使用cron）
 * @param cronExpression - cron表达式，默认每30分钟执行一次
 */
export async function startScheduler(cronExpression: string = '*/30 * * * *') {
  try {
    if (isSchedulerRunning && cronTask) {
      console.warn('[Scheduler] Scheduler already running')
      return
    }

    console.log(`[Scheduler] Starting scheduler with cron expression: "${cronExpression}"`)

    // 立即执行一次
    console.log('[Scheduler] Executing initial fetch immediately...')
    await fetchAndCacheRSSData()

    // 使用cron创建定时任务
    cronTask = cron.schedule(cronExpression, async () => {
      console.log(`[Scheduler] ⏰ Cron task triggered at ${new Date().toISOString()}`)
      await fetchAndCacheRSSData()
    })

    isSchedulerRunning = true
    console.log(`[Scheduler] Scheduler started successfully (cron: "${cronExpression}")`)
  } catch (error) {
    console.error('[Scheduler] Failed to start scheduler:', error)
  }
}

/**
 * 停止定时任务
 */
export function stopScheduler() {
  try {
    if (cronTask) {
      cronTask.stop()
      cronTask = null
      isSchedulerRunning = false
      console.log('[Scheduler] Scheduler stopped')
    }
  } catch (error) {
    console.error('[Scheduler] Error stopping scheduler:', error)
  }
}

/**
 * 获取调度器状态
 */
export function getSchedulerStatus() {
  return {
    running: isSchedulerRunning,
    status: isSchedulerRunning ? 'Running' : 'Not running',
    nextRunTime: isSchedulerRunning ? 'Every 30 minutes' : 'N/A',
  }
}

/**
 * 手动触发一次数据抓取
 */
export async function triggerSchedulerOnce() {
  console.log('[Scheduler] Manual trigger at', new Date().toISOString())
  await fetchAndCacheRSSData()
}
