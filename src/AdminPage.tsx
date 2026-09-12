import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import {
  CalendarRange,
  ShieldCheck,
  UserPlus,
  UsersRound,
  Search,
  Check,
  Palette,
  Settings2,
  LockKeyhole,
  X,
} from "lucide-react";
import { supabase } from "./lib/supabase";
import {
  loadClinicLetterhead,
  loadClinicLogo,
  uploadClinicLogo,
} from "./clinicLetterhead";
import {
  colourHex,
  permissionDependencies,
  permissionGroups,
  permissionKeys,
  Workspace,
  ClinicSchedule,
} from "./clinicAccess";
import { LeaveForm, LeaveRecord } from "./TeamLeave";
import { TreatmentPriceList } from "./TreatmentPricing";
import "./ClinicControls.css";
export type Practitioner = {
  id: string;
  full_name: string;
  practitioner_role: string;
  registration_number: string | null;
  schedule_color: string;
  active: boolean;
  membership_id?: string | null;
};
type Member = {
  id: string;
  user_id: string;
  role: string;
  active: boolean;
  full_name: string | null;
  email: string;
  permissions: string[];
};
type Audit = {
  id: number;
  action: string;
  created_at: string;
  metadata: { member_name?: string; permissions?: Record<string, boolean> };
};
type Props = {
  workspace: Workspace;
  onRosterChange: (items: Practitioner[]) => void;
  onNotice: (message: string) => void;
  schedule: ClinicSchedule;
  onScheduleSave: (schedule: ClinicSchedule) => void;
  onClinicSaved: (name: string) => void;
  onAccessChange: () => void;
  branchControls?: ReactNode;
};
export function AdminPage({
  workspace,
  onRosterChange,
  onNotice,
  schedule,
  onScheduleSave,
  onClinicSaved,
  onAccessChange,
  branchControls,
}: Props) {
  const [roster, setRoster] = useState<Practitioner[]>([]),
    [members, setMembers] = useState<Member[]>([]),
    [leaves, setLeaves] = useState<LeaveRecord[]>([]),
    [audit, setAudit] = useState<Audit[]>([]);
  const [tab, setTab] = useState("team"),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState(""),
    [draft, setDraft] = useState<Record<string, boolean>>({}),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [adding, setAdding] = useState(false),
    [leaveFilter, setLeaveFilter] = useState("pending"),
    [confirmSuspend, setConfirmSuspend] = useState(false);
  const member = members.find((m) => m.id === selected),
    person = roster.find((p) => p.membership_id === selected);
  const [colour, setColour] = useState("#28796e"),
    [link, setLink] = useState("");
  const canManage = workspace.role === "admin";
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [team, r, l, a] = await Promise.all([
        supabase.rpc("clinic_admin_team", {
          target_clinic: workspace.clinicId,
        }),
        supabase
          .from("clinic_practitioners")
          .select("*")
          .eq("clinic_id", workspace.clinicId)
          .order("full_name"),
        supabase
          .from("staff_leave_requests")
          .select("*")
          .eq("clinic_id", workspace.clinicId)
          .order("created_at", { ascending: false }),
        supabase
          .from("audit_log")
          .select("id,action,created_at,metadata")
          .eq("clinic_id", workspace.clinicId)
          .like("action", "admin.%")
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      const err = team.error || r.error || l.error || a.error;
      if (err) throw err;
      setMembers(team.data || []);
      setRoster(r.data || []);
      onRosterChange(r.data || []);
      setLeaves(l.data || []);
      setAudit(a.data || []);
      setSelected((current) => current || team.data?.[0]?.id || "");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (canManage) void load();
    else setLoading(false);
  }, [workspace.clinicId, canManage]);
  useEffect(() => {
    setDraft(
      Object.fromEntries(
        permissionKeys.map((p) => [
          p,
          member?.permissions.includes(p) || false,
        ]),
      ),
    );
    setColour(colourHex(person?.schedule_color || "teal"));
    setLink(person?.id || "");
    setConfirmSuspend(false);
  }, [member, person]);
  const dirty =
    !!member &&
    permissionKeys.some((p) => draft[p] !== member.permissions.includes(p));
  const run = async (action: () => Promise<void>, message: string) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await action();
      setSuccess(message);
      onNotice(message);
      await load();
      onAccessChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const saveAccess = () =>
    run(async () => {
      const { error } = await supabase.rpc("set_clinic_member_access", {
        target_clinic: workspace.clinicId,
        target_member: selected,
        changes: draft,
      });
      if (error) throw error;
    }, "Permissions saved. They apply to this clinic immediately.");
  const setPermission = (key: string, value: boolean) =>
    setDraft((current) => {
      const next = { ...current, [key]: value };
      const enable = (p: string) => {
        next[p] = true;
        (permissionDependencies[p] || []).forEach(enable);
      };
      if (value) enable(key);
      else {
        let changed = true;
        while (changed) {
          changed = false;
          for (const [p, deps] of Object.entries(permissionDependencies)) {
            if (next[p] && deps.some((d) => !next[d])) {
              next[p] = false;
              changed = true;
            }
          }
        }
      }
      return next;
    });
  const selectMember = (id: string) => {
    if (dirty) {
      setError(
        "Save or discard your permission changes before selecting another team member.",
      );
      return;
    }
    setSelected(id);
    setError("");
    setSuccess("");
  };
  const decideLeave = (leave: LeaveRecord, status: string) =>
    run(
      async () => {
        const { error } = await supabase
          .from("staff_leave_requests")
          .update({ status })
          .eq("id", leave.id)
          .eq("clinic_id", workspace.clinicId)
          .select("id")
          .single();
        if (error) throw error;
        onScheduleSave({ ...schedule, leaves: [] });
      },
      status === "approved"
        ? "Leave approved. Appointments are blocked for this period."
        : "Leave request rejected / approval withdrawn.",
    );
  if (!canManage)
    return (
      <section className="clinic-controls">
        <div className="control-card">
          <LockKeyhole />
          <h1>Administrator access required</h1>
          <p>Contact your clinic administrator to change team permissions.</p>
        </div>
      </section>
    );
  return (
    <section className="clinic-controls">
      <header className="controls-heading">
        <div>
          <span className="eyebrow">
            {workspace.clinicName.toUpperCase()} · ADMINISTRATION
          </span>
          <h1>Admin controls</h1>
          <p>The right access for every member of your clinic.</p>
        </div>
        <span className="admin-badge">
          <ShieldCheck size={15} />
          Administrator
        </span>
      </header>
      <div className="controls-tabs" role="tablist" aria-label="Admin sections">
        {(
          [
            ["team", "Team & access", UsersRound],
            ["leave", "Leave approvals", CalendarRange],
            ["clinic", "Clinic setup", Settings2],
            ["prices", "Treatment prices", Palette],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            type="button"
            role="tab"
            aria-selected={tab === id}
            key={String(id)}
            onClick={() => {
              if (dirty) {
                setError(
                  "Save or discard permission changes before changing sections.",
                );
                return;
              }
              setTab(String(id));
            }}
          >
            <Icon size={17} />
            {String(label)}
            {id === "leave" &&
              leaves.filter((l) => l.status === "pending").length > 0 && (
                <span className="tab-count">
                  {leaves.filter((l) => l.status === "pending").length}
                </span>
              )}
          </button>
        ))}
      </div>
      {error && (
        <div className="controls-alert error" role="alert">
          {error}
          {!members.length && (
            <button type="button" onClick={() => void load()} disabled={busy}>
              Reload
            </button>
          )}
        </div>
      )}
      {success && (
        <div className="controls-alert" role="status">
          <Check size={16} />
          {success}
        </div>
      )}
      {loading && !members.length ? (
        <div className="control-card control-empty">
          Loading clinic controls…
        </div>
      ) : (
        <>
          {tab === "team" && (
            <div className="team-workspace">
              <aside className="control-card team-sidebar">
                <div className="team-list-heading">
                  <h2>
                    Clinic team <span>{members.length}</span>
                  </h2>
                  <button
                    className="icon-button"
                    aria-label="Add team member"
                    disabled={dirty || busy}
                    onClick={() => setAdding(true)}
                  >
                    <UserPlus size={19} />
                  </button>
                </div>
                <label className="team-search">
                  <Search size={16} />
                  <input
                    aria-label="Search team"
                    placeholder="Find a team member"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <div className="team-list">
                  {members
                    .filter((m) =>
                      `${m.full_name} ${m.email} ${m.role}`
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                    )
                    .map((m) => (
                      <button
                        key={m.id}
                        className={
                          selected === m.id
                            ? "team-person selected"
                            : "team-person"
                        }
                        onClick={() => selectMember(m.id)}
                        aria-pressed={selected === m.id}
                      >
                        <span
                          className="team-avatar"
                          style={{
                            borderColor: colourHex(
                              roster.find((p) => p.membership_id === m.id)
                                ?.schedule_color || "teal",
                            ),
                          }}
                        >
                          {(m.full_name || m.email || "?")
                            .slice(0, 2)
                            .toUpperCase()}
                        </span>
                        <span>
                          <b>{m.full_name || m.email}</b>
                          <small>
                            {m.role} · {m.active ? "Active" : "Suspended"}
                          </small>
                        </span>
                      </button>
                    ))}
                </div>
                <p className="team-footnote">
                  Each login has its own access. Roster entries must be linked
                  to a login to use permissions.
                </p>
                {roster.some((p) => !p.membership_id) && (
                  <details>
                    <summary>
                      Unlinked roster (
                      {roster.filter((p) => !p.membership_id).length})
                    </summary>
                    {roster
                      .filter((p) => !p.membership_id)
                      .map((p) => (
                        <UnlinkedColour
                          key={p.id}
                          person={p}
                          disabled={dirty || busy}
                          onSave={(colour) =>
                            run(async () => {
                              const { error } = await supabase
                                .from("clinic_practitioners")
                                .update({ schedule_color: colour })
                                .eq("id", p.id)
                                .eq("clinic_id", workspace.clinicId)
                                .select("id")
                                .single();
                              if (error) throw error;
                            }, "Doctor colour saved.")
                          }
                        />
                      ))}
                  </details>
                )}
              </aside>
              <div className="team-detail">
                {member ? (
                  <>
                    <div className="control-card">
                      <div className="member-heading">
                        <div>
                          <span className="eyebrow">TEAM MEMBER</span>
                          <h2>{member.full_name || member.email}</h2>
                          <p>{member.email}</p>
                        </div>
                        <span
                          className={`control-status ${member.active ? "approved" : "rejected"}`}
                        >
                          {member.active ? "Active login" : "Suspended"}
                        </span>
                      </div>
                      <div className="member-meta">
                        <span>
                          <b>Role</b>
                          {member.role}
                        </span>
                        <span>
                          <b>Clinic access</b>
                          {member.active ? "Enabled" : "Disabled"}
                        </span>
                        <span>
                          <b>Schedule profile</b>
                          {person?.full_name || "Not linked"}
                        </span>
                      </div>
                      {member.role !== "admin" && (
                        <div className="suspend-control">
                          {confirmSuspend ? (
                            <>
                              <span>
                                {member.active
                                  ? "Suspend this login? They will lose access to this clinic."
                                  : "Restore this login with its saved permissions?"}
                              </span>
                              <button
                                className="ghost"
                                disabled={busy}
                                onClick={() => setConfirmSuspend(false)}
                              >
                                Cancel
                              </button>
                              <button
                                className="ghost danger"
                                disabled={busy}
                                onClick={() =>
                                  void run(
                                    async () => {
                                      const { error } = await supabase.rpc(
                                        "set_clinic_member_status",
                                        {
                                          target_clinic: workspace.clinicId,
                                          target_member: member.id,
                                          enabled: !member.active,
                                        },
                                      );
                                      if (error) throw error;
                                      setConfirmSuspend(false);
                                    },
                                    member.active
                                      ? "Clinic access suspended."
                                      : "Clinic access restored.",
                                  )
                                }
                              >
                                Confirm{" "}
                                {member.active ? "suspension" : "restoration"}
                              </button>
                            </>
                          ) : (
                            <button
                              className="ghost small"
                              disabled={dirty || busy}
                              onClick={() => setConfirmSuspend(true)}
                            >
                              {member.active
                                ? "Suspend clinic access"
                                : "Restore clinic access"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <form
                      className="control-card"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void run(async () => {
                          const { error } = await supabase.rpc(
                            "link_clinic_practitioner",
                            {
                              target_clinic: workspace.clinicId,
                              target_member: member.id,
                              target_practitioner: link || null,
                              chosen_colour: colour,
                            },
                          );
                          if (error) throw error;
                        }, "Schedule profile and colour saved.");
                      }}
                    >
                      <div className="control-card-heading">
                        <Palette size={20} />
                        <div>
                          <h2>Schedule identity</h2>
                          <p>
                            Choose the doctor’s colour across the appointment
                            calendar.
                          </p>
                        </div>
                      </div>
                      <div className="control-fields">
                        <label>
                          Linked doctor / staff profile
                          <select
                            value={link}
                            onChange={(e) => setLink(e.target.value)}
                          >
                            <option value="">No schedule profile</option>
                            {roster
                              .filter(
                                (p) =>
                                  !p.membership_id ||
                                  p.membership_id === member.id,
                              )
                              .map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.full_name}
                                </option>
                              ))}
                          </select>
                        </label>
                        <label>
                          Custom colour
                          <div className="colour-field">
                            <input
                              type="color"
                              aria-label="Doctor colour wheel"
                              value={colour}
                              onChange={(e) => setColour(e.target.value)}
                            />
                            <span>{colour.toUpperCase()}</span>
                            <span
                              className="colour-preview"
                              style={{
                                borderColor: colour,
                                background: `${colour}18`,
                              }}
                            >
                              Appointment
                            </span>
                          </div>
                        </label>
                      </div>
                      <footer className="control-footer">
                        <span>Use the colour picker for any shade.</span>
                        <button className="ghost" disabled={busy || dirty}>
                          Save schedule identity
                        </button>
                      </footer>
                    </form>
                    <div className="permission-heading">
                      <div>
                        <h2>Permissions</h2>
                        <p>
                          {member.role === "admin"
                            ? "Administrators retain full control of clinic security."
                            : "Yes allows this action. No blocks it. Related view access is enabled when needed."}
                        </p>
                      </div>
                      {member.role === "admin" && <LockKeyhole size={20} />}
                    </div>
                    {permissionGroups.map((group) => (
                      <div
                        className="control-card permission-group"
                        key={group.title}
                      >
                        <header>
                          <h3>{group.title}</h3>
                          <p>{group.copy}</p>
                        </header>
                        {group.items.map(([key, label, description]) => (
                          <div className="permission-row" key={key}>
                            <div>
                              <b>{label}</b>
                              <p>{description}</p>
                            </div>
                            <div
                              className="yes-no"
                              role="group"
                              aria-label={label}
                            >
                              {[true, false].map((value) => (
                                <button
                                  type="button"
                                  key={String(value)}
                                  aria-pressed={!!draft[key] === value}
                                  disabled={
                                    busy ||
                                    member.role === "admin" ||
                                    !member.active
                                  }
                                  className={
                                    !!draft[key] === value
                                      ? value
                                        ? "chosen yes"
                                        : "chosen no"
                                      : ""
                                  }
                                  onClick={() => setPermission(key, value)}
                                >
                                  {value ? "Yes" : "No"}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                    {member.role !== "admin" && (
                      <div className="permission-save">
                        <span>
                          {dirty
                            ? "You have unsaved permission changes."
                            : "All permissions saved."}
                        </span>
                        <div>
                          <button
                            className="ghost"
                            disabled={!dirty || busy}
                            onClick={() =>
                              setDraft(
                                Object.fromEntries(
                                  permissionKeys.map((p) => [
                                    p,
                                    member.permissions.includes(p),
                                  ]),
                                ),
                              )
                            }
                          >
                            Discard
                          </button>
                          <button
                            className="primary"
                            disabled={!dirty || busy || !member.active}
                            onClick={() => void saveAccess()}
                          >
                            {busy ? "Saving…" : "Save permissions"}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="control-card control-empty">
                    <UsersRound />
                    <h2>No team logins yet</h2>
                    <p>Add a clinic member to begin configuring access.</p>
                    <button className="primary" onClick={() => setAdding(true)}>
                      Add team member
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          {tab === "leave" && (
            <>
              <div className="control-card">
                <div className="control-card-heading">
                  <CalendarRange size={21} />
                  <div>
                    <h2>Leave & half-day requests</h2>
                    <p>
                      Approved leave blocks bookings for that doctor. Existing
                      appointments must be moved first.
                    </p>
                  </div>
                </div>
                <div className="leave-filters">
                  {["pending", "approved", "rejected", "all"].map((f) => (
                    <button
                      className={leaveFilter === f ? "active" : ""}
                      key={f}
                      onClick={() => setLeaveFilter(f)}
                      aria-pressed={leaveFilter === f}
                    >
                      {f === "all" ? "All requests" : f}
                    </button>
                  ))}
                </div>
                {leaves.filter(
                  (l) => leaveFilter === "all" || l.status === leaveFilter,
                ).length ? (
                  leaves
                    .filter(
                      (l) => leaveFilter === "all" || l.status === leaveFilter,
                    )
                    .map((l) => (
                      <div className="leave-record" key={l.id}>
                        <div>
                          <b>{l.staff_name}</b>
                          <p>
                            {l.start_date}
                            {l.end_date !== l.start_date
                              ? ` – ${l.end_date}`
                              : ""}{" "}
                            ·{" "}
                            {l.leave_kind === "half_day"
                              ? `${l.start_time.slice(0, 5)}–${l.end_time.slice(0, 5)} · Half day`
                              : "Full day"}
                          </p>
                          {l.note && <p>{l.note}</p>}
                        </div>
                        <span className={`control-status ${l.status}`}>
                          {l.status}
                        </span>
                        <div className="leave-actions">
                          {l.status === "pending" && (
                            <>
                              <button
                                className="ghost"
                                disabled={busy}
                                onClick={() => void decideLeave(l, "rejected")}
                              >
                                Reject
                              </button>
                              <button
                                className="primary"
                                disabled={busy}
                                onClick={() => void decideLeave(l, "approved")}
                              >
                                Approve
                              </button>
                            </>
                          )}
                          {l.status === "approved" && (
                            <button
                              className="ghost danger"
                              disabled={busy}
                              onClick={() => void decideLeave(l, "rejected")}
                            >
                              Withdraw approval
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                ) : (
                  <div className="control-empty">
                    No {leaveFilter === "all" ? "" : leaveFilter} leave
                    requests.
                  </div>
                )}
              </div>
              <div className="control-card">
                <h2>Record a leave request</h2>
                <p className="control-subtitle">
                  Create a request on behalf of a doctor or staff member, then
                  approve it above.
                </p>
                <LeaveForm
                  clinicId={workspace.clinicId}
                  practitioners={roster.filter((p) => p.active)}
                  onSaved={load}
                />
              </div>
            </>
          )}
          {tab === "clinic" && (
            <>
              <ClinicSetup
                workspace={workspace}
                schedule={schedule}
                onSaved={(s, n) => {
                  onScheduleSave(s);
                  onClinicSaved(n);
                }}
              />
              {branchControls}
            </>
          )}
          {tab === "prices" && (
            <div className="admin-prices">
              <div className="controls-hint">
                <ShieldCheck size={18} />
                <p>
                  Set clinic treatment prices here. Give individual price and
                  finance permissions under Team & access.
                </p>
              </div>
              <TreatmentPriceList workspace={workspace} onNotice={onNotice} />
            </div>
          )}
          {tab === "team" && (
            <details className="control-card audit-panel">
              <summary>Recent access changes</summary>
              {audit.length ? (
                audit.map((a) => (
                  <div className="audit-row" key={a.id}>
                    <b>
                      {a.metadata?.member_name ||
                        a.action.replace("admin.", "").replaceAll("_", " ")}
                    </b>
                    <span>
                      {a.action.replace("admin.", "").replaceAll("_", " ")}
                    </span>
                    <time>{new Date(a.created_at).toLocaleString()}</time>
                  </div>
                ))
              ) : (
                <p className="control-empty">
                  Access changes will appear here after saving.
                </p>
              )}
            </details>
          )}
        </>
      )}
      {adding && (
        <AddMember
          workspace={workspace}
          onClose={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            await load();
          }}
        />
      )}
    </section>
  );
}
function ClinicSetup({
  workspace,
  schedule,
  onSaved,
}: {
  workspace: Workspace;
  schedule: ClinicSchedule;
  onSaved: (s: ClinicSchedule, n: string) => void;
}) {
  const [name, setName] = useState(workspace.clinicName),
    [address, setAddress] = useState(""),
    [phone, setPhone] = useState(""),
    [logoPath, setLogoPath] = useState<string | null>(null),
    [logoUrl, setLogoUrl] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState(""),
    [removeLogo, setRemoveLogo] = useState(false),
    [draft, setDraft] = useState(schedule),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [loaded, setLoaded] = useState(false),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoaded(false);
    setError("");
    (async () => {
      try {
        const profile = await loadClinicLetterhead(workspace.clinicId);
        if (!alive) return;
        setName(profile.name);
        setAddress(profile.address);
        setPhone(profile.phone);
        setLogoPath(profile.logo_path);
        if (profile.logo_path) {
          try {
            const url = await loadClinicLogo(profile.logo_path);
            if (alive) setLogoUrl(url);
            else URL.revokeObjectURL(url);
          } catch {
            if (alive)
              setError(
                "The saved logo could not be loaded. Upload a replacement if needed.",
              );
          }
        }
        if (alive) setLoaded(true);
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [workspace.clinicId, revision]);
  useEffect(
    () => () => {
      if (logoUrl) URL.revokeObjectURL(logoUrl);
    },
    [logoUrl],
  );
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !loaded) return;
    setError("");
    setMessage("");
    if (draft.close <= draft.open) {
      setError("Closing time must be after opening time.");
      return;
    }
    setBusy(true);
    let uploaded: string | null = null;
    try {
      if (file) uploaded = await uploadClinicLogo(workspace.clinicId, file);
      const path = removeLogo ? null : uploaded || logoPath;
      const r = await supabase.rpc("save_clinic_profile", {
        target_clinic: workspace.clinicId,
        clinic_name: name.trim(),
        opens: draft.open,
        closes: draft.close,
        closed_days: draft.closedDays,
        clinic_address: address.trim(),
        clinic_phone: phone.trim(),
        clinic_logo_path: path,
      });
      if (r.error) throw r.error;
      setLogoPath(path);
      if (file) setLogoUrl(URL.createObjectURL(file));
      if (removeLogo) setLogoUrl("");
      setFile(null);
      setRemoveLogo(false);
      onSaved(draft, name.trim());
      setMessage(
        "Clinic details saved. Prescriptions will use this letterhead.",
      );
      uploaded = null;
    } catch (e) {
      setError((e as Error).message);
      if (uploaded)
        await supabase.storage
          .from("clinic-logos")
          .remove([uploaded])
          .catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="control-card" onSubmit={save}>
      <div className="control-card-heading">
        <Settings2 size={21} />
        <div>
          <h2>Clinic identity & working hours</h2>
          <p>Contact details and logo appear on prescriptions.</p>
        </div>
      </div>
      {error && (
        <p className="controls-alert error" role="alert">
          {error}
          {!loaded && !loading && (
            <button
              type="button"
              className="ghost"
              onClick={() => setRevision((v) => v + 1)}
            >
              Retry
            </button>
          )}
        </p>
      )}
      {message && (
        <p className="controls-alert" role="status">
          {message}
        </p>
      )}
      {loading && <p role="status">Loading clinic details…</p>}
      <fieldset
        className="clinic-profile-fields"
        disabled={loading || busy || !loaded}
      >
        <div className="control-fields">
          <label className="span-all">
            Clinic name
            <input
              required
              minLength={2}
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="clinic-logo-field span-all">
            <div className="clinic-logo-preview">
              {!removeLogo && (preview || logoUrl) ? (
                <img src={preview || logoUrl} alt="Clinic logo preview" />
              ) : (
                <span>Clinic logo</span>
              )}
            </div>
            <div>
              <label>
                Upload clinic logo
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const picked = e.target.files?.[0];
                    if (!picked) return;
                    if (
                      !["image/png", "image/jpeg", "image/webp"].includes(
                        picked.type,
                      ) ||
                      picked.size > 1048576
                    ) {
                      setError(
                        "Choose a PNG, JPG or WebP no larger than 1 MB.",
                      );
                      e.target.value = "";
                      return;
                    }
                    setFile(picked);
                    e.target.value = "";
                    setRemoveLogo(false);
                    setError("");
                  }}
                />
              </label>
              <small>PNG, JPG or WebP · up to 1 MB</small>
              {(logoPath || file) && (
                <button
                  className="ghost"
                  type="button"
                  onClick={() => {
                    setRemoveLogo(true);
                    setFile(null);
                  }}
                >
                  Remove logo
                </button>
              )}
            </div>
          </div>
          <label className="span-all">
            Clinic address
            <textarea
              rows={2}
              maxLength={500}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street, locality, city and PIN code"
            />
          </label>
          <label className="span-all">
            Clinic phone number
            <input
              type="tel"
              maxLength={60}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone number for patient enquiries"
            />
          </label>
          <label>
            Opens at
            <input
              type="time"
              required
              value={draft.open}
              onChange={(e) => setDraft({ ...draft, open: e.target.value })}
            />
          </label>
          <label>
            Closes at
            <input
              type="time"
              required
              value={draft.close}
              onChange={(e) => setDraft({ ...draft, close: e.target.value })}
            />
          </label>
        </div>
        <fieldset className="closed-days">
          <legend>Weekly closed days</legend>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => (
            <label key={day}>
              <input
                type="checkbox"
                checked={draft.closedDays.includes(i)}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    closedDays: e.target.checked
                      ? [...draft.closedDays, i]
                      : draft.closedDays.filter((d) => d !== i),
                  })
                }
              />
              {day}
            </label>
          ))}
        </fieldset>
      </fieldset>
      <footer className="control-footer">
        <span>Times follow this clinic’s timezone.</span>
        <button className="primary" disabled={busy || loading || !loaded}>
          {busy ? "Saving…" : "Save clinic settings"}
        </button>
      </footer>
    </form>
  );
}
function AddMember({
  workspace,
  onClose,
  onSaved,
}: {
  workspace: Workspace;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [email, setEmail] = useState(""),
    [name, setName] = useState(""),
    [role, setRole] = useState("doctor"),
    [colour, setColour] = useState("#28796e"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="control-dialog clinic-controls"
      aria-labelledby="add-member-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <form
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const { error } = await supabase.rpc("add_clinic_member", {
              target_clinic: workspace.clinicId,
              account_email: email.trim(),
              staff_name: name.trim(),
              member_role: role,
              chosen_colour: colour,
            });
            if (error) throw error;
            await onSaved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <header className="dialog-heading">
          <div>
            <span className="eyebrow">CLINIC TEAM</span>
            <h2 id="add-member-title">Add team member</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close dialog"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <p>
          Enter the email they use to sign in to SculptOS. They must create
          their account first. You can review their permissions after adding
          them.
        </p>
        {error && (
          <div className="controls-alert error" role="alert">
            {error}
          </div>
        )}
        <div className="control-fields">
          <label className="span-all">
            Account email
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="span-all">
            Doctor / staff name
            <input
              required
              minLength={2}
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Role
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {[
                "doctor",
                "receptionist",
                "assistant",
                "accountant",
                "manager",
              ].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label>
            Schedule colour
            <div className="colour-field">
              <input
                type="color"
                aria-label="New doctor colour wheel"
                value={colour}
                onChange={(e) => setColour(e.target.value)}
              />
              <span>{colour.toUpperCase()}</span>
            </div>
          </label>
        </div>
        <footer className="control-footer">
          <button
            type="button"
            className="ghost"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "Adding…" : "Add to clinic"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

function UnlinkedColour({
  person,
  disabled,
  onSave,
}: {
  person: Practitioner;
  disabled: boolean;
  onSave: (colour: string) => Promise<void>;
}) {
  const [colour, setColour] = useState(colourHex(person.schedule_color));
  return (
    <div className="unlinked-person">
      <b>{person.full_name}</b>
      <small>{person.practitioner_role}</small>
      <div className="unlinked-colour">
        <input
          type="color"
          aria-label={`Colour for ${person.full_name}`}
          value={colour}
          onChange={(e) => setColour(e.target.value)}
        />
        <button
          type="button"
          className="ghost small"
          disabled={disabled || colour === colourHex(person.schedule_color)}
          onClick={() => void onSave(colour)}
        >
          Save colour
        </button>
      </div>
    </div>
  );
}
