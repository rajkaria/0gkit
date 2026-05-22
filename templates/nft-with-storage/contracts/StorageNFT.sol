// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * Minimal ERC-721 with off-chain metadata pointing at 0G Storage. The
 * `tokenURI(tokenId)` returns `0g-storage://<root>` where <root> is the
 * Merkle root of the metadata JSON returned by `0gkit-storage`.
 *
 * Not OpenZeppelin — kept inline so a template reader can scan it top-to-
 * bottom. Use OZ's audited base in production.
 */
contract StorageNFT {
    string public name;
    string public symbol;

    mapping(uint256 => address) private _owners;
    mapping(uint256 => bytes32) private _metadataRoots;
    uint256 public totalSupply;

    address public owner;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Minted(address indexed to, uint256 indexed tokenId, bytes32 metadataRoot);

    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
        owner = msg.sender;
    }

    function mint(address to, bytes32 metadataRoot) external returns (uint256 tokenId) {
        require(msg.sender == owner, "not owner");
        tokenId = totalSupply + 1;
        totalSupply = tokenId;
        _owners[tokenId] = to;
        _metadataRoots[tokenId] = metadataRoot;
        emit Transfer(address(0), to, tokenId);
        emit Minted(to, tokenId, metadataRoot);
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        address o = _owners[tokenId];
        require(o != address(0), "nonexistent");
        return o;
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        bytes32 root = _metadataRoots[tokenId];
        require(root != bytes32(0), "nonexistent");
        return string(abi.encodePacked("0g-storage://", _bytes32ToHex(root)));
    }

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
