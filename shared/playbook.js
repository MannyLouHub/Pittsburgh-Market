/* Pittsburgh Market — Shared Playbook JS
 *
 * Requires window.PLAYBOOK_CONFIG to be declared BEFORE this script loads:
 *
 *   window.PLAYBOOK_CONFIG = {
 *     locationName: 'Crafton',      // used in verdict text
 *     clr:   0.527,                 // Common Level Ratio (e.g. 52.7% → 0.527)
 *     mills: 43.5382,               // Combined mill rate (raw, e.g. 43.5382)
 *     rentDefaults: {               // auto-filled when property type changes
 *       duplex:  1750,
 *       triplex: 2510,
 *       quad:    3280
 *     }
 *   };
 *
 * After this script loads, call buildChecklist() and calc() from an inline
 * <script> block with location-specific checklist data.
 */

let insMode   = 'yr';
let otherMode = 'pct';
let pmManaged = true;

/* ─── Tab navigation ──────────────────────────────────────── */
function showTab(evt, name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  evt.currentTarget.classList.add('active');
  document.getElementById('panel-' + name).classList.add('active');
}

/* ─── Rent auto-fill ──────────────────────────────────────── */
function setRentDefault() {
  const d = window.PLAYBOOK_CONFIG.rentDefaults;
  const ptype = document.getElementById('ptype').value;
  document.getElementById('rent').value = d[ptype] || d.duplex;
  calc();
}

/* ─── Toggle helpers ──────────────────────────────────────── */
function toggleIns() {
  const btn = document.getElementById('ins-toggle');
  const inp = document.getElementById('ins');
  const curVal = parseFloat(inp.value) || 0;
  if (insMode === 'yr') {
    insMode = 'mo';
    inp.value = Math.round(curVal / 12);
    btn.textContent = '/mo';
  } else {
    insMode = 'yr';
    inp.value = Math.round(curVal * 12);
    btn.textContent = '/yr';
  }
  calc();
}

function toggleOther() {
  const btn = document.getElementById('other-toggle');
  const inp = document.getElementById('other');
  const rentGross = parseFloat(document.getElementById('rent').value) || 0;
  const curVal = parseFloat(inp.value) || 0;
  if (otherMode === 'pct') {
    otherMode = 'mo';
    inp.value = Number((rentGross * curVal / 100).toFixed(2));
    btn.textContent = '$/mo';
  } else {
    otherMode = 'pct';
    inp.value = rentGross > 0 ? Number((curVal / rentGross * 100).toFixed(6)) : 0;
    btn.textContent = '%';
  }
  calc();
}

function togglePM() {
  pmManaged = !pmManaged;
  const btn = document.getElementById('pm-toggle');
  const inp = document.getElementById('pmfee');
  btn.textContent = pmManaged ? 'PM Managed - Fee Included' : 'Self-Managed - PM Fee $0';
  inp.disabled = !pmManaged;
  calc();
}

