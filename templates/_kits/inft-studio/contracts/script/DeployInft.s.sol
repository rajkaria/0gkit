// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {Inft} from "../Inft.sol";

/**
 * Deploy the Inft contract to 0G chain.
 *
 * Usage:
 *   forge script contracts/script/DeployInft.s.sol \
 *     --rpc-url $OG_RPC_URL \
 *     --private-key $OG_PRIVATE_KEY \
 *     --broadcast
 *
 * After deployment, set OG_INFT_ADDRESS to the printed address in your .env.local.
 * The deployer address becomes the contract owner (minter).
 */
contract DeployInft is Script {
    function run() external {
        string memory tokenName = vm.envOr("INFT_TOKEN_NAME", string("Intelligent NFT"));
        string memory tokenSymbol = vm.envOr("INFT_TOKEN_SYMBOL", string("iNFT"));

        vm.startBroadcast();
        Inft inft = new Inft(tokenName, tokenSymbol);
        console.log("Inft deployed at", address(inft));
        console.log("  name:   ", tokenName);
        console.log("  symbol: ", tokenSymbol);
        console.log("  owner:  ", msg.sender);
        vm.stopBroadcast();
    }
}
