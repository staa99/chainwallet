import { ChainWalletClientConfig, deriveFinalConfig } from './configuration'
import { ChainWalletMaster } from './types/ChainWalletMaster'
import {
  BigNumberish,
  BytesLike,
  Contract,
  ContractReceipt,
  Overrides,
  Signer,
} from 'ethers'
import chainWalletAbi from './abis/ChainWalletMaster.json'
import { arrayify, hexlify } from 'ethers/lib/utils'
import erc20 from './abis/erc20.json'
import { ContractInteractionTransactionResponse } from './transactions'
import EventEmitter from 'events'
import { Buffer } from 'buffer'

export class ChainWalletClient {
  private config: ChainWalletClientConfig
  private contract?: ChainWalletMaster
  private readonly eventEmitter: EventEmitter
  private onTransactionEmittedListener?: (hash: string, log: any) => void

  constructor(config: ChainWalletClientConfig) {
    this.config = deriveFinalConfig(config)
    this.eventEmitter = new EventEmitter()
  }

  async connect(signer: Signer): Promise<void> {
    ChainWalletClient.assertTruthy(signer, 'Signer is required')
    if (!signer.provider) {
      throw Error('signer must be connected to a provider')
    }

    this.contract = new Contract(
      this.config.contractAddress,
      chainWalletAbi,
      signer
    ) as ChainWalletMaster

    // make call to ensure that contract exists and is connected
    await this.contract.instanceId()
  }

  async createWallet(): Promise<string> {
    this.assertContract()

    const tx = await this.contract!.createWallet()
    const rct = await tx.wait()
    const agentAddress = rct.events?.find((e) => e.event === 'AgentDeployed')
      ?.args?.[1] as string

    if (!agentAddress) {
      throw Error('Wallet creation failed')
    }

    return agentAddress
  }

  async createSubwallet(): Promise<string> {
    this.assertContract()

    const tx = await this.contract!.createAgent()
    const rct = await tx.wait()
    const agentAddress = rct.events?.find((e) => e.event === 'AgentDeployed')
      ?.args?.[1] as string

    if (!agentAddress) {
      throw Error('Wallet creation failed')
    }

    return agentAddress
  }

  async getSubwallets(): Promise<string[]> {
    this.assertContract()

    return await this.contract!.getAgents()
  }

  async disconnectWallet(): Promise<void> {
    this.assertContract()

    const tx = await this.contract!.deleteWallet()
    await tx.wait()
  }

  async cancelDisconnection(): Promise<void> {
    this.assertContract()

    const tx = await this.contract!.cancelDelete()
    await tx.wait()
  }

  async confirmDisconnection(): Promise<void> {
    this.assertContract()

    const tx = await this.contract!.confirmDelete()
    await tx.wait()
  }

  async sendEthersPrivately(
    subwalletAddress: string,
    to: string,
    value: BigNumberish,
    overrides?: Overrides,
    initiationOverrides?: Overrides
  ): Promise<string> {
    this.assertContract()

    const tx = {
      agentAddress: subwalletAddress,
      toAddress: to,
      value: value,
      nonce:
        (await overrides?.nonce) ??
        (await this.contract!.getAgentNonce(subwalletAddress)),
      gasLimit: (await overrides?.gasLimit) ?? 150000, // default gas limit for ether transfer
      gasPrice:
        (await overrides?.gasPrice) ?? (await this.contract!.provider.getGasPrice()),
      data: '0x',
      signature: '0x',
    }

    const hash = await this.contract!.computeSendEthersHash(tx)
    tx.signature = await this.contract!.signer.signMessage(arrayify(hash))

    const locator = await this.config.networkClientInterface!.sendTransaction(
      tx,
      'sendEthers'
    )

    let submitTx
    if (initiationOverrides) {
      submitTx = await this.contract!.initiateProxyTransaction(
        ChainWalletClient.formatLocator(locator),
        initiationOverrides
      )
    } else {
      submitTx = await this.contract!.initiateProxyTransaction(
        ChainWalletClient.formatLocator(locator)
      )
    }

    await submitTx.wait()
    this.watchHash(hash)

    return hash
  }

  async sendERC20TokenPrivately(
    contractAddress: string,
    subwalletAddress: string,
    to: string,
    value: BigNumberish,
    overrides?: Overrides,
    initiationOverrides?: Overrides
  ): Promise<ContractInteractionTransactionResponse> {
    this.assertContract()
    const erc20Contract = new Contract(contractAddress, erc20, this.contract!.provider)
    const unsignedTx = await erc20Contract.populateTransaction.transfer(to, value)

    const tx = {
      agentAddress: subwalletAddress,
      toAddress: to,
      value: value,
      nonce:
        (await overrides?.nonce) ??
        (await this.contract!.getAgentNonce(subwalletAddress)),
      gasLimit: (await overrides?.gasLimit) ?? 300000, // default gas limit for erc20 transfer
      gasPrice:
        (await overrides?.gasPrice) ?? (await this.contract!.provider.getGasPrice()),
      data: unsignedTx.data!,
      signature: '0x',
    }

    const hash = await this.contract!.computeInteractHash(tx)
    tx.signature = await this.contract!.signer.signMessage(arrayify(hash))

    const locator = await this.config.networkClientInterface!.sendTransaction(
      tx,
      'contractInteraction'
    )

    let submitTx
    if (initiationOverrides) {
      submitTx = await this.contract!.initiateProxyTransaction(
        ChainWalletClient.formatLocator(locator),
        initiationOverrides
      )
    } else {
      submitTx = await this.contract!.initiateProxyTransaction(
        ChainWalletClient.formatLocator(locator)
      )
    }

    await submitTx.wait()
    this.watchHash(hash)

    return {
      data: unsignedTx.data!,
      hash: hash,
    }
  }

  setOnTransactionEmittedListener(
    fn: (hash: string, receipt: ContractReceipt) => void
  ): void {
    this.onTransactionEmittedListener = (hash, log) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
      log.getTransactionReceipt().then((rct: ContractReceipt) => {
        fn(hash, rct)
      })
    }
  }

  watchHash(hash: string): void {
    this.assertContract()
    const listener = this.onTransactionEmittedListener
    if (!listener) {
      throw Error('Listener must be configured before watching')
    }

    this.contract!.provider.once(
      this.contract!.filters.TransactionCompleted(hash),
      (log) => {
        listener(hash, log)
      }
    )
  }

  private assertContract() {
    ChainWalletClient.assertTruthy(this.contract, 'Wallet is not connected')
  }

  private static assertTruthy(v: unknown, msg: string) {
    if (!v) {
      throw Error(msg)
    }
  }

  private static formatLocator(locator: string): BytesLike {
    return hexlify(Buffer.from(locator))
  }
}
