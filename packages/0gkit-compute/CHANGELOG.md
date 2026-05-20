# @foundryprotocol/0gkit-compute

## 0.1.1

### Patch Changes

- 42dbc88: Align `ethers` peer dependency with the upstream `@0gfoundation/0g-*-ts-sdk` constraints so consumers can run `npm install` (strict peer resolution) without `ERESOLVE` errors.
  - `@foundryprotocol/0gkit-storage` peer `ethers`: `^6.16.0` → `6.13.1` (matches `@0gfoundation/0g-storage-ts-sdk@1.2.9`, which pins exactly `6.13.1`).
  - `@foundryprotocol/0gkit-compute` peer `ethers`: `^6.16.0` → `^6.13.1` (matches `@0gfoundation/0g-compute-ts-sdk`).
  - READMEs for both packages now recommend `ethers@6.13.1` in the install instructions.
