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

  /* 1b — Light/Dark theme toggle.
   *      The no-FOUC head script already set data-theme before paint; here we
   *      just inject the control and keep it in sync. Default theme is dark. */
  if (!window.__setTheme) {
    window.__setTheme = function (t) {
      document.documentElement.setAttribute('data-theme', t);
      try { localStorage.setItem('pmh-theme', t); } catch (e) {}
      const btn = document.querySelector('.theme-toggle');
      if (btn) {
        const light = t === 'light';
        btn.innerHTML = light
          ? '<span class="ic">☾</span> DARK'
          : '<span class="ic">☀</span> LIGHT';
        btn.setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode');
      }
    };
    window.__toggleTheme = function () {
      const cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
      window.__setTheme(cur === 'light' ? 'dark' : 'light');
    };
  }
  const themeBtn = document.createElement('button');
  themeBtn.type = 'button';
  themeBtn.className = 'theme-toggle';
  themeBtn.addEventListener('click', window.__toggleTheme);
  const badgeBox = document.querySelector('.badges');
  if (badgeBox) badgeBox.insertBefore(themeBtn, badgeBox.firstChild);
  else nav.appendChild(themeBtn);
  /* paint the correct label for the current theme */
  window.__setTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');

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
          '<option value="seller">Seller Finance — Flexible terms · No PMI/MIP · Balloon typical</option>' +
        '</select>' +
        '<div class="hint">Conventional: PMI (0.48%/yr) kicks in automatically when DP &lt; 20% and drops at 80% LTV &nbsp;·&nbsp; ' +
        'FHA: monthly MIP never drops if &lt;10% down &nbsp;·&nbsp; Rates: Movement Mortgage, May 2026 &nbsp;·&nbsp; ' +
        'Seller Finance: No PMI/MIP regardless of down payment &nbsp;·&nbsp; Balloon due date typical</div>';
      dpRow.insertAdjacentElement('afterend', row);

      // Seller Finance hidden input rows (shown only when loan_type === 'seller')
      const sfAmortRow = document.createElement('div');
      sfAmortRow.className = 'input-row';
      sfAmortRow.id = 'sf-amort-row';
      sfAmortRow.style.display = 'none';
      sfAmortRow.innerHTML =
        '<label>Amortization Period (yrs)</label>' +
        '<input type="number" id="sf-amort" value="30" oninput="calc()">' +
        '<div class="hint">Full amortization schedule length — P&amp;I payment is based on this</div>';

      const sfBalloonRow = document.createElement('div');
      sfBalloonRow.className = 'input-row';
      sfBalloonRow.id = 'sf-balloon-row';
      sfBalloonRow.style.display = 'none';
      sfBalloonRow.innerHTML =
        '<label>Balloon Due After (yrs) — 0 = fully amortized</label>' +
        '<input type="number" id="sf-balloon" value="5" oninput="calc()">' +
        '<div class="hint">Remaining balance due in full at this year — must refinance or sell to exit</div>';

      row.insertAdjacentElement('afterend', sfAmortRow);
      sfAmortRow.insertAdjacentElement('afterend', sfBalloonRow);
    }
  }

  /* 2a — Number-of-Units control (replaces the duplex/triplex/quad dropdown)
   *      Lets the user model any unit count. 5+ units flips the calculator
   *      into commercial mode: 25% down default, ~25-yr amortization,
   *      ≥1.25× DSCR target, and FHA/residential-conventional gated out. */
  const ptypeSel = document.getElementById('ptype');
  if (ptypeSel) {
    const ptypeRow   = ptypeSel.closest('.input-row');
    const startUnits = ptypeSel.value === 'triplex' ? 3 : ptypeSel.value === 'quad' ? 4 : 2;
    ptypeSel.style.display = 'none';

    if (ptypeRow) {
      const lbl = ptypeRow.querySelector('label');
      if (lbl) lbl.textContent = 'Number of Units';

      const wrap = document.createElement('div');
      wrap.innerHTML =
        '<input type="number" id="unitcount" min="1" step="1" value="' + startUnits + '" oninput="onUnitsChange()">' +
        '<div style="display:flex;gap:5px;margin-top:6px;flex-wrap:wrap;">' +
          '<button type="button" class="toggle-btn" style="flex:1;min-width:58px;padding:5px 4px;font-size:11px;" onclick="setUnits(2)">Duplex</button>' +
          '<button type="button" class="toggle-btn" style="flex:1;min-width:58px;padding:5px 4px;font-size:11px;" onclick="setUnits(3)">Triplex</button>' +
          '<button type="button" class="toggle-btn" style="flex:1;min-width:58px;padding:5px 4px;font-size:11px;" onclick="setUnits(4)">Quad</button>' +
          '<button type="button" class="toggle-btn" style="flex:1;min-width:58px;padding:5px 4px;font-size:11px;" onclick="setUnits(5)">5+ Comm.</button>' +
        '</div>' +
        '<div class="hint">2–4 units = residential financing &nbsp;·&nbsp; 5+ units = commercial</div>' +
        '<div class="hint" id="commercial-note" style="display:none;color:var(--gold-light);margin-top:6px;line-height:1.5;"></div>';
      ptypeRow.appendChild(wrap);
    }

    // Commercial amortization field — shown only in commercial mode (after the Interest Rate row)
    const rateEl = document.getElementById('rate');
    if (rateEl && rateEl.closest('.input-row')) {
      const commRow = document.createElement('div');
      commRow.className = 'input-row';
      commRow.id = 'comm-amort-row';
      commRow.style.display = 'none';
      commRow.innerHTML =
        '<label>Amortization (yrs) — Commercial</label>' +
        '<input type="number" id="comm-amort" value="25" oninput="calc()">' +
        '<div class="hint">Commercial loans typically amortize over 20–25 yrs (vs. 30 residential)</div>';
      rateEl.closest('.input-row').insertAdjacentElement('afterend', commRow);
    }

    // Relabel gross rent as Acquisition / In-Place, and inject a Stabilized rent field after it
    const rentEl0 = document.getElementById('rent');
    if (rentEl0 && rentEl0.closest('.input-row')) {
      const rentRow0 = rentEl0.closest('.input-row');
      const rLbl = rentRow0.querySelector('label');
      if (rLbl) rLbl.textContent = 'Acquisition / In-Place Rent ($/mo)';
      const rh = rentRow0.querySelector('.hint');
      if (rh) rh.textContent = 'Current in-place rents you buy on — drives the year-1 deal math';
      const stabRow = document.createElement('div');
      stabRow.className = 'input-row';
      stabRow.innerHTML =
        '<label>Stabilized / Market Rent ($/mo)</label>' +
        '<input type="number" id="rentstab" value="' + (parseFloat(rentEl0.value) || 0) + '" oninput="this.dataset.touched=\'1\';calc()">' +
        '<div class="hint">Post-reno / market rents — drives stabilized NOI &amp; the estimated ARV. Tracks in-place until you edit it</div>';
      rentRow0.insertAdjacentElement('afterend', stabRow);
    }

    // Set initial residential/commercial state
    applyCommercialMode(startUnits >= 5);

    /* 2b — Extended inputs: reserves · hold assumptions · refi · rent roll */
    const calcInputs = document.querySelector('.calc-inputs');
    if (calcInputs) {
      const ext = document.createElement('div');
      ext.innerHTML =
        '<div style="border-top:1px solid var(--border);margin-top:10px;padding-top:12px;">' +
          '<div class="ctc-header">Operating Detail</div>' +
          '<div class="input-row"><label>CapEx Reserve</label>' +
            '<div class="input-with-toggle">' +
              '<input type="number" id="capexreserve" value="5" oninput="calc()">' +
              '<button type="button" class="toggle-btn" id="capexres-toggle" onclick="toggleCapexRes()">% of income</button>' +
            '</div>' +
            '<div class="hint">Big-ticket sinking fund (roof/HVAC) — separate from Repairs. Toggle $/unit/yr or % of income (≈5–10% typical)</div></div>' +
          '<div class="input-row"><label>Owner-Paid Utilities ($/mo)</label>' +
            '<input type="number" id="utilities" value="0" oninput="calc()">' +
            '<div class="hint">Water/sewer/trash or common-area utilities you pay (not the tenant)</div></div>' +
        '</div>' +
        '<div style="border-top:1px solid var(--border);margin-top:10px;padding-top:12px;">' +
          '<div class="ctc-header">Hold &amp; Return Assumptions</div>' +
          '<div class="input-row"><label>Rent Growth (%/yr)</label><input type="number" id="rentgrowth" value="3" oninput="calc()"></div>' +
          '<div class="input-row"><label>Expense Growth (%/yr)</label><input type="number" id="expgrowth" value="3" oninput="calc()"></div>' +
          '<div class="input-row"><label>Appreciation (%/yr)</label><input type="number" id="appreciation" value="3" oninput="calc()"></div>' +
          '<div class="input-row"><label>Hold Period (yrs)</label><input type="number" id="holdyears" value="5" oninput="calc()"></div>' +
          '<div class="input-row"><label>Years to Stabilize</label><input type="number" id="stabyears" value="1" oninput="calc()">' +
            '<div class="hint">Years for the projection to ramp from in-place to stabilized rents (value-add only)</div></div>' +
          '<div class="input-row"><label>Selling Costs (% of sale)</label><input type="number" id="sellcost" value="6.5" oninput="calc()"></div>' +
        '</div>' +
        '<div style="border-top:1px solid var(--border);margin-top:10px;padding-top:12px;">' +
          '<div class="ctc-header">Seller Credit (optional)</div>' +
          '<div class="input-row"><label>Seller Credit ($)</label>' +
            '<input type="number" id="sellercredit" value="0" oninput="calc()">' +
            '<div class="hint">Money the seller gives at closing. Price &amp; loan don\'t change — this only lowers the cash you bring</div></div>' +
          '<div class="input-row"><label>Credit Use</label>' +
            '<button type="button" class="toggle-btn" id="sellercredit-toggle" style="width:100%;text-align:center;" onclick="toggleSellerCredit()">Escrowed for Repairs</button>' +
            '<div class="hint">Escrowed for Repairs (e.g. a sewer holdback) vs. Toward Closing Costs. Both cut cash to close; the lender limits differ</div></div>' +
        '</div>' +
        '<div style="border-top:1px solid var(--border);margin-top:10px;padding-top:12px;">' +
          '<div class="ctc-header">Rehab Financing (optional)</div>' +
          '<div class="input-row"><label>Finance the Rehab?</label>' +
            '<button type="button" class="toggle-btn" id="rehabfin-toggle" style="width:100%;text-align:center;" onclick="toggleRehabFin()">No — Rehab Paid in Cash</button>' +
            '<div class="hint">Fund rehab with a separate loan (hard money / bridge) instead of cash. Boosts cash-on-cash but adds a 2nd payment</div></div>' +
          '<div id="rehabfin-rows" style="display:none;">' +
            '<div class="input-row"><label>% of Rehab Financed</label><input type="number" id="rehabfin-pct" value="100" oninput="calc()"></div>' +
            '<div class="input-row"><label>Rehab Loan Rate (%)</label><input type="number" id="rehabfin-rate" value="10" oninput="calc()"></div>' +
            '<div class="input-row"><label>Payment Type</label>' +
              '<button type="button" class="toggle-btn" id="rehabfin-io-toggle" style="width:100%;text-align:center;" onclick="toggleRehabIO()">Interest-Only (hard money)</button>' +
              '<div class="hint">Interest-only is typical for bridge/hard-money; amortizing uses the term below</div></div>' +
            '<div class="input-row" id="rehabfin-term-row" style="display:none;"><label>Rehab Loan Amortization (yrs)</label><input type="number" id="rehabfin-term" value="20" oninput="calc()"></div>' +
          '</div>' +
        '</div>' +
        '<div style="border-top:1px solid var(--border);margin-top:10px;padding-top:12px;">' +
          '<div class="ctc-header">Refinance / BRRRR Exit (optional)</div>' +
          '<div class="input-row"><label>Refinance after stabilizing?</label>' +
            '<button type="button" class="toggle-btn" id="willrefi-toggle" style="width:100%;text-align:center;" onclick="toggleWillRefi()">Yes — refinance (BRRRR)</button>' +
            '<div class="hint">Yes = pull cash out with a new loan once stabilized (BRRRR). No = buy &amp; hold on the original financing — the Stabilized Deal section is then your after-stabilization return</div></div>' +
          '<div id="refi-rows">' +
            '<div class="input-row"><label>Market Cap Rate — for ARV (%)</label>' +
              '<input type="number" id="arvcaprate" value="8" oninput="calc()">' +
              '<div class="hint">Estimated ARV = stabilized NOI ÷ this cap rate. Bump Stabilized Rent above to trigger it</div></div>' +
            '<div class="input-row"><label>ARV — manual override ($)</label>' +
              '<input type="number" id="arv" value="0" oninput="this.dataset.touched=\'1\';calc()">' +
              '<div class="hint">Leave 0 to use the estimate; enter a number (e.g. comp-based) to override it</div></div>' +
            '<div class="input-row"><label>Refi LTV (%)</label><input type="number" id="refiltv" value="75" oninput="calc()"></div>' +
            '<div class="input-row"><label>Refi Rate (%)</label><input type="number" id="refirate" value="7.5" oninput="calc()"></div>' +
            '<div class="input-row"><label>Refi Amortization (yrs)</label><input type="number" id="refiamort" value="30" oninput="this.dataset.touched=\'1\';calc()">' +
              '<div class="hint">Defaults to your acquisition amortization until you change it</div></div>' +
            '<div class="input-row"><label>Refinance at Year</label><input type="number" id="refiyear" value="1" min="0" step="1" oninput="calc()">' +
              '<div class="hint">Years after purchase before you refinance (seasoning + stabilization). Waiting longer pays the acquisition loan down more, so a bit more cash comes out</div></div>' +
          '</div>' +
        '</div>' +
        '<div style="border-top:1px solid var(--border);margin-top:10px;padding-top:12px;">' +
          '<div class="ctc-header">Rent Roll / Unit Mix (optional)</div>' +
          '<div id="rr-rows"></div>' +
          '<div style="display:flex;gap:6px;align-items:center;margin:6px 0;">' +
            '<button type="button" class="toggle-btn" style="padding:5px 10px;" onclick="rrAddRow()">+ Add unit type</button>' +
            '<span class="hint" style="margin:0;">Total <strong id="rr-total">$0</strong> · <strong id="rr-units">0</strong> units</span>' +
          '</div>' +
          '<div style="display:flex;gap:6px;">' +
            '<button type="button" class="toggle-btn" style="flex:1;text-align:center;" onclick="rrApply(\'acq\')">→ Acquisition</button>' +
            '<button type="button" class="toggle-btn" style="flex:1;text-align:center;" onclick="rrApply(\'stab\')">→ Stabilized</button>' +
          '</div>' +
          '<div class="hint">Build the unit mix, then send the total to Acquisition (in-place) or Stabilized (market) rents &amp; unit count</div>' +
        '</div>' +
        '<div style="border-top:1px solid var(--border);margin-top:10px;padding-top:12px;">' +
          '<button type="button" class="toggle-btn" style="width:100%;text-align:center;padding:9px;" onclick="exportCalcXLSX()">⬇ Export Deal Sheet (Excel)</button>' +
          '<div class="hint">Styled .xlsx with every active input &amp; result — opens in Excel, Google Sheets, or Numbers</div>' +
        '</div>';
      calcInputs.appendChild(ext);

      const rrRows = document.getElementById('rr-rows');
      if (rrRows) { rrRows.innerHTML = rrRowHTML(startUnits, Math.round(perUnitRent())); rrSum(); }
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

      /* SELLER FINANCE — full-width card */
      '<div class="strategy-card mb-14"><div class="s-stripe" style="background:#8b7cc8;"></div>' +
      '<div class="s-label">Loan Type 5 — Creative Finance</div>' +
      '<div class="s-title">Seller Finance</div>' +
      '<div class="s-trigger">Best for: <span>Buyers who can\'t qualify conventionally · Sellers who want income stream · Low/no-down creative deals · Off-market negotiations</span></div>' +
      '<div class="s-metrics">' +
        '<div>Min Down: <span>0% possible — seller sets terms, no PMI/MIP at any LTV</span></div>' +
        '<div>Rate (typical): <span>6–9% — seller charges a premium for providing financing</span></div>' +
        '<div>Amortization: <span>Typically 20–30 yr schedule · 3–7 yr balloon payment</span></div>' +
        '<div>PMI / MIP: <span>None — ever, regardless of down payment</span></div>' +
        '<div>Income Docs: <span>Seller sets requirements — no bank underwriting</span></div>' +
        '<div>Structure: <span>Purchase Money Mortgage (buyer gets deed · seller holds lien) — preferred in PA</span></div>' +
      '</div>' +
      '<div class="s-note"><strong>✅ Pros:</strong> No PMI or MIP at any down payment — even 0% down. Flexible terms negotiated directly with seller. Faster close. Installment sale tax benefit for seller incentivizes participation. Works when conventional lenders decline the property or borrower profile.<br><br>' +
      '<strong>⚠️ Cons:</strong> Balloon payment (typically 5–7 yrs) means you <em>must</em> refinance, sell, or pay off — have an exit plan before you buy. Rate is usually above market. Requires a PA real estate attorney and properly recorded Purchase Money Mortgage. ' +
      'Dodd-Frank ability-to-repay rules apply for owner-occupied 1–4 unit properties — seller must verify income and can only do 3 seller-financed deals/yr without an MLO license. ' +
      'Use Purchase Money Mortgage (not Land Contract) for buyer protection in PA.</div>' +
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
          '<tr><td class="hl">Seller Finance</td><td>0–20% (seller sets)</td><td class="mu">6–9% (above market)</td><td class="gr">None — ever</td><td class="gr">No (investment-friendly)</td><td class="mu">Creative deals · off-market · buyers who can\'t qualify conventionally · balloon in 3–7 yrs</td></tr>' +
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
      '<div id="lc-schedule"></div>' +
      '<div id="lc-comparison"></div>' +
      '</div>';

    panel.insertAdjacentElement('afterend', lcPanel);

    /* Auto-run loan calc once all scripts have loaded */
    setTimeout(function () { if (typeof runLoanCalc === 'function') runLoanCalc(); }, 0);
  }

})();

