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

/* ─── Injections: back nav · loan type selector · Loans tab ───── */
(function () {

  /* 0 — Fix browser step-snapping: set step="any" on all number inputs
   *     Without this, inputs with step="0.25", step="0.5", etc. will silently
   *     round your typed value to the nearest valid step when you click away.
   *     step="any" keeps spinner arrows but accepts any decimal value. */
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('input[type="number"]').forEach(function (el) {
      el.setAttribute('step', 'any');
    });
  });

  /* 1 — Back nav */
  const nav = document.createElement('div');
  nav.className = 'back-nav';
  nav.innerHTML = '<a href="../index.html">← Market Hub</a>';
  document.body.insertBefore(nav, document.body.firstChild);

  /* 2 — Loan type selector (between Down Payment and Interest Rate)
   *     4 types: Conventional (PMI auto-applies when DP <20%) | FHA | DSCR | Cash
   *     Source: Movement Mortgage pre-app estimate · Pittsburgh PA 15206 · May 2026 */
  const dpInput = document.getElementById('dp');
  if (dpInput) {
    const dpRow = dpInput.closest('.input-row');
    if (dpRow) {
      const row = document.createElement('div');
      row.className = 'input-row';
      row.innerHTML =
        '<label>Loan Type</label>' +
        '<select id="loan_type" onchange="updateLoanType()">' +
          '<option value="conv">Conventional (PMI auto-applies if &lt;20% down)</option>' +
          '<option value="fha">FHA — 3.5% min down · MIP 0.55%/yr + 1.75% upfront · Owner-occupied only</option>' +
          '<option value="dscr">DSCR — Investor loan · 20%+ down · No PMI</option>' +
          '<option value="cash">Cash Purchase · No financing</option>' +
        '</select>' +
        '<div class="hint">Conventional: PMI (0.48%/yr) kicks in automatically when DP &lt; 20% and drops at 80% LTV &nbsp;·&nbsp; ' +
        'FHA: monthly MIP never drops if &lt;10% down &nbsp;·&nbsp; Rates: Movement Mortgage, May 2026</div>';
      dpRow.insertAdjacentElement('afterend', row);
    }
  }

  /* 3 — Loans tab + panel (appended after last existing panel) */
  const tabsInner = document.querySelector('.tabs-inner');
  if (tabsInner) {
    const t = document.createElement('div');
    t.className = 'tab';
    t.setAttribute('onclick', "showTab(event,'loans')");
    t.textContent = '💰 Loans';
    tabsInner.appendChild(t);
  }

  const panels = document.querySelectorAll('.panel');
  const lastPanel = panels[panels.length - 1];
  if (lastPanel) {
    const cfg = window.PLAYBOOK_CONFIG || {};
    const loc = cfg.locationName || 'this market';
    // Flag distressed ZIP markets where DSCR lenders are cautious
    const distressedZips = ['15132','15120']; // McKeesport, Homestead
    const locKey = (cfg.locationKey || '').toLowerCase();
    const dscrNote = (locKey === 'mckeesport' || locKey === 'homestead')
      ? '<div class="alert red" style="margin-top:10px;"><div class="alert-title">⚠️ DSCR LENDER CAUTION IN ' + loc.toUpperCase() + '</div>Some DSCR lenders decline non-owner-occupied properties in distressed Mon Valley ZIPs. Confirm your DSCR lender underwrites this ZIP before making any offer. Cash is often the more reliable path in this market.</div>'
      : '';

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.id = 'panel-loans';
    panel.innerHTML = '<div class="content">' +
      '<div class="section-title"><div class="dot"></div>Loan Types — What Works for Small Multifamily in Pittsburgh</div>' +

      '<div class="alert red mb-14"><div class="alert-title">🚨 CRITICAL RULE: FHA IS OWNER-OCCUPIED ONLY</div>' +
      'FHA loans for 2–4 unit properties require you to live in one of the units. You <strong>cannot</strong> use FHA for a straight investment property. FHA is the house-hack loan — not the investor loan. ' +
      'If you are not planning to live in the building, your options are Conventional (20%+ down), DSCR, or Cash.</div>' +

      '<div class="grid-2 mb-14">' +

        /* CONVENTIONAL */
        '<div class="strategy-card"><div class="s-stripe" style="background:var(--gold);"></div>' +
        '<div class="s-label">Loan Type 1</div>' +
        '<div class="s-title">Conventional</div>' +
        '<div class="s-trigger">Best for: <span>Investment properties at 20%+ down · House hacks at 5–10% down with PMI</span></div>' +
        '<div class="s-metrics">' +
          '<div>Min Down (Investment): <span>20–25%</span></div>' +
          '<div>Min Down (House Hack): <span>5%</span></div>' +
          '<div>Rate (est.): <span>6.875% · Movement Mortgage, May 2026</span></div>' +
          '<div>PMI: <span>0.48%/yr of loan when DP &lt;20% · Auto-drops at 80% LTV</span></div>' +
          '<div>Upfront Cost: <span>None — no upfront mortgage insurance</span></div>' +
          '<div>Credit Min: <span>620+ (740+ for best rates)</span></div>' +
        '</div>' +
        '<div class="s-note"><strong>✅ Pros:</strong> PMI drops at 80% LTV — it\'s not permanent. No upfront MIP. Standard product with widest lender availability. At 20%+ down, zero mortgage insurance cost.<br><br>' +
        '<strong>⚠️ Cons:</strong> Investment properties require 20–25% down. Full income documentation required (W-2, tax returns, DTI check). Harder to qualify when you already own multiple financed properties.</div>' +
        '</div>' +

        /* FHA */
        '<div class="strategy-card"><div class="s-stripe" style="background:#7a9fd4;"></div>' +
        '<div class="s-label">Loan Type 2 — Owner-Occupied Only</div>' +
        '<div class="s-title">FHA</div>' +
        '<div class="s-trigger">Best for: <span>House hacks (you live in one unit) · First-time buyers · Lower credit profiles</span></div>' +
        '<div class="s-metrics">' +
          '<div>Min Down: <span>3.5% (580+ credit) · 10% (500–579 credit)</span></div>' +
          '<div>Rate (est.): <span>6.125% · Movement Mortgage, May 2026</span></div>' +
          '<div>Monthly MIP: <span>0.55%/yr of loan ($259.53/mo on $569,350 loan)</span></div>' +
          '<div>Upfront MIP: <span>1.75% of loan at closing ($9,963.62 on $569,350)</span></div>' +
          '<div>MIP Duration: <span>Life of loan if &lt;10% down · 11 years if ≥10% down</span></div>' +
          '<div>Loan Limits (Allegheny Co.): <span>2-unit $671,200 · 3-unit $811,275 · 4-unit $1,008,150</span></div>' +
        '</div>' +
        '<div class="s-note"><strong>✅ Pros:</strong> Lowest down payment (3.5%). Lower rate than conventional. Lower credit threshold (580+). Best entry point for owner-occupant small multifamily.<br><br>' +
        '<strong>🚨 Cons:</strong> OWNER-OCCUPIED ONLY — you must live in one unit. Monthly MIP never drops if you put less than 10% down. Upfront MIP adds ~$10K to your closing cost on a $570K loan. Loan limits cap your purchase price.</div>' +
        '</div>' +

      '</div>' +
      '<div class="grid-2 mb-14">' +

        /* DSCR */
        '<div class="strategy-card"><div class="s-stripe" style="background:var(--green-light);"></div>' +
        '<div class="s-label">Loan Type 3 — Investor Specific</div>' +
        '<div class="s-title">DSCR</div>' +
        '<div class="s-trigger">Best for: <span>Investment properties · Self-employed investors · Scaling investors with multiple properties</span></div>' +
        '<div class="s-metrics">' +
          '<div>Min Down: <span>20–25% (no PMI)</span></div>' +
          '<div>Rate (est.): <span>8.50%+ (higher than conventional)</span></div>' +
          '<div>Qualification: <span>Based on property income (rent ÷ debt service) — not your W-2</span></div>' +
          '<div>Min DSCR: <span>Typically 1.20× (rent covers 120% of P&I)</span></div>' +
          '<div>Income Docs: <span>No tax returns required · Lease or market rent analysis</span></div>' +
          '<div>Entity: <span>Can close in LLC — no personal income exposure</span></div>' +
        '</div>' +
        '<div class="s-note"><strong>✅ Pros:</strong> Qualification is based on the property\'s income, not yours. No tax returns. Works when you have too many financed properties for conventional. LLC-friendly — keeps the asset in your entity.<br><br>' +
        '<strong>⚠️ Cons:</strong> Rates are 1.5–2% higher than conventional. Requires 20–25% down. Some lenders decline certain Pittsburgh ZIP codes (McKeesport, Homestead). Property must cash-flow at 1.20× DSCR to qualify.</div>' +
        dscrNote +
        '</div>' +

        /* CASH */
        '<div class="strategy-card"><div class="s-stripe" style="background:var(--text-muted);"></div>' +
        '<div class="s-label">Loan Type 4</div>' +
        '<div class="s-title">Cash</div>' +
        '<div class="s-trigger">Best for: <span>Low-price markets where financing is limited · Competitive offers · Maximum cash flow</span></div>' +
        '<div class="s-metrics">' +
          '<div>Down Payment: <span>100% — no loan</span></div>' +
          '<div>P&I: <span>$0/mo — no debt service</span></div>' +
          '<div>PMI/MIP: <span>None</span></div>' +
          '<div>Qualification: <span>No lender approval needed</span></div>' +
          '<div>Close Timeline: <span>Fastest — typically 10–21 days</span></div>' +
          '<div>Best Markets: <span>' + loc + ' · McKeesport · Homestead · Low-price BRRRR targets</span></div>' +
        '</div>' +
        '<div class="s-note"><strong>✅ Pros:</strong> Strongest offer — no financing contingency. Maximum monthly cash flow (no debt service). Works in any market regardless of lender ZIP appetite. Fastest close.<br><br>' +
        '<strong>⚠️ Cons:</strong> Ties up a large amount of capital. Lower cash-on-cash return than leveraged deals. Can\'t pull equity back out unless you refinance later (BRRRR exit).</div>' +
        '</div>' +

      '</div>' +

      /* Quick comparison table */
      '<div class="section-title sm"><div class="dot"></div>Quick Comparison — ' + loc + '</div>' +
      '<table class="data-table mb-14">' +
        '<thead><tr><th>Loan Type</th><th>Min Down</th><th>Rate (est.)</th><th>PMI / MIP</th><th>Owner-Occ Required</th><th>Best Use Case</th></tr></thead>' +
        '<tbody>' +
          '<tr><td class="hl">Conventional</td><td>5% (house hack) · 20% (investment)</td><td class="mu">6.875%</td><td>PMI 0.48%/yr if &lt;20% · drops at 80% LTV</td><td class="mu">No</td><td class="gr">Standard investment or house hack</td></tr>' +
          '<tr><td class="hl">FHA</td><td>3.5%</td><td class="mu">6.125%</td><td>MIP 0.55%/yr (life of loan) + 1.75% upfront</td><td class="rd">YES — must live in one unit</td><td class="mu">House hack only</td></tr>' +
          '<tr><td class="hl">DSCR</td><td>20–25%</td><td class="mu">8.50%+</td><td>None</td><td class="gr">No</td><td class="mu">Investor scaling · LLC deals · no W-2 needed</td></tr>' +
          '<tr><td class="hl">Cash</td><td>100%</td><td class="mu">N/A</td><td>None</td><td class="gr">No</td><td class="gr">Max cash flow · distressed ZIPs · BRRRR entry</td></tr>' +
        '</tbody>' +
      '</table>' +

      '<div class="sources"><strong>Rate source:</strong> ' +
        '<a href="#" onclick="return false;">Movement Mortgage pre-application estimate · Pittsburgh PA 15206 · May 17, 2026 · Loan Officer: Justin Ruzicka · (412) 335-2317</a>' +
        ' &nbsp;·&nbsp; Rates are estimates — get an official Loan Estimate before choosing a loan.' +
      '</div>' +
    '</div>';

    lastPanel.insertAdjacentElement('afterend', panel);

    /* 4 — Loan Calc tab + panel */
    const lcT = document.createElement('div');
    lcT.className = 'tab';
    lcT.setAttribute('onclick', "showTab(event,'loancalc')");
    lcT.textContent = '📐 Loan Calc';
    if (tabsInner) tabsInner.appendChild(lcT);

    const lcPanel = document.createElement('div');
    lcPanel.className = 'panel';
    lcPanel.id = 'panel-loancalc';

    const _bs  = 'padding:6px 16px;border-radius:4px;border:1px solid var(--border);cursor:pointer;font-size:13px;font-weight:600;margin-right:2px;';
    const _on  = _bs + 'background:var(--gold);color:#000;border-color:var(--gold);';
    const _off = _bs + 'background:rgba(255,255,255,0.06);color:var(--text-muted);border-color:var(--border);';

    lcPanel.innerHTML =
      '<div class="content">' +
      '<div class="section-title"><div class="dot"></div>Loan Calculator — Amortization &amp; Interest-Only</div>' +
      '<div style="background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:6px;padding:12px 14px;margin-bottom:14px;font-size:13px;color:var(--text-muted);">' +
        'Enter a <strong style="color:var(--text);">loan amount</strong>, rate, and term. ' +
        'Toggle between <strong style="color:var(--text);">Amortization</strong> (P&amp;I — standard mortgage) ' +
        'and <strong style="color:var(--text);">Interest-Only</strong> (used by private lenders — lower monthly, full principal due at balloon). ' +
        'Enable <strong style="color:var(--text);">Balloon</strong> for any loan with a lump-sum payoff date.' +
      '</div>' +
      '<div style="background:rgba(0,0,0,0.2);border:1px solid var(--border);border-radius:8px;padding:18px 20px;margin-bottom:16px;">' +
        '<div class="input-row">' +
          '<label>Loan Amount — P</label>' +
          '<input type="number" id="lc-principal" value="200000" oninput="runLoanCalc()">' +
          '<div class="hint">Loan amount only — not the purchase price. Use the Deal Calculator tab to find your loan amount first.</div>' +
        '</div>' +
        '<div class="input-row">' +
          '<label>Annual Interest Rate (%)</label>' +
          '<input type="number" id="lc-rate" value="6.875" oninput="runLoanCalc()">' +
          '<div class="hint">Enter as a percentage — e.g. 6.875 for 6.875%/yr</div>' +
        '</div>' +
        '<div class="input-row">' +
          '<label>Loan Term</label>' +
          '<div style="display:flex;gap:8px;align-items:center;">' +
            '<input type="number" id="lc-term" value="30" oninput="runLoanCalc()" style="flex:1;">' +
            '<button id="lc-term-btn" onclick="lcToggleTerm()" style="' + _on + '">Years</button>' +
          '</div>' +
          '<div class="hint" id="lc-term-hint">= 360 months</div>' +
        '</div>' +
        '<div class="input-row">' +
          '<label>Payment Type</label>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
            '<button id="lc-amort-btn" onclick="lcSetCalcType(\'amort\')" style="' + _on  + '">📊 Amortization (P&amp;I)</button>' +
            '<button id="lc-io-btn"    onclick="lcSetCalcType(\'io\')"    style="' + _off + '">💸 Interest-Only</button>' +
          '</div>' +
          '<div class="hint">Amortization = pays down principal every month &nbsp;·&nbsp; Interest-Only = interest only, full principal due at balloon date</div>' +
        '</div>' +
        '<div class="input-row">' +
          '<label>Balloon Payment</label>' +
          '<div style="display:flex;gap:8px;">' +
            '<button id="lc-balloon-btn" onclick="lcToggleBalloon()" style="' + _off + '">🔵 OFF — No Balloon</button>' +
          '</div>' +
          '<div class="hint">Enable for private lenders, bridge loans, hard money — any loan with a lump-sum payoff date</div>' +
        '</div>' +
        '<div class="input-row" id="lc-balloon-row" style="display:none;">' +
          '<label>Balloon Due After</label>' +
          '<div style="display:flex;gap:8px;align-items:center;">' +
            '<input type="number" id="lc-balloon-term" value="24" oninput="runLoanCalc()" style="flex:1;">' +
            '<button id="lc-balloon-term-btn" onclick="lcToggleBalloonTerm()" style="' + _on + '">Months</button>' +
          '</div>' +
          '<div class="hint">Full remaining balance is due at this point — must refinance, sell, or pay off</div>' +
        '</div>' +
      '</div>' +
      '<div id="lc-results"></div>' +
      '<div id="lc-comparison"></div>' +
      '</div>';

    panel.insertAdjacentElement('afterend', lcPanel);

    /* Auto-run loan calc once all scripts have loaded */
    setTimeout(function () { if (typeof runLoanCalc === 'function') runLoanCalc(); }, 0);
  }

})();

