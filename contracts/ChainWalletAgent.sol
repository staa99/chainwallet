// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

contract ChainWalletAgent {
    bytes32 public VERSION_CODE;
    address private _master;

    constructor() payable {
        VERSION_CODE = keccak256("ChainWalletAgent_v1.0.0");
        _master = msg.sender;
    }

    fallback() external payable {}

    receive() external payable {}

    modifier onlyMaster() {
        require(msg.sender == _master, "ACCESS_DENIED");
        _;
    }

    function performInteraction(
        address contractAddress,
        uint256 value,
        bytes calldata data
    ) external onlyMaster returns (bytes memory) {
        (bool success, bytes memory response) = contractAddress.call{ value: value }(data);
        require(success, "CONTRACT_INTERACTION_FAILED");
        return response;
    }
}
