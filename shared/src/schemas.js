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
  email: z.string().email().refine(
    (v) => v.endsWith("@igenesys.com"),
    { message: "Work email must end with @igenesys.com" },
  ),
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

/** Fields an EMPLOYEE can edit on their own profile.
 *  `.strict()` rejects any other field with 400 — an employee cannot
 *  smuggle role/salary/manager_id/code/doj changes through their self-patch. */
export const EmployeeSelfPatchSchema = z.object({
  phone: z.string().max(20).optional().nullable(),
  personal_email: z.string().email().optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  emergency_name: z.string().max(200).optional().nullable(),
  emergency_phone: z.string().max(20).optional().nullable(),
  blood_group: z.string().max(10).optional().nullable(),
  nationality: z.string().max(60).optional().nullable(),
  wedding_anniversary: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  prefix: z.string().max(20).optional().nullable(),
  bank_name: z.string().max(100).optional().nullable(),
  bank_acc: z.string().max(50).optional().nullable(),
  ifsc: z.string().max(20).optional().nullable(),
}).strict();

// ── Employee Detail Sub-entities (self-service) ──────────────────────────

export const EmergencyContactSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().min(1).max(20),
  relationship: z.string().max(50).optional().nullable(),
  is_primary: z.number().int().min(0).max(1).default(0),
});

export const FamilyMemberSchema = z.object({
  name: z.string().min(1).max(200),
  relationship: z.string().min(1).max(50),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  is_dependent: z.number().int().min(0).max(1).default(0),
});

export const NomineeSchema = z.object({
  name: z.string().min(1).max(200),
  relationship: z.string().min(1).max(50),
  share_pct: z.number().min(0).max(100).default(100),
});

export const EducationSchema = z.object({
  degree: z.string().min(1).max(200),
  institution: z.string().max(300).optional().nullable(),
  year: z.number().int().min(1950).max(2100).optional().nullable(),
  grade: z.string().max(50).optional().nullable(),
});

export const PrevEmployerSchema = z.object({
  company: z.string().min(1).max(200),
  designation: z.string().max(200).optional().nullable(),
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  reason_leaving: z.string().max(500).optional().nullable(),
});

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
  confirmOverBalance: z.boolean().optional(),
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

// ── Expense & Reimbursement ──────────────────────────────────────────────────

export const ExpensePolicyCreateSchema = z.object({
  name: z.string().min(1).max(200),
  per_diem_limit: z.number().int().positive().optional().nullable(),
  requires_receipt: z.number().int().min(0).max(1).default(1),
  active: z.number().int().min(0).max(1).default(1),
});

export const ExpensePolicyPatchSchema = ExpensePolicyCreateSchema.partial();

export const ExpenseCategoryCreateSchema = z.object({
  name: z.string().min(1).max(200),
  policy_id: z.number().int().positive().optional().nullable(),
  active: z.number().int().min(0).max(1).default(1),
});

export const ExpenseCategoryPatchSchema = ExpenseCategoryCreateSchema.partial();

export const ExpenseCreateSchema = z.object({
  category_id: z.number().int().positive(),
  amount: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().max(1000).optional().nullable(),
  receipt_filename: z.string().max(500).optional().nullable(),
});

export const ExpenseActSchema = z.object({
  comment: z.string().max(1000).optional().nullable(),
});

export const ExpenseSettleSchema = z.object({
  settled_in_month: z.string().regex(/^\d{4}-\d{2}$/),
});

export const AdvanceRequestCreateSchema = z.object({
  amount: z.number().int().positive(),
  reason: z.string().max(1000).optional().nullable(),
});

export const AdvanceActSchema = z.object({
  comment: z.string().max(1000).optional().nullable(),
});

// ── Recruitment ──────────────────────────────────────────────────────────────

export const JobOpeningCreateSchema = z.object({
  title: z.string().min(1).max(300),
  dept_id: z.number().int().positive().optional().nullable(),
  location_id: z.number().int().positive().optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
  requirements: z.string().max(5000).optional().nullable(),
  positions: z.number().int().positive().default(1),
  status: z.enum(["DRAFT", "OPEN", "ON_HOLD", "CLOSED"]).default("DRAFT"),
});

export const JobOpeningPatchSchema = JobOpeningCreateSchema.partial();

