// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {StorageNFT} from "../contracts/StorageNFT.sol";

contract Deploy is Script {
    function run() external {
        vm.startBroadcast();
        StorageNFT nft = new StorageNFT("0gkit Genesis", "0GKG");
        console.log("StorageNFT deployed at", address(nft));
        vm.stopBroadcast();
    }
}
