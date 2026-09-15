import { Nav, type NavItem } from "@/components/Nav";
import { isStaff, requireUser } from "@/lib/auth";
import { signOut } from "@/app/login/actions";

const ROLE_LABELS = { owner: "Proprietário", admin: "Administrador", driver: "Motorista" } as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser();
  const staff = isStaff(session);
  const items: NavItem[] = staff
    ? [
        { href: "/painel", label: "Painel" },
        { href: "/cobranca", label: "Cobrança" },
        { href: "/frota", label: "Frota" },
        { href: "/motoristas", label: "Motoristas" },
        { href: "/recibos", label: "Recibos" },
        { href: "/agente", label: "Agente" },
        { href: "/definicoes", label: "Definições" },
      ]
    : [
        { href: "/painel", label: "A minha renda" },
        { href: "/recibos", label: "Recibos" },
      ];
  return (
    <>
      <Nav items={items} userLabel={session.profile.full_name ?? session.email ?? ""} roleLabel={ROLE_LABELS[session.profile.role]} signOut={signOut} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
    </>
  );
}
