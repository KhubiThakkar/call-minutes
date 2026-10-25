import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
      <div className="text-center">
        <h1 className="text-xl font-semibold tracking-tight">Call Minutes</h1>
        <p className="text-sm text-muted-foreground">Sign in to your shared account.</p>
      </div>
      <LoginForm />
    </div>
  );
}
