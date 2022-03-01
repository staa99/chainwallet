// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

contract ChainWalletAgent {
    bytes32 public VERSION_CODE;
    uint256 private _nonce;
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

    function getNonce() external view onlyMaster returns (uint256) {
        return _nonce;
    }

    function performInteraction(
        uint256 nonce,
        address toAddress,
        uint256 value,
        bytes calldata data
    ) external onlyMaster returns (bytes memory) {
        require(nonce == _nonce, "INVALID_NONCE");
        _nonce++;
        (bool success, bytes memory response) = toAddress.call{ value: value }(data);
        require(success, "CALL_FAILED");
        return response;
    }
}