let insMode      = 'yr';
let otherMode    = 'pct';
let pmManaged    = true;
let capexResMode = 'pct';    /* 'unit' = $/unit/yr · 'pct' = % of gross income (default 5%) */
let sellerCreditMode = 'repairs';  /* 'repairs' = escrowed repair holdback · 'closing' = toward closing costs */
let rehabFinanced = false;   /* finance rehab with a separate loan instead of cash */
let rehabIO       = true;    /* rehab loan interest-only (hard-money) vs amortizing */
let willRefi      = true;    /* true = BRRRR (pull cash out once stabilized) · false = buy & hold on original financing */

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

/* ─── Unit count / commercial mode ────────────────────────── */
let _prevCommercial = false;

function getUnits() {
  const el = document.getElementById('unitcount');
  if (el) { const n = parseInt(el.value, 10); if (n >= 1) return n; }
  const pt = document.getElementById('ptype');
  const v = pt ? pt.value : 'duplex';
  return v === 'triplex' ? 3 : v === 'quad' ? 4 : 2;
}

function perUnitRent() {
  const d = (window.PLAYBOOK_CONFIG || {}).rentDefaults || {};
  return d.perUnit || (d.duplex ? d.duplex / 2 : 1000);
}

function unitsRentDefault(units) {
  const d = (window.PLAYBOOK_CONFIG || {}).rentDefaults || {};
  if (units === 2 && d.duplex)  return d.duplex;
  if (units === 3 && d.triplex) return d.triplex;
  if (units === 4 && d.quad)    return d.quad;
  return Math.round(units * perUnitRent());
}

function setUnits(n) {
  const el = document.getElementById('unitcount');
  if (el) el.value = n;
  onUnitsChange();
}

function onUnitsChange() {
  const units = getUnits();
  const isCommercial = units >= 5;
  const rentEl = document.getElementById('rent');
  if (rentEl) rentEl.value = unitsRentDefault(units);
  // On first crossing into commercial, default down payment up to 25%
  const dp = document.getElementById('dp');
  if (isCommercial && !_prevCommercial && dp && (parseFloat(dp.value) || 0) < 25) {
    dp.value = 25;
  }
  _prevCommercial = isCommercial;
  applyCommercialMode(isCommercial);
  calc();
}

/* Toggle residential vs. commercial UI: amortization field, loan-type
 * gating (FHA & residential conventional cap at 4 units), and the note. */
function applyCommercialMode(isCommercial) {
  const lt = document.getElementById('loan_type');
  const sellerSelected = lt && lt.value === 'seller';

  const commRow = document.getElementById('comm-amort-row');
  if (commRow) commRow.style.display = (isCommercial && !sellerSelected) ? '' : 'none';

  if (lt) {
    const convOpt = lt.querySelector('option[value="conv"]');
    const fhaOpt  = lt.querySelector('option[value="fha"]');
    const dscrOpt = lt.querySelector('option[value="dscr"]');
    if (convOpt) convOpt.disabled = isCommercial;
    if (fhaOpt)  fhaOpt.disabled  = isCommercial;
    if (dscrOpt) dscrOpt.textContent = isCommercial
      ? 'DSCR / Commercial — Investor loan · 25%+ down · No PMI'
      : 'DSCR — Investor loan · 20%+ down · No PMI';
    // If a now-invalid residential type is selected, switch to DSCR/commercial
    if (isCommercial && (lt.value === 'conv' || lt.value === 'fha')) {
      lt.value = 'dscr';
      const rateEl = document.getElementById('rate');
      if (rateEl) rateEl.value = 8.50;
      const dpEl = document.getElementById('dp');
      if (dpEl && (parseFloat(dpEl.value) || 0) < 25) dpEl.value = 25;
    }
  }

  const note = document.getElementById('commercial-note');
  if (note) {
    note.style.display = isCommercial ? '' : 'none';
    if (isCommercial) {
      note.innerHTML = '🏢 <strong>Commercial (5+ units):</strong> financed as a commercial/DSCR loan — FHA &amp; residential conventional don’t apply above 4 units. 25% down typical, ~25-yr amortization, lenders want ≥1.25× DSCR. Value is driven by NOI ÷ cap rate, not residential comps.';
    }
  }
}

