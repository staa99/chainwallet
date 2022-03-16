import { INetworkClientInterface } from '../index'
import { Transaction, TransactionType, transactionTypes } from '../../transactions'
import { createCipheriv, randomBytes } from 'crypto'
import { Buffer } from 'buffer'
import { NFTStorage, File } from 'nft.storage'

export interface DefaultIpfsNetworkConfig {
  nftStorageApiKey: string
}

/**
 * A very simple implementation of a network based on IPFS that stores transaction data
 * publicly on the IPFS network. Actual transaction data is encrypted on the network, but
 * key information is stored in a manner that can be deterministically located by proxies.
 */
export class DefaultIpfsNetwork implements INetworkClientInterface {
  private client: NFTStorage

  constructor(config: DefaultIpfsNetworkConfig) {
    this.client = new NFTStorage({ token: config.nftStorageApiKey })
  }

  async sendTransaction(tx: Transaction, txType: TransactionType): Promise<string> {
    // generate key and iv
    const keyAndIV = randomBytes(48)
    const key = keyAndIV.slice(0, 32)
    const iv = keyAndIV.slice(32)

    // create cipher
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const ciphertextTx = Buffer.concat([
      cipher.update(JSON.stringify(tx), 'utf-8'),
      cipher.final(),
    ])

    const txHash = await this.client.storeBlob(
      new File(
        [
          Buffer.from(transactionTypes[txType].substring(2), 'hex'),
          cipher.getAuthTag(),
          ciphertextTx,
        ],
        ''
      )
    )
    return await this.client.storeBlob(
      new File([keyAndIV, Buffer.from(txHash, 'utf-8')], '')
    )
  }
}
