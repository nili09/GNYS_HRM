import { z } from "zod";

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const ChangePasswordSchema = z.object({
  current: z.string().min(1),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export const ResetPasswordSchema = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export const EmployeeCreateSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(200),
  gender: z.enum(["Male", "Female", "Other"]),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  email: z.string().email(),
  personal_email: z.string().email().optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  emergency_name: z.string().max(200).optional().nullable(),
  emergency_phone: z.string().max(20).optional().nullable(),
  dept_id: z.number().int().positive().optional().nullable(),
  desig_id: z.number().int().positive().optional().nullable(),
  location_id: z.number().int().positive().optional().nullable(),
  manager_id: z.number().int().positive().optional().nullable(),
  doj: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["ONBOARDING", "ACTIVE", "NOTICE", "EXITED"]).default("ONBOARDING"),
  pan: z.string().max(20).optional().nullable(),
  aadhaar: z.string().max(20).optional().nullable(),
  uan: z.string().max(20).optional().nullable(),
  pf_no: z.string().max(50).optional().nullable(),
  esi_no: z.string().max(50).optional().nullable(),
  bank_name: z.string().max(100).optional().nullable(),
  bank_acc: z.string().max(50).optional().nullable(),
  ifsc: z.string().max(20).optional().nullable(),
  pf_opt: z.number().int().min(0).max(1).default(1),
  esi_opt: z.number().int().min(0).max(1).default(1),
  pt_opt: z.number().int().min(0).max(1).default(1),
  tds_override: z.number().int().optional().nullable(),
  role: z.enum(["EMPLOYEE", "HR", "ADMIN"]).default("EMPLOYEE"),
  notes: z.string().max(2000).optional().nullable(),
  // HROne extended fields (Stage 8)
  prefix: z.string().max(20).optional().nullable(),
  blood_group: z.string().max(10).optional().nullable(),
  nationality: z.string().max(60).optional().nullable(),
  employment_status: z.string().max(50).optional().nullable(),
  other_status: z.string().max(100).optional().nullable(),
  company: z.string().max(200).optional().nullable(),
  business_unit: z.string().max(200).optional().nullable(),
  sub_branch: z.string().max(200).optional().nullable(),
  functional_manager_code: z.string().max(20).optional().nullable(),
  personal_status: z.string().max(30).optional().nullable(),
  education_status: z.string().max(30).optional().nullable(),
  work_exp_status: z.string().max(30).optional().nullable(),
  family_status: z.string().max(30).optional().nullable(),
  health_insurance_status: z.string().max(30).optional().nullable(),
  nominee_status: z.string().max(30).optional().nullable(),
  dependent_status: z.string().max(30).optional().nullable(),
  child_info_status: z.string().max(30).optional().nullable(),
  bank_status: z.string().max(30).optional().nullable(),
  prev_employer_status: z.string().max(30).optional().nullable(),
  document_status: z.string().max(30).optional().nullable(),
  resignation_type: z.string().max(100).optional().nullable(),
  resignation_reason: z.string().max(500).optional().nullable(),
  requestee_remarks: z.string().max(1000).optional().nullable(),
  approver_resignation_type: z.string().max(100).optional().nullable(),
  approver_resignation_reason: z.string().max(500).optional().nullable(),
  approver_remarks: z.string().max(1000).optional().nullable(),
  login_enabled: z.number().int().min(0).max(1).optional().nullable(),
  invite_status: z.string().max(30).optional().nullable(),
  login_status: z.string().max(30).optional().nullable(),
  notice_period_confirm: z.number().int().min(0).optional().nullable(),
  notice_period_probation: z.number().int().min(0).optional().nullable(),
  wedding_anniversary: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

export const EmployeePatchSchema = EmployeeCreateSchema.partial().omit({ email: true, role: true });

/** Salary structure — for explicit salary updates */
export const SalaryStructureSchema = z.object({
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ctc_annual: z.number().int().min(0).default(0),
  basic: z.number().int().min(0).default(0),
  hra: z.number().int().min(0).default(0),
  special: z.number().int().min(0).default(0),
  conveyance: z.number().int().min(0).default(0),
  medical: z.number().int().min(0).default(0),
  lta: z.number().int().min(0).default(0),
  other_earn: z.number().int().min(0).default(0),
  other_earn_label: z.string().max(200).default("Other Allowance"),
});

/** Contact-only fields an EMPLOYEE can edit on their own profile.
 *  `.strict()` rejects any other field with 400 — an employee cannot
 *  smuggle role/salary/manager_id changes through their self-patch. */
export const EmployeeSelfPatchSchema = z.object({
  phone: z.string().max(20).optional().nullable(),
  personal_email: z.string().email().optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  emergency_name: z.string().max(200).optional().nullable(),
  emergency_phone: z.string().max(20).optional().nullable(),
}).strict();

/** CSV import payload from mapping wizard */
export const CsvImportSchema = z.object({
  mapping: z.record(z.string(), z.number().int()),
  headers: z.array(z.string()),
  rows: z.array(z.array(z.any())),
  dupMode: z.enum(["skip", "update"]).default("skip"),
});

export const DepartmentSchema = z.object({
  name: z.string().min(1).max(200),
  active: z.number().int().min(0).max(1).default(1),
});

export const LeaveApplySchema = z.object({
  type: z.string().max(10),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  half_from: z.number().int().min(0).max(1).default(0),
  half_to: z.number().int().min(0).max(1).default(0),
  reason: z.string().max(1000).optional().nullable(),
});

export const LeaveActSchema = z.object({
  comment: z.string().max(1000).optional().nullable(),
  confirmOverBalance: z.boolean().optional(),
});

export const LeaveAdjustmentSchema = z.object({
  employee_id: z.number().int().positive(),
  year: z.number().int().min(2000).max(2100),
  type: z.string().max(10),
  delta: z.number().multipleOf(0.5),
  note: z.string().max(1000).optional().nullable(),
});

export const LeaveTypeCreateSchema = z.object({
  code: z.string().min(1).max(10),
  name: z.string().min(1).max(100),
  annual: z.number().min(0).default(0),
  paid: z.number().int().min(0).max(1).default(1),
  carry_fwd: z.number().int().min(0).max(1).default(0),
  max_carry: z.number().min(0).default(0),
});

export const LeaveTypePatchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  annual: z.number().min(0).optional(),
  paid: z.number().int().min(0).max(1).optional(),
  carry_fwd: z.number().int().min(0).max(1).optional(),
  max_carry: z.number().min(0).optional(),
});

export const LeaveApplyOnBehalfSchema = LeaveApplySchema.extend({
  employee_id: z.number().int().positive(),
});

export const AttendanceMarkSchema = z.object({
  marks: z.record(z.string(), z.enum(["P", "A", "HD", "WFH", "OD"])),
});

export const SettingsPutSchema = z.object({
  key: z.string().min(1),
  value: z.any(),
});
