import { expect, use as chaiUse } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { ethers } from 'hardhat'
import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'
import { ChainWalletMaster, ChainWalletMaster__factory, SampleContract, SampleContract__factory } from '../build/types'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { arrayify, hexlify, parseEther, randomBytes } from 'ethers/lib/utils'
import { BigNumber, BigNumberish, PopulatedTransaction } from 'ethers'
import { randomAddress } from 'hardhat/internal/hardhat-network/provider/fork/random'
const { getContractFactory, getSigners } = ethers

chaiUse(chaiAsPromised)

describe('Proxy Wallet Interactions', () => {
  let contract: ChainWalletMaster
  let admin: SignerWithAddress
  let user: SignerWithAddress
  let proxy: SignerWithAddress
  let treasury: SignerWithAddress
  let stakingManager: SignerWithAddress
  let otherWallet: SignerWithAddress
  let signers: SignerWithAddress[]

  beforeEach(async () => {
    signers = await getSigners()
    admin = signers[0]
    user = signers[1]
    treasury = signers[5]
    stakingManager = signers[6]
    proxy = signers[8]
    otherWallet = signers[11]
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

  describe('initiateProxyTransaction', () => {
    describe('validations', () => {
      it('should revert when paused', async () => {
        await contract.connect(admin).pause()
        await expect(contract.initiateProxyTransaction(hexlify(randomBytes(64)))).to.be.revertedWith('Pausable: paused')
      })
    })

    describe('effects', () => {
      it('should emit locator', async () => {
        const locator = hexlify(randomBytes(64))
        await expect(contract.initiateProxyTransaction(locator))
          .to.emit(contract, 'TransactionCreated')
          .withArgs(locator)
      })
    })
  })

  describe('interactAsProxy', () => {
    let token: SampleContract

    beforeEach(async () => {
      const sampleContractFactory = (await getContractFactory('SampleContract', admin)) as SampleContract__factory
      token = await sampleContractFactory.deploy()
      await token.transfer(user.address, parseEther('10'))

      token = token.connect(user)
    })

    async function createUserTransaction(
      agent: string,
      value: BigNumberish,
      gasLimit: BigNumberish,
      tx: PopulatedTransaction,
    ) {
      const input = {
        fromAddress: user.address,
        agentAddress: agent,
        toAddress: token.address,
        value: value,
        nonce: await contract.getAgentNonce(agent),
        gasLimit: gasLimit,
        gasPrice: await contract.provider.getGasPrice(),
        data: tx.data,
        signature: '0x',
      }

      const hash = await contract.computeInteractHash(input)
      input.signature = await user.signMessage(arrayify(hash))
      return input
    }

    describe('validations', () => {
      it('should revert when paused', async () => {
        // stake ethers
        await contract.connect(proxy).stakeEthers({ value: parseEther('3') })

        // create wallet
        await contract.createWallet()
        const agents = await contract.getAgents()
        const agent = agents[0]

        // fund agent with token
        await token.transfer(agent, parseEther('1'))

        // fund agent with ethers for gas
        await user.sendTransaction({ to: agent, value: parseEther('0.01') })

        const tokenTx = await token.populateTransaction.transfer(otherWallet.address, parseEther('1'))
        const input = await createUserTransaction(agent, 0, 200000, tokenTx)

        await contract.connect(admin).pause()
        await expect(
          contract.connect(proxy).interactAsProxy(input, {
            gasLimit: input.gasLimit,
            gasPrice: await contract.provider.getGasPrice(),
          }),
        ).to.be.revertedWith('Pausable: paused')
      })

      it('should revert when proxy has less stakes than min stake amount', async () => {
        // stake ethers
        await contract.connect(proxy).stakeEthers({ value: parseEther('1') })

        // staking manager sets stake min stake higher
        await contract.connect(stakingManager).setMinStakeAmount(parseEther('1.5'))

        // create wallet
        await contract.createWallet()
        const agents = await contract.getAgents()
        const agent = agents[0]

        // fund agent with token
        await token.transfer(agent, parseEther('1'))

        // fund agent with ethers for gas
        await user.sendTransaction({ to: agent, value: parseEther('0.01') })

        const tokenTx = await token.populateTransaction.transfer(otherWallet.address, parseEther('1'))
        const input = await createUserTransaction(agent, 0, 200000, tokenTx)

        await expect(
          contract.connect(proxy).interactAsProxy(input, {
            gasLimit: input.gasLimit,
            gasPrice: await contract.provider.getGasPrice(),
          }),
        ).to.be.revertedWith('STAKES_TOO_LOW')
      })

      it('should revert when proxy has less share of stakes in the pool than min pool share', async () => {
        // staking manager sets stake min stake very low
        await contract.connect(stakingManager).setMinStakeAmount(parseEther('0.0001'))

        // stake minimum ethers
        await contract.connect(proxy).stakeEthers({ value: parseEther('0.0001') })

        // dilute stakes
        await contract.connect(signers[13]).stakeEthers({ value: parseEther('5') })

        // create wallet
        await contract.createWallet()
        const agents = await contract.getAgents()
        const agent = agents[0]

        // fund agent with token
        await token.transfer(agent, parseEther('1'))

        // fund agent with ethers for gas
        await user.sendTransaction({ to: agent, value: parseEther('0.01') })

        const tokenTx = await token.populateTransaction.transfer(otherWallet.address, parseEther('1'))
        const input = await createUserTransaction(agent, 0, 200000, tokenTx)

        await expect(
          contract.connect(proxy).interactAsProxy(input, {
            gasLimit: input.gasLimit,
            gasPrice: await contract.provider.getGasPrice(),
          }),
        ).to.be.revertedWith('POOL_SHARE_TOO_LOW')
      })

      it('should revert when proxy is on blocklist', async () => {
        // stake ethers
        await contract.connect(proxy).stakeEthers({ value: parseEther('3') })
        await contract.connect(signers[13]).stakeEthers({ value: parseEther('3') })

        // create wallet
        await contract.createWallet()
        const agents = await contract.getAgents()
        const agent = agents[0]

        // fund agent with token
        await token.transfer(agent, parseEther('1'))

        // fund agent with ethers for gas
        await user.sendTransaction({ to: agent, value: parseEther('0.01') })

        const tokenTx = await token.populateTransaction.transfer(otherWallet.address, parseEther('1'))
        const input = await createUserTransaction(agent, 0, 200000, tokenTx)

        // withdraw to get on blocklist
        await contract.connect(proxy).withdrawStakes()

        await expect(
          contract.connect(proxy).interactAsProxy(input, {
            gasLimit: input.gasLimit,
            gasPrice: await contract.provider.getGasPrice(),
          }),
        ).to.be.revertedWith('BLOCKED')
      })

      it('should revert when address is not of an agent', async () => {
        // stake ethers
        await contract.connect(proxy).stakeEthers({ value: parseEther('3') })

        // create wallet
        await contract.createWallet()
        const agent = randomAddress().toString()

        // fund agent with token
        await token.transfer(agent, parseEther('1'))

        // fund agent with ethers for gas
        await user.sendTransaction({ to: agent, value: parseEther('0.01') })

        const tokenTx = await token.populateTransaction.transfer(otherWallet.address, parseEther('1'))
        // @ts-ignore
        await expect(createUserTransaction(agent, 0, 50000, tokenTx)).to.be.rejectedWith('AGENT_NOT_FOUND')
      })

      it('should revert when address is of an agent but not owned by user', async () => {
        // stake ethers
        await contract.connect(proxy).stakeEthers({ value: parseEther('3') })

        // create wallet
        await contract.createWallet()
        await contract.connect(otherWallet).createWallet()
        const agents = await contract.connect(otherWallet).getAgents()
        const agent = agents[0]

        // fund agent with token
        await token.transfer(agent, parseEther('1'))

        // fund agent with ethers for gas
        await user.sendTransaction({ to: agent, value: parseEther('0.01') })

        const tokenTx = await token.populateTransaction.transfer(otherWallet.address, parseEther('1'))
        // @ts-ignore
        await expect(createUserTransaction(agent, 0, 50000, tokenTx)).to.be.rejectedWith('AGENT_NOT_FOUND')
      })

      it('should revert when value is greater than agent balance', async () => {
        // stake ethers
        await contract.connect(proxy).stakeEthers({ value: parseEther('3') })

        // create wallet
        await contract.createWallet()
        const agents = await contract.getAgents()
        const agent = agents[0]

        // fund agent with token
        await token.transfer(agent, parseEther('1'))

        // fund agent with ethers for gas
        await user.sendTransaction({ to: agent, value: parseEther('0.01') })

        const tokenTx = await token.populateTransaction.transfer(otherWallet.address, parseEther('1'))
        const input = await createUserTransaction(agent, parseEther('2'), 200000, tokenTx)

        await expect(
          contract.connect(proxy).interactAsProxy(input, {
            gasLimit: input.gasLimit,
            gasPrice: await contract.provider.getGasPrice(),
          }),
        ).to.be.revertedWith('INSUFFICIENT_BALANCE')
      })

      it('should revert when transaction gas amount is higher than user specified gas', async () => {
        // stake ethers
        await contract.connect(proxy).stakeEthers({ value: parseEther('3') })

        // create wallet
        await contract.createWallet()
        const agents = await contract.getAgents()
        const agent = agents[0]

        // fund agent with token
        await token.transfer(agent, parseEther('1'))

        // fund agent with ethers for gas
        await user.sendTransaction({ to: agent, value: parseEther('0.01') })

        const tokenTx = await token.populateTransaction.transfer(otherWallet.address, parseEther('1'))
        const input = await createUserTransaction(agent, parseEther('2'), 200000, tokenTx)

        await expect(
          contract.connect(proxy).interactAsProxy(input, {
            gasLimit: BigNumber.from(50000).add(input.gasLimit),
            gasPrice: await contract.provider.getGasPrice(),
          }),
        ).to.be.revertedWith('PROXY_GAS_LIMIT_TOO_HIGH')
      })

      it('should revert when transaction gas price is not the same as user specified gas price', async () => {
        // stake ethers
        await contract.connect(proxy).stakeEthers({ value: parseEther('3') })

        // create wallet
        await contract.createWallet()
        const agents = await contract.getAgents()
        const agent = agents[0]

        // fund agent with token
        await token.transfer(agent, parseEther('1'))

        // fund agent with ethers for gas
        await user.sendTransaction({ to: agent, value: parseEther('0.01') })

        const tokenTx = await token.populateTransaction.transfer(otherWallet.address, parseEther('1'))
        const input = await createUserTransaction(agent, parseEther('2'), 200000, tokenTx)

        await expect(
          contract.connect(proxy).interactAsProxy(input, {
            gasLimit: input.gasLimit,
            gasPrice: (await contract.provider.getGasPrice()).add(100),
          }),
        ).to.be.revertedWith('WRONG_PROXY_GAS_PRICE')
      })

      it('should revert when agent balance is less than gas cost plus incentives', async () => {
        // stake ethers
        await contract.connect(proxy).stakeEthers({ value: parseEther('3') })

        // create wallet
        await contract.createWallet()
        const agents = await contract.getAgents()
        const agent = agents[0]

        // fund agent with token
        await token.transfer(agent, parseEther('1'))

        const tokenTx = await token.populateTransaction.transfer(otherWallet.address, parseEther('1'))
        const input = await createUserTransaction(agent, 0, 200000, tokenTx)

        await expect(
          contract.connect(proxy).interactAsProxy(input, {
            gasLimit: input.gasLimit,
            gasPrice: await contract.provider.getGasPrice(),
          }),
        ).to.be.revertedWith('INSUFFICIENT_BALANCE')
      })

      it('should revert when signed data is invalid', async () => {
        // stake ethers
        await contract.connect(proxy).stakeEthers({ value: parseEther('3') })

        // create wallet
        await contract.createWallet()
        const agents = await contract.getAgents()
        const agent = agents[0]

        // fund agent with token
        await token.transfer(agent, parseEther('1'))

        // fund agent with ethers for gas
        await user.sendTransaction({ to: agent, value: parseEther('0.01') })

        const tokenTx = await token.populateTransaction.transfer(otherWallet.address, parseEther('1'))
        const input = await createUserTransaction(agent, 0, 200000, tokenTx)

        // sign wrong message
        input.signature = await user.signMessage('0xabcd')

        await expect(
          contract.connect(proxy).interactAsProxy(input, {
            gasLimit: input.gasLimit,
            gasPrice: await contract.provider.getGasPrice(),
          }),
        ).to.be.revertedWith('AGENT_NOT_FOUND')
      })
    })

    describe('effects', () => {
      it('should perform contract interaction as agent', async () => {
        // stake ethers
        await contract.connect(proxy).stakeEthers({ value: parseEther('3') })

        // create wallet
        await contract.createWallet()
        const agents = await contract.getAgents()
        const agent = agents[0]

        // fund agent with token
        await token.transfer(agent, parseEther('1'))

        // fund agent with ethers for gas
        await user.sendTransaction({ to: agent, value: parseEther('0.01') })

        const valueTransferred = parseEther('1')
        const tokenTx = await token.populateTransaction.transfer(otherWallet.address, valueTransferred)
        const input = await createUserTransaction(agent, 0, 200000, tokenTx)

        await expect(() =>
          contract.connect(proxy).interactAsProxy(input, {
            gasLimit: input.gasLimit,
            gasPrice: input.gasPrice,
          }),
        ).to.changeTokenBalances(
          token,
          [{ getAddress: () => agent, provider: otherWallet.provider }, otherWallet],
          [valueTransferred.mul(-1), valueTransferred],
        )
      })
    })
  })

  describe('sendEtherAsProxy', () => {
    async function createUserTransaction(
      agent: string,
      toAddress: string,
      value: BigNumberish,
      gasLimit: BigNumberish,
    ) {
      const input = {
        fromAddress: user.address,
        agentAddress: agent,
        toAddress: toAddress,
        value: value,
        nonce: await contract.getAgentNonce(agent),
        gasLimit: gasLimit,
        gasPrice: await contract.provider.getGasPrice(),
        data: '0x',
        signature: '0x',
        hash: '0x',
      }

      const hash = await contract.computeSendEthersHash(input)
      input.signature = await user.signMessage(arrayify(hash))

      // add for test only
      input.hash = hash
      return input
    }

    describe('validations', () => {
      it('should revert when paused', async () => {
        // stake ethers
        await contract.connect(proxy).stakeEthers({ value: parseEther('3') })

        // create wallet
        await contract.createWallet()
        const agents = await contract.getAgents()
        const agent = agents[0]

        // fund agent with ethers
        await user.sendTransaction({ to: agent, value: parseEther('1.01') })

        const input = await createUserTransaction(agent, otherWallet.address, parseEther('1'), 200000)

        await contract.connect(admin).pause()
        await expect(
          contract.connect(proxy).sendEtherAsProxy(input, {
            gasLimit: input.gasLimit,
            gasPrice: input.gasPrice,
          }),
        ).to.be.revertedWith('Pausable: paused')
      })

      it('should revert when proxy has less stakes than min stake amount', async () => {
        // stake ethers
        await contract.connect(proxy).stakeEthers({ value: parseEther('1') })

        // staking manager sets stake min stake higher
        await contract.connect(stakingManager).setMinStakeAmount(parseEther('1.5'))

        // create wallet
        await contract.createWallet()
        const agents = await contract.getAgents()
        const agent = agents[0]

        // fund agent with ethers
        await user.sendTransaction({ to: agent, value: parseEther('1.01') })

        const input = await createUserTransaction(agent, otherWallet.address, parseEther('1'), 200000)

        await expect(
          contract.connect(proxy).sendEtherAsProxy(input, {
            gasLimit: input.gasLimit,
            gasPrice: input.gasPrice,
          }),
        ).to.be.revertedWith('STAKES_TOO_LOW')
      })

      it('should revert when proxy has less share of stakes in the pool', async () => {
        // staking manager sets stake min stake very low
        await contract.connect(stakingManager).setMinStakeAmount(parseEther('0.0001'))

        // stake minimum ethers
        await contract.connect(proxy).stakeEthers({ value: parseEther('0.0001') })

        // dilute stakes
        await contract.connect(signers[13]).stakeEthers({ value: parseEther('5') })

        // create wallet
        await contract.createWallet()
        const agents = await contract.getAgents()
        const agent = agents[0]

        // fund agent with ethers
        await user.sendTransaction({ to: agent, value: parseEther('1.01') })

        const input = await createUserTransaction(agent, otherWallet.address, parseEther('1'), 200000)

        await expect(
          contract.connect(proxy).sendEtherAsProxy(input, {
            gasLimit: input.gasLimit,
            gasPrice: input.gasPrice,
          }),
        ).to.be.revertedWith('POOL_SHARE_TOO_LOW')
      })

      it('should revert when proxy is on blocklist', async () => {
        // stake ethers
        await contract.connect(proxy).stakeEthers({ value: parseEther('3') })
        await contract.connect(signers[13]).stakeEthers({ value: parseEther('3') })

        // create wallet
        await contract.createWallet()
        const agents = await contract.getAgents()
        const agent = agents[0]

        // fund agent with ethers
        await user.sendTransaction({ to: agent, value: parseEther('1.01') })

        const input = await createUserTransaction(agent, otherWallet.address, parseEther('1'), 200000)

        // withdraw to get on blocklist
        await contract.connect(proxy).withdrawStakes()

        await expect(
          contract.connect(proxy).sendEtherAsProxy(input, {
            gasLimit: input.gasLimit,
            gasPrice: input.gasPrice,
          }),
        ).to.be.revertedWith('BLOCKED')
      })

      it('should revert when address is not of an agent', async () => {
        // stake ethers
        await contract.connect(proxy).stakeEthers({ value: parseEther('3') })

        // create wallet
        await contract.createWallet()
        const agent = randomAddress().toString()

        // fund agent with ethers
        await user.sendTransaction({ to: agent, value: parseEther('1.01') })

        // @ts-ignore
        await expect(createUserTransaction(agent, otherWallet.address, parseEther('1'), 200000)).to.be.rejectedWith(
          'AGENT_NOT_FOUND',
        )
      })

      it('should revert when address is of an agent but not owned by user', async () => {
        // stake ethers
        await contract.connect(proxy).stakeEthers({ value: parseEther('3') })

        // create wallet
        await contract.createWallet()
        await contract.connect(otherWallet).createWallet()
        const agents = await contract.connect(otherWallet).getAgents()
        const agent = agents[0]

        // fund agent with ethers
        await user.sendTransaction({ to: agent, value: parseEther('1.01') })

        // @ts-ignore
        await expect(createUserTransaction(agent, otherWallet.address, parseEther('1'), 200000)).to.be.rejectedWith(
          'AGENT_NOT_FOUND',
        )
      })

      it('should revert when balance is less than (2 * gas limit * gas price + value)', async () => {
        // stake ethers
        await contract.connect(proxy).stakeEthers({ value: parseEther('3') })

        // create wallet
        await contract.createWallet()
        const agents = await contract.getAgents()
        const agent = agents[0]

        // fund agent with ethers
        await user.sendTransaction({ to: agent, value: parseEther('1.01') })

        const input = await createUserTransaction(agent, otherWallet.address, parseEther('2'), 200000)

        await expect(
          contract.connect(proxy).sendEtherAsProxy(input, {
            gasLimit: input.gasLimit,
            gasPrice: input.gasPrice,
          }),
        ).to.be.revertedWith('INSUFFICIENT_BALANCE')
      })

      it('should revert when transaction gas amount is higher than user specified gas', async () => {
        // stake ethers
        await contract.connect(proxy).stakeEthers({ value: parseEther('3') })

        // create wallet
        await contract.createWallet()
        const agents = await contract.getAgents()
        const agent = agents[0]

        // fund agent with ethers
        await user.sendTransaction({ to: agent, value: parseEther('1.01') })

        const input = await createUserTransaction(agent, otherWallet.address, parseEther('1'), 200000)

        await expect(
          contract.connect(proxy).sendEtherAsProxy(input, {
            gasLimit: BigNumber.from(50000).add(input.gasLimit),
            gasPrice: input.gasPrice,
          }),
        ).to.be.revertedWith('PROXY_GAS_LIMIT_TOO_HIGH')
      })

      it('should revert when transaction gas price is not the same as user specified gas price', async () => {
        // stake ethers
        await contract.connect(proxy).stakeEthers({ value: parseEther('3') })

        // create wallet
        await contract.createWallet()
        const agents = await contract.getAgents()
        const agent = agents[0]

        // fund agent with ethers
        await user.sendTransaction({ to: agent, value: parseEther('1.01') })

        const input = await createUserTransaction(agent, otherWallet.address, parseEther('1'), 200000)

        await expect(
          contract.connect(proxy).sendEtherAsProxy(input, {
            gasLimit: input.gasLimit,
            gasPrice: BigNumber.from(100).add(input.gasPrice),
          }),
        ).to.be.revertedWith('WRONG_PROXY_GAS_PRICE')
      })
      it('should revert when signed data is invalid', async () => {
        // stake ethers
        await contract.connect(proxy).stakeEthers({ value: parseEther('3') })

        // create wallet
        await contract.createWallet()
        const agents = await contract.getAgents()
        const agent = agents[0]

        // fund agent with ethers
        await user.sendTransaction({ to: agent, value: parseEther('1.01') })

        const input = await createUserTransaction(agent, otherWallet.address, parseEther('1'), 200000)

        // sign wrong message
        input.signature = await user.signMessage('0xabcd')

        await expect(
          contract.connect(proxy).sendEtherAsProxy(input, {
            gasLimit: input.gasLimit,
            gasPrice: input.gasPrice,
          }),
        ).to.be.revertedWith('AGENT_NOT_FOUND')
      })
    })

    describe('effects', () => {
      it('should send ethers to address from agent balance', async () => {
        // stake ethers
        await contract.connect(proxy).stakeEthers({ value: parseEther('3') })

        // create wallet
        await contract.createWallet()
        const agents = await contract.getAgents()
        const agent = agents[0]

        // fund agent with ethers
        await user.sendTransaction({ to: agent, value: parseEther('1.01') })

        const valueTransferred = parseEther('1')

        const input = await createUserTransaction(agent, otherWallet.address, valueTransferred, 200000)

        const before = [
          await contract.provider.getBalance(agent),
          await contract.provider.getBalance(otherWallet.address),
          await contract.provider.getBalance(proxy.address),
          await contract.provider.getBalance(treasury.address),
        ]

        const tx = await contract.connect(proxy).sendEtherAsProxy(input, {
          gasLimit: input.gasLimit,
          gasPrice: input.gasPrice,
        })
        const rct = await tx.wait()

        const after = [
          await contract.provider.getBalance(agent),
          await contract.provider.getBalance(otherWallet.address),
          await contract.provider.getBalance(proxy.address),
          await contract.provider.getBalance(treasury.address),
        ]

        await expect(tx).to.emit(contract, 'TransactionCompleted').withArgs(input.hash)

        const deduction = before[0].sub(after[0]).sub(valueTransferred)
        const gasCost = rct.gasUsed.mul(rct.effectiveGasPrice)

        expect(deduction).to.gte(gasCost.mul(2))

        // the wallet should be credited with the transferred value
        expect(after[1].sub(before[1])).to.eq(valueTransferred)

        // the wallet should be refunded, then rewarded with at least half the gas cost
        expect(after[2].sub(before[2])).to.gte(gasCost.div(2))

        // the treasury should be credited with quarter the deduction
        expect(after[3].sub(before[3])).to.eq(deduction.div(4))
      })
    })
  })
})
