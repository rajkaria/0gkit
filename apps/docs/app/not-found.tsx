import Link from "next/link";

export default function NotFound() {
  return (
    <>
      <h1>404 — page not found</h1>
      <p>
        That page does not exist. Head back to the{" "}
        <Link href="/">0gkit documentation</Link>.
      </p>
    </>
  );
}
