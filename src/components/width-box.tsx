"use client";

import { usePathname } from "next/navigation";

const WIDE_PAGES = ["/rooster", "/vast-rooster", "/bezetting"];

/** Breedte van de pagina: het rooster mag de volle schermbreedte gebruiken, de rest blijft smal en leesbaar. */
export function WidthBox({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const wide = WIDE_PAGES.includes(pathname);
  return (
    <div className={`mx-auto w-full ${wide ? "max-w-[1800px]" : "max-w-6xl"} ${className}`}>
      {children}
    </div>
  );
}
