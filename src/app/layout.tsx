import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Rooster",
  description: "Personeelsplanning met Google Calendar-koppeling",
  applicationName: "Rooster",
  // iPhone: "Zet op beginscherm" gebruikt dit icoon en opent de site zonder Safari-balk.
  icons: { apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Rooster", statusBarStyle: "default" },
};

// Inzoomen met twee vingers blijft altijd mogelijk (handig voor het rooster op een telefoon).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: "#2f6e63",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
