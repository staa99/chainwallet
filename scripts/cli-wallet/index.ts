import * as dotenv from 'dotenv'
dotenv.config()

import { ChainWalletCLI } from './cli-wallet'
import { promptConfig } from './config'
import { question } from './util/cli_io'
import { Menu } from './menu'
import { ethers } from 'ethers'

async function initWallet(wallet: ChainWalletCLI): Promise<void> {
  try {
    const importKey = await promptConfig('importKey')
    if (importKey.toLowerCase() !== 'y') {
      wallet.generateWallet()
      return
    }

    const hasPrivateKey = await promptConfig('privateKey')
    if (hasPrivateKey.toLowerCase() !== 'y') {
      const mnemonic = await question('Mnemonic: ')
      wallet.importWalletFromMnemonic(mnemonic)
      return
    }

    const privateKey = await question('Private key: ')
    wallet.importWalletFromPrivateKey(privateKey)
  } catch (e: any) {
    console.error(e)
    return await initWallet(wallet)
  }
}

async function main() {
  const chainWallet = new ChainWalletCLI()
  const rpcEndpoint = await promptConfig('rpcEndpoint')
  const contractAddress = await promptConfig('contractAddress')

  await initWallet(chainWallet)
  await chainWallet.connectWallet(rpcEndpoint, contractAddress)

  const menu = new Menu({
    title: 'Chain Wallet',
    children: [
      new Menu({
        title: 'Setup Account',
        action: async () => {
          await chainWallet.setupAccount()
        },
      }),
      new Menu({
        title: 'Create Wallet',
        action: async () => {
          await chainWallet.createWallet()
        },
      }),
      new Menu({
        title: 'Get Balance',
        action: async () => {
          const balance = await chainWallet.getBalance()
          console.log('Balance:', ethers.utils.formatUnits(balance, 2))
        },
      }),
      new Menu({
        title: 'Display Wallets',
        action: async () => {
          const agents = await chainWallet.loadAgents()
          let i = 0
          for (const agent of agents) {
            console.log(`${++i}. ${agent}`)
          }
        },
      }),
      new Menu({
        title: 'Select Agent',
        action: async () => {
          const agents = await chainWallet.loadAgents()
          let i = 0
          for (const agent of agents) {
            console.log(`${++i}. ${agent}`)
          }
          const answer = await question(`Select agent [1-${i}]: `)
          const index = Number(answer) - 1
          if (isNaN(index) || index < 0 || index >= agents.length) {
            throw Error('Invalid selection')
          }
          await chainWallet.selectAgent(agents[index])
        },
      }),
      new Menu({
        title: 'Send ETH',
        action: async () => {
          const balance = await chainWallet.getBalance()
          console.log('Balance:', ethers.utils.formatEther(balance))
          const strAmount = await question('Enter amount: ')
          const recipient = await question('Enter recipient address: ')
          const amount = ethers.utils.parseEther(strAmount)
          await chainWallet.sendEthers(recipient, amount)
        },
      }),
    ],
  })

  await menu.enter()
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
