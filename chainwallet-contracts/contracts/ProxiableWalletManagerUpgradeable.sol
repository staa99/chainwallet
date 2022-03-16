// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import "./StakeControllerUpgradeable.sol";
import "./TreasuryManagerUpgradeable.sol";
import "./WalletManagerUpgradeable.sol";

abstract contract ProxiableWalletManagerUpgradeable is
    WalletManagerUpgradeable,
    StakeControllerUpgradeable,
    TreasuryManagerUpgradeable
{
    using ECDSAUpgradeable for bytes32;

    /**
     * @dev Used to ensure the user knows the instance they are signing for. Other instances on
     * the same or other chains must have different instance IDs.
     */
    bytes4 public instanceId;

    /**
     * @dev Emitted when a transaction is created. The locator should be unique between networks.
     * However, it should only resolve within the network used by the transaction owner.
     * Transactions that cannot be located should be ignored by proxies.
     */
    event TransactionCreated(bytes locator);

    /**
     * @dev Emitted when a transaction is completed by a proxy. The transaction hash is used to search the logs for processed transactions.
     */
    event TransactionCompleted(bytes32 indexed transactionHash);

    struct ProxyTransactionInput {
        address fromAddress;
        address agentAddress;
        address toAddress;
        uint256 value;
        uint256 nonce;
        uint256 gasLimit;
        uint256 gasPrice;
        bytes data;
        bytes signature;
    }

    // INITIALIZERS

    /**
     * @dev Initializes the contract.
     */
    function __ProxiableWalletManager_init(
        bytes4 _instanceId,
        address treasuryAddress,
        uint16 minPoolShare,
        uint256 minStakes,
        uint256 maxStakes
    ) internal onlyInitializing {
        __WalletManager_init();
        __TreasuryManager_init(treasuryAddress);
        __StakeController_init(minPoolShare, minStakes, maxStakes);

        __ProxiableWalletManager_init_unchained(_instanceId);
    }

    function __ProxiableWalletManager_init_unchained(bytes4 _instanceId) internal onlyInitializing {
        instanceId = _instanceId;
    }

    // PUBLIC READ-ONLY FUNCTIONS

    /**
     * @dev Computes the hash for the contract interaction transaction `input`.
     * Uses the contract's `instanceId` to ensure the signature only works here.
     */
    function computeInteractHash(ProxyTransactionInput calldata input) public view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    keccak256("interactAsProxy"),
                    instanceId,
                    input.fromAddress,
                    input.agentAddress,
                    input.toAddress,
                    input.value,
                    input.nonce,
                    input.gasLimit,
                    input.gasPrice,
                    input.data
                )
            );
    }

    /**
     * @dev Computes the hash for the ether transfer transaction `input`.
     * Uses the contract's `instanceId` to ensure the signature only works here.
     */
    function computeSendEthersHash(ProxyTransactionInput calldata input) public view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    keccak256("sendEtherAsProxy"),
                    instanceId,
                    input.fromAddress,
                    input.agentAddress,
                    input.toAddress,
                    input.value,
                    input.nonce,
                    input.gasLimit,
                    input.gasPrice,
                    input.data
                )
            );
    }

    // INTERNAL FUNCTIONS

    /**
     * @dev Initiates a transaction with data at locator. This is agnostic to
     * the network the user is running on.
     */
    function _initiateProxyTransaction(bytes calldata locator) internal {
        emit TransactionCreated(locator);
    }

    /**
     * @dev Executes a contract interaction transaction as a valid proxy on behalf of a user.
     */
    function _interactAsProxy(ProxyTransactionInput calldata input)
        internal
        _requireStakes
        _proxyMethod(input, computeInteractHash(input))
        returns (bytes memory)
    {
        return _interact(input.fromAddress, input.agentAddress, input.toAddress, input.value, input.nonce, input.data);
    }

    /**
     * @dev Executes an ether transfer transaction as a valid proxy on behalf of a user.
     */
    function _sendEtherAsProxy(ProxyTransactionInput calldata input)
        internal
        _requireStakes
        _proxyMethod(input, computeSendEthersHash(input))
        returns (bytes memory)
    {
        return _interact(input.fromAddress, input.agentAddress, input.toAddress, input.value, input.nonce, "");
    }

    // MODIFIERS
    /**
     * @dev Validates a proxy transaction and executes it. Then refunds the proxy for gas used and pays
     * half of the gas cost as incentive to the proxy. It also pays half of the gas cost for maintenance of the system
     */
    modifier _proxyMethod(ProxyTransactionInput calldata input, bytes32 hash) {
        uint256 gasLimit = gasleft() + 67584;
        _requireAgent(input.fromAddress, input.agentAddress);
        require(gasLimit - 67584 <= input.gasLimit, "PROXY_GAS_LIMIT_TOO_HIGH");
        require(input.gasPrice == tx.gasprice, "WRONG_PROXY_GAS_PRICE");
        require(input.agentAddress.balance >= 2 * gasLimit * tx.gasprice + input.value, "INSUFFICIENT_BALANCE");
        require(hash.toEthSignedMessageHash().recover(input.signature) == input.fromAddress, "INVALID_SIGNATURE");

        _;

        emit TransactionCompleted(hash);

        // repay msg.sender with 1.5 * gas cost
        uint256 gasCost = (gasLimit - gasleft()) * tx.gasprice;
        _agents[wallets[input.fromAddress]][input.agentAddress].performInteraction(
            input.nonce + 1,
            msg.sender,
            (3 * gasCost) / 2,
            ""
        );

        // commit 0.5 * gas cost to treasury
        _agents[wallets[input.fromAddress]][input.agentAddress].performInteraction(
            input.nonce + 2,
            treasury,
            gasCost / 2,
            ""
        );
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}
