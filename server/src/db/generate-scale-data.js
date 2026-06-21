#!/usr/bin/env node
/**
 * Generate 1000+ employees with realistic scale data for audit testing.
 * Run from hrms/server: node src/db/generate-scale-data.js
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { getDb } from "./index.js";
import { reindexAll } from "../utils/search.js";

const db = getDb();
const TOTAL = 1050;

const FIRST_NAMES_M = ["Aarav","Vivaan","Aditya","Vihaan","Arjun","Reyansh","Mohammed","Sai","Arnav","Dhruv","Kabir","Ritvik","Anirudh","Shaurya","Ayaan","Ishaan","Kartik","Laksh","Pranav","Advait","Rohan","Nikhil","Amit","Rajesh","Suresh","Vikram","Deepak","Pradeep","Ramesh","Harish","Manoj","Sanjay","Gaurav","Rahul","Sachin","Mohit","Ankit","Pankaj","Tushar","Varun","Kunal","Ashish","Neeraj","Ajay","Ravi","Arun","Vinod","Dinesh","Naveen","Kiran"];
const FIRST_NAMES_F = ["Ananya","Saanvi","Aanya","Aadhya","Aaradhya","Myra","Diya","Priya","Shreya","Pooja","Neha","Ankita","Swati","Pallavi","Kavita","Sunita","Meena","Rekha","Anita","Smita","Divya","Ritu","Nandini","Shalini","Manisha","Komal","Jyoti","Archana","Sneha","Shweta","Tanya","Preeti","Isha","Vidya","Bhavna","Geeta","Rashmi","Suman","Radha","Padma"];
const LAST_NAMES = ["Sharma","Patel","Singh","Kumar","Verma","Gupta","Reddy","Joshi","Nair","Menon","Rao","Iyer","Desai","Shah","Mehta","Chopra","Bhatia","Agarwal","Mishra","Pandey","Saxena","Tiwari","Dubey","Chatterjee","Banerjee","Mukherjee","Das","Ghosh","Sen","Bose","Pillai","Kulkarni","Patil","Deshpande","Kadam","Jadhav","Shinde","More","Pawar","Thakur"];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pad(n) { return String(n).padStart(4, "0"); }
function randomDate(startY, endY) {
  const y = randInt(startY, endY);
  const m = randInt(1, 12);
  const d = randInt(1, 28);
  return `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
}

console.log(`Generating ${TOTAL} employees...`);

// Get org data
const depts = db.prepare("SELECT id, name FROM departments WHERE active=1").all();
const desigs = db.prepare("SELECT id, name FROM designations WHERE active=1").all();
const locs = db.prepare("SELECT id, name FROM locations WHERE active=1").all();

// Shared password hash (fast cost for scale gen)
const hash = bcrypt.hashSync("Welcome@123", 4);

const insertEmp = db.prepare(`
  INSERT INTO employees(code, name, gender, dob, phone, email, dept_id, desig_id, location_id,
    doj, status, role, password_hash, must_change_pw, pf_opt, esi_opt, pt_opt, nationality)
  VALUES(@code, @name, @gender, @dob, @phone, @email, @dept_id, @desig_id, @location_id,
    @doj, @status, @role, @hash, 1, 1, 1, 1, 'Indian')
`);

const insertSalary = db.prepare(`
  INSERT INTO salary_structures(employee_id, effective_from, ctc_annual, basic, hra, special, conveyance, medical, lta, other_earn, other_earn_label)
  VALUES(@employee_id, @effective_from, @ctc_annual, @basic, @hra, @special, @conveyance, @medical, @lta, 0, 'Other Allowance')
`);

// Check existing employee count
const existingCount = db.prepare("SELECT COUNT(*) as c FROM employees").get().c;
const skipInsert = existingCount >= TOTAL;
if (skipInsert) {
  console.log(`Already have ${existingCount} employees. Skipping insert.`);
}

const startCode = existingCount + 1;
const empIds = [];

if (skipInsert) {
  // Skip to post-insert steps
} else {
// Build manager hierarchy: first 50 are senior (potential managers)
const insertTransaction = db.transaction(() => {
  for (let i = startCode; i <= TOTAL; i++) {
    const isMale = Math.random() > 0.4;
    const firstName = isMale ? pick(FIRST_NAMES_M) : pick(FIRST_NAMES_F);
    const lastName = pick(LAST_NAMES);
    const name = `${firstName} ${lastName}`;
    const code = `GEN${pad(i)}`;
    const email = `${firstName.toLowerCase()}${lastName.toLowerCase()}${i}@igenesys.com`;
    const gender = isMale ? "Male" : "Female";
    const dob = randomDate(1970, 2000);
    const phone = `9${randInt(100000000, 999999999)}`;
    const dept = pick(depts);
    const desig = pick(desigs);
    const loc = pick(locs);
    const doj = randomDate(2018, 2026);

    // Role distribution: mostly EMPLOYEE, a few HR
    let role = "EMPLOYEE";
    if (i > 1 && i <= 6) role = "HR";

    const result = insertEmp.run({
      code, name, gender, dob, phone, email,
      dept_id: dept.id, desig_id: desig.id, location_id: loc.id,
      doj, status: "ACTIVE", role, hash,
    });
    empIds.push(result.lastInsertRowid);

    // Salary structure
    const monthlyBasic = randInt(15000, 80000);
    const hra = Math.round(monthlyBasic * 0.5);
    const special = randInt(2000, 15000);
    const conv = 1600;
    const med = 1250;
    const lta = Math.round(monthlyBasic * 0.1);
    const ctcAnnual = (monthlyBasic + hra + special + conv + med + lta) * 12;

    insertSalary.run({
      employee_id: result.lastInsertRowid,
      effective_from: doj,
      ctc_annual: ctcAnnual,
      basic: monthlyBasic, hra, special,
      conveyance: conv, medical: med, lta,
    });
  }
});

insertTransaction();
console.log(`✓ ${TOTAL - startCode + 1} employees inserted`);
} // end skipInsert

// Assign managers: build a real hierarchy
const allEmps = db.prepare("SELECT id FROM employees WHERE status='ACTIVE' ORDER BY id").all();
const adminId = db.prepare("SELECT id FROM employees WHERE role='ADMIN' LIMIT 1").get()?.id;
if (!adminId) { console.error("No admin found!"); process.exit(1); }
const nonAdminEmps = allEmps.filter(e => e.id !== adminId);
const seniorIds = nonAdminEmps.slice(0, 50).map(e => e.id);

const updateManager = db.prepare("UPDATE employees SET manager_id = ? WHERE id = ?");
const assignManagers = db.transaction(() => {
  for (const emp of nonAdminEmps) {
    const idx = nonAdminEmps.indexOf(emp);
    if (idx < 10) {
      // Top 10 report to admin
      updateManager.run(adminId, emp.id);
    } else if (idx < 50) {
      // Next 40 report to one of top 10
      updateManager.run(seniorIds[idx % 10], emp.id);
    } else {
      // Everyone else reports to one of the 50 seniors
      updateManager.run(pick(seniorIds), emp.id);
    }
  }
});
assignManagers();
console.log(`✓ Manager hierarchy assigned`);

// Generate attendance for June 2026
console.log("Generating attendance for June 2026...");
const activeEmps = db.prepare("SELECT id FROM employees WHERE status='ACTIVE'").all();
const insertAtt = db.prepare(`
  INSERT OR IGNORE INTO attendance(date, employee_id, code, marked_by, marked_at)
  VALUES(@date, @employee_id, @code, @marked_by, datetime('now'))
`);
const codes = ["P","P","P","P","P","P","P","P","P","P","P","P","P","P","P","WFH","HD","A","OD"];

const attTransaction = db.transaction(() => {
  for (let day = 1; day <= 20; day++) {
    const dateStr = `2026-06-${String(day).padStart(2, "0")}`;
    const dow = new Date(dateStr).getDay();
    if (dow === 0) continue; // skip sundays

    for (const emp of activeEmps) {
      insertAtt.run({
        date: dateStr,
        employee_id: emp.id,
        code: pick(codes),
        marked_by: adminId,
      });
    }
  }
});
attTransaction();
console.log(`✓ Attendance generated`);

// Generate leave requests
console.log("Generating leave requests...");
const insertLeave = db.prepare(`
  INSERT INTO leaves(employee_id, type, date_from, date_to, half_from, half_to, days, reason, status, applied_at)
  VALUES(@employee_id, @type, @date_from, @date_to, 0, 0, @days, @reason, @status, datetime('now'))
`);
const leaveTypes = ["EL","CL","SL"];
const leaveStatuses = ["PENDING","APPROVED","REJECTED","APPROVED","APPROVED","PENDING"];
const leaveReasons = ["Family function","Medical appointment","Personal work","Vacation","Festival celebration","Not feeling well","Wedding ceremony","Home repair"];

const leaveTransaction = db.transaction(() => {
  for (let i = 0; i < 300; i++) {
    const emp = pick(activeEmps);
    const lt = pick(leaveTypes);
    const startDay = randInt(1, 25);
    const duration = randInt(1, 3);
    const dateFrom = `2026-06-${String(startDay).padStart(2, "0")}`;
    const dateTo = `2026-06-${String(Math.min(startDay + duration - 1, 28)).padStart(2, "0")}`;

    insertLeave.run({
      employee_id: emp.id,
      type: lt,
      date_from: dateFrom,
      date_to: dateTo,
      days: duration,
      reason: pick(leaveReasons),
      status: pick(leaveStatuses),
    });
  }
});
leaveTransaction();
console.log(`✓ 300 leave requests generated`);

// Generate holidays
const insertHoliday = db.prepare(`INSERT OR IGNORE INTO holidays(date, name) VALUES(?, ?)`);
const holidays = [
  ["2026-01-26", "Republic Day"],
  ["2026-03-14", "Holi"],
  ["2026-04-14", "Ambedkar Jayanti"],
  ["2026-05-01", "Maharashtra Day"],
  ["2026-08-15", "Independence Day"],
  ["2026-10-02", "Gandhi Jayanti"],
  ["2026-10-20", "Dussehra"],
  ["2026-11-09", "Diwali"],
  ["2026-12-25", "Christmas"],
];
for (const [d, n] of holidays) insertHoliday.run(d, n);
console.log(`✓ Holidays seeded`);

// Rebuild search index
reindexAll(db);
console.log("✓ Search index rebuilt");

console.log(`\n✅ Scale data generation complete: ${TOTAL} employees, attendance, leaves, holidays`);
process.exit(0);
