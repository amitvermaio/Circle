import Redis from "ioredis";

import { config } from "./config";

const redisOptions = {
  lazyConnect: true,
  maxRetriesPerRequest: null,
};

export const redisPublisher = new Redis(config.REDIS_URL, redisOptions);
export const redisSubscriber = new Redis(config.REDIS_URL, redisOptions);

