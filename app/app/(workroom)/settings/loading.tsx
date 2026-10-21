import { SettingsSkeleton } from "../../../../components/workroom/skeletons";

// Shown at once when navigating here, while the page's data loads (components/workroom/skeletons.tsx).
export default function Loading() {
  return <SettingsSkeleton />;
}
