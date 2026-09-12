import { FormEvent, useState } from "react";
import { supabase } from "./lib/supabase";
export type LeaveRecord = {
  id: string;
  staff_name: string;
  practitioner_id: string | null;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  leave_kind: "full_day" | "half_day";
  status: "pending" | "approved" | "rejected";
  note: string | null;
};
export function LeaveForm({
  clinicId,
  practitioners,
  onSaved,
}: {
  clinicId: string;
  practitioners: { id: string; full_name: string }[];
  onSaved: () => void | Promise<void>;
}) {
  const [person, setPerson] = useState(practitioners[0]?.id || ""),
    [kind, setKind] = useState("full_day"),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [from, setFrom] = useState("10:00"),
    [to, setTo] = useState("14:00"),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (kind === "half_day" && from >= to) {
      setError("End time must be after start time.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase
        .from("staff_leave_requests")
        .insert({
          clinic_id: clinicId,
          practitioner_id: person,
          staff_name: practitioners.find((p) => p.id === person)?.full_name,
          start_date: start,
          end_date: kind === "half_day" ? start : end,
          leave_kind: kind,
          start_time: kind === "half_day" ? from : "00:00",
          end_time: kind === "half_day" ? to : "23:59:59",
          note: note.trim() || null,
          status: "pending",
        });
      if (error) throw error;
      setStart("");
      setEnd("");
      setNote("");
      setSuccess("Request submitted for approval.");
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="leave-request-form">
      {error && (
        <p className="controls-alert error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="controls-alert" role="status">
          {success}
        </p>
      )}
      <div className="control-fields">
        <label>
          Team member
          <select
            required
            value={person}
            onChange={(e) => setPerson(e.target.value)}
          >
            <option value="" disabled>
              Select a team member
            </option>
            {practitioners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Leave type
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="full_day">Full day / multiple days</option>
            <option value="half_day">Half day / hourly permission</option>
          </select>
        </label>
        <label>
          {kind === "half_day" ? "Date" : "First day"}
          <input
            type="date"
            required
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              if (end < e.target.value) setEnd(e.target.value);
            }}
          />
        </label>
        {kind === "full_day" ? (
          <label>
            Last day
            <input
              type="date"
              required
              min={start}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        ) : (
          <div className="time-pair">
            <label>
              From
              <input
                type="time"
                required
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              Until
              <input
                type="time"
                required
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </div>
        )}
        <label className="span-all">
          Reason / note
          <textarea
            maxLength={500}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional context for the administrator"
          />
        </label>
      </div>
      <div className="control-footer">
        <span>Approval is required before time is blocked.</span>
        <button className="primary" disabled={busy || !practitioners.length}>
          {busy ? "Submitting…" : "Submit request"}
        </button>
      </div>
    </form>
  );
}
