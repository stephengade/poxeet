import type { AdminActions } from "../../../lib/admin/types";
import { changeMyCode, grantCredits, invite, inviteAdmin, newCode, removeInvite, resetAdminCode, setAdminDisabled, setSignupMode, updateMember } from "./actions";

/** The server actions, as the views expect them. */
export const adminActions: AdminActions = {
  updateMember, grantCredits, setSignupMode, invite, newCode, removeInvite, inviteAdmin, setAdminDisabled, resetAdminCode, changeMyCode,
};
