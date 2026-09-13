import { Redis } from "@upstash/redis";
import dotenv from "dotenv";
dotenv.config();

let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (!_redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
      throw new Error("Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN env vars");
    }
    _redis = new Redis({ url, token });
  }
  return _redis;
}
