import { desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { portalUsers, roleAssignments, teachers } from "@/db/schema";
import { can, getOptionalActor } from "@/lib/auth";
import { ROLES } from "@/lib/auth/policy";
import { grantRoleAction, inviteUserAction, revokeRoleAction, setUserStatusAction } from "@/lib/auth/admin-actions";

export const dynamic = "force-dynamic";

export default async function AccessPage() {
  const actor = await getOptionalActor();
  if (!actor) redirect("/login");
  if (!await can(actor, "manage_users")) redirect("/forbidden");
  const [users, assignments, teacherRows] = await Promise.all([
    db.select().from(portalUsers).orderBy(desc(portalUsers.createdAt)),
    db.select().from(roleAssignments),
    db.select({ id: teachers.id, code: teachers.shortCode }).from(teachers),
  ]);
  const teacherCode = new Map(teacherRows.map((row) => [row.id, row.code]));
  return <div className="mx-auto max-w-6xl space-y-7">
    <div><p className="text-xs font-semibold uppercase tracking-widest text-gold-text">Administration</p><h1 className="font-display mt-1 text-3xl font-semibold">People &amp; access</h1><p className="mt-2 text-sm text-muted">Only invited Google addresses can sign in. Roles take effect immediately; suspending an account removes portal access even if its Google session remains open.</p></div>
    <section className="rounded-xl border border-[var(--color-line)] bg-white p-5">
      <h2 className="font-display text-xl font-semibold">Invite a person</h2>
      <form action={inviteUserAction} className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-sm">Full name<input className="mt-1 w-full rounded-md border p-2" name="displayName" required placeholder="e.g. Md. Forhan Shahriar Fahim" /></label>
        <label className="text-sm">Google email<input className="mt-1 w-full rounded-md border p-2" type="email" name="email" required placeholder="e.g. faculty@example.edu" /></label>
        <label className="text-sm">First role<select className="mt-1 w-full rounded-md border p-2" name="role" defaultValue="teacher">{ROLES.map((role) => <option key={role} value={role}>{role.replaceAll("_", " ")}</option>)}</select></label>
        <label className="text-sm">Teacher short code (required for teacher role)<input className="mt-1 w-full rounded-md border p-2" name="teacherCode" placeholder="e.g. FSF" /></label>
        <button className="w-fit rounded-md bg-[var(--color-ink)] px-4 py-2 text-sm font-semibold text-white">Create invitation</button>
      </form>
    </section>
    <section className="space-y-3">
      <h2 className="font-display text-xl font-semibold">Invited accounts ({users.length})</h2>
      {users.map((user) => {
        const current = assignments.filter((assignment) => assignment.userId === user.id && !assignment.activeTo);
        return <article key={user.id} className="rounded-xl border border-[var(--color-line)] bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h3 className="font-semibold">{user.displayName} {user.id === actor.id && <span className="text-xs text-muted">(you)</span>}</h3><p className="text-sm text-muted">{user.email}{user.teacherId && ` · ${teacherCode.get(user.teacherId) ?? "Teacher"}`}</p><p className="mt-1 text-xs uppercase tracking-wide">{user.status}</p></div>
            {user.id !== actor.id && <form action={setUserStatusAction}><input type="hidden" name="userId" value={user.id} /><input type="hidden" name="status" value={user.status === "suspended" ? "active" : "suspended"} /><button className="rounded-md border px-3 py-1.5 text-xs font-semibold">{user.status === "suspended" ? "Reactivate" : "Suspend"}</button></form>}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {current.map((assignment) => <span key={assignment.id} className="inline-flex items-center gap-2 rounded-full bg-wash px-3 py-1 text-xs">{assignment.role.replaceAll("_", " ")}{user.id !== actor.id && <form action={revokeRoleAction}><input type="hidden" name="assignmentId" value={assignment.id} /><button aria-label={`Remove ${assignment.role} from ${user.displayName}`} className="font-bold text-red-700">×</button></form>}</span>)}
          </div>
          <form action={grantRoleAction} className="mt-3 flex flex-wrap gap-2"><input type="hidden" name="userId" value={user.id} /><select name="role" className="rounded-md border px-2 py-1 text-xs">{ROLES.map((role) => <option key={role} value={role}>{role.replaceAll("_", " ")}</option>)}</select><button className="rounded-md border px-3 py-1 text-xs font-semibold">Add role</button></form>
        </article>;
      })}
    </section>
  </div>;
}
