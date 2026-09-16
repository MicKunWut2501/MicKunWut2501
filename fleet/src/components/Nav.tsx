"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string };

export function Nav({ items, userLabel, roleLabel, signOut }: { items: NavItem[]; userLabel: string; roleLabel: string; signOut: () => Promise<void> }) {
  const path = usePathname();
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/dashboard" className="text-base font-semibold tracking-tight">Luanda Fleet</Link>
        <nav className="flex flex-wrap gap-1">
          {items.map((it) => {
            const active = path === it.href || path.startsWith(it.href + "/");
            return (
              <Link key={it.href} href={it.href} className={`rounded-md px-3 py-1.5 text-sm ${active ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"}`}>
                {it.label}
              </Link>
            );
          })}
        </nav>
        <form action={signOut} className="ml-auto flex items-center gap-3 text-sm text-gray-600">
          <span>{userLabel} <span className="text-gray-400">· {roleLabel}</span></span>
          <button className="rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50">Sign out</button>
        </form>
      </div>
    </header>
  );
}
