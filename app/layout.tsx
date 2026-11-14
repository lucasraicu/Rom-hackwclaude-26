import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ResearchImpactNavigation } from "./components/ResearchImpactNavigation";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FundPilot-AI | Allocation review",
  description:
    "Review proposed grant allocations with source evidence and clear next steps.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ResearchImpactNavigation>{children}</ResearchImpactNavigation>
      </body>
    </html>
  );
}
