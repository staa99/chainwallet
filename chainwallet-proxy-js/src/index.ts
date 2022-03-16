import dotenv from 'dotenv'
import validators from './validation'
import { RedisStore } from './storage'
import Watcher from './watcher'
import { Proxy } from './proxy'

dotenv.config()
async function main() {
  console.log('ChainWallet Proxy')
  console.log('Starting...')
  validators.environment.checkEnvironment()

  const redisStore = new RedisStore()
  await redisStore.connect()

  const watcher = new Watcher(redisStore)
  await watcher.connect()

  const proxy = new Proxy(watcher.contract!)

  watcher.onTransactionInitiated((locator) => {
    proxy.addLocator(locator)
  })

  await Promise.all([watcher.watch(), proxy.start()])
}

main().catch((e) => {
  console.error('Terminating from error')
  console.error(e)
  process.exitCode = -1
})