let insMode   = 'yr';
let otherMode = 'pct';
let pmManaged = true;

/* Loan Calculator state */
let lcTermMode    = 'yr';    /* 'yr' | 'mo' */
let lcBalloonMode = 'mo';    /* 'yr' | 'mo' */
let lcCalcType    = 'amort'; /* 'amort' | 'io' */
let lcBalloon     = false;

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

/* ─── Loan type change handler ────────────────────────────── */
function updateLoanType() {
  const lt   = document.getElementById('loan_type').value;
  const rate = document.getElementById('rate');
  const dp   = document.getElementById('dp');
  // Suggest rate defaults per loan type (user can still override)
  if      (lt === 'conv')  { rate.value = 6.875; }
  else if (lt === 'fha')   { rate.value = 6.125; dp.value = 3.5; }
  else if (lt === 'dscr')  { rate.value = 8.50;  dp.value = 20;  }
  else if (lt === 'cash')  { rate.value = 0;     dp.value = 100; }
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

  // Loan type & PMI / MIP
  // Rates sourced from Movement Mortgage pre-app estimate, Pittsburgh PA, May 2026
  const loanTypeEl = document.getElementById('loan_type');
  const loanType   = loanTypeEl ? loanTypeEl.value : 'conv';
  const isCash     = loanType === 'cash';

  // Financing
  const dp   = pp * dpPct / 100;
  const loan = pp - dp;
  const mr   = rate / 100 / 12;
  const pi   = isCash ? 0
             : (mr > 0 ? loan * (mr * Math.pow(1 + mr, 360)) / (Math.pow(1 + mr, 360) - 1) : 0);

  // PMI / MIP calculation
  // Conventional: PMI auto-applies when DP < 20% — no separate option needed
  //   0.48%/yr of loan (Movement Mortgage quote: $560,500 loan → $224.20/mo · May 2026)
  // FHA: always has two charges — monthly MIP + upfront MIP
  //   Monthly MIP: 0.55%/yr  (Movement Mortgage quote: $569,350 loan → $259.53/mo · May 2026)
  //   Upfront MIP: 1.75% of loan at close (confirmed: $9,963.62 on $569,350)
  let pmiMonthly    = 0;
  let fhaUpfrontMip = 0;
  if (!isCash) {
    if (loanType === 'conv' && dpPct < 20) {
      pmiMonthly = loan * 0.0048 / 12;
    } else if (loanType === 'fha') {
      pmiMonthly    = loan * 0.0055 / 12;
      fhaUpfrontMip = loan * 0.0175;
    }
  }

  // Tax — location-specific via config (CLR × mill rate)
  const assessedVal = pp * cfg.clr;
  const monthlyTax  = assessedVal * (cfg.mills / 1000) / 12;

  // Income & expenses
  const grossIncome      = rentGross + otherIncome;
  const egi              = grossIncome * (1 - vacPct / 100);
  const pmFee            = egi * (pmPct / 100);
  const totalExp         = monthlyTax + insMonthly + capexMonthly + otherMonthly + pmFee + pmiMonthly;
  const operatingExpPct  = egi > 0 ? totalExp / egi * 100 : 0;
  const noi              = egi - totalExp;
  const noi_yr           = noi * 12;
  const capRate          = pp > 0 ? (noi_yr / pp * 100) : 0;
  const cf               = noi - pi;

  // Returns
  const closingCostAmt = pp * closingCostPct / 100;
  const cashToClose    = dp + closingCostAmt + rehab + fhaUpfrontMip;
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
    ...(pmiMonthly > 0 ? [{
      l: loanType === 'fha' ? 'FHA MIP (0.55%/yr · drops at loan payoff)' : 'PMI (0.48%/yr · drops at 80% LTV)',
      v: fmt(pmiMonthly) + '/mo · ' + fmt(pmiMonthly * 12) + '/yr',
      c: 'bad', key: false
    }] : []),
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
    ${fhaUpfrontMip > 0 ? `<div class="result-row"><span class="result-label">FHA Upfront MIP (1.75%)</span><span class="result-value bad">${fmt(fhaUpfrontMip)}</span></div>` : ''}
    <div class="result-row key"><span class="result-label">Total Cash to Close</span><span class="result-value warn">${fmt(cashToClose)}</span></div>
    <div class="note">CoC return calculated on total cash invested (down + closing + rehab${fhaUpfrontMip > 0 ? ' + FHA upfront MIP' : ''}).</div>
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

/* ─── Loan Calculator helpers ─────────────────────────── */
function _lcBtnStyle(isActive) {
  const base = 'padding:6px 16px;border-radius:4px;border:1px solid var(--border);cursor:pointer;font-size:13px;font-weight:600;margin-right:2px;';
  return isActive
    ? base + 'background:var(--gold);color:#000;border-color:var(--gold);'
    : base + 'background:rgba(255,255,255,0.06);color:var(--text-muted);border-color:var(--border);';
}

function lcSetCalcType(type) {
  lcCalcType = type;
  const aBtn = document.getElementById('lc-amort-btn');
  const iBtn = document.getElementById('lc-io-btn');
  if (aBtn) aBtn.setAttribute('style', _lcBtnStyle(type === 'amort'));
  if (iBtn) iBtn.setAttribute('style', _lcBtnStyle(type === 'io'));
  runLoanCalc();
}

function lcToggleTerm() {
  const inp = document.getElementById('lc-term');
  const btn = document.getElementById('lc-term-btn');
  if (!inp || !btn) return;
  const val = parseFloat(inp.value) || 0;
  if (lcTermMode === 'yr') {
    lcTermMode   = 'mo';
    inp.value    = Math.round(val * 12);
    btn.textContent = 'Months';
  } else {
    lcTermMode   = 'yr';
    inp.value    = +(val / 12).toFixed(1);
    btn.textContent = 'Years';
  }
  runLoanCalc();
}

function lcToggleBalloonTerm() {
  const inp = document.getElementById('lc-balloon-term');
  const btn = document.getElementById('lc-balloon-term-btn');
  if (!inp || !btn) return;
  const val = parseFloat(inp.value) || 0;
  if (lcBalloonMode === 'mo') {
    lcBalloonMode   = 'yr';
    inp.value       = +(val / 12).toFixed(1);
    btn.textContent = 'Years';
  } else {
    lcBalloonMode   = 'mo';
    inp.value       = Math.round(val * 12);
    btn.textContent = 'Months';
  }
  runLoanCalc();
}

function lcToggleBalloon() {
  lcBalloon = !lcBalloon;
  const btn = document.getElementById('lc-balloon-btn');
  const row = document.getElementById('lc-balloon-row');
  if (!btn || !row) return;
  if (lcBalloon) {
    btn.textContent = '🟡 ON — Balloon Enabled';
    btn.setAttribute('style', _lcBtnStyle(true));
    row.style.display = '';
  } else {
    btn.textContent = '🔵 OFF — No Balloon';
    btn.setAttribute('style', _lcBtnStyle(false));
    row.style.display = 'none';
  }
  runLoanCalc();
}

/* ─── Loan Calculator — main calc ────────────────────── */
function runLoanCalc() {
  const P       = parseFloat(document.getElementById('lc-principal').value) || 0;
  const annRate = parseFloat(document.getElementById('lc-rate').value)      || 0;
  const termVal = parseFloat(document.getElementById('lc-term').value)      || 0;
  const n       = Math.max(1, Math.round(lcTermMode === 'yr' ? termVal * 12 : termVal));
  const r       = annRate / 100 / 12;

  /* Update term hint */
  const hint = document.getElementById('lc-term-hint');
  if (hint) hint.textContent = lcTermMode === 'yr'
    ? '= ' + n + ' months'
    : '≈ ' + (n / 12).toFixed(1) + ' years';

  const resultsEl    = document.getElementById('lc-results');
  const comparisonEl = document.getElementById('lc-comparison');
  if (!resultsEl || !comparisonEl) return;

  if (P <= 0 || n <= 0) {
    resultsEl.innerHTML    = '<div style="text-align:center;padding:20px;color:var(--text-muted);">Enter a loan amount and term above to see results.</div>';
    comparisonEl.innerHTML = '';
    return;
  }

  /* ── Math helpers ──────────────────────────────────── */
  function amortPmt(principal, mr, months) {
    if (mr === 0) return principal / months;
    return principal * (mr * Math.pow(1 + mr, months)) / (Math.pow(1 + mr, months) - 1);
  }
  function remainBal(principal, mr, amortMonths, paid) {
    if (amortMonths <= 0) return 0;
    if (mr === 0) return Math.max(0, principal - (principal / amortMonths) * paid);
    const pmt = amortPmt(principal, mr, amortMonths);
    return Math.max(0, principal * Math.pow(1 + mr, paid) - pmt * (Math.pow(1 + mr, paid) - 1) / mr);
  }
  function fmtD(v) { return '$' + Math.abs(v).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}); }
  function fmtN(v) { return '$' + Math.abs(v).toLocaleString('en-US', {minimumFractionDigits:0,  maximumFractionDigits:0}); }

  /* ── Core calculation ──────────────────────────────── */
  let monthlyPayment, totalInterest, totalPaid, balloonBalance = 0, balloonMonths = 0;

  if (lcCalcType === 'amort') {
    monthlyPayment = amortPmt(P, r, n);
    if (lcBalloon) {
      const bVal     = parseFloat(document.getElementById('lc-balloon-term').value) || 0;
      balloonMonths  = Math.min(Math.round(lcBalloonMode === 'yr' ? bVal * 12 : bVal), n);
      balloonBalance = remainBal(P, r, n, balloonMonths);
      totalPaid      = monthlyPayment * balloonMonths + balloonBalance;
      totalInterest  = totalPaid - P;
    } else {
      totalPaid     = monthlyPayment * n;
      totalInterest = totalPaid - P;
    }
  } else {
    /* Interest-Only */
    monthlyPayment = P * r;
    balloonBalance = P; /* full principal always owed */
    if (lcBalloon) {
      const bVal    = parseFloat(document.getElementById('lc-balloon-term').value) || 0;
      balloonMonths = Math.min(Math.round(lcBalloonMode === 'yr' ? bVal * 12 : bVal), n);
    } else {
      balloonMonths = n;
    }
    totalInterest = monthlyPayment * balloonMonths;
    totalPaid     = totalInterest + balloonBalance;
  }

  /* ── Results HTML ──────────────────────────────────── */
  const showBalloon = lcBalloon || lcCalcType === 'io';
  const typeLabel   = lcCalcType === 'amort' ? 'Amortization (P&I)' : 'Interest-Only';

  let html = '<div style="border:1px solid var(--border);padding:16px 18px;background:rgba(0,0,0,0.15);border-radius:8px;margin-bottom:14px;">';
  html += '<div class="ctc-header" style="margin-bottom:10px;">' + typeLabel + ' Results</div>';

  html += `<div class="result-row key"><span class="result-label">Monthly Payment</span><span class="result-value good">${fmtD(monthlyPayment)}/mo</span></div>`;

  if (lcCalcType === 'io') {
    html += `<div class="result-row"><span class="result-label">Annual Interest Cost</span><span class="result-value">${fmtN(monthlyPayment * 12)}/yr</span></div>`;
    html += `<div class="result-row"><span class="result-label">Principal Balance (zero paydown)</span><span class="result-value bad">${fmtN(P)} — unchanged every month</span></div>`;
  }

  if (showBalloon) {
    html += `<div class="result-row key"><span class="result-label">Balloon Payment Due · ${balloonMonths} months</span><span class="result-value bad">${fmtN(balloonBalance)}</span></div>`;
  }

  html += `<div class="result-row"><span class="result-label">Total Interest Paid${showBalloon ? ' (before balloon)' : ''}</span><span class="result-value warn">${fmtN(totalInterest)}</span></div>`;
  html += `<div class="result-row key"><span class="result-label">Total Cash Out${showBalloon ? ' (payments + balloon)' : ''}</span><span class="result-value">${fmtN(totalPaid)}</span></div>`;

  /* Equity milestones for standard amortization */
  if (lcCalcType === 'amort' && !lcBalloon && n >= 60) {
    const eq5  = P - remainBal(P, r, n, 60);
    html += `<div class="result-row"><span class="result-label">Principal Paid Down — 5 years</span><span class="result-value gr">${fmtN(eq5)}</span></div>`;
  }
  if (lcCalcType === 'amort' && !lcBalloon && n >= 120) {
    const eq10 = P - remainBal(P, r, n, 120);
    html += `<div class="result-row"><span class="result-label">Principal Paid Down — 10 years</span><span class="result-value gr">${fmtN(eq10)}</span></div>`;
  }

  html += '</div>';
  resultsEl.innerHTML = html;

  /* ── Side-by-side comparison ───────────────────────── */
  function compRow(label, pmt, intPaid, cost, balloon, isYourTerm) {
    const cls = isYourTerm ? ' class="key"' : '';
    return `<tr${cls}><td class="hl">${label}</td><td class="mu">${fmtD(pmt)}/mo</td><td class="warn">${fmtN(intPaid)}</td><td>${fmtN(cost)}</td><td class="${balloon === 'None' ? 'gr' : 'rd'}">${balloon}</td></tr>`;
  }

  const pmt30 = amortPmt(P, r, 360);
  const pmt15 = amortPmt(P, r, 180);
  const pmtN  = amortPmt(P, r, n);
  const pmtIO = P * r;

  let compHtml = '<div class="section-title sm" style="margin-top:4px;"><div class="dot"></div>Side-by-Side Comparison — Same Loan Amount &amp; Rate</div>';
  compHtml += '<table class="data-table mb-14"><thead><tr><th>Scenario</th><th>Monthly</th><th>Total Interest</th><th>Total Cost</th><th>Balloon</th></tr></thead><tbody>';

  compHtml += compRow('Amortized · 30 yr (standard)',              pmt30, pmt30 * 360 - P, pmt30 * 360, 'None',              false);
  compHtml += compRow('Amortized · 15 yr',                         pmt15, pmt15 * 180 - P, pmt15 * 180, 'None',              false);

  const termLabel = lcTermMode === 'yr' ? termVal + ' yr' : n + ' mo';
  if (n !== 360 && n !== 180) {
    compHtml += compRow('Amortized · ' + termLabel + ' ✦ your term', pmtN, pmtN * n - P,   pmtN * n,   'None',              true);
  }

  const io24Int = pmtIO * 24;
  compHtml += compRow('Interest-Only · 2 yr balloon (private)',    pmtIO, io24Int,           io24Int + P, fmtN(P) + ' at 24 mo', false);

  const io60Int = pmtIO * 60;
  compHtml += compRow('Interest-Only · 5 yr balloon (bridge)',     pmtIO, io60Int,           io60Int + P, fmtN(P) + ' at 5 yr',  false);

  compHtml += '</tbody></table>';
  compHtml += `<div class="sources">All scenarios use the loan amount (${fmtN(P)}) and rate (${annRate}%/yr) entered above. ✦ marks your exact inputs. Comparison rows show standard reference terms.</div>`;

  comparisonEl.innerHTML = compHtml;
}
