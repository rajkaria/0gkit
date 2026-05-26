# nft-with-storage — ERC-721 minter with metadata + media on 0G Storage

Mint an ERC-721 token whose **metadata JSON** and **media file** both live on
**0G Storage** rather than IPFS or AWS. `tokenURI` resolves to
`0g-storage://<root>` where `<root>` is the Merkle root returned by the
upload.

Stack: Foundry (contracts) · `@foundryprotocol/0gkit-storage` ·
`@foundryprotocol/0gkit-contracts` (typed contract codegen) ·
`@foundryprotocol/0gkit-wallet`.

## Workflow

```bash
# 1. Build the contract
pnpm build:contracts          # → forge build, writes out/StorageNFT.sol/...

# 2. Generate the typed TS client (SP4)
pnpm generate:contracts        # → src/generated/StorageNFT.ts

# 3. Deploy (Foundry script)
forge script scripts/Deploy.s.sol \
  --rpc-url $RPC_URL --broadcast --private-key $PRIVATE_KEY

# 4. Configure
cp .env.example .env
# Paste the deployed StorageNFT address into NFT_ADDRESS.

# 5. Mint
pnpm dev 0x… "Genesis" ./my-image.png
```

Sample output:

```
Media uploaded: 0xabc… (tx 0xfeed…)
Metadata uploaded: 0xdef… (tx 0xcafe…)
Minted to 0x…: tx 0xmint…

Mint OK.
  media    : 0g-storage://0xabc…
  metadata : 0g-storage://0xdef…
  tx       : 0xmint…
```

## Walk through the code

- **`contracts/StorageNFT.sol`** — minimal ERC-721. `tokenURI(id)` returns
  `0g-storage://<metadataRoot>`. Inline implementation (no OZ) so a reader
  sees the whole thing top-to-bottom. Use OZ's audited base in production.
- **`scripts/Deploy.s.sol`** — Foundry deploy script.
- **`src/metadata.ts`** — pure ERC-721 metadata codec. Unit-tested.
- **`src/mint-flow.ts`** — `runMintFlow(input, deps)`. Two uploads (media,
  then metadata referencing the media root), then one on-chain mint. Pure
  with respect to `deps`. Returns either a success record or a structured
  error reason.
- **`src/index.ts`** — wires `Storage`, `createTypedContract`, and the
  deploy address; runs the flow.

## SP4 typed-contract codegen

`pnpm generate:contracts` runs `0g contracts generate --abi <forge-out>`.
The output is a deterministic TypeScript module under `src/generated/` that
gives you full IntelliSense for `mint`, `ownerOf`, `tokenURI`. The template
ships with an inline ABI in `src/index.ts` for readability, but you can
import the generated module for stronger types in production.

## Run the tests

```bash
pnpm test
```

Eleven tests cover the metadata codec (6) + the mint flow (5) using
inline storage fakes. No live chain or storage required. ≥ 80% lines.

## Production hardening checklist

- Replace the inline ERC-721 with [`@openzeppelin/contracts`](https://github.com/OpenZeppelin/openzeppelin-contracts).
- Add an off-chain metadata gateway that resolves `0g-storage://<root>` →
  the JSON for marketplaces that expect HTTP(S) (OpenSea-style).
- Move minting to a durable queue once `@foundryprotocol/0gkit-jobs` (SP10)
  ships, so a slow upload doesn't time out a mint request.

## Deploy on Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Frajkaria%2F0gkit%2Ftree%2Fmain%2Ftemplates%2Fnft-with-storage&project-name=0gkit-nft-with-storage&env=NETWORK%2CPRIVATE_KEY%2CRPC_URL&envDescription=See%20docs.0gkit.com%20env%20vars&envLink=https%3A%2F%2Fdocs.0gkit.com%2Fgetting-started%2Fenv-vars)

Vercel will fork the template into a new repository, prompt for the listed
env vars, and deploy in under 60 seconds on Fluid Compute.

## What next?

1. **Deploy contract** — `forge create contracts/StorageNFT.sol:StorageNFT --rpc-url ...`; paste address into `.env`.
2. **Extend** — add ERC-2981 royalties; build a marketplace UI reading mint events via `0gkit-indexer`.
3. **Migrate to mainnet** — redeploy `StorageNFT` to aristotle; rebuild typed clients with `0g contracts generate`.
