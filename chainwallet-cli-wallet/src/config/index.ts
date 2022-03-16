import { question } from '../util/cli_io'

interface ConfigItem {
  prompt: string
  default: string
  options?: string
}

interface Config {
  rpcEndpoint: ConfigItem
  contractAddress: ConfigItem
  importKey: ConfigItem
  privateKey: ConfigItem
}

let _config: Config
function getConfig() {
  if (_config) {
    return _config
  }

  _config = {
    rpcEndpoint: {
      prompt: 'RPC Endpoint:',
      default: `https://rinkeby.infura.io/v3/${process.env.INFURA_KEY}`,
    },
    contractAddress: {
      prompt: 'Contract Address:',
      default: process.env.CONTRACT_ADDRESS!,
    },
    importKey: {
      prompt: 'Do you want to import an existing wallet?',
      default: 'n',
      options: 'Y/N',
    },
    privateKey: {
      prompt: 'Do you have a private key?',
      default: 'n',
      options: 'Y/N',
    },
  }
  return _config
}

export async function promptConfig(key: keyof Config): Promise<string> {
  const config = getConfig()
  let prompt = config[key].prompt
  if (config[key].options) {
    prompt += ` (${config[key].options})`
  }
  prompt += ` [${config[key].default}] `

  return (await question(prompt)) || config[key].default
}
