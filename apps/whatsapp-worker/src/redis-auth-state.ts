import Redis from 'ioredis';
import { AuthenticationState, AuthenticationCreds, SignalDataTypeMap, initAuthCreds, BufferJSON } from '@whiskeysockets/baileys';

/**
 * Redis-based auth state for Baileys
 * This allows WhatsApp sessions to be shared across multiple worker instances
 * enabling horizontal scaling of the WhatsApp worker
 */
export async function useRedisAuthState(redis: Redis, tenantId: string): Promise<{
    state: AuthenticationState;
    saveCreds: () => Promise<void>;
}> {
    const prefix = `whatsapp:auth:${tenantId}`;

    const writeData = async (key: string, data: any): Promise<void> => {
        const serialized = JSON.stringify(data, BufferJSON.replacer);
        await redis.set(`${prefix}:${key}`, serialized);
    };

    const readData = async (key: string): Promise<any> => {
        const data = await redis.get(`${prefix}:${key}`);
        if (!data) return null;
        return JSON.parse(data, BufferJSON.reviver);
    };

    const removeData = async (key: string): Promise<void> => {
        await redis.del(`${prefix}:${key}`);
    };

    // Initialize or load creds
    let creds: AuthenticationCreds = await readData('creds');
    if (!creds) {
        creds = initAuthCreds();
        await writeData('creds', creds);
    }

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data: { [_: string]: SignalDataTypeMap[typeof type] } = {};
                    await Promise.all(
                        ids.map(async (id) => {
                            const value = await readData(`${type}-${id}`);
                            if (value) {
                                // Handle pre-key special case
                                if (type === 'pre-key' && value && value.keyPair) {
                                    data[id] = value;
                                } else {
                                    data[id] = value;
                                }
                            }
                        })
                    );
                    return data;
                },
                set: async (data) => {
                    const tasks: Promise<void>[] = [];
                    for (const [category, categoryData] of Object.entries(data)) {
                        for (const [id, value] of Object.entries(categoryData)) {
                            const key = `${category}-${id}`;
                            tasks.push(value ? writeData(key, value) : removeData(key));
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: async () => {
            await writeData('creds', creds);
        }
    };
}

/**
 * Clear all auth data for a tenant from Redis
 */
export async function clearRedisAuthState(redis: Redis, tenantId: string): Promise<void> {
    const prefix = `whatsapp:auth:${tenantId}`;
    const keys = await redis.keys(`${prefix}:*`);
    if (keys.length > 0) {
        await redis.del(...keys);
    }
}
