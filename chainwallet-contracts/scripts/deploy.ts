import '@nomiclabs/hardhat-ethers'
import '@openzeppelin/hardhat-upgrades'
import { ethers, upgrades } from 'hardhat'
import {parseEther} from "ethers/lib/utils";

async function main() {
  const factory = await ethers.getContractFactory('ChainWalletMaster')

  /**
   initialize args:
   ----------------
   
   bytes4 _instanceId,
   address treasuryAddress,
   uint256 minStakes,
   uint256 maxStakes,
   uint16 minPoolShare
   */
  
  const initializeArgs = [
    // _instanceId
    process.env.IARGS_INSTANCE_ID,
    
    // treasury address
    process.env.IARGS_TREASURY_ADDRESS,
    
    // minStakes
    parseEther(process.env.IARGS_MIN_STAKES_ETHERS),
    
    // maxStakes
    parseEther(process.env.IARGS_MAX_STAKES_ETHERS),
    
    // minPoolShare
    Number(process.env.IARGS_MIN_POOL_SHARE),
  ] 
  
  const contract = await upgrades.deployProxy(factory, initializeArgs, {
    initializer: 'initialize',
  })

  // The address the Contract WILL have once mined
  console.log(contract.address)

  // The transaction that was sent to the network to deploy the Contract
  console.log(contract.deployTransaction.hash)

  // The contract is NOT deployed yet; we must wait until it is mined
  await contract.deployed()
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
