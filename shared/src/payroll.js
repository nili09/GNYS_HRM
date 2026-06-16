/**
 * Payroll engine — ported from Genesys-HRMS.html @@CALC_START@@ block.
 * Pure statutory calculation functions (FY 2026-27, verified rates).
 * All money values are integer rupees. Round at computation boundaries.
 */

// ── Statutory rates ─────────────────────────────────────────────────────────

export const STAT = {
  pf: {
    empRate: 0.12,
    erRate: 0.12,
    epsRate: 0.0833,
    wageCeil: 15000,
  },
  esi: {
    empRate: 0.0075,
    erRate: 0.0325,
    wageCeil: 21000,
  },
  tax: {
    slabs: [
      [400000, 0],
      [800000, 0.05],
      [1200000, 0.10],
      [1600000, 0.15],
      [2000000, 0.20],
      [2400000, 0.25],
      [Infinity, 0.30],
    ],
    stdDeduction: 75000,
    rebateLimit: 1200000,
    cess: 0.04,
  },
};

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Round to nearest integer (standard rounding). */
function r0(n) {
  return Math.round(n);
}

// ── Professional Tax (Maharashtra) ──────────────────────────────────────────

/**
 * Maharashtra PT (monthly).
 * Feb (monthNum===2) = 300 for the >10k slab so annual naturally caps at 2,500.
 *
 * @param {number} grossMonth  FULL monthly gross (not prorated)
 * @param {string} gender      "Male" | "Female"
 * @param {number} monthNum    1–12 (calendar month)
 * @returns {number} PT amount
 */
export function calcPT(grossMonth, gender, monthNum) {
  if (gender === "Female") {
    if (grossMonth <= 25000) return 0;
    return monthNum === 2 ? 300 : 200;
  }
  if (grossMonth <= 7500) return 0;
  if (grossMonth <= 10000) return 175;
  return monthNum === 2 ? 300 : 200;
}

// ── Provident Fund ──────────────────────────────────────────────────────────

/**
 * PF calculation.
 * @param {number} pfWages     earned basic (prorated)
 * @param {boolean} capWages   if true, cap at ₹15,000
 * @returns {{ empPF, erEPS, erEPF, erTotal, base }}
 */
export function calcPF(pfWages, capWages) {
  const base = capWages ? Math.min(pfWages, STAT.pf.wageCeil) : pfWages;
  const emp = Math.round(base * STAT.pf.empRate);
  const eps = Math.round(Math.min(pfWages, STAT.pf.wageCeil) * STAT.pf.epsRate);
  const er = Math.round(base * STAT.pf.erRate);
  return { empPF: emp, erEPS: eps, erEPF: er - eps, erTotal: er, base };
}

// ── ESI ─────────────────────────────────────────────────────────────────────

/**
 * ESI calculation.
 * Eligibility on FULL monthly gross ≤ ₹21,000.
 * @param {number} grossMonth  FULL monthly gross (for eligibility check)
 * @param {boolean} eligible   esi_opt && esiEnabled
 * @returns {{ emp, er, covered }}
 */
export function calcESI(grossMonth, eligible) {
  if (!eligible || grossMonth > STAT.esi.wageCeil || grossMonth <= 0) {
    return { emp: 0, er: 0, covered: false };
  }
  return {
    emp: Math.ceil(grossMonth * STAT.esi.empRate),
    er: Math.ceil(grossMonth * STAT.esi.erRate),
    covered: true,
  };
}

// ── Income Tax (New Regime) ─────────────────────────────────────────────────

/**
 * Annual tax, new regime, salaried.
 * Includes §87A rebate and marginal relief.
 *
 * @param {number} grossAnnual  full annual gross (monthly × 12)
 * @returns {number} annual tax (integer rupees)
 */
export function calcAnnualTax(grossAnnual) {
  let taxable = Math.max(0, grossAnnual - STAT.tax.stdDeduction);
  let tax = 0;
  let prev = 0;
  for (const [upTo, rate] of STAT.tax.slabs) {
    if (taxable > prev) tax += (Math.min(taxable, upTo) - prev) * rate;
    prev = upTo;
    if (taxable <= upTo) break;
  }
  if (taxable <= STAT.tax.rebateLimit) {
    tax = 0; // §87A rebate
  } else {
    const excess = taxable - STAT.tax.rebateLimit;
    if (tax > excess) tax = excess; // marginal relief
  }
  return Math.round(tax * (1 + STAT.tax.cess));
}

