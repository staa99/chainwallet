/* eslint-disable @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-return */
import { BigNumber, BigNumberish, Contract, ethers, Wallet } from 'ethers'
import { ChainWalletClient } from 'chainwallet-client'
import erc20 from '../abis/erc20.json'
import { formatUnits, parseUnits } from 'ethers/lib/utils'
import { ERC20Token, TransactionData } from './ERC20Token'

export class ChainWalletCLI {
  private signer?: Wallet
  private client?: ChainWalletClient
  private currentSubwallet?: string
  private readonly subwallets: string[]
  private readonly tokens: Map<string, ERC20Token>
  private readonly transactions: Map<string, TransactionData>

  constructor() {
    this.subwallets = []
    this.transactions = new Map<string, TransactionData>()
    this.tokens = new Map<string, ERC20Token>()
  }

  generateWallet(): void {
    this.signer = Wallet.createRandom()
    console.log('Generated EOA:', this.signer.address)
  }

  importWalletFromMnemonic(mnemonic: string): void {
    if (!ethers.utils.isValidMnemonic(mnemonic)) {
      throw Error('Invalid Mnemonic')
    }

    this.signer = Wallet.fromMnemonic(mnemonic)
    console.log('Imported EOA:', this.signer.address)
  }

  importWalletFromPrivateKey(key: string): void {
    this.signer = new Wallet(key)
    console.log('Imported EOA:', this.signer.address)
  }

  exportPrivateKey(): string {
    this.assertSigner()
    return this.signer!.privateKey
  }

  async connectWallet(rpcEndpoint: string): Promise<void> {
    this.assertSigner()
    this.client = new ChainWalletClient()
    const provider = new ethers.providers.JsonRpcProvider(rpcEndpoint)
    this.signer = this.signer!.connect(provider)
    await this.client.connect(this.signer)
    await this.loadSubwallets()
    if (this.subwallets.length) {
      this.selectSubwallet(this.subwallets[0])
    }
    console.log('Connected to Chain Wallet')
    this.client.setOnTransactionEmittedListener((hash, receipt) => {
      const tx = this.transactions.get(hash)
      if (!tx) {
        console.log('Hash not found:', hash)
        return
      }

      console.log('Transaction', hash, 'has been completed')
      tx.completed = true
      tx.receipt = receipt
    })
  }

  async createWallet(): Promise<void> {
    this.assertClient()
    if (this.subwallets.length) {
      throw Error('Account already setup')
    }

    const subwalletAddress = await this.client!.createWallet()
    console.log('Wallet Created:', subwalletAddress)
    await this.loadSubwallets()
    this.selectSubwallet(subwalletAddress)
  }

  async createSubwallet(): Promise<void> {
    this.assertClient()

    const subwalletAddress = await this.client!.createSubwallet()
    console.log('Wallet Created:', subwalletAddress)
    await this.loadSubwallets()
    this.selectSubwallet(subwalletAddress)
  }

  async loadSubwallets(): Promise<string[]> {
    try {
      this.assertClient()
      const subwallets = await this.client!.getSubwallets()
      if (this.subwallets.length !== subwallets.length) {
        this.subwallets.length = 0
        this.subwallets.push(...subwallets)
      }
      return this.subwallets
    } catch (e) {
      // Not registered
      console.log('Account Setup Required!')
      this.subwallets.length = 0
      return []
    }
  }

  selectSubwallet(subwallet: string): void {
    if (this.subwallets.indexOf(subwallet) === -1) {
      throw Error('Subwallet not found')
    }

    this.currentSubwallet = subwallet
    console.log('Connected as', subwallet)
  }

  async getBalance(): Promise<BigNumberish> {
    this.assertClient()
    this.assertSubwallet()

    return await this.signer!.provider.getBalance(this.currentSubwallet!)
  }

  async getERC20TokenBalance(symbol: string): Promise<BigNumberish> {
    this.assertClient()
    this.assertSubwallet()
    this.assertToken(symbol)

    const token = this.tokens.get(symbol)
    return await token!.contract.balanceOf(this.currentSubwallet)
  }

  async addERC20Token(tokenAddress: string): Promise<string> {
    this.assertClient()

    const tokenContract = new Contract(tokenAddress, erc20, this.signer)
    const symbol = await tokenContract.symbol()
    this.tokens.set(symbol, {
      name: await tokenContract.name(),
      symbol: symbol,
      decimals: await tokenContract.decimals(),
      contract: tokenContract,
    })

    return symbol
  }

  async sendEthers(recipient: string, amount: BigNumberish): Promise<void> {
    this.assertClient()
    this.assertSubwallet()

    const hash = await this.client!.sendEthersPrivately(
      this.currentSubwallet!,
      recipient,
      amount
    )
    this.transactions.set(hash, {
      type: 'sendEthers',
      to: recipient,
      subwallet: this.currentSubwallet!,
      amount: amount,
      completed: false,
      hash: hash,
    })
    console.log(
      ethers.utils.formatEther(amount),
      'ETH Sent.\nCurrent Balance: ',
      ethers.utils.formatEther(await this.getBalance())
    )
  }

  async sendERC20Token(
    symbol: string,
    recipient: string,
    amount: BigNumberish
  ): Promise<void> {
    this.assertClient()
    this.assertSubwallet()
    this.assertToken(symbol)

    const token = this.tokens.get(symbol)

    const response = await this.client!.sendERC20TokenPrivately(
      token!.contract.address,
      this.currentSubwallet!,
      recipient,
      amount
    )
    this.transactions.set(response.hash, {
      type: 'contractInteraction',
      to: recipient,
      subwallet: this.currentSubwallet!,
      amount: amount,
      completed: false,
      hash: response.hash,
      data: response.data,
    })
    console.log(
      this.formatTokenAmount(symbol, amount),
      symbol,
      'Sent.\nCurrent Balance: ',
      this.formatTokenAmount(symbol, await this.getERC20TokenBalance(symbol))
    )
  }

  formatTokenAmount(symbol: string, amount: BigNumberish): string {
    return formatUnits(amount, this.tokens.get(symbol)!.decimals)
  }

  parseTokenAmount(symbol: string, amount: string): BigNumber {
    return parseUnits(amount, this.tokens.get(symbol)!.decimals)
  }

  private assertSigner() {
    if (!this.signer) {
      throw Error('NO_ACTIVE_WALLET')
    }
  }

  private assertClient() {
    if (!this.client) {
      throw Error('CLIENT_NOT_CONNECTED')
    }
  }

  private assertSubwallet() {
    if (!this.currentSubwallet) {
      throw Error('WALLET_NOT_SELECTED')
    }
  }

  private assertToken(symbol: string) {
    if (!this.tokens.has(symbol)) {
      throw Error(`TOKEN_NOT_ADDED: ${symbol}`)
    }
  }
}
