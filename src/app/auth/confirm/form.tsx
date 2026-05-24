"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { confirmEmailAction, type ConfirmState } from "./actions";

export function ConfirmForm({
  tokenHash,
  type,
}: {
  tokenHash: string;
  type: string;
}) {
  const [state, formAction, pending] = useActionState<ConfirmState, FormData>(
    confirmEmailAction,
    undefined,
  );

  const missingToken = !tokenHash;

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle>Confirm your email</CardTitle>
        <CardDescription>
          {missingToken
            ? "This link is missing its confirmation token. Request a new one by signing up again."
            : "Click below to finish creating your account."}
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4">
          <input type="hidden" name="token_hash" value={tokenHash} />
          <input type="hidden" name="type" value={type} />
          {state?.error && (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          )}
        </CardContent>
        <CardFooter className="flex-col gap-3 pt-2">
          <Button
            type="submit"
            className="w-full"
            disabled={pending || missingToken}
          >
            {pending ? "Confirming…" : "Confirm email"}
          </Button>
          <p className="text-sm text-muted-foreground">
            Already confirmed?{" "}
            <Link
              href="/auth/login"
              className="text-foreground underline-offset-4 hover:underline"
            >
              Log in
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
