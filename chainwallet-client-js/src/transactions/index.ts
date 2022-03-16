import { BigNumberish } from 'ethers'
import { id } from 'ethers/lib/utils'

export interface ContractInteractionTransactionResponse {
  data: string
  hash: string
}

export interface Transaction {
  agentAddress: string
  toAddress: string
  value: BigNumberish
  nonce: BigNumberish
  gasLimit: BigNumberish
  gasPrice: BigNumberish
  data: string
  signature: string
}

interface TransactionTypes {
  sendEthers: string
  contractInteraction: string
}

export const transactionTypes: TransactionTypes = {
  sendEthers: id('sendEthersTransaction'),
  contractInteraction: id('contractInteractionTransaction'),
}

export type TransactionType = keyof TransactionTypes
