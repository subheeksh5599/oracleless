// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {OraclelessConditionVault} from "../src/OraclelessConditionVault.sol";

/// @dev Deploy OraclelessConditionVault to Somnia Shannon (chain 50312).
///      BinaryMarketsModule is CREATE3-deployed, identical testnet/mainnet:
///      0x3ecC694Cef705358864a646142ac17A90E29e388
///
/// Usage:
///   PRIVATE_KEY=<deployer> forge script script/Deploy.s.sol --rpc-url https://dream-rpc.somnia.network --broadcast
contract DeployOracleless is Script {
    address constant BINARY_MODULE = 0x3ecC694Cef705358864a646142ac17A90E29e388;

    function run() external returns (OraclelessConditionVault vault) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);
        vault = new OraclelessConditionVault(BINARY_MODULE);
        vm.stopBroadcast();
        console2.log("OraclelessConditionVault deployed at:", address(vault));
        console2.log("binaryModule:", vault.binaryModule());
    }
}
