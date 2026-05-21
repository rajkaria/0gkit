# @foundryprotocol/0gkit-wallet-react

React adapter for `@foundryprotocol/0gkit-wallet`. Exports `ZeroGWalletProvider` (wagmi-backed React Context) and hooks (`useWallet`, `useConnect`, `useSwitchNetwork`). Use it in client components to connect browser wallets and get a `Signer` compatible with all 0gkit primitives.

```tsx
import { ZeroGWalletProvider, useWallet } from "@foundryprotocol/0gkit-wallet-react";

function App() {
  return (
    <ZeroGWalletProvider config={{ network: "galileo" }}>
      <Wallet />
    </ZeroGWalletProvider>
  );
}

function Wallet() {
  const { address, isConnected, signer } = useWallet();
  return <div>{isConnected ? address : "not connected"}</div>;
}
```
