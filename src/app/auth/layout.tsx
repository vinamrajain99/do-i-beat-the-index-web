import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
      <Link
        href="/"
        className="absolute top-6 left-6 text-sm text-muted-foreground hover:text-foreground"
      >
        ← Home
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
