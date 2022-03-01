import { BigNumberish, Contract, ethers, Wallet } from 'ethers'
import {ChainWalletMaster} from "../../../build/types";
import abi from '../../../build/abis/ChainWalletMaster.json'

export class ChainWalletCLI {
  private signer?: Wallet
  private contract?: ChainWalletMaster
  private readonly agents: string[]
  private currentAgent?: string
  
  constructor() {
    this.agents = []
  }

  generateWallet(): void {
    this.signer = Wallet.createRandom()
    console.log('Generated EOA:', this.signer.address)
  }

  importWalletFromMnemonic(mnemonic: string): void {
    if (ethers.utils.isValidMnemonic(mnemonic)) {
      throw Error('Invalid Mnemonic')
    }

    this.signer = Wallet.fromMnemonic(mnemonic)
  }

  importWalletFromPrivateKey(key: string): void {
    this.signer = new Wallet(key)
  }

  exportPrivateKey(): string {
    this.assertSigner()
    return this.signer!.privateKey
  }

  async connectWallet(rpcEndpoint: string, contractAddress: string): Promise<void> {
    this.assertSigner()
    const provider = new ethers.providers.JsonRpcProvider(rpcEndpoint)
    this.signer = this.signer!.connect(provider)
    this.contract = new Contract(contractAddress, abi, this.signer) as ChainWalletMaster
    await this.loadAgents()
    console.log('Connected to Chain Wallet');
  }
  
  async setupAccount(): Promise<void> {
    this.assertContract()
    if (this.agents.length) {
      throw Error('Account already setup')
    }
    
    const tx = await this.contract.createWallet()
    const rct = await tx.wait()
    const [,agentAddress] = rct.events.find(e => e.event === 'AgentDeployed')?.args
    console.log('Wallet Created:', agentAddress)
    await this.loadAgents()
    this.selectAgent(agentAddress)
  }
  
  async createWallet(): Promise<void> {
    this.assertContract()
    const tx = await this.contract.createAgent()
    const rct = await tx.wait()
    const [,agentAddress] = rct.events.find(e => e.event === 'AgentDeployed')?.args
    console.log('Wallet Created:', agentAddress)
    await this.loadAgents()
    this.selectAgent(agentAddress)
  }
  
  async loadAgents() {
    try {
      this.assertContract()
      const agents = await this.contract.getAgents()
      if (this.agents.length !== agents.length) {
        this.agents.length = 0
        this.agents.push(...agents)
      }
      return this.agents
    }
    catch (e) {
      // Not registered
      console.log('Account Setup Required!')
      this.agents.length = 0
      return []
    }
  }
  
  selectAgent(agent: string) {
    if (this.agents.indexOf(agent) === -1) {
      throw Error('Agent not found')
    }

    this.currentAgent = agent
    console.log('Connected as', agent)
  }

  async getBalance(): Promise<BigNumberish> {
    this.assertContract()
    return await this.signer!.provider.getBalance(this.currentAgent)
  }
  
  async sendEthers(recipient: string, amount: BigNumberish) {
    this.assertContract()
    const tx = await this.contract.sendEther(this.currentAgent, recipient, amount)
    await tx.wait()
    console.log(
      ethers.utils.formatEther(amount),
      'ETH Sent.\nCurrent Balance: ',
      ethers.utils.formatEther(await this.getBalance())
    )
  }

  private assertSigner() {
    if (!this.signer) {
      throw new Error('NO_ACTIVE_WALLET')
    }
  }

  private assertContract() {
    if (!this.contract) {
      throw new Error('CONTRACT_NOT_CONNECTED')
    }
  }
}
