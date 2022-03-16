import * as dotenv from 'dotenv'

import { ChainWalletCLI } from './cli-wallet'
import { promptConfig } from './config'
import { question } from './util/cli_io'
import { Menu } from './menu'
import { ethers } from 'ethers'
import { isAddress } from 'ethers/lib/utils'

dotenv.config()

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
  } catch (e) {
    console.error(e)
    return await initWallet(wallet)
  }
}

async function main() {
  const chainWallet = new ChainWalletCLI()
  const rpcEndpoint = await promptConfig('rpcEndpoint')

  await initWallet(chainWallet)
  await chainWallet.connectWallet(rpcEndpoint)

  const menu = new Menu({
    title: 'Chain Wallet',
    children: [
      new Menu({
        title: 'Setup Account',
        action: async () => {
          await chainWallet.createWallet()
        },
      }),
      new Menu({
        title: 'Create Wallet',
        action: async () => {
          await chainWallet.createSubwallet()
        },
      }),
      new Menu({
        title: 'Get Balance',
        action: async () => {
          const balance = await chainWallet.getBalance()
          console.log('Balance:', ethers.utils.formatEther(balance))
        },
      }),
      new Menu({
        title: 'Display Wallets',
        action: async () => {
          const subwallets = await chainWallet.loadSubwallets()
          let i = 0
          for (const subwallet of subwallets) {
            console.log(`${++i}. ${subwallet}`)
          }
        },
      }),
      new Menu({
        title: 'Select Subwallet',
        action: async () => {
          const subwallets = await chainWallet.loadSubwallets()
          let i = 0
          for (const subwallet of subwallets) {
            console.log(`${++i}. ${subwallet}`)
          }
          const answer = await question(`Select subwallet [1-${i}]: `)
          const index = Number(answer) - 1
          if (isNaN(index) || index < 0 || index >= subwallets.length) {
            throw Error('Invalid selection')
          }
          chainWallet.selectSubwallet(subwallets[index])
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
      new Menu({
        title: 'Tokens',
        children: [
          new Menu({
            title: 'Add ERC20 Token',
            action: async () => {
              const tokenAddress = await question('Enter token address: ')
              if (!isAddress(tokenAddress)) {
                throw new Error('Invalid token address')
              }

              const symbol = await chainWallet.addERC20Token(tokenAddress)
              console.log(symbol, 'added')
            },
          }),
          new Menu({
            title: 'Get Balance',
            action: async () => {
              const symbol = await question('Enter token symbol: ')
              const balance = await chainWallet.getERC20TokenBalance(symbol)
              console.log('Balance:', chainWallet.formatTokenAmount(symbol, balance))
            },
          }),
          new Menu({
            title: 'Send ERC20 Token',
            action: async () => {
              const symbol = await question('Enter token symbol: ')
              const balance = await chainWallet.getERC20TokenBalance(symbol)
              console.log('Balance:', chainWallet.formatTokenAmount(symbol, balance))

              const strAmount = await question('Enter amount: ')
              const recipient = await question('Enter recipient address: ')
              const amount = chainWallet.parseTokenAmount(symbol, strAmount)
              await chainWallet.sendERC20Token(symbol, recipient, amount)
            },
          }),
        ],
      }),
    ],
  })

  await menu.enter()
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