/* ─── Main calculator ─────────────────────────────────────── */
function calc() {
  const cfg = window.PLAYBOOK_CONFIG;

  const ptype            = document.getElementById('ptype').value;
  const pp               = parseFloat(document.getElementById('pp').value) || 0;
  const dpPct            = parseFloat(document.getElementById('dp').value) || 20;
  const rate             = parseFloat(document.getElementById('rate').value) || 7.75;
  const rentGross        = parseFloat(document.getElementById('rent').value) || 0;
  const otherIncome      = parseFloat(document.getElementById('other_income').value) || 0;
  const vacPct           = parseFloat(document.getElementById('vac').value) || 8;
  const configuredPmPct  = parseFloat(document.getElementById('pmfee').value) || 10;
  const pmPct            = pmManaged ? configuredPmPct : 0;
  const insRaw           = parseFloat(document.getElementById('ins').value) || 0;
  const insMonthly       = insMode === 'yr' ? insRaw / 12 : insRaw;
  const capexPct         = parseFloat(document.getElementById('capex').value) || 0;
  const capexMonthly     = rentGross * capexPct / 100;
  const otherInput       = parseFloat(document.getElementById('other').value) || 0;
  const otherMonthly     = otherMode === 'pct' ? rentGross * otherInput / 100 : otherInput;
  const closingCostPct   = parseFloat(document.getElementById('closing_cost').value) || 6.5;
  const rehab            = parseFloat(document.getElementById('rehab').value) || 0;

  // Financing
  const dp   = pp * dpPct / 100;
  const loan = pp - dp;
  const mr   = rate / 100 / 12;
  const pi   = mr > 0 ? loan * (mr * Math.pow(1 + mr, 360)) / (Math.pow(1 + mr, 360) - 1) : loan / 360;

  // Tax — location-specific via config (CLR × mill rate)
  const assessedVal = pp * cfg.clr;
  const monthlyTax  = assessedVal * (cfg.mills / 1000) / 12;

  // Income & expenses
  const grossIncome      = rentGross + otherIncome;
  const egi              = grossIncome * (1 - vacPct / 100);
  const pmFee            = egi * (pmPct / 100);
  const totalExp         = monthlyTax + insMonthly + capexMonthly + otherMonthly + pmFee;
  const operatingExpPct  = egi > 0 ? totalExp / egi * 100 : 0;
  const noi              = egi - totalExp;
  const noi_yr           = noi * 12;
  const capRate          = pp > 0 ? (noi_yr / pp * 100) : 0;
  const cf               = noi - pi;

  // Returns
  const closingCostAmt = pp * closingCostPct / 100;
  const cashToClose    = dp + closingCostAmt + rehab;
  const coc            = cashToClose > 0 ? (cf * 12 / cashToClose * 100) : 0;
  const dscr           = pi > 0 ? noi / pi : 0;
  const grm            = rentGross > 0 ? pp / (rentGross * 12) : 0;
  const units          = ptype === 'duplex' ? 2 : ptype === 'triplex' ? 3 : 4;
  const pricePerUnit   = units ? pp / units : 0;

  // Helpers
  function fmt(n)           { return '$' + Math.abs(n).toLocaleString('en-US', {minimumFractionDigits:0, maximumFractionDigits:0}); }
  function fmtPct(n)        { return n.toFixed(2) + '%'; }
  function cls(v, good, warn) { return v >= good ? 'good' : v >= warn ? 'warn' : 'bad'; }

  const insAnnual = insMode === 'yr' ? insRaw : insRaw * 12;

  const rows = [
    {l:'Purchase Price',                              v:fmt(pp),                                                   c:'',                      key:false},
    {l:'Down Payment (' + dpPct + '%)',               v:fmt(dp),                                                   c:'',                      key:false},
    {l:'Loan Amount',                                 v:fmt(loan),                                                 c:'',                      key:false},
    {l:'Monthly P&I',                                 v:fmt(pi) + '/mo',                                           c:'',                      key:false},
    {l:'Tax Estimate (CLR-modeled)',                  v:fmt(monthlyTax) + '/mo · ' + fmt(monthlyTax * 12) + '/yr', c:'',                      key:false},
    ...(otherIncome > 0 ? [{l:'Other Monthly Income', v:'+' + fmt(otherIncome) + '/mo',                            c:'good',                  key:false}] : []),
    {l:'Insurance',                                   v:fmt(insMonthly) + '/mo · ' + fmt(insAnnual) + '/yr',       c:'',                      key:false},
    {l:'Repairs & Maint. (' + capexPct + '%)',        v:fmt(capexMonthly) + '/mo',                                 c:'',                      key:false},
    {l:'Other Expenses (' + (otherMode === 'pct' ? otherInput + '%' : fmt(otherMonthly) + '/mo') + ')', v:fmt(otherMonthly) + '/mo', c:'', key:false},
    {l:pmManaged ? 'PM Fee (' + pmPct + '% of EGI)' : 'PM Fee (Self-Managed)', v:fmt(pmFee) + '/mo',  c:pmManaged ? 'bad' : 'good', key:false},
    {l:'Total Monthly Expenses',                      v:fmt(totalExp) + '/mo',                                     c:'',                      key:false},
    {l:'Operating Expense %',                         v:fmtPct(operatingExpPct) + ' of EGI',                       c:'',                      key:true},
    {l:'NOI (before debt service)',                   v:(noi < 0 ? '-' : '') + fmt(noi) + '/mo',                  c:cls(noi, 0, -1),         key:false},
    {l:'Monthly Cash Flow',                           v:(cf < 0 ? '-' : '') + fmt(cf) + '/mo',                    c:cls(cf, 150 * units, 0), key:true},
    {l:'Annual Cash Flow',                            v:(cf * 12 < 0 ? '-' : '') + fmt(cf * 12) + '/yr',          c:cls(cf * 12, 1800 * units, 0), key:false},
    {l:'Cap Rate (' + (pmManaged ? 'PM-adjusted' : 'Self-managed') + ')', v:fmtPct(capRate),           c:cls(capRate, 8, 6.5),    key:true},
    {l:'Cash-on-Cash Return',                         v:fmtPct(coc),                                               c:cls(coc, 7, 4),          key:true},
    {l:'DSCR',                                        v:dscr.toFixed(2) + 'x',                                     c:cls(dscr, 1.2, 1.0),     key:true},
    {l:'Price Per Unit',                              v:fmt(pricePerUnit),                                         c:'',                      key:false},
    {l:'Gross Rent Multiplier',                       v:grm.toFixed(1) + 'x (target ≤10)',                        c:grm <= 10 ? 'good' : grm <= 12 ? 'warn' : 'bad', key:false}
  ];

  let html = rows.map(r =>
    `<div class="result-row${r.key ? ' key' : ''}"><span class="result-label">${r.l}</span><span class="result-value ${r.c}">${r.v}</span></div>`
  ).join('');

  // Verdict
  let verdict = '', color = '';
  if (capRate >= 8 && coc >= 7 && dscr >= 1.2 && cf >= 150 * units) {
    verdict = '🟢 STRONG DEAL — Meets ' + (pmManaged ? 'PM-adjusted' : 'self-managed') + ' ' + cfg.locationName + ' benchmarks';
    color = 'var(--green-light)';
  } else if (capRate >= 6.5 && dscr >= 1.0 && cf > 0) {
    verdict = '🟡 MARGINAL — Verify rent and tax before proceeding';
    color = '#e09a40';
  } else if (cf >= -200 && capRate >= 5.5) {
    verdict = '🟠 WEAK — Requires a different strategy or documented income upside';
    color = '#e09a40';
  } else {
    verdict = '🔴 PASS — Does not pencil under the selected management strategy';
    color = '#e07070';
  }
  html += `<div class="verdict" style="border-color:${color};color:${color};">${verdict}</div>`;

  // Cash to Close summary
  html += `<div style="margin-top:12px;border:1px solid var(--border);padding:12px 14px;background:rgba(0,0,0,0.15);">
    <div class="ctc-header">Cash to Close</div>
    <div class="result-row"><span class="result-label">Down Payment (${dpPct}%)</span><span class="result-value">${fmt(dp)}</span></div>
    <div class="result-row"><span class="result-label">Closing Costs (${closingCostPct}%)</span><span class="result-value">${fmt(closingCostAmt)}</span></div>
    ${rehab > 0 ? `<div class="result-row"><span class="result-label">Rehab Budget</span><span class="result-value">${fmt(rehab)}</span></div>` : ''}
    <div class="result-row key"><span class="result-label">Total Cash to Close</span><span class="result-value warn">${fmt(cashToClose)}</span></div>
    <div class="note">CoC return calculated on total cash invested (down + closing + rehab).</div>
  </div>`;

  document.getElementById('results').innerHTML = html;
}

/* ─── Diligence checklist ─────────────────────────────────── */
function buildChecklist(id, items) {
  document.getElementById(id).innerHTML = items.map(item => `
    <div class="flag-row" style="margin-bottom:4px;cursor:pointer;" onclick="toggleCheck(this)">
      <div class="flag-icon" style="font-size:15px;">⬜</div>
      <div class="flag-text" style="font-size:13px;">${item}</div>
    </div>`).join('');
}

function toggleCheck(el) {
  const ic = el.querySelector('.flag-icon');
  ic.textContent = ic.textContent === '⬜' ? '✅' : '⬜';
}
