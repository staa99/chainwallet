# DNGN Minter Microservice

This microservice has a very simple purpose.
It listens for messages on a message queue and mints tokens according the the message instruction.

Messages are encrypted with RSA.
The private key is stored in an environment variable on the minter environment.

On decryption, messages are UTF-8 encoded JSON strings with the following format:

```json
{
  "offChainTransactionId": "transaction id from deposit provider",
  "to": "depositor's address",
  "amount": "total amount from depositor (integer kobo)",
  "fees": "computed platform fees (integer kobo)"
}
```

The private key for the minter and the contract address of the DNGN
contract are stored as environment variables on the minter environment.

The minter interacts with the contract and calls the `deposit` method with the data above.
If the transaction succeeds, the message is acknowledged successfully.

If it fails because the minter has insufficient balance for gas, the status is logged 
and the minter delays until the balance is restored. A notification is sent (just stubbed in the PoC)
via email to alert the provider of the status.

If it fails because of an invalid message, it is rejected and dropped.

If it fails because of a different issue, the error is logged and a notification is sent.
Then the minter rejects the message and re-queues it.
