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
  alternates: { canonical: "/" },
};

export default async function HomePage() {
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
