import { Suspense, type ReactNode } from "react";
import { AppSettingsNav, CurrentAppSettingsNav } from "../../../../components/workroom/settings-nav";
import { billingEnabled } from "../../../../lib/billing/config";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const billing = billingEnabled();
  return (
    <div className="wr-settings">
      <Suspense fallback={<AppSettingsNav billing={billing} />}><CurrentAppSettingsNav billing={billing} /></Suspense>
      <div className="wr-settings-main">{children}</div>
    </div>
  );
}
