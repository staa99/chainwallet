import { createClient, RedisClientType } from 'redis'

export class RedisStore {
  lastBlockNumber: number
  redis: RedisClientType
  static readonly blockNumberKey = 'cw_proxy__LastBlockNumber'

  constructor() {
    this.lastBlockNumber = Number(process.env.START_BLOCK_NUMBER)
    if (isNaN(this.lastBlockNumber)) {
      throw Error('INVALID_START_BLOCK_NUMBER')
    }

    this.redis = createClient({
      url: process.env.REDIS_URL!,
    }) as never
  }

  async connect(): Promise<void> {
    this.redis.on('error', (err) => console.log('REDIS_CLIENT_ERROR:', err))
    await this.redis.connect()
  }

  async getLastBlockNumber(): Promise<number> {
    const value = await this.redis.get(RedisStore.blockNumberKey)

    if (!value) {
      await this.redis.set(RedisStore.blockNumberKey, this.lastBlockNumber)
      return this.lastBlockNumber
    }

    return Number(value)
  }

  async setLastBlockNumber(blockNumber: number): Promise<void> {
    const lastBlockNumber = await this.getLastBlockNumber()
    this.lastBlockNumber = Math.max(lastBlockNumber, blockNumber)
    await this.redis.set(RedisStore.blockNumberKey, this.lastBlockNumber)
  }
}
