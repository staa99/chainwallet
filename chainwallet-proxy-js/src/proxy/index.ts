import { PriorityQueue } from '../ds/PriorityQueue'
import { Transaction, transactionTypes } from '../transactions'
import axios, { AxiosInstance } from 'axios'
import { toUtf8String } from 'ethers/lib/utils'
import { ChainWalletMaster } from '../watcher/ChainWalletMaster'
import { BigNumber } from 'ethers'
import { createDecipheriv } from 'crypto'

type TransactionWithType = Transaction & { type: string }

export class Proxy {
  transactions: PriorityQueue<TransactionWithType>
  http: AxiosInstance
  contract: ChainWalletMaster

  constructor(contract: ChainWalletMaster) {
    this.http = axios.create({
      baseURL: process.env.IPFS_GATEWAY_BASE_URL,
    })
    this.transactions = new PriorityQueue<TransactionWithType>()
    this.contract = contract
  }

  async start(): Promise<void> {
    while (true) {
      while (this.transactions.size > 0) {
        const current = this.transactions.dequeue()!.value
        const overrides = {
          gasLimit: current.gasLimit,
          gasPrice: current.gasPrice,
        }
        try {
          switch (current.type) {
            case transactionTypes.sendEthers:
              await this.contract.estimateGas.sendEtherAsProxy(current, overrides)
              break
            case transactionTypes.contractInteraction:
              await this.contract.estimateGas.interactAsProxy(current, overrides)
              break
            default:
              throw Error('Unidentified transaction type')
          }
        } catch (e) {
          console.error('Transaction will fail\n', e)
          continue
        }

        try {
          let tx
          switch (current.type) {
            case transactionTypes.sendEthers:
              tx = await this.contract.sendEtherAsProxy(current, overrides)
              break
            case transactionTypes.contractInteraction:
              tx = await this.contract.interactAsProxy(current, overrides)
              break
          }

          // wait for one confirmation before processing additional requests
          if (tx) {
            await tx.wait()
          }
        } catch (e) {
          console.error('Transaction failed')
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
  }

  addLocator(locator: string): void {
    setImmediate(() => {
      this.locate(locator)
        .then((tx) => {
          if (!tx) {
            return
          }

          this.transactions.enqueue({
            priority: BigNumber.from(tx.gasPrice).mul(tx.gasLimit).toNumber(),
            value: tx,
          })
        })
        .catch((e) => {
          console.error('Could not locate', locator)
          console.error(e)
        })
    })
  }

  private async locate(locator: string): Promise<TransactionWithType | undefined> {
    const cid = toUtf8String(locator)
    const locatorResult = await this.http.get(cid, {
      responseType: 'arraybuffer',
    })

    const locatorBuffer = locatorResult.data as Buffer
    const locatorParts = [
      locatorBuffer.slice(0, 32),
      locatorBuffer.slice(32, 48),
      locatorBuffer.slice(48),
    ]
    const dataResult = await this.http.get(locatorParts[2].toString('utf-8'), {
      responseType: 'arraybuffer',
    })

    const dataBuffer = dataResult.data as Buffer
    const dataParts = [
      dataBuffer.slice(0, 32),
      dataBuffer.slice(32, 48),
      dataBuffer.slice(48),
    ]

    const decipher = createDecipheriv('aes-256-gcm', locatorParts[0], locatorParts[1])
    decipher.setAuthTag(dataParts[1])
    const plaintext = Buffer.concat([decipher.update(dataParts[2]), decipher.final()])
    const data = JSON.parse(plaintext.toString('utf-8')) as Transaction
    return {
      ...data,
      type: dataParts[1].toString('utf-8'),
    }
  }
}
