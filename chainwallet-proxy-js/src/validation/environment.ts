export function ensureEnvironmentVariables(): void {
  const requiredEnvKeys = [
    'BLOCKCHAIN_RPC_ENDPOINT',
    'CONTRACT_ADDRESS',
    'PRIVATE_KEY',
    'IPFS_GATEWAY_BASE_URL',
    'REDIS_URL',
    'START_BLOCK_NUMBER',
  ]

  const unsetKeys = requiredEnvKeys.filter((key) => !process.env[key])
  if (!unsetKeys.length) {
    return
  }

  throw Error(`WITHDRAWER_LAUNCH_ERR: ${unsetKeys} not defined in environment variables`)
}
