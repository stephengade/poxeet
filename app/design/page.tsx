import type { Metadata } from "next";
import { APP_NAME } from "../../lib/config";
import { Showcase } from "./showcase";

export const metadata: Metadata = {
  title: `Design system · ${APP_NAME}`,
  robots: { index: false, follow: false },
};

export default function DesignPage() {
  return <Showcase />;
}
