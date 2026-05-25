"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActive =
    pathname === href ||
    (href !== "/" && pathname?.startsWith(href + "/"));

  return (
    <Link
      href={href}
      className={cn(
        "px-2 py-1 rounded-md text-sm transition-colors hover:text-foreground",
        isActive
          ? "text-foreground font-medium"
          : "text-muted-foreground",
      )}
    >
      {children}
    </Link>
  );
}
