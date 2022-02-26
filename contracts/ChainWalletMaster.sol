// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./StakeControllerUpgradeable.sol";
import "./TreasuryManagerUpgradeable.sol";
import "./ChainWalletAgent.sol";

contract ChainWalletMaster is
    Initializable,
    PausableUpgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable,
    StakeControllerUpgradeable,
    TreasuryManagerUpgradeable
{
    using ECDSAUpgradeable for bytes32;

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant SUPPORTED_AGENT_VERSION = keccak256("ChainWalletAgent_v1.0.0");

    mapping(address => bytes32) public wallets;
    
    mapping(address => bool) private _deleting;
    mapping(bytes32 => UserProxyTransaction) private _proxyTransactions;
    mapping(bytes32 => mapping(address => ChainWalletAgent)) private _agents;
    mapping(bytes32 => address[]) private _allAgents;

    event WalletCreated(address indexed owner, bytes32 walletId);
    event WalletShared(address indexed sharer, address indexed recipient, bytes32 walletId);
    event AgentDeployed(bytes32 indexed walletId, address agent);
    event WalletDeleted(bytes32 indexed walletId);
    event TransactionCreated(bytes32 indexed transactionId);
    event TransactionCompleted(bytes32 indexed transactionId);

    struct UserProxyTransaction {
        bool processed;
        bytes32 addressHash;
        bytes32 id;
        bytes32 key;
    }

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

    constructor() payable {}

    function initialize(
        address treasuryAddress,
        uint256 minStakes,
        uint256 maxStakes,
        uint16 minPoolShare
    ) public initializer {
        __Pausable_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();
        __StakeController_init(minPoolShare, minStakes, maxStakes);
        __TreasuryManager_init(treasuryAddress);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
        _grantRole(UPGRADER_ROLE, msg.sender);
        _grantRole(STAKING_MANAGER_ROLE, msg.sender);
        _grantRole(TREASURY_MANAGER_ROLE, msg.sender);
    }

    function stakeEthers() external payable whenNotPaused {
        _stakeEthers();
    }

    function withdrawStakes() external payable whenNotPaused {
        _withdrawStakes(treasury);
    }

    function getProxyTransaction(bytes32 id) external view whenNotPaused _requireStakes returns (UserProxyTransaction memory) {
        return _proxyTransactions[id];
    }

    function createWallet() external payable whenNotPaused returns (bytes32) {
        require(wallets[msg.sender] == 0, "DUPLICATE_WALLET_INVALID");

        // generate a wallet
        bytes32 walletId = keccak256(abi.encodePacked(msg.sender, block.timestamp, block.difficulty));
        wallets[msg.sender] = walletId;
        emit WalletCreated(msg.sender, walletId);
        _createAgent(walletId);

        return walletId;
    }

    function createAgent() external payable whenNotPaused {
        require(wallets[msg.sender] != 0, "WALLET_NOT_CREATED");
        _createAgent(wallets[msg.sender]);
    }

    function initiateProxyTransaction(
        address agentAddress,
        bytes32 id,
        bytes32 key
    ) external whenNotPaused {
        _requireAgent(agentAddress);
        bytes32 transactionId = keccak256(
            abi.encode(
                keccak256("proxyTransaction"),
                keccak256(abi.encode(agentAddress)),
                id,
                key,
                block.difficulty,
                block.timestamp
            )
        );
        _proxyTransactions[transactionId] = UserProxyTransaction(false, keccak256(abi.encode(agentAddress)), id, key);
        emit TransactionCreated(transactionId);
    }

    function getAgentNonce(address agentAddress) external view returns (uint256) {
        _requireAgent(agentAddress);
        return _agents[wallets[msg.sender]][agentAddress].getNonce();
    }

    function computeInteractHash(ProxyTransactionInput calldata input) public pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    keccak256("interactAsProxy"),
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

    function computeSendEthersHash(ProxyTransactionInput calldata input) public pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    keccak256("sendEtherAsProxy"),
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

    function getAgents() external view returns (address[] memory) {
        require(wallets[msg.sender] != 0, "WALLET_NOT_CREATED");
        return _allAgents[wallets[msg.sender]];
    }

    function deleteWallet() external whenNotPaused {
        require(wallets[msg.sender] != 0, "WALLET_NOT_CREATED");
        if (!_deleting[msg.sender]) {
            _deleting[msg.sender] = true;
        }
    }

    function cancelDelete() external whenNotPaused {
        if (_deleting[msg.sender]) {
            _deleting[msg.sender] = false;
        }
    }

    function confirmDelete() external whenNotPaused {
        require(_deleting[msg.sender], "DELETE_NOT_INITIATED");
        emit WalletDeleted(wallets[msg.sender]);
        wallets[msg.sender] = 0;
    }

    function isDeleting() external view returns (bool) {
        return _deleting[msg.sender];
    }

    function shareWallet(address recipient) external whenNotPaused {
        require(wallets[msg.sender] != 0, "WALLET_NOT_CREATED");
        require(wallets[recipient] == 0, "RECIPIENT_WALLET_EXISTS");

        wallets[recipient] = wallets[msg.sender];
        emit WalletShared(msg.sender, recipient, wallets[msg.sender]);
    }

    function interact(
        address agentAddress,
        address contractAddress,
        uint256 value,
        bytes calldata data
    ) external payable whenNotPaused returns (bytes memory) {
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

    function interactAsProxy(bytes32 transactionId, ProxyTransactionInput calldata input)
        external
        payable
        whenNotPaused
        _requireStakes
        _proxyMethod(transactionId, input, computeInteractHash(input))
        returns (bytes memory)
    {
        return _interact(input.fromAddress, input.agentAddress, input.toAddress, input.value, input.nonce, input.data);
    }

    function sendEther(
        address agentAddress,
        address recipientAddress,
        uint256 value
    ) external payable whenNotPaused returns (bytes memory) {
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

    function sendEtherAsProxy(bytes32 transactionId, ProxyTransactionInput calldata input)
        external
        payable
        whenNotPaused
        _requireStakes
        _proxyMethod(transactionId, input, computeSendEthersHash(input))
        returns (bytes memory)
    {
        return _interact(input.fromAddress, input.agentAddress, input.toAddress, input.value, input.nonce, "");
    }

    function pause() public onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() public onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}

    function _interact(
        address msgSender,
        address agentAddress,
        address contractAddress,
        uint256 value,
        uint256 nonce,
        bytes memory data
    ) private whenNotPaused returns (bytes memory) {
        // send the ether to the agent if the transaction has msg.value
        if (msg.value > 0) {
            (bool success, ) = agentAddress.call{ value: msg.value }("");
            require(success, "VALUE_TRANSFER_FAILED");
        }

        return _agents[wallets[msgSender]][agentAddress].performInteraction(nonce, contractAddress, value, data);
    }

    modifier _proxyMethod(
        bytes32 transactionId,
        ProxyTransactionInput calldata input,
        bytes32 hash
    ) {
        uint256 gasLimit = gasleft() + 36000;
        require(gasLimit - 36000 <= input.gasLimit, "PROXY_GAS_LIMIT_TOO_HIGH");
        require(input.gasPrice <= tx.gasprice, "PROXY_GAS_PRICE_TOO_HIGH");
        require(!_proxyTransactions[transactionId].processed, "TRANSACTION_ALREADY_PROCESSED");
        require(
            _proxyTransactions[transactionId].addressHash == keccak256(abi.encode(input.agentAddress)),
            "INVALID_AGENT_ADDRESS"
        );
        _requireAgent(input.fromAddress, input.agentAddress);

        // The agent balance MUST be sufficient to cover the user's gas cost + value + incentive
        // reward is calculated as 1.5 x gas cost (refund plus incentive)
        // gas cost is estimated as 36000 + gas used within this context

        require(input.agentAddress.balance >= 2 * gasLimit * tx.gasprice + input.value, "INSUFFICIENT_BALANCE");
        require(hash.toEthSignedMessageHash().recover(input.signature) == input.fromAddress, "INVALID_SIGNED_DATA");

        _;

        // update transaction status
        _proxyTransactions[transactionId].processed = true;

        // repay msg.sender with 1.5 * gas cost
        uint256 gasUsed = gasLimit - gasleft();
        _agents[wallets[input.fromAddress]][input.agentAddress].performInteraction(
            input.nonce + 1,
            msg.sender,
            (3 * gasUsed * tx.gasprice) / 2,
            ""
        );

        // commit 0.5 * gas cost to treasury
        _agents[wallets[input.fromAddress]][input.agentAddress].performInteraction(
            input.nonce + 2,
            treasury,
            (gasUsed * tx.gasprice) / 2,
            ""
        );
    }

    function _requireAgent(address agentAddress) private view {
        _requireAgent(msg.sender, agentAddress);
    }

    function _requireAgent(address msgSender, address agentAddress) private view {
        require(
            _agents[wallets[msgSender]][agentAddress].VERSION_CODE() == SUPPORTED_AGENT_VERSION,
            "UNSUPPORTED_AGENT_VERSION"
        );
    }

    function _createAgent(bytes32 walletId) private whenNotPaused {
        // deploy the first agent
        ChainWalletAgent agent = new ChainWalletAgent{ value: msg.value }();
        address agentAddress = address(agent);
        _agents[walletId][agentAddress] = agent;
        _allAgents[walletId].push(agentAddress);
        emit AgentDeployed(walletId, agentAddress);
    }
}
