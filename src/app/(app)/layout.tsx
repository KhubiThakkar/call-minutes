import { BottomNav } from "@/components/nav/bottom-nav";
import { SignOutButton } from "@/components/nav/sign-out-button";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <span className="text-sm font-semibold tracking-tight">Call Minutes</span>
        <SignOutButton />
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-4">{children}</main>
      <BottomNav />
    </div>
  );
}
