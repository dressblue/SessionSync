import { SignUp } from "@clerk/nextjs";

// Facilitators self-provision here; course access is still gated by the
// invite code after sign-up.
export default function SignUpPage() {
  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <SignUp />
    </main>
  );
}