/**
 * Monthly TDS estimate.
 * @param {number} grossMonthly  full monthly gross
 * @returns {number} monthly TDS (integer rupees)
 */
export function calcMonthlyTDS(grossMonthly) {
  return Math.round(calcAnnualTax(grossMonthly * 12) / 12);
}

// ── Full monthly gross from salary structure ────────────────────────────────

/**
 * Compute full monthly gross from a salary structure row.
 * @param {{ basic, hra, special, conveyance, medical, lta, other_earn }} sal
 * @returns {number}
 */
export function monthlyGross(sal) {
  return (
    (sal.basic || 0) +
    (sal.hra || 0) +
    (sal.special || 0) +
    (sal.conveyance || 0) +
    (sal.medical || 0) +
    (sal.lta || 0) +
    (sal.other_earn || 0)
  );
}

// ── Compute one payroll line ────────────────────────────────────────────────

/**
 * Compute one employee's pay for one month.
 *
 * @param {object} emp       employee row (id, gender, pf_opt, esi_opt, pt_opt, tds_override)
 * @param {object} sal       salary_structure row (basic, hra, special, conveyance, medical, lta, other_earn)
 * @param {string} ym        "YYYY-MM"
 * @param {object} settings  { pfEnabled, pfCapWages, esiEnabled, ptEnabled }
 * @param {number} payable   payable days (from attendance engine)
 * @param {number} totalDays calendar days in month
 * @returns {object} payline
 */
export function computePayLine(emp, sal, ym, settings, payable, totalDays) {
  const monthNum = Number(ym.split("-")[1]);
  const factor = totalDays > 0 ? payable / totalDays : 0;

  // Earned components (prorated)
  const earn = {
    basic: r0((sal.basic || 0) * factor),
    hra: r0((sal.hra || 0) * factor),
    conveyance: r0((sal.conveyance || 0) * factor),
    medical: r0((sal.medical || 0) * factor),
    lta: r0((sal.lta || 0) * factor),
    special: r0((sal.special || 0) * factor),
    other: r0((sal.other_earn || 0) * factor),
  };
  const gross =
    earn.basic + earn.hra + earn.conveyance + earn.medical + earn.lta + earn.special + earn.other;
  const fullGross = monthlyGross(sal);

  // PF: on earned basic
  let pf = { empPF: 0, erEPS: 0, erEPF: 0, erTotal: 0, base: 0 };
  if (settings.pfEnabled && emp.pf_opt) {
    pf = calcPF(earn.basic, settings.pfCapWages);
  }

  // ESI: eligibility on FULL gross; deduction on earned gross
  const esiCheck = calcESI(fullGross, settings.esiEnabled && emp.esi_opt);
  const esiEmp = esiCheck.covered ? Math.ceil(gross * STAT.esi.empRate) : 0;
  const esiEr = esiCheck.covered ? Math.ceil(gross * STAT.esi.erRate) : 0;

  // PT: on full gross
  const pt = settings.ptEnabled && emp.pt_opt ? calcPT(fullGross, emp.gender, monthNum) : 0;

  // TDS: override or estimate from full gross
  const tds =
    emp.tds_override !== null && emp.tds_override !== undefined
      ? r0(emp.tds_override)
      : calcMonthlyTDS(fullGross);

  const totalDed = pf.empPF + esiEmp + pt + tds;
  const net = gross - totalDed;

  return {
    employee_id: emp.id,
    payable,
    month_days: totalDays,
    earn_basic: earn.basic,
    earn_hra: earn.hra,
    earn_conv: earn.conveyance,
    earn_medical: earn.medical,
    earn_lta: earn.lta,
    earn_special: earn.special,
    earn_other: earn.other,
    gross,
    ded_pf: pf.empPF,
    ded_esi: esiEmp,
    ded_pt: pt,
    ded_tds: tds,
    net,
    er_epf: pf.erEPF,
    er_eps: pf.erEPS,
    er_esi: esiEr,
    esi_covered: esiCheck.covered ? 1 : 0,
  };
}
