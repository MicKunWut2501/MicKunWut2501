import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Frota Luanda</h1>
        <p className="mt-1 text-sm text-gray-500">Entre com a sua conta.</p>
        <LoginForm next={next ?? "/painel"} />
      </div>
    </main>
  );
}
