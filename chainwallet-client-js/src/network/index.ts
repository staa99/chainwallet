import { Transaction, TransactionType } from '../transactions'

export interface INetworkClientInterface {
  /**
   * Broadcasts a transaction on the network and returns a 32-bytes locator
   * that can be used by agents in the network to locate the transaction
   *
   * @param tx The transaction to broadcast
   * @param txType The type of the transaction
   */
  sendTransaction(tx: Transaction, txType: TransactionType): Promise<string>
}
