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

    function performInteraction(
        address contractAddress,
        uint256 value,
        bytes calldata data
    ) external returns (bytes memory) {
        require(msg.sender == _master, "ONLY_MASTER_CAN_PERFORM_INTERACTIONS");
        (bool success, bytes memory response) = contractAddress.call{ value: value }(data);
        require(success, "CONTRACT_INTERACTION_FAILED");
        return response;
    }
}
