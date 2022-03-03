// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

abstract contract StakeControllerUpgradeable is Initializable, ContextUpgradeable, AccessControlUpgradeable {
    bytes32 public constant STAKING_MANAGER_ROLE = keccak256("STAKING_MANAGER_ROLE");

    /**
     * @dev The current minimum percentage of the pool a proxy must have to become.
     * Scaled to 1 decimal precision.
     *
     * 1 = 0.1%, 10 = 1%, 100 = 10%, 1000 = 100%.
     *
     * `minPoolSharePercentage` must never be higher than 10%
     */
    uint16 public minPoolSharePercentage;

    /**
     * @dev The current minimum amount that must be staked to become a proxy
     */
    uint256 public minStakeAmount;

    /**
     * @dev The current maximum amount that must be staked to become a proxy
     */
    uint256 public maxStakeAmount;

    /**
     * @dev The total amount currently staked in the pool
     */
    uint256 public totalStakes;

    /**
     * @dev The mapping of addresses to the stakes they have in the pool
     */
    mapping(address => uint256) public stakes;

    /**
     * @dev A list of proxies that have been blocked from executing transactions
     */
    mapping(address => bool) public blockList;

    /**
     * @dev Emitted when the `minStakeAmount` is changed to `newAmount`
     */
    event MinStakeAmountChanged(uint256 newAmount);

    /**
     * @dev Emitted when the `maxStakeAmount` is changed to `newAmount`
     */
    event MaxStakeAmountChanged(uint256 newAmount);

    /**
     * @dev Emitted when new stakes are added by staker
     */
    event StakesAdded(address indexed staker, uint256 totalStakes);

    /**
     * @dev Emitted when staker withdraws their stakes
     */
    event StakesWithdrawn(address staker);

    /**
     * @dev Initializes the contract.
     */
    function __StakeController_init(
        uint16 minPoolShare,
        uint256 minStakes,
        uint256 maxStakes
    ) internal onlyInitializing {
        __AccessControl_init();

        __StakeController_init_unchained(minPoolShare, minStakes, maxStakes);
    }

    function __StakeController_init_unchained(
        uint16 minPoolShare,
        uint256 minStakes,
        uint256 maxStakes
    ) internal onlyInitializing {
        require(minPoolShare <= 100, "MIN_POOL_SHARE_TOO_HIGH");
        minStakeAmount = minStakes;
        maxStakeAmount = maxStakes;
        minPoolSharePercentage = minPoolShare;
    }

    /**
     * @dev Allows an address to stake a valid amount of ethers to the pool.
     * The amount added must be within `minStakeAmount` and `maxStakeAmount`.
     */
    function _stakeEthers() internal {
        require(msg.value + stakes[msg.sender] >= minStakeAmount, "STAKE_TOO_LOW");
        require(msg.value + stakes[msg.sender] <= maxStakeAmount, "STAKE_TOO_HIGH");

        stakes[msg.sender] += msg.value;
        totalStakes += msg.value;

        emit StakesAdded(msg.sender, stakes[msg.sender] + msg.value);
    }

    /**
     * @dev Enables the withdrawal of 50% of stakes while losing the other 50% to the treasury.
     * This is implemented as a deterrent to mitigate malicious staking and ensure only committed proxies
     * are able to execute transactions for users.
     *
     * Furthermore, when an address has withdrawn all funds, the address can no longer execute transactions.
     *
     * The current stakes of the account must be greater than 0
     */
    function _withdrawStakes(address treasury) internal {
        require(stakes[msg.sender] > 0, "STAKE_TOO_LOW");

        uint256 amount = stakes[msg.sender];
        stakes[msg.sender] = 0;
        totalStakes -= amount;

        // transfer 50% to owner
        (bool success, ) = msg.sender.call{ value: amount / 2 }("");
        require(success, "WITHDRAWAL_FAILED");

        // transfer 50% to treasury
        (success, ) = treasury.call{ value: amount / 2 }("");
        require(success, "WITHDRAWAL_FAILED");
    }

    /**
     * @dev Sets the minimum amount required to be a valid proxy.
     * Emits `MinStakeAmountChanged(amount)` on success.
     */
    function setMinStakeAmount(uint256 amount) external onlyRole(STAKING_MANAGER_ROLE) {
        minStakeAmount = amount;
        emit MinStakeAmountChanged(amount);
    }

    /**
     * @dev Sets the maximum amount required to be a valid proxy.
     * Emits `MaxStakeAmountChanged(amount)` on success.
     */
    function setMaxStakeAmount(uint256 amount) external onlyRole(STAKING_MANAGER_ROLE) {
        require(amount > minStakeAmount);
        maxStakeAmount = amount;
        emit MaxStakeAmountChanged(amount);
    }

    /**
     * @dev Performs validation to ensure that the sender has satisfied all
     * staking requirements to be a valid proxy.
     */
    function _ensureProxyStakesValidity() private view {
        require(totalStakes > 0, "POOL_EMPTY");
        require(!blockList[msg.sender], "BLOCKED");
        require(stakes[msg.sender] >= minStakeAmount, "STAKES_TOO_LOW");

        // at least 0.5% of the pool
        require((stakes[msg.sender] * 1000) / totalStakes >= minPoolSharePercentage, "POOL_SHARE_TOO_LOW");
    }

    /**
     * @dev A modifier that is intended to be used on proxy execution and data access methods
     * to ensure that only validated proxies are able to perform operations for users.
     */
    modifier _requireStakes() {
        _ensureProxyStakesValidity();
        _;
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}
