import EventEmitter from 'events'
import { Contract, providers, Signer, Wallet } from 'ethers'
import abi from '../abis/ChainWalletMaster.json'
import { ChainWalletMaster, TransactionCreatedEvent } from './ChainWalletMaster'
import { RedisStore } from '../storage'

class Watcher {
  contract: ChainWalletMaster | undefined
  private readonly _emitter: EventEmitter
  private readonly _signer: Signer
  private readonly _store: RedisStore
  private readonly newTransactionEvent = 'transactions:new'

  constructor(store: RedisStore) {
    this._store = store
    this._emitter = new EventEmitter()
    this._signer = new Wallet(
      process.env.PRIVATE_KEY!,
      new providers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC_ENDPOINT)
    )
  }

  async connect(): Promise<void> {
    console.log('Connecting to blockchain')
    console.log('Chain ID:', await this._signer.getChainId())
    console.log('Balance:', await this._signer.getBalance())

    this.contract = new Contract(
      process.env.CONTRACT_ADDRESS!,
      abi,
      this._signer
    ) as ChainWalletMaster
    console.log('Connected to blockchain')
  }

  triggerEvent(event: TransactionCreatedEvent): void {
    console.log(`TransactionCreated: locator=${event.args.locator}`)
    this._emitter.emit(this.newTransactionEvent, event.args.locator)
  }

  async watch(): Promise<void> {
    if (!this.contract) {
      throw Error('You must call `connect` before starting')
    }

    const startBlock = (await this._store.getLastBlockNumber()) + 1
    console.log('Pulling logs from', startBlock)
    while (true) {
      try {
        const filter = this.contract.filters.TransactionCreated()
        const nextBlock = (await this._store.getLastBlockNumber()) + 1
        const transfers = await this.contract?.queryFilter(filter, nextBlock)

        for (const transfer of transfers) {
          if (transfer.blockNumber < nextBlock) {
            continue
          }
          this.triggerEvent(transfer)
        }

        if (!transfers.length) {
          await new Promise((resolve) => setTimeout((v) => resolve(v), 5000))
          continue
        }

        console.log('Processing log set')
        this._store
          .setLastBlockNumber(transfers[transfers.length - 1].blockNumber)
          .then(() => new Promise((resolve) => setTimeout((v) => resolve(v), 5000)))
          .catch((reason) => {
            // notify failure
            console.error('TRANSACTION_TRIGGER_FAILED', reason)
          })
      } catch (e) {
        console.error('TRANSACTION_POLL_ERROR', e)
      }
    }
  }

  onTransactionInitiated(listener: (args: string) => void): void {
    this._emitter.on(this.newTransactionEvent, (evtArgs) =>
      setImmediate(() => {
        // eslint-disable-next-line no-void
        void listener(evtArgs)
      })
    )
  }
}

export default Watcher
