import { createContext, useContext } from "react";

export const permissionGroups = [
  {
    title: "Pharmacy & prescriptions",
    copy: "Manage medicines and control prescription access.",
    items: [
      [
        "pharmacy.view",
        "View medicine catalogue",
        "Read reference and clinic medicines.",
      ],
      [
        "pharmacy.manage",
        "Manage clinic medicines",
        "Add, edit and archive custom medicines.",
      ],
      [
        "prescriptions.write",
        "Write prescriptions",
        "Create patient prescriptions and print saved copies.",
      ],
    ],
  },
  {
    title: "Patient records",
    copy: "Protect patient identity and clinical history.",
    items: [
      [
        "patients.view",
        "View patient records",
        "Read patient details and treatment estimates.",
      ],
      ["patients.create", "Register patients", "Create new patient files."],
      [
        "patients.update",
        "Edit patient information",
        "Change names, contact details and patient groups.",
      ],
      [
        "patients.dates.edit",
        "Edit patient dates",
        "Change date of birth, follow-up and record dates.",
      ],
      [
        "clinical.write",
        "Edit clinical files",
        "Update complaints, findings, diagnoses and clinical notes.",
      ],
      [
        "patients.delete",
        "Delete patient records",
        "Permanently remove patient records and linked data.",
      ],
    ],
  },
  {
    title: "Treatment & photographs",
    copy: "Separate routine clinical work from removal and pricing.",
    items: [
      [
        "treatment_plans.write",
        "Edit treatment plans",
        "Add and change planned treatments.",
      ],
      [
        "treatment_plans.delete",
        "Remove treatment plans / items",
        "Delete saved plans and treatment rows.",
      ],
      [
        "imaging.view",
        "View photos & imaging",
        "Open patient photographs and scans.",
      ],
      [
        "imaging.manage",
        "Upload & edit photos",
        "Add imaging and edit photo details.",
      ],
      [
        "imaging.delete",
        "Delete photos & imaging",
        "Remove post-op photos, scans and stored files.",
      ],
    ],
  },
  {
    title: "Prices & finances",
    copy: "Control who can see money and who can change it.",
    items: [
      [
        "pricing.view",
        "View treatment price list",
        "Read the clinic treatment catalogue.",
      ],
      [
        "pricing.manage",
        "Manage treatment prices",
        "Change standard prices and catalogue entries.",
      ],
      [
        "patient_price.override",
        "Override a patient’s price",
        "Set a price different from the clinic catalogue.",
      ],
      [
        "treatment_discount.apply",
        "Apply discounts & adjustments",
        "Change discounts and estimate adjustments.",
      ],
      [
        "finance.view",
        "View clinic finances",
        "Read income, expenses and compensation.",
      ],
      [
        "finance.manage",
        "Manage clinic finances",
        "Record, edit and remove financial entries.",
      ],
    ],
  },
  {
    title: "Appointments & operations",
    copy: "Set access to scheduling and clinic stock.",
    items: [
      [
        "appointments.manage",
        "Manage appointments",
        "Book, reschedule and cancel appointments.",
      ],
      [
        "inventory.view",
        "View inventory",
        "Read stock levels and stock movements.",
      ],
      [
        "inventory.manage",
        "Manage inventory",
        "Edit items, record usage and adjust stock.",
      ],
      [
        "leave.request",
        "Request leave / half days",
        "Submit requests for administrator approval.",
      ],
    ],
  },
] as const;
export const permissionKeys = permissionGroups.flatMap((group) =>
  group.items.map((item) => item[0]),
);
export type PermissionKey = (typeof permissionKeys)[number];
export const AccessContext = createContext<ReadonlySet<string>>(new Set());
export const usePermission = (permission: string) =>
  useContext(AccessContext).has(permission);
export const colourHex = (colour: string) =>
  ({ teal: "#28796e", violet: "#8065b0", amber: "#b57d25" })[colour] ||
  (/^#[0-9a-f]{6}$/i.test(colour) ? colour : "#28796e");
export type ClinicSchedule = {
  open: string;
  close: string;
  closedDays: number[];
  leaves: {
    id: string;
    doctor: string;
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
  }[];
};
export type Workspace = {
  organizationId: string;
  clinicId: string;
  clinicName: string;
  role: string;
};

export const permissionDependencies: Record<string, string[]> = {
  "pharmacy.manage": ["pharmacy.view"],
  "prescriptions.write": ["patients.view", "pharmacy.view"],
  "patients.create": ["patients.view"],
  "patients.update": ["patients.view"],
  "patients.dates.edit": ["patients.view"],
  "clinical.write": ["patients.view"],
  "patients.delete": ["patients.view", "treatment_plans.delete"],
  "treatment_plans.write": ["patients.view", "pricing.view"],
  "treatment_plans.delete": ["patients.view"],
  "imaging.manage": ["imaging.view"],
  "imaging.delete": ["imaging.view"],
  "pricing.manage": ["pricing.view"],
  "patient_price.override": [
    "patients.view",
    "pricing.view",
    "treatment_plans.write",
  ],
  "treatment_discount.apply": ["patients.view", "treatment_plans.write"],
  "finance.manage": ["finance.view"],
  "inventory.manage": ["inventory.view"],
};

// Use the actual assigned colour with WCAG-selected foreground, including very light colours.
export function doctorCardStyle(colour: string) {
  const background = colourHex(colour);
  const values = [1, 3, 5]
    .map((i) => parseInt(background.slice(i, i + 2), 16) / 255)
    .map((v) =>
      v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4),
    );
  const luminance =
    values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
  return {
    background,
    color: luminance > 0.179 ? "#000000" : "#ffffff",
    borderLeftColor: luminance > 0.7 ? "#52635c" : background,
  };
}
