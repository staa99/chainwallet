// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

contract SampleContract {
    string public name = "Sample Basic Token";
    string public symbol = "SBT";

    uint256 public totalSupply = 100 ether;
    address public owner;

    mapping(address => uint256) balances;

    constructor() {
        balances[msg.sender] = totalSupply;
        owner = msg.sender;
    }

    function transfer(address to, uint256 amount) external {
        require(balances[msg.sender] >= amount, "Not enough tokens");

        balances[msg.sender] -= amount;
        balances[to] += amount;
    }

    function balanceOf(address account) external view returns (uint256) {
        return balances[account];
    }
}
