// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./ChainWalletAgent.sol";

abstract contract WalletManagerUpgradeable is Initializable, ContextUpgradeable {
    bytes32 public constant SUPPORTED_AGENT_VERSION = keccak256("ChainWalletAgent_v1.0.0");

    // STATE VARIABLES

    /**
     * @dev Mapping of wallet owners to wallet IDs
     */
    mapping(address => bytes32) public wallets;

    /**
     * @dev Mapping of wallet ids to agents
     */
    mapping(bytes32 => mapping(address => ChainWalletAgent)) internal _agents;

    /**
     * @dev Mapping of wallet ids to agents list
     */
    mapping(bytes32 => address[]) private _allAgents;

    /**
     * @dev Mapping of wallet owners to deletion status
     */
    mapping(address => bool) private _deleting;

    // EVENTS

    /**
     * @dev Emitted when a wallet is created
     */
    event WalletCreated(address indexed owner, bytes32 walletId);

    /**
     * @dev Emitted when a wallet is shared with another address
     */
    event WalletShared(address indexed sharer, address indexed recipient, bytes32 walletId);

    /**
     * @dev Emitted when an agent is created on a wallet
     */
    event AgentDeployed(bytes32 indexed walletId, address agent);

    /**
     * @dev Emitted when a wallet is deleted
     */
    event WalletDeleted(address indexed owner);

    // INITIALIZERS

    /**
     * @dev Initializes the contract.
     */
    function __WalletManager_init() internal onlyInitializing {
        __WalletManager_init_unchained();
    }

    function __WalletManager_init_unchained() internal onlyInitializing {}

    // EXTERNAL READ-ONLY FUNCTIONS

    /**
     * @dev Returns the list of agents owned by a user, if the user has a wallet. Otherwise, it reverts.
     */
    function getAgents() external view returns (address[] memory) {
        require(wallets[msg.sender] != 0, "WALLET_NOT_CREATED");
        return _allAgents[wallets[msg.sender]];
    }

    /**
     * @dev Gets the current nonce of the agent for the current user.
     */
    function getAgentNonce(address agentAddress) external view returns (uint256) {
        _requireAgent(agentAddress);
        return _agents[wallets[msg.sender]][agentAddress].getNonce();
    }

    /**
     * @dev Returns true if a delete request has been initiated and awaiting confirmation
     */
    function isDeleting() external view returns (bool) {
        return _deleting[msg.sender];
    }

    // INTERNAL FUNCTIONS

    /**
     * @dev Cancels deletion of the sender's access
     */
    function _cancelDelete() internal {
        if (_deleting[msg.sender]) {
            _deleting[msg.sender] = false;
        }
    }

    /**
     * @dev Confirms and executes deletion of the sender's access. Deletion must have previously been initiated
     */
    function _confirmDelete() internal {
        require(_deleting[msg.sender], "DELETE_NOT_INITIATED");
        emit WalletDeleted(msg.sender);
        wallets[msg.sender] = 0;
    }

    /**
     * @dev Deploys a new agent contract for the sender. The sender must already have a wallet.
     */
    function _createAgent() internal {
        require(wallets[msg.sender] != 0, "WALLET_NOT_CREATED");
        _createAgent(wallets[msg.sender]);
    }

    /**
     * @dev Creates a new wallet for the sender and deploys the first agent.
     */
    function _createWallet() internal returns (bytes32) {
        require(wallets[msg.sender] == 0, "DUPLICATE_WALLET_INVALID");

        // generate a wallet
        bytes32 walletId = keccak256(abi.encodePacked(msg.sender, block.timestamp, block.difficulty));
        wallets[msg.sender] = walletId;
        emit WalletCreated(msg.sender, walletId);
        _createAgent(walletId);

        return walletId;
    }

    /**
     * @dev Initiates the deletion process for the sender's account.
     */
    function _deleteWallet() internal {
        require(wallets[msg.sender] != 0, "WALLET_NOT_CREATED");
        if (!_deleting[msg.sender]) {
            _deleting[msg.sender] = true;
        }
    }

    /**
     * @dev Triggers an interaction with the contract at `contractAddress` from the agent,
     * passing `data` as calldata and sending `value` with the transaction.
     * `agentAddress` must be the address of an agent managed by sender's wallet.
     */
    function _interact(
        address agentAddress,
        address contractAddress,
        uint256 value,
        bytes calldata data
    ) internal returns (bytes memory) {
        _requireAgent(msg.sender, agentAddress);
        return
            _interact(
                msg.sender,
                agentAddress,
                contractAddress,
                value,
                _agents[wallets[msg.sender]][agentAddress].getNonce(),
                data
            );
    }

    /**
     * @dev Sends `value` ethers from `agentAddress` to `recipientAddress`.
     * `agentAddress` must be the address of an agent managed by sender's wallet.
     */
    function _sendEther(
        address agentAddress,
        address recipientAddress,
        uint256 value
    ) internal returns (bytes memory) {
        _requireAgent(msg.sender, agentAddress);
        return
            _interact(
                msg.sender,
                agentAddress,
                recipientAddress,
                value,
                _agents[wallets[msg.sender]][agentAddress].getNonce(),
                ""
            );
    }

    /**
     * @dev Sends `value` ethers from `agentAddress` to `recipientAddress`.
     * `agentAddress` must be the address of an agent managed by sender's wallet.
     */
    function _interact(
        address msgSender,
        address agentAddress,
        address contractAddress,
        uint256 value,
        uint256 nonce,
        bytes memory data
    ) internal returns (bytes memory) {
        return _agents[wallets[msgSender]][agentAddress].performInteraction(nonce, contractAddress, value, data);
    }

    /**
     * @dev Allows `recipient` to have full access to the wallet owned by `sender`.
     * Fails if the sender has not created a wallet or if the recipient already has a wallet.
     */
    function _shareWallet(address recipient) internal {
        require(wallets[msg.sender] != 0, "WALLET_NOT_CREATED");
        require(wallets[recipient] == 0, "RECIPIENT_WALLET_EXISTS");

        wallets[recipient] = wallets[msg.sender];
        emit WalletShared(msg.sender, recipient, wallets[msg.sender]);
    }

    /**
     * @dev Validates that `agentAddress` is a managed agent belonging to `msg.sender`.
     */
    function _requireAgent(address agentAddress) internal view {
        _requireAgent(msg.sender, agentAddress);
    }

    /**
     * @dev Validates that `agentAddress` is a managed agent belonging to `msgSender`.
     */
    function _requireAgent(address msgSender, address agentAddress) internal view {
        require(
            _agents[wallets[msgSender]][agentAddress].VERSION_CODE() == SUPPORTED_AGENT_VERSION,
            "UNSUPPORTED_AGENT_VERSION"
        );
    }

    // PRIVATE FUNCTIONS

    /**
     * @dev Deploys a new agent on the wallet identified by `walletId`.
     * `msg.value` is passed along to the agent after creation.
     */
    function _createAgent(bytes32 walletId) private {
        // deploy the first agent
        ChainWalletAgent agent = new ChainWalletAgent{ value: msg.value }();
        address agentAddress = address(agent);
        _agents[walletId][agentAddress] = agent;
        _allAgents[walletId].push(agentAddress);
        emit AgentDeployed(walletId, agentAddress);
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}
