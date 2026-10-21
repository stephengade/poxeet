import { SettingsHead } from "../../../../../components/workroom/settings-head";
import { WEEKDAYS } from "../../../../../lib/auth/schemas";
import { getMember } from "../../../../../lib/member";
import { ScheduleForm } from "./schedule-form";

export default async function ScheduleSettings() {
  const member = await getMember();
  const days = WEEKDAYS.filter((day) => member.slots.some((slot) => slot.day === day));
  return (
    <>
      <SettingsHead title="Publishing schedule">Your rhythm. Empty slots in it show on the calendar so you can see the gaps.</SettingsHead>
      <ScheduleForm timezone={member.timezone} initial={{ days: days.length ? days : ["mon", "wed", "fri"], time: member.slots[0]?.time ?? "09:00" }} />
    </>
  );
}
