import json
import time
from functools import wraps
from typing import Callable, Any

import redis.asyncio as redis
from app.deps import REDIS_URL

class TTLCache:
    """
    Redis-backed TTL Cache for exogenous signals.
    Avoids hitting external APIs repeatedly for the same queries.
    """
    def __init__(self, redis_url: str = REDIS_URL):
        self.redis_url = redis_url
        self._redis = None

    async def get_redis(self):
        if self._redis is None:
            self._redis = redis.from_url(self.redis_url, decode_responses=True)
        return self._redis

    async def get(self, key: str) -> Any | None:
        r = await self.get_redis()
        data = await r.get(key)
        if data:
            return json.loads(data)
        return None

    async def set(self, key: str, value: Any, ttl_seconds: int):
        r = await self.get_redis()
        await r.setex(key, ttl_seconds, json.dumps(value))

    async def clear(self):
        r = await self.get_redis()
        await r.flushdb()


# Global cache instance
_cache = TTLCache()

def cached_with_ttl(source_type: str, ttl_seconds: int = 300):
    """
    Decorator for async connector functions to cache results in Redis.
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Create a deterministic cache key from arguments
            # e.g., 'weather:query=storm'
            key_parts = [source_type]
            for arg in args[1:]: # Skip 'self'
                key_parts.append(str(arg))
            for k, v in sorted(kwargs.items()):
                key_parts.append(f"{k}={v}")
            cache_key = ":".join(key_parts)
            
            cached_result = await _cache.get(cache_key)
            if cached_result is not None:
                return cached_result
                
            # If not in cache, call the function
            result = await func(*args, **kwargs)
            
            # Cache the result
            # Assuming the result is a list of dataclasses, we need to serialize them
            # For simplicity, if they are RawDocument, we can store their __dict__
            # Or assume the caller handles serialization if needed.
            # Here we just dump assuming json serializeable or we will serialize RawDocuments
            if isinstance(result, list):
                serialized = [r.__dict__ if hasattr(r, '__dict__') else r for r in result]
            else:
                serialized = result
                
            await _cache.set(cache_key, serialized, ttl_seconds)
            return result
        return wrapper
    return decorator
