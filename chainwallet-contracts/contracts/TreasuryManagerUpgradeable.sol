// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

abstract contract TreasuryManagerUpgradeable is Initializable, ContextUpgradeable, AccessControlUpgradeable {
    bytes32 public constant TREASURY_MANAGER_ROLE = keccak256("TREASURY_MANAGER_ROLE");

    /**
     * @dev The address of the treasury
     */
    address public treasury;

    /**
     * @dev Emitted when the `treasury` address is changed to `addr`
     */
    event TreasuryAddressChanged(address addr);

    /**
     * @dev Initializes the contract.
     */
    function __TreasuryManager_init(address addr) internal onlyInitializing {
        __AccessControl_init();

        __TreasuryManager_init_unchained(addr);
    }

    function __TreasuryManager_init_unchained(address addr) internal onlyInitializing {
        treasury = addr;
    }

    /**
     * @dev Sets the address of the treasury to `addr`
     */
    function setTreasuryAddress(address addr) public onlyRole(TREASURY_MANAGER_ROLE) {
        if (treasury != addr) {
            treasury = addr;
            emit TreasuryAddressChanged(addr);
        }
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}
