import { expect } from 'chai'
import { ethers } from 'hardhat'
import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'

import { ChainWalletMaster, ChainWalletMaster__factory } from '../build/types'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { parseEther, randomBytes } from 'ethers/lib/utils'
const { getContractFactory, getSigners } = ethers

describe('Wallet Management', () => {
  let contract: ChainWalletMaster
  let admin: SignerWithAddress
  let user: SignerWithAddress
  let treasury: SignerWithAddress
  let signers: SignerWithAddress[]

  beforeEach(async () => {
    signers = await getSigners()
    admin = signers[0]
    user = signers[1]
    treasury = signers[5]
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

  describe('createWallet', () => {
    describe('validations', () => {
      it('should revert when paused', async () => {
        await contract.connect(admin).pause()
        await expect(contract.createWallet()).to.be.reverted
      })
      it('should revert when user has a wallet', async () => {
        await contract.createWallet()
        await expect(contract.createWallet()).to.be.revertedWith('DUPLICATE_WALLET_INVALID')
      })
    })

    describe('effects', () => {
      it('should create wallet and emit WalletCreated', async () => {
        await expect(contract.createWallet()).to.emit(contract, 'WalletCreated')
      })

      it('should create agent and emit AgentDeployed', async () => {
        await expect(contract.createWallet()).to.emit(contract, 'AgentDeployed')

        const agents = await contract.getAgents()
        expect(agents.length).to.be.gt(0)
      })

      it('should fund agent balance with value', async () => {
        await contract.createWallet({ value: parseEther('2') })

        const agents = await contract.getAgents()
        expect(await contract.provider.getBalance(agents[0])).to.be.eq(parseEther('2'))
      })
    })
  })

  describe('createAgent', () => {
    describe('validations', () => {
      it('should revert when paused', async () => {
        await contract.createWallet()
        await contract.connect(admin).pause()
        await expect(contract.createAgent()).to.be.reverted
      })
      it('should revert when user does not have a wallet', async () => {
        await expect(contract.createAgent()).to.be.revertedWith('WALLET_NOT_CREATED')
      })
    })

    describe('effects', () => {
      it('should create agent and emit AgentDeployed', async () => {
        await contract.createWallet()
        await expect(contract.createAgent()).to.emit(contract, 'AgentDeployed')

        const agents = await contract.getAgents()
        expect(agents.length).to.be.gt(0)
      })

      it('should fund agent balance with value', async () => {
        await contract.createWallet()
        await contract.createAgent({ value: parseEther('2') })

        const agents = await contract.getAgents()
        expect(await contract.provider.getBalance(agents[1])).to.be.eq(parseEther('2'))
      })
    })
  })

  describe('shareWallet', () => {
    let otherWallet: SignerWithAddress

    beforeEach(() => {
      otherWallet = signers[11]
    })

    describe('validations', () => {
      it('should revert when paused', async () => {
        await contract.createWallet()
        await contract.connect(admin).pause()
        await expect(contract.shareWallet(otherWallet.address)).to.be.reverted
      })
      it('should revert when user does not have a wallet', async () => {
        await expect(contract.shareWallet(otherWallet.address)).to.be.revertedWith('WALLET_NOT_CREATED')
      })
      it('should revert when other address already has a wallet', async () => {
        await contract.createWallet()
        await contract.connect(otherWallet).createWallet()
        await expect(contract.shareWallet(otherWallet.address)).to.be.revertedWith('RECIPIENT_WALLET_EXISTS')
      })
    })

    describe('effects', () => {
      it('should emit events and have same set of agents', async () => {
        await contract.createWallet()
        await expect(contract.shareWallet(otherWallet.address)).to.emit(contract, 'WalletShared')

        const agents = await contract.getAgents()
        const otherAgents = await contract.connect(otherWallet).getAgents()

        expect(otherAgents).eql(agents)
      })
    })
  })

  describe('deleteWallet', () => {
    describe('validations', () => {
      it('should revert when paused', async () => {
        await contract.createWallet()
        await contract.connect(admin).pause()
        await expect(contract.deleteWallet()).to.be.reverted
      })
      it('should revert when user does not have a wallet', async () => {
        await expect(contract.deleteWallet()).to.be.reverted
      })
    })

    describe('effects', () => {
      it('should set deleting to true', async () => {
        await contract.createWallet()
        await contract.deleteWallet()

        expect(await contract.isDeleting()).to.be.true
      })
    })
  })

  describe('cancelDelete', () => {
    describe('validations', () => {
      it('should revert when paused', async () => {
        await contract.createWallet()
        await contract.deleteWallet()
        await contract.connect(admin).pause()
        await expect(contract.cancelDelete()).to.be.reverted
      })
    })

    describe('effects', () => {
      it('should set deleting to false', async () => {
        await contract.createWallet()
        await contract.deleteWallet()
        await contract.cancelDelete()

        expect(await contract.isDeleting()).to.be.false
      })
    })
  })

  describe('confirmDelete', () => {
    describe('validations', () => {
      it('should revert when paused', async () => {
        await contract.createWallet()
        await contract.deleteWallet()
        await contract.connect(admin).pause()
        await expect(contract.confirmDelete()).to.be.reverted
      })
      it('should revert when delete not initiated', async () => {
        await contract.createWallet()
        await expect(contract.confirmDelete()).to.be.revertedWith('DELETE_NOT_INITIATED')
      })
    })

    describe('effects', () => {
      it('should delete wallet and emit WalletDeleted', async () => {
        await contract.createWallet()
        await contract.deleteWallet()

        await expect(contract.confirmDelete()).to.emit(contract, 'WalletDeleted').withArgs(user.address)
        await expect(contract.getAgents()).to.be.revertedWith('WALLET_NOT_CREATED')
      })
    })
  })
})
