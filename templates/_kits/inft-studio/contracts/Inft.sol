// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * Inft — Intelligent NFT with 0G Storage metadata and attested provenance.
 *
 * Extends the minimal ERC-721 pattern from templates/nft-with-storage with:
 *   - `mint(address to, bytes32 metadataRoot)` — mints a new token; the
 *     `metadataRoot` is the 0G Storage root of the uploaded metadata JSON.
 *   - Optional `provenanceHash` stored alongside the metadata root, so
 *     on-chain verifiers can confirm the AI provenance receipt off-chain.
 *   - `tokenURI(tokenId)` returns `0g-storage://<metadataRoot>` (same
 *     format as StorageNFT so existing readers can parse it).
 *
 * Not OpenZeppelin — kept inline so a template reader can scan it top-to-
 * bottom. Use OZ's audited base in production.
 */
contract Inft {
    string public name;
    string public symbol;

    mapping(uint256 => address) private _owners;
    mapping(uint256 => bytes32) private _metadataRoots;
    mapping(uint256 => bytes32) private _provenanceHashes;
    uint256 public totalSupply;

    address public owner;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Minted(
        address indexed to,
        uint256 indexed tokenId,
        bytes32 metadataRoot,
        bytes32 provenanceHash
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
        owner = msg.sender;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Mint
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Mint a new intelligent NFT.
     *
     * @param to            Recipient address.
     * @param metadataRoot  0G Storage root of the uploaded metadata JSON.
     * @return tokenId      The new token ID (1-indexed, auto-incremented).
     */
    function mint(address to, bytes32 metadataRoot)
        external
        returns (uint256 tokenId)
    {
        require(msg.sender == owner, "Inft: not owner");
        tokenId = totalSupply + 1;
        totalSupply = tokenId;
        _owners[tokenId] = to;
        _metadataRoots[tokenId] = metadataRoot;
        emit Transfer(address(0), to, tokenId);
        emit Minted(to, tokenId, metadataRoot, bytes32(0));
    }

    /**
     * Mint with optional on-chain provenance hash commitment.
     *
     * @param to              Recipient address.
     * @param metadataRoot    0G Storage root of the uploaded metadata JSON.
     * @param provenanceHash  keccak256 of the signed provenance receipt (bytes32(0) if none).
     * @return tokenId        The new token ID.
     */
    function mintWithProvenance(
        address to,
        bytes32 metadataRoot,
        bytes32 provenanceHash
    ) external returns (uint256 tokenId) {
        require(msg.sender == owner, "Inft: not owner");
        tokenId = totalSupply + 1;
        totalSupply = tokenId;
        _owners[tokenId] = to;
        _metadataRoots[tokenId] = metadataRoot;
        _provenanceHashes[tokenId] = provenanceHash;
        emit Transfer(address(0), to, tokenId);
        emit Minted(to, tokenId, metadataRoot, provenanceHash);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ERC-721 read surface
    // ─────────────────────────────────────────────────────────────────────────

    function ownerOf(uint256 tokenId) external view returns (address) {
        address o = _owners[tokenId];
        require(o != address(0), "Inft: nonexistent token");
        return o;
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        bytes32 root = _metadataRoots[tokenId];
        require(root != bytes32(0), "Inft: nonexistent token");
        return string(abi.encodePacked("0g-storage://", _bytes32ToHex(root)));
    }

    function balanceOf(address _owner) external view returns (uint256 balance) {
        require(_owner != address(0), "Inft: zero address");
        for (uint256 i = 1; i <= totalSupply; i++) {
            if (_owners[i] == _owner) balance++;
        }
    }

    function provenanceHashOf(uint256 tokenId) external view returns (bytes32) {
        return _provenanceHashes[tokenId];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    function _bytes32ToHex(bytes32 v) internal pure returns (string memory) {
        bytes memory hexChars = "0123456789abcdef";
        bytes memory out = new bytes(2 + 64);
        out[0] = "0";
        out[1] = "x";
        for (uint256 i = 0; i < 32; i++) {
            uint8 b = uint8(v[i]);
            out[2 + 2 * i] = hexChars[b >> 4];
            out[3 + 2 * i] = hexChars[b & 0x0f];
        }
        return string(out);
    }
}