export const CandidateCreateSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  phone: z.string().max(20).optional().nullable(),
  resume_filename: z.string().max(500).optional().nullable(),
  source: z.string().max(100).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const CandidatePatchSchema = CandidateCreateSchema.partial();

export const ApplicationCreateSchema = z.object({
  job_id: z.number().int().positive(),
  candidate_id: z.number().int().positive(),
});

export const ApplicationPatchSchema = z.object({
  status: z.enum(["APPLIED", "SCREENING", "INTERVIEW", "OFFERED", "HIRED", "REJECTED"]),
});

export const InterviewCreateSchema = z.object({
  application_id: z.number().int().positive(),
  interviewer_id: z.number().int().positive(),
  scheduled_at: z.string().min(1),
  duration_mins: z.number().int().positive().default(60),
  mode: z.enum(["IN_PERSON", "VIDEO", "PHONE"]).default("IN_PERSON"),
});

export const InterviewPatchSchema = z.object({
  scheduled_at: z.string().min(1).optional(),
  duration_mins: z.number().int().positive().optional(),
  mode: z.enum(["IN_PERSON", "VIDEO", "PHONE"]).optional(),
  feedback: z.string().max(5000).optional().nullable(),
  rating: z.number().int().min(1).max(5).optional().nullable(),
  status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED"]).optional(),
});

export const OfferCreateSchema = z.object({
  ctc_offered: z.number().int().positive(),
  joining_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["DRAFT", "SENT", "ACCEPTED", "DECLINED"]).default("DRAFT"),
});

export const OfferPatchSchema = z.object({
  ctc_offered: z.number().int().positive().optional(),
  joining_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(["DRAFT", "SENT", "ACCEPTED", "DECLINED"]).optional(),
});

// ── Performance Management ─────────────────────────────────────────────────

export const ReviewCycleCreateSchema = z.object({
  name: z.string().min(1).max(300),
  year: z.number().int().min(2000).max(2100),
  quarter: z.number().int().min(1).max(4).optional().nullable(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["DRAFT", "ACTIVE", "CLOSED"]).default("DRAFT"),
});

export const ReviewCyclePatchSchema = z.object({
  name: z.string().min(1).max(300).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "CLOSED"]).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const GoalCreateSchema = z.object({
  employee_id: z.number().int().positive(),
  cycle_id: z.number().int().positive(),
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional().nullable(),
  weight: z.number().min(0).max(100).default(1),
  target_value: z.string().max(500).optional().nullable(),
});

export const GoalPatchSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional().nullable(),
  weight: z.number().min(0).max(100).optional(),
  target_value: z.string().max(500).optional().nullable(),
  actual_value: z.string().max(500).optional().nullable(),
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "DEFERRED"]).optional(),
  self_rating: z.number().int().min(1).max(5).optional().nullable(),
  manager_rating: z.number().int().min(1).max(5).optional().nullable(),
});

export const ReviewCreateSchema = z.object({
  employee_id: z.number().int().positive(),
  cycle_id: z.number().int().positive(),
  reviewer_id: z.number().int().positive(),
  relationship: z.enum(["SELF", "MANAGER", "PEER", "SKIP_LEVEL"]).default("MANAGER"),
});

export const ReviewPatchSchema = z.object({
  overall_rating: z.number().int().min(1).max(5).optional().nullable(),
  strengths: z.string().max(5000).optional().nullable(),
  improvements: z.string().max(5000).optional().nullable(),
  comments: z.string().max(5000).optional().nullable(),
  status: z.enum(["PENDING", "SUBMITTED"]).optional(),
});

export const OneOnOneCreateSchema = z.object({
  employee_id: z.number().int().positive(),
  manager_id: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(5000).optional().nullable(),
  action_items: z.string().max(5000).optional().nullable(),
});

