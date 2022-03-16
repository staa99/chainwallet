# ChainWallet Proxy Service

An implementation of a proxy node on the public network. It is meant to be used primarily
as a guide for use in private networks. However, users on the public network can also 
use public proxies to execute transactions.

## Configuration

The following environment variables are required

```
BLOCKCHAIN_RPC_ENDPOINT: The full URL of the JSON_RPC endpoint of the node on the network
PRIVATE_KEY: The private key of the proxy
CONTRACT_ADDRESS: The address of the chainwallet contract
IPFS_GATEWAY_BASE_URL: The URL of the IPFS gateway endpoint
REDIS_URL: A redis connection string to track block numbers
START_BLOCK_NUMBER: The block number to start indexing from
```
