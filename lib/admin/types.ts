// What the admin pages show (PRD ADM-1, D-031): counts, money and settings, never member content. Shared by the
// server loaders (lib/admin/server.ts), the views (components/admin) and the preview's sample data.

/** How a member's AI is paid for right now: the first match in key resolution (lib/ai/server.ts). */
export type AiSource = "instance" | "credits" | "own" | "none";

export type AdminMember = {
  id: string;
  name: string;
  email: string;
  status: "active" | "suspended";
  ai: AiSource;
  /** The admin granted the instance key (it only pays once they have no own key). */
  instanceKey: boolean;
  /** Instance-key calls since midnight UTC, against `cap`. */
  usedToday: number;
  cap: number;
  /** Credit balance when billing is on, else null. */
  credits: number | null;
  creditsLow: boolean;
  joined: string;
  lastJob: string | null;
  calls7d: number;
  published30d: number;
};

export type InviteHow = "all" | "code" | "email";

export type AdminInvite = {
  email: string;
  name: string;
  how: InviteHow;
  code: string | null;
  expires: string | null;
  state: "joined" | "waiting" | "expired";
  instanceKey: boolean;
};

export type AuditKind = "access" | "ai" | "credits" | "account" | "admins";

export type AdminAuditEntry = {
  id: string;
  at: string;
  actor: string;
  kind: AuditKind;
  text: string;
  detail: string | null;
  targetId: string | null;
};

export type PurchaseStatus = "paid" | "refunded" | "partially_refunded" | "pending" | "expired";

export type AdminPurchase = {
  id: string;
  memberId: string;
  name: string;
  email: string;
  at: string;
  pack: string;
  credits: number;
  amount: number;
  currency: string;
  status: PurchaseStatus;
  /** What Bachs refunded, and credits that couldn't be clawed back because they were already spent. */
  refunded: number;
  shortfall: number;
};

export type AdminEarnings = {
  purchases: AdminPurchase[];
  /** Credits members spent on AI in the period, and credits granted free. */
  creditsUsed: number;
  creditsGranted: number;
  /** Credits used per US dollar of real provider cost, for the cost estimate: margin x 100, divided by the shared
   *  model's share of the billed price (D-034), since every model is charged at the top rate. */
  creditsPerCostDollar: number;
};

export type AdminOverview = {
  /** When it was loaded, so "this week" is the same on the server and in the browser. */
  now: number;
  members: AdminMember[];
  invites: AdminInvite[];
  audit: AdminAuditEntry[];
  /** Instance-key calls per UTC day, oldest first, today last. */
  callsByDay: Array<{ day: string; calls: number }>;
  /** Null when billing is off. */
  earnings: { net: Record<string, number>; purchases: number; refunded: Record<string, number> } | null;
};

export type AdminResult = { ok: true; message?: string } | { ok: false; message: string };

/** A change to one member's admin-set fields. Only the fields given change. */
export type MemberChange = { instanceKey?: boolean; cap?: number; suspended?: boolean };

export type InviteInput = {
  firstName: string;
  lastName: string;
  email: string;
  how: InviteHow;
  /** How long the access code works: "7d", "30d", "3m" or "never". */
  expiry: string;
  instanceKey: boolean;
  send: boolean;
};

/** An admin account (public.admins, D-032). Admins are admin only: no member profile, no workspace. */
export type AdminPerson = {
  id: string;
  name: string;
  email: string;
  status: "invited" | "active" | "disabled";
  you: boolean;
  invitedBy: string | null;
  lastSignIn: string | null;
  created: string;
  /** Still on a code someone else set (an invite or a reset). */
  mustChangeCode: boolean;
};

/** Everything an admin view may do. The real pages pass server actions; the preview passes stand-ins. */
export type AdminActions = {
  updateMember(id: string, change: MemberChange): Promise<AdminResult>;
  grantCredits(id: string, amount: number, note: string): Promise<AdminResult>;
  setSignupMode(mode: "open" | "invite_only"): Promise<AdminResult>;
  invite(input: InviteInput): Promise<AdminResult & { code?: string | null }>;
  newCode(email: string): Promise<AdminResult & { code?: string }>;
  removeInvite(email: string): Promise<AdminResult>;
  inviteAdmin(input: { name: string; email: string; code: string }): Promise<AdminResult>;
  setAdminDisabled(id: string, disabled: boolean): Promise<AdminResult>;
  resetAdminCode(id: string, code: string): Promise<AdminResult>;
  changeMyCode(current: string, next: string): Promise<AdminResult>;
};
