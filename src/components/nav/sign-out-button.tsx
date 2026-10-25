"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/actions/auth";

export function SignOutButton() {
  return (
    <Button variant="ghost" size="icon" onClick={() => signOut()} aria-label="Sign out">
      <LogOut className="size-4" />
    </Button>
  );
}