export const OneOnOnePatchSchema = z.object({
  notes: z.string().max(5000).optional().nullable(),
  action_items: z.string().max(5000).optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// ── Employee Engagement ────────────────────────────────────────────────────

export const AnnouncementCreateSchema = z.object({
  title: z.string().min(1).max(300),
  body: z.string().min(1).max(10000),
  priority: z.enum(["NORMAL", "IMPORTANT", "URGENT"]).default("NORMAL"),
  expires_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

export const AnnouncementPatchSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  body: z.string().min(1).max(10000).optional(),
  priority: z.enum(["NORMAL", "IMPORTANT", "URGENT"]).optional(),
  expires_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  active: z.coerce.number().int().min(0).max(1).optional(),
});

export const SurveyCreateSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional().nullable(),
  closes_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  anonymous: z.coerce.number().int().min(0).max(1).default(1),
  questions: z.array(z.object({
    question: z.string().min(1).max(1000),
    type: z.enum(["RATING", "TEXT", "CHOICE"]).default("RATING"),
    options: z.string().max(2000).optional().nullable(),
    sort_order: z.number().int().min(0).default(0),
  })).min(1),
});

export const SurveyPatchSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(5000).optional().nullable(),
  status: z.enum(["DRAFT", "ACTIVE", "CLOSED"]).optional(),
  closes_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

export const SurveyRespondSchema = z.object({
  answers: z.array(z.object({
    question_id: z.number().int().positive(),
    answer: z.string().min(1).max(5000),
  })).min(1),
});

export const BadgeCreateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().nullable(),
  icon: z.string().max(50).default("star"),
});

export const BadgePatchSchema = BadgeCreateSchema.partial();

export const RecognitionCreateSchema = z.object({
  to_employee: z.number().int().positive().optional(),
  to_employee_code: z.string().min(1).max(20).optional(),
  badge_id: z.number().int().positive(),
  message: z.string().min(1).max(1000),
}).refine(d => d.to_employee || d.to_employee_code, {
  message: "Provide to_employee (id) or to_employee_code",
});

// ── Asset Management ──────────────────────────────────────────────────────

export const AssetTypeCreateSchema = z.object({
  name: z.string().min(1).max(200),
});

export const VendorCreateSchema = z.object({
  name: z.string().min(1).max(200),
  contact_email: z.string().email().optional().nullable(),
  contact_phone: z.string().max(30).optional().nullable(),
});

export const AssetCreateSchema = z.object({
  asset_type_id: z.number().int().positive(),
  name: z.string().min(1).max(300),
  serial_no: z.string().max(200).optional().nullable(),
  purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  purchase_cost: z.number().int().min(0).optional().nullable(),
  vendor_id: z.number().int().positive().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const AssetPatchSchema = z.object({
  name: z.string().min(1).max(300).optional(),
  serial_no: z.string().max(200).optional().nullable(),
  purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  purchase_cost: z.number().int().min(0).optional().nullable(),
  vendor_id: z.number().int().positive().optional().nullable(),
  status: z.enum(["AVAILABLE", "ASSIGNED", "IN_REPAIR", "RETIRED"]).optional(),
  notes: z.string().max(2000).optional().nullable(),
});

export const AssetAssignSchema = z.object({
  employee_id: z.number().int().positive(),
  is_temporary: z.coerce.number().int().min(0).max(1).default(0),
  notes: z.string().max(2000).optional().nullable(),
});

// ── Helpdesk ──────────────────────────────────────────────────────────────

export const TicketCategoryCreateSchema = z.object({
  name: z.string().min(1).max(200),
  assigned_to: z.number().int().positive().optional().nullable(),
});

export const TicketCreateSchema = z.object({
  category_id: z.number().int().positive(),
  subject: z.string().min(1).max(500),
  description: z.string().min(1).max(10000),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
});

export const TicketPatchSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  assigned_to: z.number().int().positive().optional().nullable(),
});

export const TicketCommentSchema = z.object({
  body: z.string().min(1).max(5000),
});

// ── Resignation ──────────────────────────────────────────────────────────────

export const ResignationSubmitSchema = z.object({
  resignation_type: z.string().min(1).max(100),
  resignation_reason: z.string().min(1).max(500),
  intended_last_day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  requestee_remarks: z.string().max(1000).optional().nullable(),
}).strict();

export const ResignationActSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  approver_remarks: z.string().max(1000).optional().nullable(),
  last_working_day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
}).strict();

// ── Onboarding ───────────────────────────────────────────────────────────────

export const OnboardingDocCheckSchema = z.object({
  key: z.string().min(1).max(100),
  done: z.number().int().min(0).max(1),
}).strict();

export const OnboardingPolicyAckSchema = z.object({
  policy_key: z.string().min(1).max(100),
}).strict();
