"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  resetPasswordAction,
  type ResetPasswordState,
} from "./actions";

export function ResetPasswordForm({
  tokenHash,
  type,
}: {
  tokenHash: string;
  type: string;
}) {
  const [state, formAction, pending] = useActionState<
    ResetPasswordState,
    FormData
  >(resetPasswordAction, undefined);

  const missingToken = !tokenHash;

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle>Set a new password</CardTitle>
        <CardDescription>
          Choose something you can remember. You&apos;ll be logged in
          automatically when you save.
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4">
          <input type="hidden" name="token_hash" value={tokenHash} />
          <input type="hidden" name="type" value={type} />
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          {missingToken && (
            <p className="text-sm text-destructive" role="alert">
              This reset link is missing its token. Request a new password
              reset email and click the link from there.
            </p>
          )}
          {state?.error && (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          )}
        </CardContent>
        <CardFooter className="pt-2">
          <Button
            type="submit"
            className="w-full"
            disabled={pending || missingToken}
          >
            {pending ? "Saving…" : "Save password"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
