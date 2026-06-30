// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {Anchor} from "../Anchor.sol";

/**
 * Deploy the Anchor contract to 0G chain.
 *
 * Usage:
 *   forge script contracts/script/DeployAnchor.s.sol \
 *     --rpc-url $OG_RPC_URL \
 *     --private-key $OG_PRIVATE_KEY \
 *     --broadcast
 *
 * After deployment, set OG_ANCHOR_ADDRESS to the printed address and
 * OG_ANCHOR_ONCHAIN=1 to enable on-chain anchoring.
 */
contract DeployAnchor is Script {
    function run() external {
        vm.startBroadcast();
        Anchor anchor = new Anchor();
        console.log("Anchor deployed at", address(anchor));
        vm.stopBroadcast();
    }
}
