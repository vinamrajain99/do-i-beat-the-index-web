import { ConfirmForm } from "./form";

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const params = await searchParams;
  return (
    <ConfirmForm
      tokenHash={params.token_hash ?? ""}
      type={params.type ?? "email"}
    />
  );
}
