import { expect } from 'chai'
import { ethers } from 'hardhat'
import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'

import { ChainWalletMaster, ChainWalletMaster__factory, SampleContract, SampleContract__factory } from '../build/types'
import { Provider } from '@ethersproject/providers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import {
  arrayify,
  formatBytes32String,
  formatEther,
  parseEther,
} from 'ethers/lib/utils'
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
      const initialBalance = parseEther('0.01')
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
      console.log('Balance:', formatEther(agentBalance))
    })

    it('createAgent should deploy an agent', async () => {
      let tx, rct
      const initialBalance = parseEther('0.01')
      tx = await contract.createWallet({
        value: initialBalance,
      })
      await tx.wait()

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
      await tx.wait()

      expect(contract.createWallet()).to.be.revertedWith('DUPLICATE_WALLET_INVALID')
    })

    it('createAgent should fail if no wallet exists', async () => {
      expect(contract.createAgent()).to.be.revertedWith('WALLET_NOT_CREATED')
    })
  })

  describe('wallet deletion', () => {
    it('deleteWallet should set deleting to true', async () => {
      let tx
      tx = await contract.createWallet()
      await tx.wait()

      tx = await contract.deleteWallet()
      await tx.wait()

      expect(await contract.isDeleting()).true
    })

    it('cancelDelete should set deleting to false', async () => {
      let tx
      tx = await contract.createWallet()
      await tx.wait()

      tx = await contract.deleteWallet()
      await tx.wait()

      expect(await contract.isDeleting()).true

      tx = await contract.cancelDelete()
      await tx.wait()

      expect(await contract.isDeleting()).false
    })

    it('confirmDelete should delete wallet', async () => {
      let tx
      const [, owner] = signers
      tx = await contract.createWallet()
      await tx.wait()

      tx = await contract.deleteWallet()
      await tx.wait()

      expect(await contract.isDeleting()).true

      tx = await contract.confirmDelete()
      await tx.wait()

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

      let tx
      tx = await contract.createWallet()
      await tx.wait()

      tx = await contract.shareWallet(other.address)
      await tx.wait()

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

      let tx
      tx = await contract.createWallet()
      await tx.wait()

      const otherContract = contract.connect(other)
      tx = await otherContract.createWallet()
      await tx.wait()
      expect(contract.shareWallet(other.address)).to.be.revertedWith('RECIPIENT_WALLET_EXISTS')
    })
  })

  describe('contract interactions and ether transfers', () => {
    let sampleContract: SampleContract
    beforeEach(async () => {
      let tx
      const [factoryAdmin, user] = signers
      const sampleContractFactory = (await getContractFactory(
        'SampleContract',
        factoryAdmin,
      )) as SampleContract__factory
      sampleContract = await sampleContractFactory.deploy()
      await sampleContract.deployed()

      // fund user account with 10 sampleContract tokens
      tx = await sampleContract.transfer(user.address, parseEther('10'))
      await tx.wait()

      // create user wallet
      tx = await contract.createWallet()
      await tx.wait()

      sampleContract = sampleContract.connect(user)
    })

    it('contract interaction triggers as agent', async () => {
      let tx
      const [, user] = signers
      const agents = await contract.getAgents()

      // fund agent with 1 sampleContract token
      const balanceBefore = await sampleContract.balanceOf(user.address)
      const transferAmount = parseEther('1')
      tx = await sampleContract.transfer(agents[0], transferAmount)
      await tx.wait()
      const balanceAfter = await sampleContract.balanceOf(user.address)

      // verify that the user's wallet is debited
      expect(balanceBefore.sub(balanceAfter)).to.eq(transferAmount)

      // verify that the agent wallet is funded
      const agentBalance = await sampleContract.balanceOf(agents[0])
      expect(agentBalance).to.eq(transferAmount)

      // populate transaction to send transfer amount to user address
      const transferTx = await sampleContract.populateTransaction.transfer(user.address, transferAmount)

      // execute transaction as agent
      tx = await contract.interact(agents[0], sampleContract.address, 0, transferTx.data)
      await tx.wait()

      // verify that agent balance was debited
      const newAgentBalance = await sampleContract.balanceOf(agents[0])
      expect(newAgentBalance).to.eq(0)

      // verify that user balance was credited
      const balanceAfterAgent = await sampleContract.balanceOf(user.address)
      expect(balanceAfterAgent).to.eq(balanceBefore)
    })

    it('ether transfer triggers as agent', async () => {
      let tx, rct
      const [, owner] = signers
      const agents = await contract.getAgents()

      // fund agent with 1 ether
      const balanceBefore = await provider.getBalance(owner.address)
      const transferAmount = parseEther('1')
      tx = await owner.sendTransaction({ to: agents[0], value: transferAmount })
      rct = await tx.wait()
      const balanceAfter = await provider.getBalance(owner.address)

      // verify that account was debited by transferAmount and gas fees
      expect(balanceBefore.sub(balanceAfter)).to.eq(transferAmount.add(rct.effectiveGasPrice.mul(rct.gasUsed)))

      // verify that agent balance is now transferAmount
      const agentBalance = await provider.getBalance(agents[0])
      expect(agentBalance).to.eq(transferAmount)

      // execute ether transfer as agent
      tx = await contract.sendEther(agents[0], owner.address, transferAmount)
      rct = await tx.wait()

      // verify that agent ether balance is now zero
      const newAgentBalance = await provider.getBalance(agents[0])
      expect(newAgentBalance).to.eq(0)

      // verify that the balance after the
      const balanceAfterAgent = await provider.getBalance(owner.address)
      expect(balanceAfterAgent.sub(balanceAfter)).eq(transferAmount.sub(rct.effectiveGasPrice.mul(rct.gasUsed)))
    })

    describe('proxy transactions', () => {
      it('initiate proxy transaction logs event', async () => {
        let tx, rct
        const agents = await contract.getAgents()

        // initiate a sample proxy transaction
        tx = await contract.initiateProxyTransaction(
          agents[0],
          formatBytes32String('sampleId'),
          formatBytes32String('sampleKey'),
        )
        rct = await tx.wait()

        // extract transaction id from logs
        const [transactionId] = rct.events.find((e) => e.event === 'TransactionCreated')?.args

        // verify that transaction id exists
        expect(transactionId).not.null

        // verify that stored transaction matches parameters
        const transaction = await contract.proxyTransactions(transactionId)
        expect(transaction).not.null
        expect(transaction.agentAddress).to.eq(agents[0])
        expect(transaction.id).to.eq(formatBytes32String('sampleId'))
        expect(transaction.key).to.eq(formatBytes32String('sampleKey'))
      })

      it('proxy agent contract interaction transaction execution succeeds', async () => {
        let tx, rct
        const [, user, proxy] = signers
        const agents = await contract.getAgents()

        // fund agent for gas payment
        tx = await user.sendTransaction({ to: agents[0], value: parseEther('1') })
        await tx.wait()

        // transfer 1 sampleContract token to agent address
        const transferAmount = parseEther('1')
        tx = await sampleContract.transfer(agents[0], transferAmount)
        await tx.wait()

        // populate transaction to transfer `transferAmount` `sampleContract` tokens to user
        const transferTx = await sampleContract.populateTransaction.transfer(user.address, transferAmount)

        // create transaction to be executed by proxy
        const transaction = {
          fromAddress: user.address,
          agentAddress: agents[0],
          toAddress: sampleContract.address,
          value: 0,
          nonce: 0,
          gasLimit: 120000,
          gasPrice: await contract.provider.getGasPrice(),
          data: transferTx.data,
          signature: '0x', // unset
        }
        const hash = await contract.computeInteractHash(transaction)
        transaction.signature = await user.signMessage(arrayify(hash))

        // initiate transaction to be executed by proxy as agent owner
        tx = await contract.initiateProxyTransaction(
          agents[0],
          formatBytes32String('sampleId'),
          formatBytes32String('sampleKey'),
        )
        rct = await tx.wait()
        const [transactionId] = rct.events.find((e) => e.event === 'TransactionCreated')?.args

        // create contract instance backed by proxy
        const contractAsProxy = contract.connect(proxy)

        // execute user transaction as proxy
        const initialProxyBalance = await proxy.getBalance()
        tx = await contractAsProxy.interactAsProxy(transactionId, transaction, {
          gasLimit: transaction.gasLimit,
          gasPrice: transaction.gasPrice,
        })
        rct = await tx.wait()
        const finalProxyBalance = await proxy.getBalance()

        // verify that transaction succeeded (agent has zero sampleContract tokens)
        const newAgentBalance = await sampleContract.balanceOf(agents[0])
        expect(newAgentBalance).to.eq(0)

        // verify that proxy was refunded the gas cost
        expect(finalProxyBalance.gte(initialProxyBalance))

        // verify that incentives at least the amount of the gas cost were paid
        const incentives = finalProxyBalance.sub(initialProxyBalance)
        const gasCost = rct.effectiveGasPrice.mul(rct.gasUsed)
        expect(incentives.gte(gasCost))
      })

      it('proxy agent ether transfer transaction execution succeeds', async () => {
        let tx, rct
        const [, user, proxy] = signers
        const agents = await contract.getAgents()

        // fund agent for transfer plus gas payment
        tx = await user.sendTransaction({ to: agents[0], value: parseEther('1.01') })
        await tx.wait()

        // create transaction to be executed by proxy
        const transaction = {
          fromAddress: user.address,
          agentAddress: agents[0],
          toAddress: user.address,
          value: parseEther('1'),
          nonce: 0,
          gasLimit: 120000,
          gasPrice: await contract.provider.getGasPrice(),
          data: '0x', // not used
          signature: '0x', // unset
        }
        const hash = await contract.computeSendEthersHash(transaction)
        transaction.signature = await user.signMessage(arrayify(hash))

        // initiate transaction to be executed by proxy as agent owner
        tx = await contract.initiateProxyTransaction(
          agents[0],
          formatBytes32String('sampleId'),
          formatBytes32String('sampleKey'),
        )
        rct = await tx.wait()
        const [transactionId] = rct.events.find((e) => e.event === 'TransactionCreated')?.args

        // create contract instance backed by proxy
        const contractAsProxy = contract.connect(proxy)

        // execute user transaction as proxy
        const initialUserBalance = await user.getBalance()
        const initialProxyBalance = await proxy.getBalance()
        tx = await contractAsProxy.sendEtherAsProxy(transactionId, transaction, {
          gasLimit: transaction.gasLimit,
          gasPrice: transaction.gasPrice,
        })
        rct = await tx.wait()
        const finalProxyBalance = await proxy.getBalance()
        const finalUserBalance = await user.getBalance()

        // verify that transaction succeeded (user balance has increased by 1 ether)
        expect(finalUserBalance.sub(initialUserBalance)).to.eq(parseEther('1'))

        // verify that proxy was refunded the gas cost
        expect(finalProxyBalance.gte(initialProxyBalance))

        // verify that incentives at least the amount of the gas cost were paid
        const incentives = finalProxyBalance.sub(initialProxyBalance)
        const gasCost = rct.effectiveGasPrice.mul(rct.gasUsed)
        expect(incentives.gte(gasCost))
      })
    })
  })
})
