import { Suspense } from "react";
import { AccessForm } from "../../components/auth/access-form";
import { AuthShell } from "../../components/auth/auth-shell";

type LoginSearchParams = PageProps<"/login">["searchParams"];

const text = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);

async function LoginParams({ searchParams }: { searchParams: LoginSearchParams }) {
  const params = await searchParams;
  return (
    <AccessForm
      intent="signin"
      email={text(params.email)}
      next={text(params.next)}
      suspended={params.suspended === "1"}
      setupMissing={params.setup === "1"}
    />
  );
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <AuthShell>
      <Suspense fallback={<AccessForm intent="signin" />}>
        <LoginParams searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}
