import { Suspense } from "react";
import { AdminAccess } from "../../../../components/admin/admin-access";
import { AdminGate } from "../admin-gate";

export default function AdminSignupPage() {
  return <Suspense fallback={<AdminAccess mode="signup" />}><AdminGate mode="signup" /></Suspense>;
}
