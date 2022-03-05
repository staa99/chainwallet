import { expect } from 'chai'
import { ethers } from 'hardhat'
import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { parseEther, randomBytes } from 'ethers/lib/utils'
import { ChainWalletMaster, ChainWalletMaster__factory } from '../build/types'

const { getContractFactory, getSigners } = ethers

describe('Staking', () => {
  let contract: ChainWalletMaster
  let admin: SignerWithAddress
  let user: SignerWithAddress
  let treasury: SignerWithAddress
  let stakingManager: SignerWithAddress
  let signers: SignerWithAddress[]

  beforeEach(async () => {
    signers = await getSigners()
    admin = signers[0]
    user = signers[1]
    treasury = signers[5]
    stakingManager = signers[6]
    const instanceId = randomBytes(4)

    const chainWalletMasterFactory = (await getContractFactory(
      'ChainWalletMaster',
      admin,
    )) as ChainWalletMaster__factory
    contract = await chainWalletMasterFactory.deploy()
    await contract.deployed()
    await contract.initialize(instanceId, treasury.address, parseEther('1'), parseEther('5'), 100)
    await contract.grantRole(await contract.STAKING_MANAGER_ROLE(), stakingManager.address)

    contract = contract.connect(user)
  })

  describe('administration', () => {
    describe('setMinStakeAmount', () => {
      describe('validations', () => {
        it('should revert on unauthorized users', async () => {
          await expect(contract.setMinStakeAmount(parseEther('0.5'))).to.reverted
        })

        it('should not revert for admin', async () => {
          await expect(contract.connect(admin).setMinStakeAmount(parseEther('0.5'))).to.not.reverted
        })

        it('should not revert for user with role', async () => {
          await expect(contract.connect(stakingManager).setMinStakeAmount(parseEther('0.5'))).to.not.reverted
        })
      })

      describe('effects', () => {
        it('should update minStakeAmount and emit event', async () => {
          const amount = parseEther('0.8')
          const tx = contract.connect(stakingManager).setMinStakeAmount(amount)
          await expect(tx).to.emit(contract, 'MinStakeAmountChanged').withArgs(amount)

          const currentAmount = await contract.minStakeAmount()
          expect(currentAmount).to.eq(amount)
        })
      })
    })

    describe('setMaxStakeAmount', () => {
      describe('validations', () => {
        it('should revert on unauthorized users', async () => {
          await expect(contract.setMaxStakeAmount(parseEther('0.5'))).to.be.reverted
        })

        it('should not revert for admin', async () => {
          await expect(contract.connect(admin).setMaxStakeAmount(parseEther('2'))).to.not.be.reverted
        })

        it('should not revert for user with role', async () => {
          await expect(contract.connect(stakingManager).setMaxStakeAmount(parseEther('2'))).to.not.be.reverted
        })
      })

      describe('effects', () => {
        it('should update maxStakeAmount and emit event', async () => {
          const amount = parseEther('2')
          const tx = contract.connect(stakingManager).setMaxStakeAmount(amount)
          await expect(tx).to.emit(contract, 'MaxStakeAmountChanged').withArgs(amount)

          const currentAmount = await contract.maxStakeAmount()
          expect(currentAmount).to.eq(amount)
        })
      })
    })
  })

  describe('staking', () => {
    describe('stakeEthers', () => {
      describe('validations', () => {
        it('should revert when paused', async () => {
          await contract.connect(admin).pause()
          await expect(contract.stakeEthers({ value: parseEther('3') })).to.be.reverted
        })
        it('should revert when new additional stake is less than min stake', async () => {
          await expect(contract.stakeEthers({ value: parseEther('0.5') })).to.be.revertedWith('STAKE_TOO_LOW')
        })
        it('should revert when new total stake is less than min stake', async () => {
          await contract.stakeEthers({ value: parseEther('2') })
          await contract.connect(stakingManager).setMinStakeAmount(parseEther('3'))
          await expect(contract.stakeEthers({ value: parseEther('0.5') })).to.be.revertedWith('STAKE_TOO_LOW')
        })
        it('should revert when new additional stake is greater than max stake', async () => {
          await expect(contract.stakeEthers({ value: parseEther('10') })).to.be.revertedWith('STAKE_TOO_HIGH')
        })
        it('should revert when new total stake is greater than max stake', async () => {
          await contract.stakeEthers({ value: parseEther('3') })
          await expect(contract.stakeEthers({ value: parseEther('3') })).to.be.revertedWith('STAKE_TOO_HIGH')
        })
      })

      describe('effects', () => {
        it('should set stake when no stake existed', async () => {
          await contract.stakeEthers({ value: parseEther('2') })
          expect(await contract.stakes(user.address)).to.be.eq(parseEther('2'))
        })

        it('should increment stake when stake existed', async () => {
          await contract.stakeEthers({ value: parseEther('2') })
          await contract.stakeEthers({ value: parseEther('3') })
          expect(await contract.stakes(user.address)).to.be.eq(parseEther('5'))
        })
      })
    })

    describe('withdrawStakes', () => {
      describe('validations', () => {
        it('should revert when paused', async () => {
          await contract.stakeEthers({ value: parseEther('3') })
          await contract.connect(admin).pause()
          await expect(contract.withdrawStakes()).to.be.reverted
        })
        it('should revert when total stakes = 0', async () => {
          await expect(contract.withdrawStakes()).to.be.revertedWith('STAKE_TOO_LOW')
        })
      })

      describe('effects', () => {
        it('should set stake to zero and emit StakesWithdrawn', async () => {
          await contract.stakeEthers({ value: parseEther('3') })
          await expect(contract.withdrawStakes()).to.emit(contract, 'StakesWithdrawn').withArgs(user.address)
          expect(await contract.stakes(user.address)).to.eq(0)
        })

        it('should add user to blocklist', async () => {
          await contract.stakeEthers({ value: parseEther('3') })
          await contract.withdrawStakes()
          expect(await contract.blockList(user.address)).to.be.true
        })

        it('should transfer 50% of stake to owner and 50% to treasury', async () => {
          await contract.stakeEthers({ value: parseEther('3') })
          expect(await contract.withdrawStakes()).to.changeEtherBalances(
            [user, treasury],
            [parseEther('1.5'), parseEther('1.5')],
          )
        })
      })
    })
  })
})
