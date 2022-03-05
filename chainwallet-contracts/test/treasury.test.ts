import { expect } from 'chai'
import { ethers } from 'hardhat'
import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'

import { ChainWalletMaster, ChainWalletMaster__factory } from '../build/types'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { parseEther, randomBytes } from 'ethers/lib/utils'
const { getContractFactory, getSigners } = ethers

describe('Treasury Management', () => {
  let contract: ChainWalletMaster
  let admin: SignerWithAddress
  let user: SignerWithAddress
  let treasury: SignerWithAddress
  let treasuryManager: SignerWithAddress
  let signers: SignerWithAddress[]
  let newTreasuryAddress: string

  beforeEach(async () => {
    signers = await getSigners()
    admin = signers[0]
    user = signers[1]
    treasury = signers[5]
    treasuryManager = signers[7]
    newTreasuryAddress = signers[11].address
    const instanceId = randomBytes(4)

    const chainWalletMasterFactory = (await getContractFactory(
      'ChainWalletMaster',
      admin,
    )) as ChainWalletMaster__factory
    contract = await chainWalletMasterFactory.deploy()
    await contract.deployed()
    await contract.initialize(instanceId, treasury.address, parseEther('1'), parseEther('5'), 100)
    await contract.grantRole(await contract.TREASURY_MANAGER_ROLE(), treasuryManager.address)

    contract = contract.connect(user)
  })

  describe('setTreasuryAddress', () => {
    describe('validations', () => {
      it('should revert on unauthorized users', async () => {
        await expect(contract.setTreasuryAddress(newTreasuryAddress)).to.reverted
      })

      it('should not revert for admin', async () => {
        await expect(contract.connect(admin).setTreasuryAddress(newTreasuryAddress)).to.not.reverted
      })

      it('should not revert for user with role', async () => {
        await expect(contract.connect(treasuryManager).setTreasuryAddress(newTreasuryAddress)).to.not.reverted
      })
    })

    describe('effects', () => {
      it('should update treasury and emit event', async () => {
        await expect(contract.connect(treasuryManager).setTreasuryAddress(newTreasuryAddress))
          .to.emit(contract, 'TreasuryAddressChanged')
          .withArgs(newTreasuryAddress)

        expect(await contract.treasury()).to.eq(newTreasuryAddress)
      })
    })
  })
})
