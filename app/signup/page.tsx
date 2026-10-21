import { Suspense } from "react";
import { AccessForm } from "../../components/auth/access-form";
import { AuthShell } from "../../components/auth/auth-shell";

const text = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);

// An invite link can carry the code or the email: /signup?code=CODE01 or /signup?email=you@example.com.
async function SignUpParams({
  searchParams,
}: {
  searchParams: PageProps<"/signup">["searchParams"];
}) {
  const params = await searchParams;
  const email = text(params.email);
  return <AccessForm intent="signup" defaultMethod={email ? "email" : "code"} email={email} code={text(params.code)} />;
}

export default function SignUpPage({ searchParams }: PageProps<"/signup">) {
  return (
    <AuthShell>
      <Suspense fallback={<AccessForm intent="signup" defaultMethod="code" />}>
        <SignUpParams searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}
