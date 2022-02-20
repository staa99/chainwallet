import { expect } from 'chai'
import { ethers } from 'hardhat'
import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'

import { ChainWalletMaster, ChainWalletMaster__factory, SampleContract, SampleContract__factory } from '../build/types'
import { Provider } from '@ethersproject/providers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'

const { getContractFactory, getSigners } = ethers

describe('ChainWallet', () => {
  let contract: ChainWalletMaster
  let provider: Provider
  let signers: SignerWithAddress[]

  beforeEach(async () => {
    signers = await getSigners()
    const [factoryAdmin, user] = signers

    const chainWalletMasterFactory = (await getContractFactory(
      'ChainWalletMaster',
      factoryAdmin,
    )) as ChainWalletMaster__factory
    contract = await chainWalletMasterFactory.deploy()
    await contract.deployed()
    contract = contract.connect(user)
    provider = contract.provider
  })

  describe('wallet creation', () => {
    it('createWallet should create wallet and deploy an agent', async () => {
      const [, owner] = signers
      const initialBalance = ethers.utils.parseEther('0.01')
      const tx = await contract.createWallet({
        value: initialBalance,
      })
      const rct = await tx.wait()

      const [ownerAddress, walletId] = rct.events.find((e) => e.event === 'WalletCreated')?.args ?? []
      const [deployedWalletId, agent] = rct.events.find((e) => e.event === 'AgentDeployed')?.args ?? []
      const agentBalance = await provider.getBalance(agent)

      expect(ownerAddress).to.eq(owner.address)
      expect(deployedWalletId).to.eq(walletId)
      expect(agent).not.null
      expect(agentBalance).to.eq(initialBalance)

      console.log('WalletID:', walletId)
      console.log('Agent:', agent)
      console.log('Balance:', ethers.utils.formatEther(agentBalance))
    })

    it('createAgent should deploy an agent', async () => {
      let tx, rct
      const [, owner] = signers
      const initialBalance = ethers.utils.parseEther('0.01')
      tx = await contract.createWallet({
        value: initialBalance,
      })
      rct = await tx.wait()

      tx = await contract.createAgent({
        value: initialBalance,
      })

      rct = await tx.wait()

      const agents = await contract.getAgents()
      expect(agents.length).to.eq(2)

      const [, agent] = rct.events.find((e) => e.event === 'AgentDeployed')?.args ?? []
      const agentBalance = await provider.getBalance(agent)

      expect(agent).not.null
      expect(agentBalance).to.eq(initialBalance)
    })

    it('createWallet should fail if wallet exists', async () => {
      const tx = await contract.createWallet()
      const rct = await tx.wait()

      expect(contract.createWallet()).to.be.revertedWith('DUPLICATE_WALLET_INVALID')
    })

    it('createAgent should fail if no wallet exists', async () => {
      expect(contract.createAgent()).to.be.revertedWith('WALLET_NOT_CREATED')
    })
  })

  describe('wallet deletion', () => {
    it('deleteWallet should set deleting to true', async () => {
      let tx, rct
      const [, owner] = signers
      tx = await contract.createWallet()
      rct = await tx.wait()

      tx = await contract.deleteWallet()
      rct = await tx.wait()

      expect(await contract.isDeleting()).true
    })

    it('cancelDelete should set deleting to false', async () => {
      let tx, rct
      const [, owner] = signers
      tx = await contract.createWallet()
      rct = await tx.wait()

      tx = await contract.deleteWallet()
      rct = await tx.wait()

      expect(await contract.isDeleting()).true

      tx = await contract.cancelDelete()
      rct = await tx.wait()

      expect(await contract.isDeleting()).false
    })

    it('confirmDelete should delete wallet', async () => {
      let tx, rct
      const [, owner] = signers
      tx = await contract.createWallet()
      rct = await tx.wait()

      tx = await contract.deleteWallet()
      rct = await tx.wait()

      expect(await contract.isDeleting()).true

      tx = await contract.confirmDelete()
      rct = await tx.wait()

      expect(await contract.wallets(owner.address)).eq(
        '0x0000000000000000000000000000000000000000000000000000000000000000',
      )
    })

    it('deleteWallet should fail if no wallet exists', async () => {
      expect(contract.deleteWallet()).to.be.revertedWith('WALLET_NOT_CREATED')
    })

    it('confirmDelete should fail if delete not initiated', async () => {
      expect(contract.confirmDelete()).to.be.revertedWith('DELETE_NOT_INITIATED')
    })
  })

  describe('wallet sharing', () => {
    it('shareWallet should set wallet of recipient to same wallet', async () => {
      const [, owner, other] = signers

      let tx, rct
      tx = await contract.createWallet()
      rct = await tx.wait()

      tx = await contract.shareWallet(other.address)
      rct = await tx.wait()

      const ownerWalletId = await contract.wallets(owner.address)
      const otherWalletId = await contract.wallets(other.address)

      expect(otherWalletId).to.eq(ownerWalletId)
    })

    it('shareWallet should fail if no wallet exists', async () => {
      const [, , other] = signers

      expect(contract.shareWallet(other.address)).to.be.revertedWith('WALLET_NOT_CREATED')
    })

    it('shareWallet should fail if recipient has wallet', async () => {
      const [, , other] = signers

      let tx, rct
      tx = await contract.createWallet()
      rct = await tx.wait()

      const otherContract = contract.connect(other)
      tx = await otherContract.createWallet()
      rct = await tx.wait()
      expect(contract.shareWallet(other.address)).to.be.revertedWith('RECIPIENT_WALLET_EXISTS')
    })
  })

  describe('contract interactions', () => {
    let sampleContract: SampleContract
    beforeEach(async () => {
      const [factoryAdmin, user] = signers
      const sampleContractFactory = (await getContractFactory(
        'SampleContract',
        factoryAdmin,
      )) as SampleContract__factory
      sampleContract = await sampleContractFactory.deploy()
      await sampleContract.deployed()

      const tx = await sampleContract.transfer(user.address, ethers.utils.parseEther('10'))
      await tx.wait()
      sampleContract = sampleContract.connect(user)
    })

    it('contract interaction triggers as agent', async () => {
      let tx, rct
      const [, owner] = signers
      tx = await contract.createWallet()
      rct = await tx.wait()
      const agents = await contract.getAgents()

      const balanceBefore = await sampleContract.balanceOf(owner.address)
      const transferAmount = ethers.utils.parseEther('1')
      tx = await sampleContract.transfer(agents[0], transferAmount)
      rct = await tx.wait()
      const balanceAfter = await sampleContract.balanceOf(owner.address)

      expect(balanceBefore.sub(balanceAfter)).to.eq(transferAmount)

      const agentBalance = await sampleContract.balanceOf(agents[0])
      expect(agentBalance).to.eq(transferAmount)

      const transferTx = await sampleContract.populateTransaction.transfer(owner.address, agentBalance)

      tx = await contract.interact(agents[0], sampleContract.address, transferTx.data)
      rct = await tx.wait()

      const newAgentBalance = await sampleContract.balanceOf(agents[0])
      expect(newAgentBalance).to.eq(0)

      const balanceAfterAgent = await sampleContract.balanceOf(owner.address)
      expect(balanceAfterAgent).to.eq(balanceBefore)
    })
  })
})
