import { FormEvent, useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Download,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { usePermission, Workspace } from "./clinicAccess";
import { supabase } from "./lib/supabase";
import { ControlDialog } from "./ControlDialog";
import "./Performance.css";

type Transaction = {
  id: string;
  transaction_date: string;
  type: "income" | "expense";
  category: string;
  amount: number;
  payment_method: string | null;
  status: string;
  subcategory?: string;
  counterparty?: string;
  reference_number?: string;
  expense_period?: string;
  note: string | null;
};
type Daily = {
  day: string;
  income: number;
  expense: number;
  treatments: number;
  discounts: number;
};
type Category = { category: string; amount: number };
type Report = {
  month: string;
  timezone: string;
  income: number;
  expense: number;
  treatments: number;
  treatment_units: number;
  discounts: number;
  entries: number;
  pending_entries: number;
  undated_completions: number;
  daily: Daily[];
  expense_categories: Category[];
  inventory_categories: Category[];
};
const money = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
const compact = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const labels: Record<string, string> = {
  inventory: "Inventory",
  marketing: "Marketing",
  payroll: "Payroll & consultants",
  rent_utilities: "Rent & utilities",
  maintenance: "Maintenance",
  other: "Other expenses",
  treatment: "Treatment payments",
  consultation: "Consultations",
  other_income: "Other income",
};
const colours = [
  "#277c6f",
  "#93b7a3",
  "#d4a866",
  "#788cac",
  "#ad8ca8",
  "#b5bcb7",
];
const monthLabel = (value: string) =>
  new Date(value + "T12:00:00").toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
const nextMonth = (m: string) => {
  const [y, n] = m.split("-").map(Number);
  return `${n === 12 ? y + 1 : y}-${String(n === 12 ? 1 : n + 1).padStart(2, "0")}-01`;
};
const failMessage = (e: unknown) =>
  e instanceof Error
    ? e.message
    : "Could not load this report. Please try again.";

export function FinancePage({
  workspace,
  onNotice,
  patients = [],
}: {
  workspace: Workspace;
  patients?: {
    id: string;
    first_name: string;
    last_name: string | null;
    patient_number: string;
  }[];
  onNotice: (message: string) => void;
}) {
  const canManage = usePermission("finance.manage");
  const canSeePatients = usePermission("patients.view");
  const [month, setMonth] = useState(today().slice(0, 7)),
    [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; report: Report } | null>(
      null,
    ),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0),
    [ledger, setLedger] = useState<{
      key: string;
      rows: Transaction[];
      total: number;
    } | null>(null),
    [ledgerError, setLedgerError] = useState("");
  const [adding, setAdding] = useState(false),
    [saving, setSaving] = useState(false),
    [saveError, setSaveError] = useState("");
  const [showData, setShowData] = useState(false),
    [activity, setActivity] = useState<"treatments" | "discounts">(
      "treatments",
    );
  const key = workspace.clinicId + ":" + month + ":" + revision,
    report = result?.key === key ? result.report : null;
  const ledgerKey = key + ":" + page,
    rows = ledger?.key === ledgerKey ? ledger.rows : null;
  const currentKey = useRef(key);
  currentKey.current = key;
  useEffect(() => {
    setAdding(false);
    setPage(0);
  }, [workspace.clinicId]);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    setResult(null);
    (async () => {
      try {
        const { data, error } = await supabase.rpc(
          "clinic_monthly_performance",
          { target_clinic: workspace.clinicId, report_month: month + "-01" },
        );
        if (error) throw new Error(error.message);
        if (!data) throw new Error("The report returned no data.");
        if (alive) setResult({ key, report: data as Report });
      } catch (e) {
        if (alive) setError(failMessage(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [key, workspace.clinicId, month]);
  useEffect(() => {
    let alive = true;
    setLedger(null);
    setLedgerError("");
    (async () => {
      try {
        const { data, count, error } = await supabase
          .from("financial_transactions")
          .select(
            "id,transaction_date,type,category,amount,payment_method,status,note,subcategory,counterparty,reference_number,expense_period",
            { count: "exact" },
          )
          .eq("clinic_id", workspace.clinicId)
          .eq("status", "recorded")
          .gte("transaction_date", month + "-01")
          .lt("transaction_date", nextMonth(month))
          .order("transaction_date", { ascending: false })
          .order("id", { ascending: false })
          .range(page * 15, page * 15 + 14);
        if (error) throw new Error(error.message);
        if (alive)
          setLedger({
            key: ledgerKey,
            rows: (data || []) as Transaction[],
            total: count || 0,
          });
      } catch (e) {
        if (alive) setLedgerError(failMessage(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [ledgerKey, workspace.clinicId, month, page]);
  const refresh = () => setRevision((n) => n + 1);
  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget),
      saveKey = key;
    setSaving(true);
    setSaveError("");
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user)
        throw new Error("Please sign in again before saving.");
      const category = String(form.get("category")),
        type = String(form.get("type")),
        amount = Number(form.get("amount"));
      if (!Number.isFinite(amount) || amount <= 0)
        throw new Error("Enter a valid amount greater than zero.");
      const { error } = await supabase.from("financial_transactions").insert({
        clinic_id: workspace.clinicId,
        transaction_date: String(form.get("date")),
        type,
        category: labels[category],
        reporting_category: category,
        subcategory: String(form.get("subcategory") || "").trim() || null,
        amount,
        payment_method: String(form.get("payment_method")) || null,
        note: String(form.get("note")).trim() || null,
        status: "recorded",
        counterparty: String(form.get("counterparty") || "").trim() || null,
        reference_number:
          String(form.get("reference_number") || "").trim() || null,
        patient_id:
          type === "income"
            ? String(form.get("patient_id") || "") || null
            : null,
        expense_period:
          type === "expense" && form.get("expense_period")
            ? String(form.get("expense_period")) + "-01"
            : null,
        created_by: auth.user.id,
        updated_by: auth.user.id,
      });
      if (error) throw new Error(error.message);
      if (currentKey.current === saveKey) {
        setAdding(false);
        refresh();
      }
      onNotice("Entry saved to " + workspace.clinicName + ".");
    } catch (e) {
      if (currentKey.current === saveKey) setSaveError(failMessage(e));
    } finally {
      setSaving(false);
    }
  };
  const exportReport = () => {
    if (!report) return;
    const lines: (string | number)[][] = [
      ["Clinic", workspace.clinicName],
      ["Month", report.month],
      ["Timezone", report.timezone],
      [],
      ["Metric", "Value"],
      ["Income received", report.income],
      ["Recorded expenses", report.expense],
      ["Net cash movement", report.income - report.expense],
      ["Treatments completed (rows)", report.treatments],
      ["Treatment units completed", report.treatment_units],
      ["Current discounts on estimates created this month", report.discounts],
      ["Undated historical completions (excluded)", report.undated_completions],
      ["Pending entries (excluded)", report.pending_entries],
      [],
      [
        "Date",
        "Income",
        "Expenses",
        "Treatments completed",
        "Estimate discounts",
      ],
      ...report.daily.map((d) => [
        d.day,
        d.income,
        d.expense,
        d.treatments,
        d.discounts,
      ]),
      [],
      ["Expense category", "Amount"],
      ...report.expense_categories.map((c) => [
        labels[c.category] || c.category,
        c.amount,
      ]),
      [],
      ["Inventory category (allocated by purchase cost)", "Amount"],
      ...report.inventory_categories.map((c) => [c.category, c.amount]),
      [],
      [
        "Basis",
        "Recorded cash entries only. Discounts are current saved estimates, not cash deductions. Reports reflect edits to source records.",
      ],
    ];
    const csv =
      "\uFEFF" +
      lines
        .map((row) =>
          row
            .map(
              (v) =>
                '"' +
                String(
                  typeof v === "string" && /^[=+@\-]/.test(v) ? "'" + v : v,
                ).replaceAll('"', '""') +
                '"',
            )
            .join(","),
        )
        .join("\r\n");
    const url = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8;" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = `clinic-performance-${workspace.clinicId}-${month}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section className="performance clinic-controls" aria-busy={loading}>
      <header className="performance-heading">
        <div>
          <span className="eyebrow">MONTHLY BRANCH REPORT</span>
          <h1>Clinic Performance</h1>
          <p>Clinical activity and cash movement, in one clear view.</p>
        </div>
        <div className="performance-actions">
          <button className="ghost" disabled={!report} onClick={exportReport}>
            <Download size={16} />
            Export report
          </button>
          {canManage && (
            <button
              className="primary"
              onClick={() => {
                setSaveError("");
                setAdding(true);
              }}
            >
              <Plus size={16} />
              Record entry
            </button>
          )}
        </div>
      </header>
      <div className="performance-toolbar">
        <div>
          <span className="branch-dot" />
          <strong>{workspace.clinicName}</strong>
          <span className="performance-branch-hint">Current branch</span>
        </div>
        <div>
          <label htmlFor="report-month">Reporting month</label>
          <input
            id="report-month"
            type="month"
            min="2000-01"
            max="2100-12"
            value={month}
            onChange={(e) => {
              if (
                /^\d{4}-\d{2}$/.test(e.target.value) &&
                e.target.value >= "2000-01" &&
                e.target.value <= "2100-12"
              ) {
                setMonth(e.target.value);
                setPage(0);
              }
            }}
          />
          <button
            className="ghost"
            aria-label="Refresh report"
            onClick={refresh}
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>
      {error ? (
        <div className="control-alert error" role="alert">
          {error}{" "}
          <button className="ghost" onClick={refresh}>
            Try again
          </button>
        </div>
      ) : !report ? (
        <div className="performance-loading" role="status">
          Loading branch report…
        </div>
      ) : (
        <>
          <div className="performance-metrics">
            <Metric
              label="Income received"
              value={money(report.income)}
              hint="Recorded payments"
              accent
            />
            <Metric
              label="Total expenditure"
              value={money(report.expense)}
              hint="All recorded expenses"
            />
            <Metric
              label="Net cash movement"
              value={money(report.income - report.expense)}
              hint="Income less expenditure"
            />
            <Metric
              label="Treatments completed"
              value={report.treatments.toLocaleString("en-IN")}
              hint={`${report.treatment_units.toLocaleString("en-IN")} treatment units · completed rows`}
            />
            <Metric
              label="Discounts offered"
              value={money(report.discounts)}
              hint="On estimates created this month"
            />
          </div>
          {(report.pending_entries > 0 || report.undated_completions > 0) && (
            <div className="performance-note">
              {report.pending_entries > 0 && (
                <span>
                  {report.pending_entries} pending{" "}
                  {report.pending_entries === 1 ? "entry is" : "entries are"}{" "}
                  excluded from cash totals.{" "}
                </span>
              )}
              {report.undated_completions > 0 && (
                <span>
                  {report.undated_completions} historical completed treatments
                  have no completion date and are excluded from monthly counts.
                </span>
              )}
            </div>
          )}
          <div className="performance-chart-grid">
            <article className="performance-card performance-cash">
              <CardHeading
                title="Income & expenditure"
                subtitle={monthLabel(report.month) + " · daily cash movement"}
              />
              <div className="performance-legend">
                <span>
                  <i style={{ background: colours[0] }} />
                  Income
                </span>
                <span>
                  <i style={{ background: colours[2] }} />
                  Expenditure
                </span>
              </div>
              <Trend days={report.daily} />
              <p className="performance-caption">
                Only recorded entries are included. Pending and void entries are
                excluded.
              </p>
            </article>
            <article className="performance-card">
              <CardHeading
                title="Expense allocation"
                subtitle="Where this month’s money went"
              />
              <CategoryChart
                categories={report.expense_categories}
                total={report.expense}
                donut
                empty="No expenses recorded for this month."
              />
            </article>
            <article className="performance-card">
              <div className="performance-card-head">
                <CardHeading
                  title="Treatment activity"
                  subtitle="Daily activity for the selected month"
                />
                <div
                  className="performance-segment"
                  role="group"
                  aria-label="Activity chart"
                >
                  <button
                    aria-pressed={activity === "treatments"}
                    onClick={() => setActivity("treatments")}
                  >
                    Treatments
                  </button>
                  <button
                    aria-pressed={activity === "discounts"}
                    onClick={() => setActivity("discounts")}
                  >
                    Discounts
                  </button>
                </div>
              </div>
              <ActivityChart days={report.daily} field={activity} />
              <p className="performance-caption">
                {activity === "treatments"
                  ? "Counts treatment rows marked Completed, using their completion date."
                  : "Current discounts on active estimates created this month, including negative plan adjustments. These are not deducted again from income."}
              </p>
            </article>
            <article className="performance-card">
              <CardHeading
                title="Inventory spend"
                subtitle="Purchase cost by inventory category"
              />
              <CategoryChart
                categories={report.inventory_categories}
                total={
                  report.expense_categories.find(
                    (c) => c.category === "inventory",
                  )?.amount || 0
                }
                empty="No inventory expenditure recorded this month."
              />
              <p className="performance-caption">
                Linked purchases appear once. Costs are allocated by item value;
                purchases without category detail are shown as unallocated.
              </p>
            </article>
          </div>
          <article className="performance-card">
            <div className="performance-card-head">
              <CardHeading
                title="Daily report"
                subtitle="The exact figures behind every chart"
              />
              <button
                className="ghost"
                aria-expanded={showData}
                onClick={() => setShowData((v) => !v)}
              >
                {showData ? "Hide daily data" : "View daily data"}
              </button>
            </div>
            {showData && (
              <div className="performance-table-wrap">
                <table>
                  <caption className="sr-only">
                    Daily branch report for {monthLabel(report.month)}
                  </caption>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Income</th>
                      <th>Expenses</th>
                      <th>Treatments</th>
                      <th>Discounts offered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.daily.map((d) => (
                      <tr key={d.day}>
                        <td>{d.day}</td>
                        <td>{money(d.income)}</td>
                        <td>{money(d.expense)}</td>
                        <td>{d.treatments}</td>
                        <td>{money(d.discounts)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
          <article className="performance-card">
            <div className="performance-card-head">
              <CardHeading
                title="Monthly ledger"
                subtitle={`${report.entries} recorded entries · ${monthLabel(report.month)}`}
              />
              <span className="performance-caption">Current branch only</span>
            </div>
            {ledgerError ? (
              <p role="alert">
                {ledgerError}{" "}
                <button className="ghost" onClick={refresh}>
                  Retry ledger
                </button>
              </p>
            ) : !rows ? (
              <p role="status">Loading entries…</p>
            ) : !rows.length ? (
              <Empty text="No recorded payments or expenses this month. New clinic entries will populate this report automatically." />
            ) : (
              <>
                <div className="performance-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Category / reference</th>
                        <th>Method</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id}>
                          <td>{r.transaction_date}</td>
                          <td>
                            <span className="performance-entry-type">
                              {r.type === "income" ? (
                                <ArrowUpRight size={15} />
                              ) : (
                                <ArrowDownLeft size={15} />
                              )}{" "}
                              {r.category}
                            </span>
                            {r.subcategory && <small>{r.subcategory}</small>}
                            {r.counterparty && <small>{r.counterparty}</small>}
                            {r.reference_number && (
                              <small>Ref: {r.reference_number}</small>
                            )}
                            {r.expense_period && (
                              <small>
                                Period: {r.expense_period.slice(0, 7)}
                              </small>
                            )}
                            {r.note && <small>{r.note}</small>}
                          </td>
                          <td>
                            {r.payment_method?.replaceAll("_", " ") || "—"}
                          </td>
                          <td
                            className={
                              r.type === "income" ? "performance-positive" : ""
                            }
                          >
                            {r.type === "income" ? "+" : "−"}
                            {money(Number(r.amount))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="performance-pagination">
                  <span>
                    {page * 15 + 1}–{page * 15 + rows.length} of {ledger?.total}
                  </span>
                  <div>
                    <button
                      className="ghost"
                      disabled={page === 0}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Previous
                    </button>
                    <button
                      className="ghost"
                      disabled={(page + 1) * 15 >= (ledger?.total || 0)}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            )}
          </article>
          <p className="performance-basis">
            Reporting basis: {report.timezone}. Cash movement is not accounting
            profit. Discounts reflect currently saved active estimates and can
            change when estimates are edited. Only actual clinic records are
            shown; an empty month stays empty.
          </p>
        </>
      )}
      {adding && (
        <EntryForm
          saving={saving}
          error={saveError}
          clinicName={workspace.clinicName}
          patients={canSeePatients ? patients : []}
          onClose={() => !saving && setAdding(false)}
          onSubmit={add}
        />
      )}
    </section>
  );
}
function Metric({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: string;
  hint: string;
  accent?: boolean;
}) {
  return (
    <div className={"performance-metric" + (accent ? " accent" : "")}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}
function CardHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2>{title}</h2>
      <p className="performance-subtitle">{subtitle}</p>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="performance-empty">
      <BarChart3 size={24} />
      <p>{text}</p>
    </div>
  );
}
function Trend({ days }: { days: Daily[] }) {
  const max = Math.max(1, ...days.flatMap((d) => [d.income, d.expense])),
    x = (i: number) => 52 + (i * 568) / Math.max(1, days.length - 1),
    y = (v: number) => 194 - (v / max) * 155;
  const path = (field: "income" | "expense") =>
    days.map((d, i) => (i ? "L" : "M") + x(i) + "," + y(d[field])).join(" ");
  if (!days.some((d) => d.income || d.expense))
    return (
      <Empty text="Your cash-flow chart will appear when income or expenses are recorded for this month." />
    );
  return (
    <svg
      className="performance-trend"
      viewBox="0 0 648 230"
      role="img"
      aria-label="Daily income and expenditure line chart. Exact amounts are available in Daily report."
    >
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line
            x1="52"
            x2="620"
            y1={y(max * t)}
            y2={y(max * t)}
            stroke="#e4ece8"
          />
          <text x="42" y={y(max * t) + 4} textAnchor="end">
            ₹{compact(max * t)}
          </text>
        </g>
      ))}
      <path
        d={path("income")}
        fill="none"
        stroke={colours[0]}
        strokeWidth="3"
      />
      <path
        d={path("expense")}
        fill="none"
        stroke={colours[2]}
        strokeWidth="2.5"
        strokeDasharray="6 4"
      />
      {days.map((d, i) => (
        <g key={d.day}>
          <circle cx={x(i)} cy={y(d.income)} r="3" fill={colours[0]}>
            <title>
              {d.day}: income {money(d.income)}
            </title>
          </circle>
          <circle cx={x(i)} cy={y(d.expense)} r="2.5" fill={colours[2]}>
            <title>
              {d.day}: expenses {money(d.expense)}
            </title>
          </circle>
          {((i % 7 === 0 && i < days.length - 3) || i === days.length - 1) && (
            <text x={x(i)} y="219" textAnchor="middle">
              {i + 1}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
function ActivityChart({
  days,
  field,
}: {
  days: Daily[];
  field: "treatments" | "discounts";
}) {
  const max = Math.max(1, ...days.map((d) => d[field])),
    width = 568 / days.length;
  if (!days.some((d) => d[field]))
    return (
      <Empty
        text={
          field === "treatments"
            ? "No dated treatment completions in this month yet."
            : "No discounts on active estimates created this month."
        }
      />
    );
  return (
    <svg
      className="performance-trend"
      viewBox="0 0 648 230"
      role="img"
      aria-label={`Daily ${field} bar chart. Exact figures are available in Daily report.`}
    >
      {[0, 0.5, 1]
        .filter((t) => field === "discounts" || Number.isInteger(max * t))
        .map((t) => (
          <g key={t}>
            <line
              x1="52"
              x2="620"
              y1={194 - 155 * t}
              y2={194 - 155 * t}
              stroke="#e4ece8"
            />
            <text x="42" y={198 - 155 * t} textAnchor="end">
              {field === "discounts" ? "₹" : ""}
              {compact(max * t)}
            </text>
          </g>
        ))}
      {days.map((d, i) => (
        <g key={d.day}>
          <rect
            x={52 + i * width + 2}
            y={194 - (155 * d[field]) / max}
            width={Math.max(2, width - 5)}
            height={(155 * d[field]) / max}
            rx="3"
            fill={field === "treatments" ? colours[0] : colours[3]}
          >
            <title>
              {d.day}: {field === "discounts" ? money(d[field]) : d[field]}{" "}
              {field === "treatments" ? "completed" : ""}
            </title>
          </rect>
          {((i % 7 === 0 && i < days.length - 3) || i === days.length - 1) && (
            <text x={52 + (i + 0.5) * width} y="219" textAnchor="middle">
              {i + 1}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
function CategoryChart({
  categories,
  total,
  donut = false,
  empty,
}: {
  categories: Category[];
  total: number;
  donut?: boolean;
  empty: string;
}) {
  if (!total) return <Empty text={empty} />;
  let offset = 0;
  return (
    <div className={donut ? "performance-allocation" : "performance-inventory"}>
      {donut && (
        <div className="performance-donut">
          <svg
            viewBox="0 0 160 160"
            role="img"
            aria-label="Expense allocation. Category amounts and percentages are listed alongside."
          >
            <circle
              cx="80"
              cy="80"
              r="61"
              fill="none"
              stroke="#eef2ef"
              strokeWidth="18"
            />
            {categories.map((c, i) => {
              const share = (c.amount / total) * 100,
                start = offset;
              offset += share;
              return (
                <circle
                  key={c.category}
                  cx="80"
                  cy="80"
                  r="61"
                  fill="none"
                  stroke={colours[i % colours.length]}
                  strokeWidth="18"
                  pathLength="100"
                  strokeDasharray={`${share} ${100 - share}`}
                  strokeDashoffset={-start}
                  transform="rotate(-90 80 80)"
                >
                  <title>
                    {labels[c.category] || c.category}: {money(c.amount)}
                  </title>
                </circle>
              );
            })}
          </svg>
          <div>
            <small>Total spent</small>
            <strong>{money(total)}</strong>
          </div>
        </div>
      )}
      <ul className="performance-category-list">
        {categories.map((c, i) => (
          <li key={c.category}>
            <div>
              <span>
                <i style={{ background: colours[i % colours.length] }} />
                {labels[c.category] || c.category}
              </span>
              <b>{money(c.amount)}</b>
            </div>
            <div className="performance-category-track">
              <span
                style={{
                  width: `${Math.min(100, (c.amount / total) * 100)}%`,
                  background: colours[i % colours.length],
                }}
              />
            </div>
            <small>
              {((c.amount / total) * 100).toFixed(1)}% of{" "}
              {donut ? "expenses" : "inventory spend"}
            </small>
          </li>
        ))}
      </ul>
    </div>
  );
}
function EntryForm({
  saving,
  error,
  clinicName,
  patients,
  onClose,
  onSubmit,
}: {
  saving: boolean;
  error: string;
  clinicName: string;
  patients: {
    id: string;
    first_name: string;
    last_name: string | null;
    patient_number: string;
  }[];
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [type, setType] = useState("income"),
    [category, setCategory] = useState("treatment");
  return (
    <ControlDialog
      label="Record financial entry"
      busy={saving}
      onClose={onClose}
    >
      <form onSubmit={onSubmit}>
        <div className="performance-dialog-head">
          <div>
            <h2>Record entry</h2>
            <p>{clinicName}</p>
          </div>
          <button
            className="ghost"
            type="button"
            aria-label="Close entry form"
            disabled={saving}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <p className="performance-caption">
          Record a received payment or expense. Inventory purchases already
          linked to the ledger must not be entered again.
        </p>
        {error && (
          <div className="control-alert error" role="alert">
            {error}
          </div>
        )}
        <fieldset disabled={saving} className="performance-fieldset">
          <div className="control-fields">
            <label>
              Date
              <input
                name="date"
                type="date"
                min="2000-01-01"
                max="2100-12-31"
                defaultValue={today()}
                required
              />
            </label>
            <label>
              Entry type
              <select
                name="type"
                value={type}
                onChange={(e) => {
                  setType(e.target.value);
                  setCategory(
                    e.target.value === "income" ? "treatment" : "other",
                  );
                }}
              >
                <option value="income">Income received</option>
                <option value="expense">Expense paid</option>
              </select>
            </label>
            <label>
              Category
              <select
                name="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {(type === "income"
                  ? ["treatment", "consultation", "other_income"]
                  : [
                      "inventory",
                      "marketing",
                      "payroll",
                      "rent_utilities",
                      "maintenance",
                      "other",
                    ]
                ).map((c) => (
                  <option key={c} value={c}>
                    {labels[c]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Amount (₹)
              <input
                name="amount"
                type="number"
                min="0.01"
                max="9999999999.99"
                step="0.01"
                placeholder="0.00"
                required
              />
            </label>
            {(type === "expense" || type === "income") && (
              <label className="span-all">
                {category === "inventory"
                  ? "Inventory category"
                  : category === "marketing"
                    ? "Campaign / channel"
                    : category === "payroll"
                      ? "Salary / consultant / incentive"
                      : "Subcategory / purpose"}
                <input
                  name="subcategory"
                  maxLength={120}
                  placeholder={
                    category === "inventory"
                      ? "e.g. Endodontics or consumables"
                      : category === "marketing"
                        ? "e.g. Google Ads, print, referral campaign"
                        : "e.g. Advance payment, lab bill, software"
                  }
                />
                <small>Add detail for reconciliation and monthly review.</small>
              </label>
            )}
            <label>
              {type === "income"
                ? "Received from (optional)"
                : "Supplier / payee"}
              <input
                name="counterparty"
                maxLength={160}
                placeholder={
                  type === "income"
                    ? "Payer or insurer"
                    : "Vendor, employee or consultant"
                }
                required={type === "expense"}
              />
            </label>
            <label>
              Invoice / receipt / UTR reference
              <input
                name="reference_number"
                maxLength={120}
                placeholder="e.g. INV-104 or payment reference"
              />
            </label>
            {type === "income" && patients.length > 0 && (
              <label className="span-all">
                Link patient (optional)
                <select name="patient_id" defaultValue="">
                  <option value="">No patient link</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {[p.first_name, p.last_name].filter(Boolean).join(" ")} ·{" "}
                      {p.patient_number}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {type === "expense" && (
              <label className="span-all">
                Expense relates to month (optional)
                <input name="expense_period" type="month" />
                <small>
                  For payroll, rent or campaign reconciliation. Cash totals use
                  the payment date above.
                </small>
              </label>
            )}
            <label>
              Payment method
              <select name="payment_method" defaultValue="" required>
                <option value="" disabled>
                  Select payment method
                </option>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="upi">UPI</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              Notes / payment context
              <input
                name="note"
                maxLength={500}
                placeholder="Invoice or supplier reference"
              />
            </label>
          </div>
        </fieldset>
        <div className="control-footer">
          <button
            type="button"
            className="ghost"
            disabled={saving}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="primary" disabled={saving}>
            {saving ? "Saving…" : "Save entry"}
          </button>
        </div>
      </form>
    </ControlDialog>
  );
}
