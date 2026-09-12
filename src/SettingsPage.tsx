import { FormEvent, useEffect, useState } from "react";
import {
  LogOut,
  UserRound,
  CalendarDays,
  Check,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "./lib/supabase";
import { usePermission, Workspace } from "./clinicAccess";
import { LeaveForm, LeaveRecord } from "./TeamLeave";
import "./ClinicControls.css";

export function SettingsPage({
  workspace,
  profileName,
  email,
  onSaved,
  onLogout,
}: {
  workspace: Workspace;
  profileName: string;
  email: string;
  onSaved: (name: string) => void;
  onLogout: () => void;
}) {
  const [name, setName] = useState(profileName),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]),
    [practitioner, setPractitioner] = useState<{
      id: string;
      full_name: string;
    } | null>(null);
  const canRequest = usePermission("leave.request");
  const load = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const membership = await supabase
      .from("memberships")
      .select("id")
      .eq("clinic_id", workspace.clinicId)
      .eq("user_id", user.id)
      .single();
    if (membership.error || !membership.data) {
      setError("Your clinic membership could not be loaded.");
      return;
    }
    const [p, l] = await Promise.all([
      supabase
        .from("clinic_practitioners")
        .select("id,full_name")
        .eq("clinic_id", workspace.clinicId)
        .eq("membership_id", membership.data.id)
        .maybeSingle(),
      supabase
        .from("staff_leave_requests")
        .select("*")
        .eq("clinic_id", workspace.clinicId)
        .eq("requested_by", user.id)
        .order("created_at", { ascending: false }),
    ]);
    if (p.error || l.error) {
      setError(
        p.error?.message ||
          l.error?.message ||
          "Could not load leave requests.",
      );
      return;
    }
    setPractitioner(p.data);
    setLeaves(l.data || []);
  };
  useEffect(() => {
    void load();
  }, [workspace.clinicId]);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw Error("Please sign in again.");
      const { error } = await supabase
        .from("profiles")
        .upsert({ id: user.id, full_name: name.trim() });
      if (error) throw error;
      onSaved(name.trim());
      setMessage("Your settings are saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="clinic-controls">
      <header className="controls-heading">
        <span className="eyebrow">YOUR WORKSPACE</span>
        <h1>Settings</h1>
        <p>Your profile and personal requests, all in one place.</p>
      </header>
      {error && (
        <div className="controls-alert error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="controls-alert" role="status">
          <Check size={16} />
          {message}
        </div>
      )}
      <form className="control-card" onSubmit={save}>
        <div className="control-card-heading">
          <UserRound size={21} />
          <div>
            <h2>Profile & account</h2>
            <p>These details belong to your account.</p>
          </div>
        </div>
        <div className="control-fields">
          <label>
            Display name
            <input
              required
              minLength={2}
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Email
            <input value={email} readOnly />
          </label>
          <label>
            Current clinic
            <input value={workspace.clinicName} readOnly />
          </label>
          <label>
            Access role
            <input value={workspace.role} readOnly />
          </label>
        </div>
        <footer className="control-footer">
          <button className="ghost danger" type="button" onClick={onLogout}>
            <LogOut size={16} />
            Sign out
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : "Save settings"}
          </button>
        </footer>
      </form>
      <div className="control-card">
        <div className="control-card-heading">
          <CalendarDays size={21} />
          <div>
            <h2>My leave & half days</h2>
            <p>Send a request. Your administrator confirms availability.</p>
          </div>
        </div>
        {canRequest && practitioner ? (
          <LeaveForm
            clinicId={workspace.clinicId}
            practitioners={[practitioner]}
            onSaved={load}
          />
        ) : (
          <p className="control-empty">
            {!canRequest
              ? "Ask your administrator to enable leave requests."
              : "Ask your administrator to link your login to your staff profile to request leave."}
          </p>
        )}
        <div className="leave-records">
          {leaves.map((l) => (
            <div className="leave-record" key={l.id}>
              <div>
                <b>
                  {l.start_date}
                  {l.end_date !== l.start_date ? ` – ${l.end_date}` : ""}
                </b>
                <p>
                  {l.leave_kind === "half_day"
                    ? `Half day · ${l.start_time?.slice(0, 5)}–${l.end_time?.slice(0, 5)}`
                    : "Full day"}
                  {l.note ? ` · ${l.note}` : ""}
                </p>
              </div>
              <span className={`control-status ${l.status}`}>{l.status}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="controls-hint">
        <ShieldCheck size={18} />
        <p>
          Team permissions, clinic hours, doctor colours and pricing access are
          managed in Admin controls.
        </p>
      </div>
    </section>
  );
}