/* ─── Investment math helpers (pro forma · max offer · refi) ─── */
function pmtFromLoan(loanAmt, monthlyRate, nMonths) {
  if (nMonths <= 0 || loanAmt <= 0) return 0;
  if (monthlyRate <= 0) return loanAmt / nMonths;
  return loanAmt * (monthlyRate * Math.pow(1 + monthlyRate, nMonths)) / (Math.pow(1 + monthlyRate, nMonths) - 1);
}

function loanFromPmt(payment, monthlyRate, nMonths) {
  if (nMonths <= 0 || payment <= 0) return 0;
  if (monthlyRate <= 0) return payment * nMonths;
  return payment * (Math.pow(1 + monthlyRate, nMonths) - 1) / (monthlyRate * Math.pow(1 + monthlyRate, nMonths));
}

function remainingBalance(loanAmt, monthlyRate, nMonths, monthsPaid) {
  if (loanAmt <= 0 || monthsPaid <= 0) return Math.max(0, loanAmt);
  if (monthsPaid >= nMonths) return 0;
  if (monthlyRate <= 0) return Math.max(0, loanAmt - (loanAmt / nMonths) * monthsPaid);
  const p = pmtFromLoan(loanAmt, monthlyRate, nMonths);
  const bal = loanAmt * Math.pow(1 + monthlyRate, monthsPaid) - p * (Math.pow(1 + monthlyRate, monthsPaid) - 1) / monthlyRate;
  return Math.max(0, bal);
}

/* IRR via bisection on annual cashflows; returns % (number) or null if none. */
function irr(cashflows) {
  function npv(rate) {
    let v = 0;
    for (let i = 0; i < cashflows.length; i++) v += cashflows[i] / Math.pow(1 + rate, i);
    return v;
  }
  let lo = -0.9999, hi = 1.0, flo = npv(lo), fhi = npv(hi), tries = 0;
  while (flo * fhi > 0 && hi < 1000 && tries < 80) { hi *= 1.5; fhi = npv(hi); tries++; }
  if (flo * fhi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2, fmid = npv(mid);
    if (Math.abs(fmid) < 0.01) return mid * 100;
    if (flo * fmid < 0) { hi = mid; fhi = fmid; } else { lo = mid; flo = fmid; }
  }
  return ((lo + hi) / 2) * 100;
}

/* ─── Rent roll / unit-mix builder ────────────────────────── */
function rrRowHTML(count, rent, type) {
  type = type || '2/1';
  const opts = ['Studio', '1/1', '2/1', '2/2', '3/1', '3/2', '4/2']
    .map(function (t) { return '<option' + (t === type ? ' selected' : '') + '>' + t + '</option>'; }).join('');
  return '<div class="rr-row" style="display:flex;gap:5px;align-items:center;margin-bottom:5px;">' +
    '<select class="rr-type" onchange="rrSum()" style="width:62px;" title="unit type (bed/bath)">' + opts + '</select>' +
    '<input type="number" class="rr-count" min="0" step="1" value="' + count + '" oninput="rrSum()" style="width:46px;" title="# of units">' +
    '<span style="color:var(--text-muted);">×</span>' +
    '<input type="number" class="rr-rent" min="0" value="' + rent + '" oninput="rrSum()" style="flex:1;min-width:58px;" title="rent each ($/mo)">' +
    '<button type="button" class="toggle-btn" style="padding:4px 9px;" onclick="rrRemoveRow(this)">−</button>' +
  '</div>';
}

function rrAddRow() {
  const rows = document.getElementById('rr-rows');
  if (!rows) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = rrRowHTML(1, Math.round(perUnitRent()));
  rows.appendChild(tmp.firstChild);
  rrSum();
}

function rrRemoveRow(btn) {
  const row = btn.closest('.rr-row');
  if (row) row.remove();
  rrSum();
}

function rrSum() {
  const rows = document.querySelectorAll('#rr-rows .rr-row');
  let totalRent = 0, totalUnits = 0;
  rows.forEach(function (r) {
    const c = parseInt(r.querySelector('.rr-count').value, 10) || 0;
    const rt = parseFloat(r.querySelector('.rr-rent').value) || 0;
    totalRent += c * rt; totalUnits += c;
  });
  const tEl = document.getElementById('rr-total');
  const uEl = document.getElementById('rr-units');
  if (tEl) tEl.textContent = '$' + totalRent.toLocaleString('en-US');
  if (uEl) uEl.textContent = totalUnits;
  return { totalRent: totalRent, totalUnits: totalUnits };
}

/* Apply the rent roll total + unit count to either the Acquisition (in-place)
 * or Stabilized (market) rent field. target = 'acq' | 'stab'. */
function rrApply(target) {
  const s = rrSum();
  if (s.totalUnits <= 0) return;
  const uc = document.getElementById('unitcount');
  if (uc) uc.value = s.totalUnits;
  if (target === 'stab') {
    const rs = document.getElementById('rentstab');
    if (rs) { rs.value = s.totalRent; rs.dataset.touched = '1'; }
  } else {
    const rentEl = document.getElementById('rent');
    if (rentEl) rentEl.value = s.totalRent;
  }
  const isCommercial = s.totalUnits >= 5;
  const dp = document.getElementById('dp');
  if (isCommercial && !_prevCommercial && dp && (parseFloat(dp.value) || 0) < 25) dp.value = 25;
  _prevCommercial = isCommercial;
  applyCommercialMode(isCommercial);
  calc();
}

/* CapEx reserve toggle: $/unit/yr ↔ % of gross income (keeps the $ amount ~constant) */
function toggleCapexRes() {
  const btn = document.getElementById('capexres-toggle');
  const inp = document.getElementById('capexreserve');
  const cur = parseFloat(inp.value) || 0;
  const units = getUnits();
  const gi = (parseFloat((document.getElementById('rent') || {}).value) || 0) +
             (parseFloat((document.getElementById('other_income') || {}).value) || 0);
  if (capexResMode === 'unit') {
    capexResMode = 'pct';
    const monthly = units * cur / 12;
    inp.value = gi > 0 ? Number((monthly / gi * 100).toFixed(2)) : 0;
    btn.textContent = '% of income';
  } else {
    capexResMode = 'unit';
    const monthly = gi * cur / 100;
    inp.value = units > 0 ? Math.round(monthly * 12 / units) : 0;
    btn.textContent = '$/unit/yr';
  }
  calc();
}

/* Seller credit use: escrowed for repairs ↔ toward closing costs (drives which lender limit applies) */
function toggleSellerCredit() {
  sellerCreditMode = sellerCreditMode === 'repairs' ? 'closing' : 'repairs';
  const btn = document.getElementById('sellercredit-toggle');
  if (btn) btn.textContent = sellerCreditMode === 'repairs' ? 'Escrowed for Repairs' : 'Toward Closing Costs';
  calc();
}

/* Acquisition loan amortization (yrs) — what the refi defaults to until changed */
function acqAmortYears() {
  const lt = (document.getElementById('loan_type') || {}).value;
  if (lt === 'seller') return parseFloat((document.getElementById('sf-amort') || {}).value) || 30;
  if (getUnits() >= 5)  return parseFloat((document.getElementById('comm-amort') || {}).value) || 25;
  return 30;
}

function syncRefiAmort() {
  const r = document.getElementById('refiamort');
  if (r && r.dataset.touched !== '1') r.value = acqAmortYears();
}

/* BRRRR vs. buy-and-hold: hide the refi detail inputs + exit section when off */
function toggleWillRefi() {
  willRefi = !willRefi;
  const btn  = document.getElementById('willrefi-toggle');
  const rows = document.getElementById('refi-rows');
  if (btn)  btn.textContent = willRefi ? 'Yes — refinance (BRRRR)' : 'No — buy & hold';
  if (rows) rows.style.display = willRefi ? '' : 'none';
  calc();
}

function syncStabRent() {
  const rs = document.getElementById('rentstab');
  const r  = document.getElementById('rent');
  if (rs && r && rs.dataset.touched !== '1') rs.value = r.value;
}

/* Rehab financing toggles */
function toggleRehabFin() {
  rehabFinanced = !rehabFinanced;
  const btn  = document.getElementById('rehabfin-toggle');
  const rows = document.getElementById('rehabfin-rows');
  if (btn)  btn.textContent = rehabFinanced ? 'Yes — Rehab Financed (separate loan)' : 'No — Rehab Paid in Cash';
  if (rows) rows.style.display = rehabFinanced ? '' : 'none';
  calc();
}

function toggleRehabIO() {
  rehabIO = !rehabIO;
  const btn     = document.getElementById('rehabfin-io-toggle');
  const termRow = document.getElementById('rehabfin-term-row');
  if (btn)     btn.textContent = rehabIO ? 'Interest-Only (hard money)' : 'Amortizing';
  if (termRow) termRow.style.display = rehabIO ? 'none' : '';
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
  const commercial = getUnits() >= 5;
  if      (lt === 'conv')   { rate.value = 6.875; }
  else if (lt === 'fha')    { rate.value = 6.125; dp.value = 3.5; }
  else if (lt === 'dscr')   { rate.value = 8.50;  dp.value = commercial ? 25 : 20; }
  else if (lt === 'cash')   { rate.value = 0;     dp.value = 100; }
  else if (lt === 'seller') { rate.value = 7.5;   dp.value = 10;  }
  // Show/hide seller finance rows
  const sfAmortRow   = document.getElementById('sf-amort-row');
  const sfBalloonRow = document.getElementById('sf-balloon-row');
  if (sfAmortRow)   sfAmortRow.style.display   = lt === 'seller' ? '' : 'none';
  if (sfBalloonRow) sfBalloonRow.style.display = lt === 'seller' ? '' : 'none';
  applyCommercialMode(commercial);
  calc();
}

/* ─── DEFERRED / future calculator work (not yet built) ───────
 * Tier 3 additions (reviewed, intentionally not built yet):
 *   • Depreciation / after-tax cash flow — 27.5-yr residential vs 39-yr
 *     commercial straight-line shield, after-tax CoC.
 *   • Allegheny reassessment toggle — show tax on current assessment vs.
 *     post-sale reassessment ("newcomer tax"); calc currently models the
 *     post-sale basis only (CLR × purchase price).
 *   • Sensitivity mini-grid — cash flow / DSCR across a price or rent range.
 * Methodology fixes (left as-is to preserve existing tier calibrations):
 *   • EGI definition mismatch — Rents-tab tables subtract vacancy + 2%
 *     credit loss; calc() subtracts vacancy only. Reconcile (e.g. add a
 *     credit-loss input) before relying on either as authoritative.
 *   • Repairs & "Other" are computed off GROSS rent, not EGI.
 * ───────────────────────────────────────────────────────────── */

