/**
 * Redis Connection Factory
 * 
 * Provides pluggable Redis connection configuration supporting:
 * - Standalone Redis (default)
 * - Redis Sentinel (HA)
 * - Redis Cluster (horizontal scaling)
 * 
 * CONFIGURATION:
 * - REDIS_URL: Standard redis://host:port URL (default mode)
 * - REDIS_MODE: "standalone" | "sentinel" | "cluster"
 * - REDIS_SENTINEL_HOSTS: Comma-separated sentinel hosts (for sentinel mode)
 * - REDIS_SENTINEL_NAME: Master name for sentinel
 * - REDIS_CLUSTER_NODES: Comma-separated cluster nodes (for cluster mode)
 * 
 * NOTE: This is infrastructure-ready configuration. Actual Sentinel/Cluster
 * deployment requires ops team provisioning.
 */

import Redis, { RedisOptions, ClusterOptions, ClusterNode, Cluster } from 'ioredis';
import { logger } from '@b2automate/logger';

export type RedisMode = 'standalone' | 'sentinel' | 'cluster';

export interface RedisConfig {
    mode: RedisMode;
    url?: string;
    sentinelHosts?: string[];
    sentinelMasterName?: string;
    clusterNodes?: ClusterNode[];
    password?: string;
}

/**
 * Parse Redis configuration from environment
 */
export function getRedisConfig(): RedisConfig {
    const mode = (process.env.REDIS_MODE || 'standalone') as RedisMode;
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    const password = process.env.REDIS_PASSWORD;

    const config: RedisConfig = { mode, url, password };

    if (mode === 'sentinel') {
        const sentinelHosts = process.env.REDIS_SENTINEL_HOSTS?.split(',').map(h => h.trim());
        const sentinelMasterName = process.env.REDIS_SENTINEL_NAME || 'mymaster';
        config.sentinelHosts = sentinelHosts;
        config.sentinelMasterName = sentinelMasterName;
    }

    if (mode === 'cluster') {
        const clusterNodes = process.env.REDIS_CLUSTER_NODES?.split(',').map(node => {
            const [host, port] = node.trim().split(':');
            return { host, port: parseInt(port || '6379', 10) };
        });
        config.clusterNodes = clusterNodes;
    }

    return config;
}

/**
 * Create Redis client based on configuration
 * Returns standard Redis client (works for standalone and sentinel)
 * 
 * For cluster mode, use createRedisCluster() instead
 */
export function createRedisClient(config?: RedisConfig): Redis {
    const cfg = config || getRedisConfig();

    if (cfg.mode === 'sentinel' && cfg.sentinelHosts?.length) {
        logger.info({
            mode: 'sentinel',
            hosts: cfg.sentinelHosts.length,
            masterName: cfg.sentinelMasterName
        }, 'Creating Redis Sentinel connection');

        const sentinels = cfg.sentinelHosts.map(host => {
            const [hostname, port] = host.split(':');
            return { host: hostname, port: parseInt(port || '26379', 10) };
        });

        const options: RedisOptions = {
            sentinels,
            name: cfg.sentinelMasterName,
            password: cfg.password,
            sentinelPassword: cfg.password,
            lazyConnect: true,
            enableReadyCheck: true,
            maxRetriesPerRequest: 3,
        };

        return new Redis(options);
    }

    // Default: Standalone mode
    logger.info({ mode: 'standalone', url: cfg.url?.replace(/:[^:@]+@/, ':***@') }, 'Creating Redis standalone connection');

    const options: RedisOptions = {
        lazyConnect: true,
        enableReadyCheck: true,
        maxRetriesPerRequest: 3,
    };

    if (cfg.password) {
        options.password = cfg.password;
    }

    return new Redis(cfg.url || 'redis://localhost:6379', options);
}

/**
 * Create Redis Cluster client
 * Only use when REDIS_MODE=cluster
 */
export function createRedisCluster(config?: RedisConfig): Cluster | null {
    const cfg = config || getRedisConfig();

    if (cfg.mode !== 'cluster' || !cfg.clusterNodes?.length) {
        logger.warn('createRedisCluster called but not in cluster mode or no nodes configured');
        return null;
    }

    logger.info({ mode: 'cluster', nodes: cfg.clusterNodes.length }, 'Creating Redis Cluster connection');

    const options: ClusterOptions = {
        redisOptions: {
            password: cfg.password,
        },
        lazyConnect: true,
        enableReadyCheck: true,
        maxRedirections: 16,
    };

    return new Cluster(cfg.clusterNodes, options);
}

/**
 * Health check for Redis connection
 */
export async function checkRedisHealth(redis: Redis): Promise<boolean> {
    try {
        const result = await redis.ping();
        return result === 'PONG';
    } catch (err) {
        logger.error({ err }, 'Redis health check failed');
        return false;
    }
}
