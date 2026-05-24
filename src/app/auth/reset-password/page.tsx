import { ResetPasswordForm } from "./form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const params = await searchParams;
  return (
    <ResetPasswordForm
      tokenHash={params.token_hash ?? ""}
      type={params.type ?? "recovery"}
    />
  );
}