/* ─── Main calculator ─────────────────────────────────────── */
function calc() {
  const cfg = window.PLAYBOOK_CONFIG;
  syncRefiAmort();   // keep refi amortization matched to acquisition until user overrides
  syncStabRent();    // keep stabilized rent tracking in-place rent until user overrides

  const units            = getUnits();
  const isCommercial     = units >= 5;
  const dscrMin          = isCommercial ? 1.25 : 1.20;
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
  // Seller finance: use custom amort period; all others: standard 30-yr (360 mo)
  const sfAmortYrs   = parseFloat((document.getElementById('sf-amort')  || {}).value) || 30;
  const commAmortYrs = parseFloat((document.getElementById('comm-amort') || {}).value) || 25;
  const amortMonths  = loanType === 'seller' ? sfAmortYrs * 12
                     : isCommercial          ? commAmortYrs * 12
                     : 360;
  const pi   = isCash ? 0
             : (mr > 0 ? loan * (mr * Math.pow(1 + mr, amortMonths)) / (Math.pow(1 + mr, amortMonths) - 1) : 0);

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

  // Seller Finance — balloon balance (remaining principal at balloon date)
  let balloonBalance = 0;
  let sfBalloonYrs   = 0;
  if (loanType === 'seller') {
    sfBalloonYrs = parseFloat((document.getElementById('sf-balloon') || {}).value) || 0;
    if (sfBalloonYrs > 0 && loan > 0 && pi > 0) {
      const bMo = sfBalloonYrs * 12;
      balloonBalance = mr > 0
        ? Math.max(0, loan * Math.pow(1 + mr, bMo) - pi * (Math.pow(1 + mr, bMo) - 1) / mr)
        : Math.max(0, loan - (loan / amortMonths) * bMo);
    }
  }

  // Rehab financing — separate loan (hard money / bridge) instead of cash
  const rehabFinPct = rehabFinanced ? (parseFloat((document.getElementById('rehabfin-pct') || {}).value) || 0) / 100 : 0;
  const rehabLoan   = rehab * rehabFinPct;
  const rehabRateMo = (parseFloat((document.getElementById('rehabfin-rate') || {}).value) || 0) / 100 / 12;
  const rehabTermYr = parseFloat((document.getElementById('rehabfin-term') || {}).value) || 20;
  const rehabPI     = rehabLoan > 0
    ? (rehabIO ? rehabLoan * rehabRateMo : pmtFromLoan(rehabLoan, rehabRateMo, rehabTermYr * 12))
    : 0;

  // Tax — location-specific via config (CLR × mill rate)
  const assessedVal = pp * cfg.clr;
  const monthlyTax  = assessedVal * (cfg.mills / 1000) / 12;

  // Income & expenses
  const grossIncome      = rentGross + otherIncome;
  const egi              = grossIncome * (1 - vacPct / 100);
  const pmFee            = egi * (pmPct / 100);
  const capexResRaw         = parseFloat((document.getElementById('capexreserve') || {}).value) || 0;
  const capexReserveMonthly = capexResMode === 'pct' ? grossIncome * capexResRaw / 100 : units * capexResRaw / 12;
  const utilitiesMonthly    = parseFloat((document.getElementById('utilities') || {}).value) || 0;
  const totalExp         = monthlyTax + insMonthly + capexMonthly + otherMonthly + pmFee + pmiMonthly + capexReserveMonthly + utilitiesMonthly;
  const operatingExpPct  = egi > 0 ? totalExp / egi * 100 : 0;
  const noi              = egi - totalExp;
  const noi_yr           = noi * 12;
  const capRate          = pp > 0 ? (noi_yr / pp * 100) : 0;
  const cf               = noi - pi - rehabPI;

  // Returns — financed rehab leaves Cash to Close; rehab loan adds to debt service
  const closingCostAmt   = pp * closingCostPct / 100;
  // Seller credit: purchase price & loan are unchanged — it just reduces the cash you bring.
  const sellerCredit     = parseFloat((document.getElementById('sellercredit') || {}).value) || 0;
  const cashBeforeCredit = dp + closingCostAmt + (rehab - rehabLoan) + fhaUpfrontMip;
  const creditApplied    = Math.max(0, Math.min(sellerCredit, cashBeforeCredit)); // no cash back at closing
  const creditExcess     = sellerCredit - creditApplied;                          // disallowed → should be a price cut
  const cashToClose      = cashBeforeCredit - creditApplied;
  const coc              = cashToClose > 0 ? (cf * 12 / cashToClose * 100) : 0;
  const dscr           = (pi + rehabPI) > 0 ? noi / (pi + rehabPI) : 0;
  const gsi_yr         = grossIncome * 12;                          // Gross Scheduled Income — rent + other income, before vacancy
  const grm            = rentGross > 0 ? pp / (rentGross * 12) : 0;
  const pricePerUnit   = units ? pp / units : 0;

  // ── Stabilized operations (at market rents) — value-add view ──
  const rentStab      = parseFloat((document.getElementById('rentstab') || {}).value) || rentGross;
  const isValueAdd    = Math.abs(rentStab - rentGross) > 0.5;
  const stabGross     = rentStab + otherIncome;
  const stabEGI       = stabGross * (1 - vacPct / 100);
  const stabPM        = stabEGI * (pmPct / 100);
  const stabRepairs   = rentStab * capexPct / 100;
  const stabOther     = otherMode === 'pct' ? rentStab * otherInput / 100 : otherMonthly;
  const stabCapexRes  = capexResMode === 'pct' ? stabGross * capexResRaw / 100 : units * capexResRaw / 12;
  const stabTotalExp  = monthlyTax + insMonthly + stabPM + stabRepairs + stabOther + pmiMonthly + stabCapexRes + utilitiesMonthly;
  const stabNOI       = stabEGI - stabTotalExp;
  const stabNOI_yr    = stabNOI * 12;
  const stabCF        = stabNOI - pi - rehabPI;
  const stabCapRate   = pp > 0 ? stabNOI_yr / pp * 100 : 0;
  const stabCoC       = cashToClose > 0 ? stabCF * 12 / cashToClose * 100 : 0;
  const stabDSCR      = (pi + rehabPI) > 0 ? stabNOI / (pi + rehabPI) : 0;
  const grmStab       = rentStab > 0 ? pp / (rentStab * 12) : 0;
  const arvCapRate    = (parseFloat((document.getElementById('arvcaprate') || {}).value) || 0) / 100;
  const estimatedARV  = arvCapRate > 0 ? stabNOI_yr / arvCapRate : 0;
  const manualARV     = parseFloat((document.getElementById('arv') || {}).value) || 0;
  const arvUsed       = manualARV > 0 ? manualARV : estimatedARV;

  // Helpers
  function fmt(n)           { return '$' + Math.abs(n).toLocaleString('en-US', {minimumFractionDigits:0, maximumFractionDigits:0}); }
  function fmtPct(n)        { return n.toFixed(2) + '%'; }
  function cls(v, good, warn) { return v >= good ? 'good' : v >= warn ? 'warn' : 'bad'; }

  const insAnnual = insMode === 'yr' ? insRaw : insRaw * 12;

  const rows = [
    {l:'Purchase Price',                              v:fmt(pp),                                                   c:'',                      key:false},
    {l:'Down Payment (' + dpPct + '%)',               v:fmt(dp),                                                   c:'',                      key:false},
    ...((isCommercial && dpPct < 25) ? [{l:'⚠ Down Payment Below Commercial Min', v:'25% typical for 5+ units', c:'bad', key:true}] : []),
    {l:'Loan Amount',                                 v:fmt(loan),                                                 c:'',                      key:false},
    ...(isCommercial ? [{l:'Financing Basis', v:'Commercial · ' + commAmortYrs + '-yr amort · DSCR ≥1.25×', c:'', key:false}] : []),
    {l:'Monthly P&I',                                 v:fmt(pi) + '/mo',                                           c:'',                      key:false},
    ...(rehabPI > 0 ? [{l:'Rehab Loan ' + (rehabIO ? 'Interest' : 'P&I') + ' (' + fmt(rehabLoan) + ' @ ' + (rehabRateMo * 1200).toFixed(1) + '%' + (rehabIO ? ' IO' : '') + ')', v:fmt(rehabPI) + '/mo', c:'bad', key:false}] : []),
    {l:'Tax Estimate (CLR-modeled)',                  v:fmt(monthlyTax) + '/mo · ' + fmt(monthlyTax * 12) + '/yr', c:'',                      key:false},
    ...(pmiMonthly > 0 ? [{
      l: loanType === 'fha' ? 'FHA MIP (0.55%/yr · drops at loan payoff)' : 'PMI (0.48%/yr · drops at 80% LTV)',
      v: fmt(pmiMonthly) + '/mo · ' + fmt(pmiMonthly * 12) + '/yr',
      c: 'bad', key: false
    }] : []),
    ...(loanType === 'seller' && balloonBalance > 0 ? [{
      l: 'Balloon Balance Due — Year ' + sfBalloonYrs + ' (must refi or sell)',
      v: fmt(balloonBalance),
      c: 'bad', key: true
    }] : []),
    ...(otherIncome > 0 ? [{l:'Other Monthly Income', v:'+' + fmt(otherIncome) + '/mo',                            c:'good',                  key:false}] : []),
    {l:'Gross Scheduled Income (GSI)',                 v:fmt(grossIncome) + '/mo · ' + fmt(gsi_yr) + '/yr',        c:'',                      key:false},
    {l:'Insurance',                                   v:fmt(insMonthly) + '/mo · ' + fmt(insAnnual) + '/yr',       c:'',                      key:false},
    {l: isCash ? 'Total Fixed Monthly (Tax + Insurance)' : 'Total Monthly Payment — PITI' + (pmiMonthly > 0 ? ' + PMI/MIP' : '') + (rehabPI > 0 ? ' + Rehab' : ''),
     v: fmt(pi + rehabPI + monthlyTax + insMonthly + pmiMonthly) + '/mo',                                          c:'',                      key:true},
    {l:'Repairs & Maint. (' + capexPct + '%)',        v:fmt(capexMonthly) + '/mo',                                 c:'',                      key:false},
    {l:'Other Expenses (' + (otherMode === 'pct' ? otherInput + '%' : fmt(otherMonthly) + '/mo') + ')', v:fmt(otherMonthly) + '/mo', c:'', key:false},
    ...(capexReserveMonthly > 0 ? [{l:'CapEx Reserve (' + (capexResMode === 'pct' ? capexResRaw + '% of income' : fmt(capexResRaw) + '/unit/yr') + ')', v:fmt(capexReserveMonthly) + '/mo', c:'', key:false}] : []),
    ...(utilitiesMonthly > 0 ? [{l:'Owner-Paid Utilities', v:fmt(utilitiesMonthly) + '/mo', c:'', key:false}] : []),
    {l:pmManaged ? 'PM Fee (' + pmPct + '% of EGI)' : 'PM Fee (Self-Managed)', v:fmt(pmFee) + '/mo',  c:pmManaged ? 'bad' : 'good', key:false},
    {l:'Total Monthly Expenses',                      v:fmt(totalExp) + '/mo',                                     c:'',                      key:false},
    {l:'Operating Expense %',                         v:fmtPct(operatingExpPct) + ' of EGI',                       c:'',                      key:true},
    ...((operatingExpPct > 0 && operatingExpPct < 35) ? [{l:'⚠ OpEx Ratio Low', v:'<35% of EGI — likely under-budgeted', c:'bad', key:true}] : []),
    {l:'NOI (before debt service)',                   v:(noi < 0 ? '-' : '') + fmt(noi) + '/mo',                  c:cls(noi, 0, -1),         key:false},
    {l:'Monthly Cash Flow',                           v:(cf < 0 ? '-' : '') + fmt(cf) + '/mo',                    c:cls(cf, 150 * units, 0), key:true},
    {l:'Annual Cash Flow',                            v:(cf * 12 < 0 ? '-' : '') + fmt(cf * 12) + '/yr',          c:cls(cf * 12, 1800 * units, 0), key:false},
    {l:'Cap Rate (' + (pmManaged ? 'PM-adjusted' : 'Self-managed') + ')', v:fmtPct(capRate),           c:cls(capRate, 8, 6.5),    key:true},
    {l:'Cash-on-Cash Return',                         v:fmtPct(coc),                                               c:cls(coc, 7, 4),          key:true},
    {l:'DSCR' + (isCommercial ? ' (commercial ≥1.25×)' : ''), v:dscr.toFixed(2) + 'x',                            c:cls(dscr, dscrMin, isCommercial ? 1.05 : 1.0), key:true},
    {l:'Price Per Unit',                              v:fmt(pricePerUnit),                                         c:'',                      key:false},
    {l:'Gross Rent Multiplier',                       v:grm.toFixed(1) + 'x (target ≤10)',                        c:grm <= 10 ? 'good' : grm <= 12 ? 'warn' : 'bad', key:false}
  ];

  let html = rows.map(r =>
    `<div class="result-row${r.key ? ' key' : ''}"><span class="result-label">${r.l}</span><span class="result-value ${r.c}">${r.v}</span></div>`
  ).join('');

  // Verdict
  let verdict = '', color = '';
  if (capRate >= 8 && coc >= 7 && dscr >= dscrMin && cf >= 150 * units) {
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

  // ── Stabilized deal verdict (only when value-add: stabilized rent differs) ──
  if (isValueAdd) {
    let sVerdict = '', sColor = '';
    if (stabCapRate >= 8 && stabCoC >= 7 && stabDSCR >= dscrMin && stabCF >= 150 * units) {
      sVerdict = '🟢 STRONG once stabilized — pencils at market rents'; sColor = 'var(--green-light)';
    } else if (stabCapRate >= 6.5 && stabDSCR >= 1.0 && stabCF > 0) {
      sVerdict = '🟡 MARGINAL once stabilized — verify the rent bump is achievable'; sColor = '#e09a40';
    } else if (stabCF >= -200 && stabCapRate >= 5.5) {
      sVerdict = '🟠 WEAK even stabilized — thin at market rents'; sColor = '#e09a40';
    } else {
      sVerdict = '🔴 PASS even stabilized — the rent bump does not rescue it'; sColor = '#e07070';
    }
    const rentLift = rentGross > 0 ? (rentStab / rentGross - 1) * 100 : 0;
    html += `<div style="margin-top:12px;border:1px solid ${sColor};padding:12px 14px;background:rgba(0,0,0,0.15);">
      <div class="ctc-header" style="color:${sColor};">Stabilized Deal — at Market Rents (${rentLift >= 0 ? '+' : ''}${rentLift.toFixed(0)}% vs. in-place)</div>
      <div class="result-row"><span class="result-label">Stabilized Gross Rent</span><span class="result-value">${fmt(rentStab)}/mo</span></div>
      <div class="result-row"><span class="result-label">Stabilized GSI</span><span class="result-value">${fmt(stabGross)}/mo · ${fmt(stabGross * 12)}/yr</span></div>
      <div class="result-row"><span class="result-label">Stabilized GRM</span><span class="result-value ${grmStab <= 10 ? 'good' : grmStab <= 12 ? 'warn' : 'bad'}">${grmStab.toFixed(1)}x (target ≤10)</span></div>
      <div class="result-row"><span class="result-label">Stabilized Operating Expenses</span><span class="result-value">${fmt(stabTotalExp)}/mo</span></div>
      <div class="result-row"><span class="result-label">Stabilized NOI</span><span class="result-value">${fmt(stabNOI)}/mo · ${fmt(stabNOI_yr)}/yr</span></div>
      <div class="result-row key"><span class="result-label">Stabilized Cash Flow</span><span class="result-value ${cls(stabCF, 150 * units, 0)}">${(stabCF < 0 ? '-' : '') + fmt(stabCF)}/mo</span></div>
      <div class="result-row"><span class="result-label">Stabilized Cap Rate</span><span class="result-value ${cls(stabCapRate, 8, 6.5)}">${fmtPct(stabCapRate)}</span></div>
      <div class="result-row"><span class="result-label">Stabilized Cash-on-Cash</span><span class="result-value ${cls(stabCoC, 7, 4)}">${fmtPct(stabCoC)}</span></div>
      <div class="result-row"><span class="result-label">Stabilized DSCR${isCommercial ? ' (≥1.25×)' : ''}</span><span class="result-value ${cls(stabDSCR, dscrMin, 1.0)}">${stabDSCR.toFixed(2)}x</span></div>
      <div class="verdict" style="border-color:${sColor};color:${sColor};">${sVerdict}</div>
      <div class="note">Same acquisition financing, rents raised to your Stabilized figure (expenses updated to match). Answers "is it a good deal after I do the work?" — separate from the in-place verdict above.${willRefi ? '' : ' <strong>Buy &amp; hold (no refinance):</strong> this is your after-stabilization return — your original cash stays in the deal, so the Cash-on-Cash above is measured on it.'}</div>
    </div>`;
  }

  // Cash to Close summary
  html += `<div style="margin-top:12px;border:1px solid var(--border);padding:12px 14px;background:rgba(0,0,0,0.15);">
    <div class="ctc-header">Cash to Close</div>
    <div class="result-row"><span class="result-label">Down Payment (${dpPct}%)</span><span class="result-value">${fmt(dp)}</span></div>
    <div class="result-row"><span class="result-label">Closing Costs (${closingCostPct}%)</span><span class="result-value">${fmt(closingCostAmt)}</span></div>
    ${rehab > 0 ? `<div class="result-row"><span class="result-label">Rehab Budget</span><span class="result-value">${fmt(rehab)}</span></div>` : ''}
    ${rehabLoan > 0 ? `<div class="result-row"><span class="result-label">Less: Rehab Financed (${(rehabFinPct * 100).toFixed(0)}%)</span><span class="result-value good">-${fmt(rehabLoan)}</span></div>` : ''}
    ${fhaUpfrontMip > 0 ? `<div class="result-row"><span class="result-label">FHA Upfront MIP (1.75%)</span><span class="result-value bad">${fmt(fhaUpfrontMip)}</span></div>` : ''}
    ${creditApplied > 0 ? `<div class="result-row"><span class="result-label">Less: Seller Credit (${sellerCreditMode === 'repairs' ? 'repair escrow' : 'toward closing'})</span><span class="result-value good">-${fmt(creditApplied)}</span></div>` : ''}
    <div class="result-row key"><span class="result-label">Total Cash to Close</span><span class="result-value warn">${fmt(cashToClose)}</span></div>
    ${sellerCredit > 0 && sellerCreditMode === 'repairs' && sellerCredit > rehab ? `<div class="result-row"><span class="result-label">⚠ Credit exceeds rehab budget</span><span class="result-value warn">A repair escrow can't exceed the repair scope (${fmt(rehab)})</span></div>` : ''}
    ${sellerCredit > 0 && sellerCreditMode === 'closing' && sellerCredit > closingCostAmt ? `<div class="result-row"><span class="result-label">⚠ Credit exceeds closing costs</span><span class="result-value warn">'Toward closing' is capped at your actual costs (${fmt(closingCostAmt)})</span></div>` : ''}
    ${sellerCredit > 0 && sellerCreditMode === 'closing' && pp > 0 && sellerCredit > pp * 0.03 ? `<div class="result-row"><span class="result-label">⚠ Credit above ~3% of price</span><span class="result-value warn">${(sellerCredit / pp * 100).toFixed(1)}% — often over investor seller-credit caps; confirm with lender</span></div>` : ''}
    ${creditExcess > 0 ? `<div class="result-row"><span class="result-label">⚠ Excess credit unusable</span><span class="result-value bad">${fmt(creditExcess)} would be cash back — not allowed; re-trade it as a price reduction</span></div>` : ''}
    <div class="note">CoC return calculated on total cash invested (down + closing + ${rehabLoan > 0 ? 'unfinanced rehab' : 'rehab'}${fhaUpfrontMip > 0 ? ' + FHA upfront MIP' : ''}${creditApplied > 0 ? ' − seller credit' : ''}).${rehabLoan > 0 ? ' Financed rehab ' + fmt(rehabLoan) + ' is carried as a separate loan, not cash.' : ''}${creditApplied > 0 ? ' The credit lowers your cash in (lifts cash-on-cash) but leaves price, loan, cap rate & DSCR unchanged.' : ''}</div>
    ${loanType === 'seller' && balloonBalance > 0 ? `<div class="result-row" style="margin-top:8px;"><span class="result-label">⚠ Balloon Balance — Yr ${sfBalloonYrs} (future obligation, not today's cost)</span><span class="result-value bad">${fmt(balloonBalance)}</span></div>` : ''}
    ${loanType === 'seller' ? `<div class="note" style="margin-top:6px;">Seller Finance: No PMI/MIP regardless of down payment. Rate and terms set by seller negotiation. Dodd-Frank ability-to-repay rules apply for owner-occupied properties.</div>` : ''}
  </div>`;

  /* ── Equity margin — all-in vs. ARV (the overpay guard) ── */
  if ((rehab > 0 || manualARV > 0 || isValueAdd) && arvUsed > 0) {
    const allInCost   = pp + rehab + closingCostAmt;          // total to acquire + fix (before any credit)
    const allInPctARV = allInCost / arvUsed * 100;
    const equityAtARV = arvUsed - allInCost;
    const netBasis    = allInCost - creditApplied;            // your basis after the seller's help
    let mVerdict, mColor;
    if (allInPctARV <= 75)       { mVerdict = '🟢 Strong margin — meets the 70–75% BRRRR rule'; mColor = 'var(--green-light)'; }
    else if (allInPctARV <= 85)  { mVerdict = '🟡 Thin margin — small equity cushion'; mColor = '#e09a40'; }
    else if (allInPctARV <= 100) { mVerdict = '🟠 Minimal margin — little equity created for the risk'; mColor = '#e09a40'; }
    else                         { mVerdict = "🔴 Underwater — all-in exceeds ARV. A seller credit won't fix an overpay; re-trade the price or walk"; mColor = '#e07070'; }
    html += `<div style="margin-top:12px;border:1px solid ${mColor};padding:12px 14px;background:rgba(0,0,0,0.15);">
      <div class="ctc-header" style="color:${mColor};">Equity Margin — All-In vs. ARV</div>
      <div class="result-row"><span class="result-label">All-In Cost (price + rehab + closing)</span><span class="result-value">${fmt(allInCost)}</span></div>
      <div class="result-row"><span class="result-label">ARV Used${manualARV > 0 ? ' (manual)' : ' (estimate)'}</span><span class="result-value">${fmt(arvUsed)}</span></div>
      <div class="result-row key"><span class="result-label">All-In as % of ARV</span><span class="result-value ${allInPctARV <= 75 ? 'good' : allInPctARV <= 100 ? 'warn' : 'bad'}">${allInPctARV.toFixed(1)}%</span></div>
      <div class="result-row"><span class="result-label">Equity Created at ARV (ARV − all-in)</span><span class="result-value ${equityAtARV < 0 ? 'bad' : 'good'}">${(equityAtARV < 0 ? '-' : '') + fmt(equityAtARV)}</span></div>
      ${creditApplied > 0 ? `<div class="result-row"><span class="result-label">Your Net Basis (after ${fmt(creditApplied)} credit)</span><span class="result-value">${fmt(netBasis)}</span></div>` : ''}
      <div class="verdict" style="border-color:${mColor};color:${mColor};">${mVerdict}</div>
      <div class="note">All-in is price + rehab + closing (carry not included). The 70–75% rule keeps an equity cushion for the refi.${creditApplied > 0 ? " A seller credit lowers your cash basis (better cash-on-cash) but not the property's cost to build — the % above is the honest overpay test." : ''}</div>
    </div>`;
  }

  /* ── Lender sizing — max offer at target DSCR (#2) ── */
  if (!isCash && pi > 0 && noi_yr > 0) {
    const maxAnnualDS  = noi_yr / dscrMin;
    const maxLoan      = loanFromPmt(maxAnnualDS / 12, mr, amortMonths);
    const maxPrice     = dpPct < 100 ? maxLoan / (1 - dpPct / 100) : maxLoan;
    const delta        = pp - maxPrice;
    const deltaTxt     = delta > 0
      ? 'Your price is ' + fmt(delta) + ' ABOVE the supported max'
      : 'Your price is ' + fmt(-delta) + ' below the max — room to bid';
    html += `<div style="margin-top:12px;border:1px solid var(--border);padding:12px 14px;background:rgba(0,0,0,0.15);">
      <div class="ctc-header">Lender Sizing — Max Offer @ ${dscrMin.toFixed(2)}× DSCR</div>
      <div class="result-row"><span class="result-label">Max Supportable Loan</span><span class="result-value">${fmt(maxLoan)}</span></div>
      <div class="result-row"><span class="result-label">Max Purchase Price (at ${dpPct}% down)</span><span class="result-value">${fmt(maxPrice)}</span></div>
      <div class="result-row key"><span class="result-label">${delta > 0 ? '⚠ ' : '✅ '}vs. Your Price</span><span class="result-value ${delta > 0 ? 'bad' : 'good'}">${deltaTxt}</span></div>
      <div class="note">Lenders size the loan from NOI ÷ target DSCR — roughly the most you can pay and still qualify at today's rent &amp; rate.</div>
    </div>`;
  }

  /* ── Break-even occupancy & rent (#4) ── */
  if (grossIncome > 0) {
    const repairRate = capexPct / 100;
    const otherRate  = otherMode === 'pct' ? otherInput / 100 : 0;
    const otherFixed = otherMode === 'pct' ? 0 : otherMonthly;
    const fixedExp   = monthlyTax + insMonthly + utilitiesMonthly + capexReserveMonthly + pmiMonthly;
    const denomO     = grossIncome * (1 - pmPct / 100);
    const beOcc      = denomO > 0 ? (capexMonthly + otherMonthly + fixedExp + pi) / denomO : 0;
    const a          = (1 - vacPct / 100) * (1 - pmPct / 100);
    const denomR     = a - repairRate - otherRate;
    const beRent     = denomR > 0 ? (pi + otherFixed + fixedExp - a * otherIncome) / denomR : 0;
    const cushion    = 100 - beOcc * 100;
    html += `<div style="margin-top:12px;border:1px solid var(--border);padding:12px 14px;background:rgba(0,0,0,0.15);">
      <div class="ctc-header">Break-Even (cash flow = $0)</div>
      <div class="result-row"><span class="result-label">Break-Even Occupancy</span><span class="result-value ${cls(cushion, 15, 5)}">${(beOcc * 100).toFixed(1)}%</span></div>
      <div class="result-row"><span class="result-label">Break-Even Gross Rent</span><span class="result-value">${fmt(beRent)}/mo</span></div>
      <div class="result-row"><span class="result-label">Break-Even Rent / Unit</span><span class="result-value">${fmt(units ? beRent / units : 0)}/mo</span></div>
      <div class="note">Occupancy or rent below these levels turns cash flow negative. Lower break-even = more downside cushion.</div>
    </div>`;
  }

  /* ── 5-year pro forma & total return (#1) ── */
  if (pp > 0) {
    const holdYears   = Math.max(1, Math.round(parseFloat((document.getElementById('holdyears')   || {}).value) || 5));
    const rentG       = (parseFloat((document.getElementById('rentgrowth')   || {}).value) || 0) / 100;
    const expG        = (parseFloat((document.getElementById('expgrowth')    || {}).value) || 0) / 100;
    const apprG       = (parseFloat((document.getElementById('appreciation') || {}).value) || 0) / 100;
    const sellCostPct = (parseFloat((document.getElementById('sellcost')     || {}).value) || 0) / 100;

    const stabYears = Math.max(1, Math.round(parseFloat((document.getElementById('stabyears') || {}).value) || 1));
    const fixedBase = monthlyTax + insMonthly + utilitiesMonthly + pmiMonthly;
    let rows5 = '', cumCF = 0, lastBalance = loan, lastNOI_yr = 0;
    const cfByYear = [];
    for (let t = 1; t <= holdYears; t++) {
      // Rent: value-add ramps in-place → stabilized over stabYears, then grows; else grows from in-place
      let rent_t;
      if (isValueAdd) {
        rent_t = t <= stabYears
          ? rentGross + (rentStab - rentGross) * (t / stabYears)
          : rentStab * Math.pow(1 + rentG, t - stabYears);
      } else {
        rent_t = rentGross * Math.pow(1 + rentG, t - 1);
      }
      const gross_t    = rent_t + otherIncome;
      const egi_t      = gross_t * (1 - vacPct / 100);
      const pm_t       = egi_t * (pmPct / 100);
      const repairs_t  = rent_t * capexPct / 100;                                              // scales with rent
      const other_t    = otherMode === 'pct' ? rent_t * otherInput / 100 : otherMonthly * Math.pow(1 + expG, t - 1);
      const capexRes_t = capexResMode === 'pct' ? gross_t * capexResRaw / 100 : (units * capexResRaw / 12) * Math.pow(1 + expG, t - 1);
      const fixed_t    = fixedBase * Math.pow(1 + expG, t - 1);                                 // tax/ins/util grow at expense growth
      const noi_t_yr   = (egi_t - pm_t - repairs_t - other_t - capexRes_t - fixed_t) * 12;
      const cf_t_yr    = noi_t_yr - pi * 12 - rehabPI * 12;
      cumCF += cf_t_yr;
      cfByYear.push(cf_t_yr);
      lastBalance = remainingBalance(loan, mr, amortMonths, t * 12);
      lastNOI_yr  = noi_t_yr;
      rows5 += `<tr><td>${t}</td><td>${fmt(rent_t)}</td><td>${fmt(noi_t_yr)}</td><td class="${cf_t_yr < 0 ? 'bad' : 'good'}">${(cf_t_yr < 0 ? '-' : '') + fmt(cf_t_yr)}</td><td>${fmt(lastBalance)}</td></tr>`;
    }
    // Exit: value-add uses income approach (final NOI ÷ market cap) to capture created value; else appreciation
    const exitByIncome     = isValueAdd && arvCapRate > 0;
    const salePrice        = exitByIncome ? lastNOI_yr / arvCapRate : pp * Math.pow(1 + apprG, holdYears);
    const sellingCosts     = salePrice * sellCostPct;
    const netProceeds      = salePrice - sellingCosts - lastBalance;
    const principalPaydown = loan - lastBalance;
    const apprGain         = salePrice - pp;
    const totalProfit      = cumCF + netProceeds - cashToClose;
    const equityMult       = cashToClose > 0 ? (cumCF + netProceeds) / cashToClose : 0;
    const avgCoC           = cashToClose > 0 ? (cumCF / holdYears) / cashToClose * 100 : 0;
    const flows            = [-cashToClose].concat(cfByYear.map((c, i) => c + (i === holdYears - 1 ? netProceeds : 0)));
    const irrVal           = isCash ? avgCoC : irr(flows);
    html += `<div style="margin-top:12px;border:1px solid var(--border);padding:12px 14px;background:rgba(0,0,0,0.15);">
      <div class="ctc-header">${holdYears}-Year Projection &amp; Total Return${isValueAdd ? ' (ramps to stabilized)' : ''}</div>
      <table class="data-table" style="margin:8px 0;font-size:12px;">
        <thead><tr><th>Yr</th><th>Gross Rent</th><th>NOI</th><th>Cash Flow</th><th>Loan Bal</th></tr></thead>
        <tbody>${rows5}</tbody>
      </table>
      <div class="result-row"><span class="result-label">Total Cash Flow (${holdYears} yr)</span><span class="result-value">${(cumCF < 0 ? '-' : '') + fmt(cumCF)}</span></div>
      <div class="result-row"><span class="result-label">Principal Paydown</span><span class="result-value good">${fmt(principalPaydown)}</span></div>
      <div class="result-row"><span class="result-label">${exitByIncome ? 'Value Created (income-approach exit)' : 'Appreciation Gain'}</span><span class="result-value good">${fmt(apprGain)}</span></div>
      <div class="result-row"><span class="result-label">Net Sale Proceeds (after ${(sellCostPct * 100).toFixed(1)}% &amp; payoff)</span><span class="result-value">${fmt(netProceeds)}</span></div>
      <div class="result-row key"><span class="result-label">Total Profit (incl. sale, less cash in)</span><span class="result-value ${totalProfit < 0 ? 'bad' : 'good'}">${(totalProfit < 0 ? '-' : '') + fmt(totalProfit)}</span></div>
      <div class="result-row key"><span class="result-label">Equity Multiple</span><span class="result-value ${cls(equityMult, 2, 1)}">${equityMult.toFixed(2)}x</span></div>
      <div class="result-row key"><span class="result-label">IRR (${holdYears}-yr)</span><span class="result-value ${irrVal == null ? '' : cls(irrVal, 12, 8)}">${irrVal == null ? 'n/a' : fmtPct(irrVal)}</span></div>
      <div class="result-row"><span class="result-label">Avg Annual Cash-on-Cash</span><span class="result-value">${fmtPct(avgCoC)}</span></div>
      <div class="note">${isValueAdd ? 'Rents ramp from in-place to stabilized over ' + stabYears + ' yr (expenses track rent)' + (exitByIncome ? '; exit valued at final NOI ÷ ' + (arvCapRate * 100).toFixed(2) + '% cap' : '') + '. ' : ''}Assumes ${(rentG * 100).toFixed(1)}% rent growth, ${(expG * 100).toFixed(1)}% expense growth${exitByIncome ? '' : ', ' + (apprG * 100).toFixed(1) + '% appreciation'}, sold in year ${holdYears}.</div>
    </div>`;
  }

  /* ── Refinance / BRRRR exit (#5) — uses stabilized NOI/ARV computed above ── */
  if (willRefi && (manualARV > 0 || isValueAdd) && arvUsed > 0 && !isCash) {
    const refiLtv     = (parseFloat((document.getElementById('refiltv')  || {}).value) || 75) / 100;
    const refiRateMo  = (parseFloat((document.getElementById('refirate') || {}).value) || 7.5) / 100 / 12;
    const refiAmortYr = parseFloat((document.getElementById('refiamort') || {}).value) || 30;
    const refiYear    = Math.max(0, Math.round(parseFloat((document.getElementById('refiyear') || {}).value) || 1));
    const newLoan     = arvUsed * refiLtv;
    const acqBalAtRefi= remainingBalance(loan, mr, amortMonths, refiYear * 12);  // paid down to the refi year
    const payoff      = acqBalAtRefi + rehabLoan;        // refi clears the (paid-down) acquisition AND rehab loans
    const cashOut     = newLoan - payoff;
    const cashLeftIn  = cashToClose - cashOut;
    const newPI       = pmtFromLoan(newLoan, refiRateMo, refiAmortYr * 12);
    const postCF      = stabNOI_yr / 12 - newPI;          // rehab loan is gone post-refi
    const postCoC     = cashLeftIn > 0 ? (postCF * 12 / cashLeftIn * 100) : null;
    html += `<div style="margin-top:12px;border:1px solid var(--border);padding:12px 14px;background:rgba(0,0,0,0.15);">
      <div class="ctc-header">Refinance / BRRRR Exit — Year ${refiYear}</div>
      <div class="result-row"><span class="result-label">Stabilized NOI</span><span class="result-value">${fmt(stabNOI_yr)}/yr</span></div>
      ${arvCapRate > 0 ? `<div class="result-row"><span class="result-label">Estimated ARV (NOI ÷ ${(arvCapRate * 100).toFixed(2)}% cap)</span><span class="result-value">${fmt(estimatedARV)}</span></div>` : ''}
      <div class="result-row key"><span class="result-label">ARV Used${manualARV > 0 ? ' (manual override)' : ' (estimate)'}</span><span class="result-value">${fmt(arvUsed)}</span></div>
      <div class="result-row"><span class="result-label">New Loan (${(refiLtv * 100).toFixed(0)}% of ARV)</span><span class="result-value">${fmt(newLoan)}</span></div>
      <div class="result-row"><span class="result-label">Loans Paid Off${rehabLoan > 0 ? ' (acquisition + rehab)' : ''}${refiYear > 0 ? ', bal. @ yr ' + refiYear : ''}</span><span class="result-value">${fmt(payoff)}</span></div>
      <div class="result-row"><span class="result-label">Cash-Out (new loan − payoff)</span><span class="result-value ${cashOut < 0 ? 'bad' : 'good'}">${(cashOut < 0 ? '-' : '') + fmt(cashOut)}</span></div>
      <div class="result-row key"><span class="result-label">Cash Left in Deal</span><span class="result-value ${cashLeftIn <= 0 ? 'good' : 'warn'}">${cashLeftIn <= 0 ? '$0 — all capital recovered' : fmt(cashLeftIn)}</span></div>
      <div class="result-row"><span class="result-label">New P&amp;I (${refiAmortYr}-yr)</span><span class="result-value">${fmt(newPI)}/mo</span></div>
      <div class="result-row"><span class="result-label">Post-Refi Cash Flow (stabilized)</span><span class="result-value ${postCF < 0 ? 'bad' : 'good'}">${(postCF < 0 ? '-' : '') + fmt(postCF)}/mo</span></div>
      <div class="result-row key"><span class="result-label">Post-Refi Cash-on-Cash</span><span class="result-value ${postCoC == null ? 'good' : cls(postCoC, 7, 4)}">${postCoC == null ? '∞ — infinite (no capital left in)' : fmtPct(postCoC)}</span></div>
      <div class="note">Refinance modeled in year ${refiYear} — the acquisition loan is paid down to ${fmt(acqBalAtRefi)} by then. ARV = stabilized NOI ÷ market cap rate (enter a manual ARV to override, e.g. from comps). Post-refi cash flow uses stabilized rents. Cash left in ≤ $0 = effectively infinite return.</div>
    </div>`;
  }

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

/* ─── Export current deal to a styled Excel workbook (.xlsx) ───
 * Reads the rendered DOM so the export always matches what's on screen:
 * every VISIBLE input (incl. toggle modes & the rent-roll mix — hidden/
 * inactive fields are skipped), every result section, verdicts, and the
 * projection table as a real spreadsheet table. Styled with the brand
 * palette (navy section bars, gold table headers, sage verdict rows).
 * The .xlsx is hand-rolled (ZIP + OpenXML) — no libraries, works offline.
 * Values are a snapshot of the calculator, not live formulas. */

const _CRC_TABLE = (function () {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
  return t;
})();
function _crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = _CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

/* Minimal ZIP writer (store method — files are tiny, no compression needed) */
function _zipStore(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  const d = new Date();
  const dosTime = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
  const dosDate = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
  files.forEach(function (f) {
    const name = enc.encode(f.name), data = enc.encode(f.xml), crc = _crc32(data), sz = data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true);
    lh.setUint16(10, dosTime, true);   lh.setUint16(12, dosDate, true);
    lh.setUint32(14, crc, true);       lh.setUint32(18, sz, true); lh.setUint32(22, sz, true);
    lh.setUint16(26, name.length, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
    ch.setUint16(12, dosTime, true);   ch.setUint16(14, dosDate, true);
    ch.setUint32(16, crc, true);       ch.setUint32(20, sz, true); ch.setUint32(24, sz, true);
    ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + sz;
  });
  let cdSize = 0; central.forEach(function (a) { cdSize += a.length; });
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);    end.setUint32(16, offset, true);
  const out = new Uint8Array(offset + cdSize + 22);
  let p = 0;
  parts.concat(central, [new Uint8Array(end.buffer)]).forEach(function (a) { out.set(a, p); p += a.length; });
  return out;
}

function _xmlEsc(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* Walk the rendered calculator into a flat list of typed lines */
function _collectDealLines() {
  const lines = [];
  const cfg = window.PLAYBOOK_CONFIG || {};
  function hiddenWithin(el, stop) {
    for (let n = el; n && n !== stop; n = n.parentElement) { if (n.style && n.style.display === 'none') return true; }
    return false;
  }
  lines.push({ t: 'title',  a: 'PITTSBURGH MARKET HUB — DEAL SHEET' });
  lines.push({ t: 'sub',    a: (cfg.locationName || 'Location') + ' Investment Playbook · Luminous Steel City Holdings LLC' });
  lines.push({ t: 'sub',    a: 'Exported ' + new Date().toLocaleString() });
  lines.push({ t: 'blank' });
  lines.push({ t: 'banner', a: 'DEAL INPUTS' });

  const wrap = document.querySelector('.calc-inputs');
  if (wrap) {
    let firstGroup = true;
    wrap.querySelectorAll('.ctc-header, .input-row, .rr-row').forEach(function (el) {
      if (hiddenWithin(el, wrap)) return;   // skip inactive fields (e.g. seller-finance rows on a conventional loan)
      if (el.matches('.ctc-header')) { lines.push({ t: 'group', a: el.textContent }); firstGroup = false; return; }
      if (firstGroup) { lines.push({ t: 'group', a: 'Property & Financing' }); firstGroup = false; }
      if (el.matches('.rr-row')) {
        const cnt = parseFloat((el.querySelector('.rr-count') || {}).value) || 0;
        if (cnt > 0) {
          const typ = (el.querySelector('.rr-type') || {}).value || '';
          const rr  = parseFloat((el.querySelector('.rr-rent') || {}).value) || 0;
          lines.push({ t: 'kv', a: 'Unit mix — ' + cnt + ' × ' + typ, b: '$' + rr.toLocaleString('en-US') + '/mo each' });
        }
        return;
      }
      const lbl = el.querySelector('label');
      if (!lbl) return;
      const sel = el.querySelector('select');
      const inp = el.querySelector('input');
      const modeBtn = el.querySelector('.input-with-toggle .toggle-btn');
      const soloBtn = el.querySelector('.toggle-btn');
      let val = null;
      if (sel)      val = sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : sel.value;
      else if (inp) val = inp.value + (modeBtn ? ' ' + modeBtn.textContent : '');
      else if (soloBtn) val = soloBtn.textContent;
      if (val != null) lines.push({ t: 'kv', a: lbl.textContent, b: val });
    });
  }

  lines.push({ t: 'blank' });
  lines.push({ t: 'banner', a: 'RESULTS' });
  const res = document.getElementById('results');
  if (res) {
    let started = false;
    res.querySelectorAll('.ctc-header, .result-row, .verdict, .data-table, .note').forEach(function (el) {
      if (el.matches('.ctc-header')) { lines.push({ t: 'group', a: el.textContent }); started = true; return; }
      if (!started) { lines.push({ t: 'group', a: 'Deal Metrics' }); started = true; }
      if (el.matches('.verdict')) { lines.push({ t: 'verdict', a: el.textContent }); return; }
      if (el.matches('.note'))    { lines.push({ t: 'note',    a: el.textContent }); return; }
      if (el.matches('.data-table')) {
        lines.push({ t: 'thead', c: [].map.call(el.querySelectorAll('thead th'), function (th) { return th.textContent; }) });
        el.querySelectorAll('tbody tr').forEach(function (tr) {
          lines.push({ t: 'trow', c: [].map.call(tr.querySelectorAll('td'), function (td) { return td.textContent; }) });
        });
        return;
      }
      const l = el.querySelector('.result-label'), v = el.querySelector('.result-value');
      if (l && v) lines.push({ t: 'kv', a: l.textContent, b: v.textContent, k: el.classList.contains('key') });
    });
  }
  lines.push({ t: 'blank' });
  lines.push({ t: 'note', a: 'Snapshot of the on-screen Deal Calculator — display values, not live formulas.' });
  return lines;
}

function exportCalcXLSX() {
  if (typeof calc === 'function') { try { calc(); } catch (e) {} }
  const lines = _collectDealLines();
  const COLS = ['A', 'B', 'C', 'D', 'E'];
  const merges = [];
  let rowsXml = '', r = 0;

  function cellXml(col, style, text) {
    return '<c r="' + col + r + '" s="' + style + '" t="inlineStr"><is><t xml:space="preserve">' + _xmlEsc(text) + '</t></is></c>';
  }
  function rowOpen(ht) { return '<row r="' + r + '"' + (ht ? ' ht="' + ht + '" customHeight="1"' : '') + '>'; }
  function fullRow(style, text, ht) {
    r++;
    let cells = '';
    for (let i = 0; i < 5; i++) cells += cellXml(COLS[i], style, i === 0 ? text : '');
    rowsXml += rowOpen(ht) + cells + '</row>';
    merges.push('A' + r + ':E' + r);
  }

  lines.forEach(function (ln) {
    if (ln.t === 'blank')   { r++; rowsXml += rowOpen() + '</row>'; return; }
    if (ln.t === 'title')   return fullRow(1, ln.a, 30);
    if (ln.t === 'sub')     return fullRow(2, ln.a);
    if (ln.t === 'banner')  return fullRow(3, ln.a, 20);
    if (ln.t === 'group')   return fullRow(12, ln.a, 17);
    if (ln.t === 'verdict') return fullRow(8, ln.a, 28);
    if (ln.t === 'note')    return fullRow(2, ln.a);
    if (ln.t === 'thead' || ln.t === 'trow') {
      r++;
      const isH = ln.t === 'thead';
      let cells = '';
      for (let i = 0; i < 5; i++) cells += cellXml(COLS[i], isH ? 9 : (i === 0 ? 11 : 10), ln.c[i] == null ? '' : ln.c[i]);
      rowsXml += rowOpen() + cells + '</row>';
      return;
    }
    r++;  // kv — label in A, value merged across B:E
    let cells = cellXml('A', ln.k ? 6 : 4, ln.a);
    for (let i = 1; i < 5; i++) cells += cellXml(COLS[i], ln.k ? 7 : 5, i === 1 ? ln.b : '');
    rowsXml += rowOpen() + cells + '</row>';
    merges.push('B' + r + ':E' + r);
  });

  const sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews>' +
    '<cols><col min="1" max="1" width="42" customWidth="1"/><col min="2" max="5" width="14" customWidth="1"/></cols>' +
    '<sheetData>' + rowsXml + '</sheetData>' +
    (merges.length ? '<mergeCells count="' + merges.length + '">' + merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells>' : '') +
    '</worksheet>';

  /* Brand palette: navy #0d1b2a bars · gold #c9a84c table headers · sage #edefdf verdict/group fills */
  const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="6">' +
      '<font><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="15"/><color rgb="FFF5F0E8"/><name val="Calibri"/></font>' +
      '<font><i/><sz val="10"/><color rgb="FF627D98"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FFF5F0E8"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FF102A43"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FF0D1B2A"/><name val="Calibri"/></font>' +
    '</fonts>' +
    '<fills count="5">' +
      '<fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FF0D1B2A"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFC9A84C"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFEDEFDF"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="2">' +
      '<border><left/><right/><top/><bottom/><diagonal/></border>' +
      '<border><left style="thin"><color rgb="FFBCCCDC"/></left><right style="thin"><color rgb="FFBCCCDC"/></right><top style="thin"><color rgb="FFBCCCDC"/></top><bottom style="thin"><color rgb="FFBCCCDC"/></bottom><diagonal/></border>' +
    '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="13">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf fontId="1" fillId="2" applyFont="1" applyFill="1" applyAlignment="1" xfId="0"><alignment vertical="center"/></xf>' +
      '<xf fontId="2" applyFont="1" xfId="0"/>' +
      '<xf fontId="3" fillId="2" applyFont="1" applyFill="1" applyAlignment="1" xfId="0"><alignment vertical="center"/></xf>' +
      '<xf fontId="0" xfId="0"/>' +
      '<xf fontId="0" applyAlignment="1" xfId="0"><alignment horizontal="right"/></xf>' +
      '<xf fontId="4" applyFont="1" xfId="0"/>' +
      '<xf fontId="4" applyFont="1" applyAlignment="1" xfId="0"><alignment horizontal="right"/></xf>' +
      '<xf fontId="4" fillId="4" applyFont="1" applyFill="1" applyAlignment="1" xfId="0"><alignment vertical="center" wrapText="1"/></xf>' +
      '<xf fontId="5" fillId="3" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1" xfId="0"><alignment horizontal="center"/></xf>' +
      '<xf borderId="1" applyBorder="1" applyAlignment="1" xfId="0"><alignment horizontal="right"/></xf>' +
      '<xf borderId="1" applyBorder="1" applyAlignment="1" xfId="0"><alignment horizontal="center"/></xf>' +
      '<xf fontId="5" fillId="4" applyFont="1" applyFill="1" applyAlignment="1" xfId="0"><alignment vertical="center"/></xf>' +
    '</cellXfs>' +
    '</styleSheet>';

  const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets><sheet name="Deal Sheet" sheetId="1" r:id="rId1"/></sheets></workbook>';
  const wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>';
  const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';
  const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '</Types>';

  const zip = _zipStore([
    { name: '[Content_Types].xml',           xml: contentTypes },
    { name: '_rels/.rels',                   xml: rootRels },
    { name: 'xl/workbook.xml',               xml: workbook },
    { name: 'xl/_rels/workbook.xml.rels',    xml: wbRels },
    { name: 'xl/styles.xml',                 xml: styles },
    { name: 'xl/worksheets/sheet1.xml',      xml: sheet }
  ]);
  const cfg = window.PLAYBOOK_CONFIG || {};
  const loc = (cfg.locationName || 'deal').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'deal';
  const fname = 'deal_' + loc + '_' + new Date().toISOString().slice(0, 10) + '.xlsx';
  const blob = new Blob([zip], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fname;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
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

  /* ── Interest vs. Principal breakdown ─────────────── */
  const schedEl = document.getElementById('lc-schedule');
  if (schedEl) {
    if (lcCalcType === 'io') {
      schedEl.innerHTML =
        '<div style="border:1px solid var(--border);padding:14px 16px;background:rgba(0,0,0,0.15);border-radius:8px;margin-bottom:14px;">' +
        '<div class="ctc-header" style="margin-bottom:8px;">Interest vs. Principal Breakdown</div>' +
        '<div class="alert red" style="margin-bottom:0;">' +
          '<div class="alert-title">💸 100% INTEREST — $0 PRINCIPAL PAYDOWN</div>' +
          'Every payment is pure interest. Your principal balance stays at ' + fmtN(P) +
          ' for the entire term. Zero equity is built through payments — equity only comes from appreciation or paying off the balloon.' +
        '</div></div>';
    } else {
      /* ── Amortization schedule ── */
      const schedMonths = (lcBalloon && balloonMonths > 0) ? balloonMonths : n;

      /* Month 1 split */
      const m1Int  = P * r;
      const m1Prin = monthlyPayment - m1Int;
      const m1IntPct  = monthlyPayment > 0 ? m1Int  / monthlyPayment * 100 : 0;
      const m1PrinPct = 100 - m1IntPct;

      /* Find crossover month (principal first exceeds interest) */
      let crossover = null;
      let cBal = P;
      for (let m = 1; m <= schedMonths; m++) {
        const ip = cBal * r;
        const pp = monthlyPayment - ip;
        if (pp >= ip && crossover === null) crossover = m;
        cBal = Math.max(0, cBal - pp);
        if (cBal <= 0) break;
      }

      /* Yearly rows */
      let tableRows = '';
      let bal = P;
      const totalYears = Math.ceil(schedMonths / 12);

      for (let yr = 1; yr <= totalYears; yr++) {
        const months = Math.min(12, schedMonths - (yr - 1) * 12);
        let yrInt = 0, yrPrin = 0;
        for (let m = 0; m < months; m++) {
          const ip = bal * r;
          const pp = Math.min(monthlyPayment - ip, bal);
          yrInt  += ip;
          yrPrin += pp;
          bal     = Math.max(0, bal - pp);
        }
        const intPct  = (yrInt + yrPrin) > 0 ? yrInt / (yrInt + yrPrin) * 100 : 0;
        const prinPct = 100 - intPct;

        tableRows +=
          '<tr>' +
          '<td class="hl">Year ' + yr + '</td>' +
          '<td class="mu">' + fmtD(monthlyPayment) + '/mo</td>' +
          '<td style="color:#e07070;">' + fmtN(yrInt)  + '</td>' +
          '<td style="color:#6db36d;">' + fmtN(yrPrin) + '</td>' +
          '<td>' + fmtN(bal) + '</td>' +
          '<td style="min-width:100px;">' +
            '<div style="display:flex;height:10px;border-radius:3px;overflow:hidden;">' +
              '<div style="width:' + intPct.toFixed(1) + '%;background:#e07070;"></div>' +
              '<div style="width:' + prinPct.toFixed(1) + '%;background:#6db36d;"></div>' +
            '</div>' +
            '<div style="font-size:10px;color:var(--text-muted);margin-top:2px;">' + intPct.toFixed(0) + '% int · ' + prinPct.toFixed(0) + '% prin</div>' +
          '</td>' +
          '</tr>';
      }

      /* Add balloon row if applicable */
      if (lcBalloon && balloonBalance > 0) {
        tableRows +=
          '<tr class="key">' +
          '<td class="hl" style="color:#e07070;">🔴 Balloon</td>' +
          '<td colspan="3" style="color:#e07070;">Remaining balance due in full</td>' +
          '<td class="rd">' + fmtN(balloonBalance) + '</td>' +
          '<td style="color:#e07070;">Lump sum due</td>' +
          '</tr>';
      }

      schedEl.innerHTML =
        '<div style="border:1px solid var(--border);padding:14px 16px;background:rgba(0,0,0,0.15);border-radius:8px;margin-bottom:14px;">' +
        '<div class="ctc-header" style="margin-bottom:10px;">Interest vs. Principal Breakdown</div>' +

        /* Month 1 bar card + crossover card */
        '<div style="display:flex;gap:12px;margin-bottom:14px;flex-wrap:wrap;">' +

          '<div style="flex:1;min-width:180px;background:rgba(0,0,0,0.2);border-radius:6px;padding:10px 12px;">' +
            '<div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.04em;">Month 1 — ' + fmtD(monthlyPayment) + '/mo</div>' +
            '<div style="display:flex;height:22px;border-radius:4px;overflow:hidden;margin-bottom:6px;">' +
              '<div style="width:' + m1IntPct.toFixed(1) + '%;background:#e07070;display:flex;align-items:center;padding-left:6px;font-size:11px;color:#fff;font-weight:700;">' + m1IntPct.toFixed(0) + '%</div>' +
              '<div style="width:' + m1PrinPct.toFixed(1) + '%;background:#6db36d;display:flex;align-items:center;justify-content:flex-end;padding-right:6px;font-size:11px;color:#fff;font-weight:700;">' + m1PrinPct.toFixed(0) + '%</div>' +
            '</div>' +
            '<div style="font-size:12px;">' +
              '<span style="color:#e07070;">■</span> Interest: ' + fmtD(m1Int) +
              ' &nbsp;·&nbsp; <span style="color:#6db36d;">■</span> Principal: ' + fmtD(m1Prin) +
            '</div>' +
          '</div>' +

          (crossover
            ? '<div style="flex:1;min-width:180px;background:rgba(0,0,0,0.2);border-radius:6px;padding:10px 12px;">' +
                '<div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em;">Crossover Point</div>' +
                '<div style="font-size:18px;font-weight:700;color:var(--gold);">Month ' + crossover + '</div>' +
                '<div style="font-size:12px;color:var(--text-muted);">Year ' + (crossover / 12).toFixed(1) + ' — principal payment first exceeds interest</div>' +
              '</div>'
            : '') +

        '</div>' +

        /* Yearly table */
        '<table class="data-table" style="margin-bottom:0;">' +
          '<thead><tr>' +
            '<th>Year</th>' +
            '<th>Monthly</th>' +
            '<th style="color:#e07070;">Interest Paid</th>' +
            '<th style="color:#6db36d;">Principal Paid</th>' +
            '<th>Balance</th>' +
            '<th>Split</th>' +
          '</tr></thead>' +
          '<tbody>' + tableRows + '</tbody>' +
        '</table>' +
        '</div>';
    }
  }

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
