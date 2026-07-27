import { SignIn } from "@clerk/nextjs";

// Auth happens on our own domain (not the Clerk-hosted portal) so the flow
// stays inside SessionSync.
export default function SignInPage() {
  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <SignIn />
    </main>
  );
}
