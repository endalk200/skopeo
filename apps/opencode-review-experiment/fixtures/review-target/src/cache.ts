type CacheEntry = {
	value: string;
	expiresAt: number;
};

const cache = new Map<string, CacheEntry>();

export function putCacheValue(key: string, value: string, ttlMs: number) {
	cache.set(key, {
		value,
		expiresAt: Date.now() + ttlMs,
	});
}

export function getCacheValue(key: string) {
	const entry = cache.get(key);
	if (!entry) {
		return undefined;
	}

	if (Date.now() > entry.expiresAt) {
		cache.delete(key);
		return undefined;
	}

	return entry.value;
}
