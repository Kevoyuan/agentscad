import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { CustomScrollbarStyle } from "@/components/cad/custom-scrollbar";

const CUSTOM_SCROLLBAR_CLASS = "cad-custom-scrollbar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AgentSCAD - CAD Agent System",
  description: "Engineering control room for CAD job orchestration. Transform natural language into editable 3D models with multi-agent pipeline.",
  keywords: ["AgentSCAD", "CAD", "OpenSCAD", "3D Printing", "AI Agent", "Parametric Design"],
  authors: [{ name: "AgentSCAD Team" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "AgentSCAD - CAD Agent System",
    description: "Engineering control room for CAD job orchestration",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased ${CUSTOM_SCROLLBAR_CLASS}`}
      >
        <CustomScrollbarStyle />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
