import type { Metadata } from "next";
import { Inter, Roboto_Mono, Merriweather, DM_Sans, Caveat, Modern_Antiqua } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
});

const merriweather = Merriweather({
  variable: "--font-merriweather",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

// Display serif used only for the claim-node quote-mark glyph (the snippet
// drawer affordance). Single weight — Modern Antiqua ships 400 only.
const modernAntiqua = Modern_Antiqua({
  variable: "--font-modern-antiqua",
  subsets: ["latin"],
  weight: "400",
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dialectica",
  description: "A tool for creating, exploring, and annotating argument maps.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${robotoMono.variable} ${merriweather.variable} ${dmSans.variable} ${modernAntiqua.variable} ${caveat.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-dia-bg text-dia-fg">
        {children}
      </body>
    </html>
  );
}
