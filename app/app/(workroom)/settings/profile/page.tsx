import { SettingsHead } from "../../../../../components/workroom/settings-head";
import { getMember } from "../../../../../lib/member";
import { ProfileForm } from "./profile-form";

export default async function ProfileSettings() {
  const member = await getMember();
  return (
    <>
      <SettingsHead title="Profile">How you appear in Poxeet and on post previews.</SettingsHead>
      <ProfileForm email={member.email} initial={{ firstName: member.firstName ?? "", lastName: member.lastName ?? "", timezone: member.timezone }} />
    </>
  );
}
