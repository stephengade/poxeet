import { Suspense } from "react";
import { AdminAccess } from "../../../../components/admin/admin-access";
import { AdminGate } from "../admin-gate";

export default function AdminLoginPage() {
  return <Suspense fallback={<AdminAccess mode="signin" />}><AdminGate mode="signin" /></Suspense>;
}
