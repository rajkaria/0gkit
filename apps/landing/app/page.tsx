import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { TrustSignals } from "@/components/TrustSignals";
import { ValueProps } from "@/components/ValueProps";
import { CodeSamples } from "@/components/CodeSamples";
import { PackageMap } from "@/components/PackageMap";
import { Comparison } from "@/components/Comparison";
import { CTABottom } from "@/components/CTABottom";
import { Footer } from "@/components/Footer";
import { StructuredData } from "@/components/StructuredData";

export const metadata: Metadata = {
  title: "0gkit — The TypeScript Toolkit for the 0G Network",
  description:
    "Build on 0G in 60 seconds with 0gkit: the neutral, MIT-licensed TypeScript toolkit for storage, compute, DA, attestation, and chain. Install with `npm create 0gkit-app@latest`. 18 packages. v1.0.0 stable.",
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return (
    <>
      <StructuredData />
      <Nav />
      <main>
        <Hero />
        <TrustSignals />
        <ValueProps />
        <CodeSamples />
        <PackageMap />
        <Comparison />
        <CTABottom />
      </main>
      <Footer />
    </>
  );
}
