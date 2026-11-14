import type { MetadataRoute } from "next";

// Maakt de site installeerbaar als app op een telefoon of computer
// (Chrome/Android: "App installeren"; iPhone: Deel → "Zet op beginscherm").
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bréborgh Rooster",
    short_name: "Rooster",
    description: "Rooster, uren, klanten en administratie van Bréborgh",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f4f5f2",
    theme_color: "#2f6e63",
    lang: "nl",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
