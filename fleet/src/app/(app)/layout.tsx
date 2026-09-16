import { Nav, type NavItem } from "@/components/Nav";
import { isStaff, requireUser } from "@/lib/auth";
import { signOut } from "@/app/login/actions";

const ROLE_LABELS = { owner: "Owner", admin: "Admin", driver: "Driver" } as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser();
  const staff = isStaff(session);
  const items: NavItem[] = staff
    ? [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/rent", label: "Rent" },
        { href: "/fleet", label: "Fleet" },
        { href: "/drivers", label: "Drivers" },
        { href: "/receipts", label: "Receipts" },
        { href: "/agent", label: "Agent" },
        { href: "/settings", label: "Settings" },
      ]
    : [
        { href: "/dashboard", label: "My rent" },
        { href: "/receipts", label: "Receipts" },
      ];
  return (
    <>
      <Nav items={items} userLabel={session.profile.full_name ?? session.email ?? ""} roleLabel={ROLE_LABELS[session.profile.role]} signOut={signOut} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
    </>
  );
}
