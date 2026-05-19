import { UploadPanel } from "./UploadPanel";
import { AttestationPanel } from "./AttestationPanel";

export default function Home() {
  return (
    <main>
      <h1>0gkit React Console</h1>
      <p className="muted">
        A minimal Next.js App Router app using the hooks from{" "}
        <code>@foundryprotocol/0gkit-react</code>.
      </p>
      <UploadPanel />
      <AttestationPanel />
    </main>
  );
}
