// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./ChainWalletAgent.sol";
import "hardhat/console.sol";

contract ChainWalletMaster is Initializable, PausableUpgradeable, AccessControlUpgradeable, UUPSUpgradeable {
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant SUPPORTED_AGENT_VERSION = keccak256("ChainWalletAgent_v1.0.0");

    mapping(address => bool) private _deleting;
    mapping(address => bytes32) public wallets;
    mapping(bytes32 => mapping(address => ChainWalletAgent)) private _agents;
    mapping(bytes32 => address[]) private _allAgents;

    event WalletCreated(address indexed owner, bytes32 walletId);
    event WalletShared(address indexed sharer, address indexed recipient, bytes32 walletId);
    event AgentDeployed(bytes32 indexed walletId, address agent);
    event WalletDeleted(bytes32 indexed walletId);

    constructor() payable {}

    function initialize() public initializer {
        __Pausable_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
        _grantRole(UPGRADER_ROLE, msg.sender);
    }

    function createWallet() external payable returns (bytes32) {
        require(wallets[msg.sender] == 0, "DUPLICATE_WALLET_INVALID");

        // generate a wallet
        bytes32 walletId = keccak256(abi.encodePacked(msg.sender, block.timestamp, block.difficulty));
        wallets[msg.sender] = walletId;
        emit WalletCreated(msg.sender, walletId);
        _createAgent(walletId);

        return walletId;
    }

    function createAgent() external payable {
        require(wallets[msg.sender] != 0, "WALLET_NOT_CREATED");
        _createAgent(wallets[msg.sender]);
    }

    function getAgents() external view returns (address[] memory) {
        require(wallets[msg.sender] != 0, "WALLET_NOT_CREATED");
        return _allAgents[wallets[msg.sender]];
    }

    function deleteWallet() external {
        require(wallets[msg.sender] != 0, "WALLET_NOT_CREATED");
        if (!_deleting[msg.sender]) {
            _deleting[msg.sender] = true;
        }
    }

    function cancelDelete() external {
        if (_deleting[msg.sender]) {
            _deleting[msg.sender] = false;
        }
    }

    function confirmDelete() external {
        require(_deleting[msg.sender], "DELETE_NOT_INITIATED");
        emit WalletDeleted(wallets[msg.sender]);
        wallets[msg.sender] = 0;
    }

    function isDeleting() external view returns (bool) {
        return _deleting[msg.sender];
    }

    function shareWallet(address recipient) external {
        require(wallets[msg.sender] != 0, "WALLET_NOT_CREATED");
        require(wallets[recipient] == 0, "RECIPIENT_WALLET_EXISTS");

        wallets[recipient] = wallets[msg.sender];
        emit WalletShared(msg.sender, recipient, wallets[msg.sender]);
    }

    function interact(
        address agentAddress,
        address contractAddress,
        bytes calldata data
    ) external payable returns (bytes memory) {
        _requireAgent(agentAddress);
        return _agents[wallets[msg.sender]][agentAddress].performInteraction(contractAddress, msg.value, data);
    }

    function pause() public onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() public onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}

    function _requireAgent(address agentAddress) private view {
        require(
            _agents[wallets[msg.sender]][agentAddress].VERSION_CODE() == SUPPORTED_AGENT_VERSION,
            "UNSUPPORTED_AGENT_VERSION"
        );
    }

    function _createAgent(bytes32 walletId) private {
        // deploy the first agent
        ChainWalletAgent agent = new ChainWalletAgent{ value: msg.value }();
        address agentAddress = address(agent);
        _agents[walletId][agentAddress] = agent;
        _allAgents[walletId].push(agentAddress);
        emit AgentDeployed(walletId, agentAddress);
    }
}
