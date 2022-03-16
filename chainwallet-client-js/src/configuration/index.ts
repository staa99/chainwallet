import { ethers } from 'ethers'
import { INetworkClientInterface } from '../network'
import { DefaultIpfsNetwork } from '../network/default-ipfs-network'
import constants from '../utils/constants.json'

export interface ChainWalletClientConfig {
  contractAddress: string
  provider?: ethers.providers.Provider
  networkClientInterface?: INetworkClientInterface
}

const chainWalletClientConfigDefaults = {
  getContractAddress: () => constants.CONTRACT_ADDRESS as string,
  getProvider: () => ethers.providers.getDefaultProvider(),
  getNetworkClientInterface: () =>
    new DefaultIpfsNetwork({
      nftStorageApiKey: constants['DEFAULT_NFT.STORAGE_KEY'],
    }),
}

export function deriveFinalConfig(
  config: ChainWalletClientConfig
): ChainWalletClientConfig {
  return {
    contractAddress:
      config.contractAddress || chainWalletClientConfigDefaults.getContractAddress(),
    provider: config.provider || chainWalletClientConfigDefaults.getProvider(),
    networkClientInterface:
      config.networkClientInterface ||
      chainWalletClientConfigDefaults.getNetworkClientInterface(),
  }
}
