// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * Anchor — on-chain commitment registry for AI oracle receipts.
 *
 * Stores a keccak256 hash of a signed oracle receipt on-chain so it can be
 * independently verified by anyone with the original receipt and signature.
 *
 * This is the opt-in on-chain anchor (OG_ANCHOR_ONCHAIN=1). The default
 * anchor is 0G Storage (immutable content-addressed root). Use this contract
 * when you need a public, tamper-evident on-chain record.
 *
 * Not audited — kept minimal so a template reader can scan it top-to-bottom.
 * Use an audited access-control base in production.
 */
contract Anchor {
    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /**
     * Emitted when a hash is anchored on-chain.
     *
     * @param hash  keccak256 of the signed oracle receipt payload.
     * @param tag   Human-readable tag (e.g. "ai-oracle:1234567890").
     * @param by    The address that anchored the hash.
     */
    event Anchored(bytes32 indexed hash, string tag, address indexed by);

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    /** Maps hash → the block number at which it was first anchored. */
    mapping(bytes32 => uint256) public anchoredAt;

    // -------------------------------------------------------------------------
    // anchor()
    // -------------------------------------------------------------------------

    /**
     * Anchor a hash on-chain.
     *
     * @param hash  keccak256 of the signed oracle receipt payload.
     * @param tag   Human-readable label (stored in the event log only).
     *
     * Idempotent: calling again with the same hash emits a new Anchored event
     * but does NOT update anchoredAt (first-anchor wins).
     */
    function anchor(bytes32 hash, string calldata tag) external {
        if (anchoredAt[hash] == 0) {
            anchoredAt[hash] = block.number;
        }
        emit Anchored(hash, tag, msg.sender);
    }
}
