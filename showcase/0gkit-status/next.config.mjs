/** @type {import('next').NextConfig} */
const nextConfig = {
  // The 0gkit-* packages are Node-only (storage/compute/indexer talk to RPC +
  // native crypto). Keep them on the server — they must never be bundled into a
  // client component. Marking them external avoids Next trying to trace them.
  serverExternalPackages: [
    "@foundryprotocol/0gkit-compute",
    "@foundryprotocol/0gkit-indexer",
    "@foundryprotocol/0gkit-storage",
    "@foundryprotocol/0gkit-wallet",
  ],
};

export default nextConfig;
