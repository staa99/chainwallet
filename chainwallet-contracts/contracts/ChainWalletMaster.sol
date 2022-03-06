// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./ProxiableWalletManagerUpgradeable.sol";

contract ChainWalletMaster is
    Initializable,
    PausableUpgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable,
    ProxiableWalletManagerUpgradeable
{
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    constructor() {}

    // INITIALIZER
    function initialize(
        bytes4 _instanceId,
        address treasuryAddress,
        uint256 minStakes,
        uint256 maxStakes,
        uint16 minPoolShare
    ) public initializer {
        __Pausable_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();
        __ProxiableWalletManager_init(_instanceId, treasuryAddress, minPoolShare, minStakes, maxStakes);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
        _grantRole(UPGRADER_ROLE, msg.sender);
        _grantRole(STAKING_MANAGER_ROLE, msg.sender);
        _grantRole(TREASURY_MANAGER_ROLE, msg.sender);
    }

    // WALLET MANAGEMENT

    function cancelDelete() external whenNotPaused {
        _cancelDelete();
    }

    function confirmDelete() external whenNotPaused {
        _confirmDelete();
    }

    function createAgent() external payable whenNotPaused {
        _createAgent();
    }

    function createWallet() external payable whenNotPaused {
        _createWallet();
    }

    function deleteWallet() external whenNotPaused {
        _deleteWallet();
    }

    function shareWallet(address recipient) external whenNotPaused {
        _shareWallet(recipient);
    }

    // DIRECT INTERACTION

    function interact(
        address agentAddress,
        address contractAddress,
        uint256 value,
        bytes calldata data
    ) external whenNotPaused {
        _interact(agentAddress, contractAddress, value, data);
    }

    function sendEther(
        address agentAddress,
        address recipientAddress,
        uint256 value
    ) external whenNotPaused {
        _sendEther(agentAddress, recipientAddress, value);
    }

    // PROXIED EXECUTION

    function initiateProxyTransaction(bytes32 locator) external whenNotPaused {
        _initiateProxyTransaction(locator);
    }

    function interactAsProxy(ProxyTransactionInput calldata input) external whenNotPaused {
        _interactAsProxy(input);
    }

    function sendEtherAsProxy(ProxyTransactionInput calldata input) external whenNotPaused {
        _sendEtherAsProxy(input);
    }

    // STAKING
    function stakeEthers() external payable whenNotPaused {
        _stakeEthers();
    }

    function withdrawStakes() external payable whenNotPaused {
        _withdrawStakes(treasury);
    }

    function pause() public onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() public onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}
}
