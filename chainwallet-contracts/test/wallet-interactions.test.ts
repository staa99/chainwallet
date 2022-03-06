import { expect } from 'chai'
import { ethers } from 'hardhat'
import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'

import { ChainWalletMaster, ChainWalletMaster__factory, SampleContract, SampleContract__factory } from '../build/types'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { parseEther, randomBytes } from 'ethers/lib/utils'
import { randomAddress } from 'hardhat/internal/hardhat-network/provider/fork/random'
const { getContractFactory, getSigners } = ethers

describe('Direct Wallet Interactions', () => {
  let contract: ChainWalletMaster
  let admin: SignerWithAddress
  let user: SignerWithAddress
  let treasury: SignerWithAddress
  let otherWallet: SignerWithAddress
  let signers: SignerWithAddress[]

  beforeEach(async () => {
    signers = await getSigners()
    admin = signers[0]
    user = signers[1]
    treasury = signers[5]
    otherWallet = signers[11]
    const instanceId = randomBytes(4)

    const chainWalletMasterFactory = (await getContractFactory(
      'ChainWalletMaster',
      admin,
    )) as ChainWalletMaster__factory
    contract = await chainWalletMasterFactory.deploy()
    await contract.deployed()
    await contract.initialize(instanceId, treasury.address, parseEther('1'), parseEther('5'), 100)

    contract = contract.connect(user)
  })

  describe('interact', () => {
    let token: SampleContract

    beforeEach(async () => {
      const sampleContractFactory = (await getContractFactory('SampleContract', admin)) as SampleContract__factory
      token = await sampleContractFactory.deploy()
      await token.transfer(user.address, parseEther('10'))

      token = token.connect(user)
    })

    describe('validations', () => {
      it('should revert when paused', async () => {
        await contract.createWallet()

        const agents = await contract.getAgents()
        const tx = await token.populateTransaction.transfer(otherWallet.address, parseEther('1'))

        await contract.connect(admin).pause()
        await expect(contract.interact(agents[0], token.address, 0, tx.data)).to.be.revertedWith('Pausable: paused')
      })
      it('should revert when address is not of an agent', async () => {
        await contract.createWallet()
        const tx = await token.populateTransaction.transfer(otherWallet.address, parseEther('1'))

        await expect(contract.interact(randomAddress().toString(), token.address, 0, tx.data)).to.be.revertedWith(
          'function call to a non-contract account',
        )
      })
      it('should revert when address is of an agent but not owned by user', async () => {
        await contract.createWallet()

        await contract.connect(otherWallet).createWallet()
        const otherAgents = await contract.connect(otherWallet).getAgents()
        const tx = await token.populateTransaction.transfer(otherWallet.address, parseEther('1'))

        await expect(contract.interact(otherAgents[0], token.address, 0, tx.data)).to.be.revertedWith(
          'function call to a non-contract account',
        )
      })
      it('should revert when value is greater than agent balance', async () => {
        await contract.createWallet()
        const agents = await contract.getAgents()
        const tx = await token.populateTransaction.transfer(otherWallet.address, parseEther('1'))

        await expect(contract.interact(agents[0], token.address, parseEther('1'), tx.data)).to.be.revertedWith(
          'CALL_FAILED',
        )
      })
    })

    describe('effects', () => {
      it('should perform contract interaction as agent', async () => {
        await contract.createWallet()
        const agents = await contract.getAgents()
        const agent = agents[0]
        const valueTransferred = parseEther('1')
        await token.transfer(agent, valueTransferred)

        const tx = await token.populateTransaction.transfer(otherWallet.address, valueTransferred)

        await expect(() => contract.interact(agent, token.address, 0, tx.data)).to.changeTokenBalances(
          token,
          [{ getAddress: () => agent, provider: otherWallet.provider }, otherWallet],
          [valueTransferred.mul(-1), valueTransferred],
        )
      })
    })
  })

  describe('sendEther', () => {
    describe('validations', () => {
      it('should revert when paused', async () => {
        await contract.createWallet()
        const agents = await contract.getAgents()
        const agent = agents[0]

        await user.sendTransaction({ to: agent, value: parseEther('1') })
        await contract.connect(admin).pause()
        await expect(contract.sendEther(agent, otherWallet.address, parseEther('1'))).to.be.revertedWith(
          'Pausable: paused',
        )
      })
      it('should revert when address is not of an agent', async () => {
        await contract.createWallet()
        const address = randomAddress().toString()

        await user.sendTransaction({ to: address, value: parseEther('1') })
        await expect(contract.sendEther(address, otherWallet.address, parseEther('1'))).to.be.revertedWith(
          'function call to a non-contract account',
        )
      })
      it('should revert when address is of an agent but not owned by user', async () => {
        await contract.createWallet()

        await contract.connect(otherWallet).createWallet()
        const otherAgents = await contract.connect(otherWallet).getAgents()
        await user.sendTransaction({ to: otherAgents[0], value: parseEther('1') })

        await expect(contract.sendEther(otherAgents[0], otherWallet.address, parseEther('1'))).to.be.revertedWith(
          'function call to a non-contract account',
        )
      })
      it('should revert when value is greater than agent balance', async () => {
        await contract.createWallet()
        const agents = await contract.getAgents()
        const agent = agents[0]

        await user.sendTransaction({ to: agent, value: parseEther('1') })
        await expect(contract.sendEther(agent, otherWallet.address, parseEther('2'))).to.be.revertedWith('CALL_FAILED')
      })
    })

    describe('effects', () => {
      it('should send ethers to address from agent balance', async () => {
        await contract.createWallet()
        const agents = await contract.getAgents()
        const agent = agents[0]

        const valueTransferred = parseEther('1')
        await user.sendTransaction({ to: agent, value: valueTransferred })
        await expect(() => contract.sendEther(agent, otherWallet.address, valueTransferred)).to.changeEtherBalances(
          [{ getAddress: () => agent, provider: otherWallet.provider }, otherWallet],
          [valueTransferred.mul(-1), valueTransferred],
        )
      })
    })
  })
})
