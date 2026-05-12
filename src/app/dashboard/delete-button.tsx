"use client";

import { useTransition, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { deleteAnalysisAction } from "./actions";

type Props = {
  analysisId: string;
  analysisName: string;
  size?: "sm" | "default";
  variant?: "outline" | "destructive";
  className?: string;
};

export function DeleteButton({
  analysisId,
  analysisName,
  size = "sm",
  variant = "outline",
  className,
}: Props) {
  const [isPending, startTransition] = useTransition();

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    // The list view wraps each row in a <Link>; without preventDefault +
    // stopPropagation the button click would also navigate.
    e.preventDefault();
    e.stopPropagation();
    if (
      !window.confirm(
        `Delete "${analysisName}"?\n\nThis frees a slot for a new analysis. The action cannot be undone.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await deleteAnalysisAction(analysisId);
      if (result?.error) {
        window.alert(`Delete failed: ${result.error}`);
      }
      // Success path: server action calls redirect("/dashboard") which
      // throws/navigates. We never see a return value in that case.
    });
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleClick}
      disabled={isPending}
      className={cn(
        variant === "outline" &&
          "text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive",
        className,
      )}
    >
      {isPending ? "Deleting…" : "Delete"}
    </Button>
  );
}
