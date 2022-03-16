import { BigNumberish, Contract, ContractReceipt } from 'ethers'

export interface ERC20Token {
  name: string
  symbol: string
  decimals: number
  contract: Contract
}

interface SendEthersTransactionData {
  type: 'sendEthers'
  subwallet: string
  to: string
  amount: BigNumberish
  hash: string
  completed: boolean
  receipt?: ContractReceipt
}

interface ContractInteractionTransactionData {
  type: 'contractInteraction'
  subwallet: string
  to: string
  amount: BigNumberish
  data: string
  hash: string
  completed: boolean
  receipt?: ContractReceipt
}

export type TransactionData =
  | SendEthersTransactionData
  | ContractInteractionTransactionData
