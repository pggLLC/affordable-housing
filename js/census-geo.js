/**
 * Census snapshot (ACS Profile) with geography dropdowns for:
 *  - National (United States aggregate)
 *  - States
 *  - Counties (within a state)
 *  - Places (within a state)
 *
 * Uses window.APP_CONFIG.CENSUS_API_KEY (js/config.js)
 * Writes cards into .census-grid inside #census-stats.
 */
(() => {
  const KEY = (window.APP_CONFIG && window.APP_CONFIG.CENSUS_API_KEY) ? window.APP_CONFIG.CENSUS_API_KEY : "";
  const VINTAGES = ["2023", "2022", "2021", "2020"];
  const DATASET  = (v) => `https://api.census.gov/data/${v}/acs/acs5/profile`;

  const METRICS = [
    { key: "DP05_0001E", label: "Population",              fmt: formatNumber   },
    { key: "DP03_0062E", label: "Median household income", fmt: formatCurrency },
    { key: "DP04_0134E", label: "Median gross rent",       fmt: formatCurrency },
    { key: "DP04_0089E", label: "Median home value",       fmt: formatCurrency },
    { key: "DP03_0099PE", label: "Uninsured rate",         fmt: formatPct      },
    { key: "DP02_0067PE", label: "Bachelor's degree+",     fmt: formatPct      },
    { key: "DP03_0009PE", label: "Unemployment rate",      fmt: formatPct      },
    { key: "DP04_0003PE", label: "Vacancy rate",           fmt: formatPct      },
  ];

  const $ = (sel) => document.querySelector(sel);

  function formatNumber(n)   { return isFinite(n) ? Math.round(n).toLocaleString()           : "—"; }
  function formatCurrency(n) { return isFinite(n) ? Math.round(n).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }) : "—"; }
  function formatPct(n)      { return isFinite(n) ? Number(n).toFixed(1) + "%"               : "—"; }

  async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Census request failed (${res.status})`);
    return res.json();
  }

  function apiKey() { return KEY ? `&key=${encodeURIComponent(KEY)}` : ""; }

  function buildUrl(vintage, geography, params) {
    const vars = ["NAME", ...METRICS.map(m => m.key)].join(",");
    if (geography === "national") {
      return `${DATASET(vintage)}?get=${vars}&for=us:1${apiKey()}`;
    }
    if (geography === "state") {
      return `${DATASET(vintage)}?get=${vars}&for=state:*${apiKey()}`;
    }
    if (geography === "county") {
      return `${DATASET(vintage)}?get=${vars}&for=county:*&in=state:${params.state}${apiKey()}`;
    }
    if (geography === "place") {
      return `${DATASET(vintage)}?get=${vars}&for=place:*&in=state:${params.state}${apiKey()}`;
    }
    throw new Error("Unknown geography");
  }

  async function getWorkingVintage(geography, params) {
    for (const v of VINTAGES) {
      try {
        const url  = buildUrl(v, geography, params);
        const data = await fetchJson(url);
        if (Array.isArray(data) && data.length > 1) return { vintage: v, data };
      } catch (e) { /* try next */ }
    }
    throw new Error("No working ACS vintage found");
  }

  function toRows(table) {
    const [header, ...rows] = table;
    return rows.map(r => Object.fromEntries(header.map((h, i) => [h, r[i]])));
  }

  function fillOptions(selectEl, items, placeholder) {
    selectEl.innerHTML = "";
    if (placeholder) {
      const ph = document.createElement("option");
      ph.value = "";
      ph.textContent = placeholder;
      selectEl.appendChild(ph);
    }
    items.forEach(it => {
      const o = document.createElement("option");
      o.value = it.value;
      o.textContent = it.label;
      selectEl.appendChild(o);
    });
  }

  function renderStats(name, record, vintage) {
    const grid      = $(".census-grid");
    const vintageEl = document.querySelector("[data-census-vintage]");
    if (vintageEl) vintageEl.textContent = `ACS ${vintage} 5-year (profile) • ${name}`;

    grid.innerHTML = "";
    METRICS.forEach(m => {
      const val  = Number(record[m.key]);
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <p class="num">${m.fmt(val)}</p>
        <p class="lbl">${m.label}</p>
      `;
      grid.appendChild(card);
    });
  }

  /* ---- loaders ---- */
  async function loadNational() {
    const { vintage, data } = await getWorkingVintage("national", {});
    const rows = toRows(data);
    return { vintage, record: rows[0] };
  }

  async function loadStates() {
    const { vintage, data } = await getWorkingVintage("state", {});
    const rows   = toRows(data);
    const states = rows.map(r => ({ value: r.state, label: r.NAME }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return { vintage, states, rows };
  }

  async function loadCounties(stateFips) {
    const { vintage, data } = await getWorkingVintage("county", { state: stateFips });
    const rows  = toRows(data);
    const items = rows.map(r => ({ value: `${r.state}:${r.county}`, label: r.NAME, raw: r }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return { vintage, items };
  }

  async function loadPlaces(stateFips) {
    const { vintage, data } = await getWorkingVintage("place", { state: stateFips });
    const rows  = toRows(data);
    const items = rows.map(r => ({ value: `${r.state}:${r.place}`, label: r.NAME, raw: r }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return { vintage, items };
  }

  /* ---- UI helpers ---- */
  function showStateWrap(show) {
    const wrap = $("#censusStateWrap");
    if (wrap) wrap.style.display = show ? "" : "none";
  }

  function showGeoWrap(show) {
    const wrap = $("#censusGeoWrap");
    if (wrap) wrap.style.display = show ? "" : "none";
  }

  /* ======================================================
     INIT
     ====================================================== */
  async function init() {
    const levelEl = $("#censusLevel");
    const stateEl = $("#censusState");
    const geoEl   = $("#censusGeo");

    if (!levelEl || !stateEl || !geoEl) return;
    if (!KEY) console.warn("[census-geo] Missing CENSUS_API_KEY — requests may be rate-limited.");

    /* Hide geo wrap initially; shown when needed */
    showStateWrap(false);
    showGeoWrap(false);

    /* --- Load national + state list in parallel --- */
    let statesInfo  = null;
    let nationalInfo = null;

    const vintageEl = document.querySelector("[data-census-vintage]");

    try {
      // Kick off both fetches concurrently
      const [natResult, stResult] = await Promise.allSettled([
        loadNational(),
        loadStates()
      ]);

      if (natResult.status === "fulfilled") {
        nationalInfo = natResult.value;
      } else {
        console.warn("[census-geo] National fetch failed:", natResult.reason);
      }

      if (stResult.status === "fulfilled") {
        statesInfo = stResult.value;
        fillOptions(stateEl, statesInfo.states, "Select a state…");
      } else {
        console.warn("[census-geo] States fetch failed:", stResult.reason);
      }

      // Default view: national
      if (nationalInfo) {
        levelEl.value = "national";
        renderStats("United States", nationalInfo.record, nationalInfo.vintage);
      } else if (statesInfo) {
        // Fallback to Colorado if national unavailable
        levelEl.value = "state";
        const co = statesInfo.states.find(s => s.label === "Colorado") || statesInfo.states[0];
        if (co) {
          showGeoWrap(true);
          fillOptions(geoEl, statesInfo.states, "Select a state…");
          geoEl.value = co.value;
          const rec = statesInfo.rows.find(r => r.state === co.value);
          if (rec) renderStats(rec.NAME, rec, statesInfo.vintage);
        }
      }

    } catch (e) {
      console.warn("[census-geo] init error:", e);
      if (vintageEl) vintageEl.textContent = "Unable to load Census data";
      return;
    }

    /* ---- level change handler ---- */
    async function onLevelChange() {
      const lvl = levelEl.value;

      if (lvl === "national") {
        showStateWrap(false);
        showGeoWrap(false);
        if (nationalInfo) {
          renderStats("United States", nationalInfo.record, nationalInfo.vintage);
        } else {
          // Fetch if not yet loaded
          try {
            if (vintageEl) vintageEl.textContent = "Loading national data…";
            nationalInfo = await loadNational();
            renderStats("United States", nationalInfo.record, nationalInfo.vintage);
          } catch (e) {
            if (vintageEl) vintageEl.textContent = "National data unavailable";
          }
        }
        return;
      }

      if (lvl === "state") {
        showStateWrap(false);
        showGeoWrap(true);
        if (!statesInfo) {
          try {
            statesInfo = await loadStates();
            fillOptions(stateEl, statesInfo.states, "Select a state…");
          } catch (e) {
            if (vintageEl) vintageEl.textContent = "Unable to load state list";
            return;
          }
        }
        fillOptions(geoEl, statesInfo.states, "Select a state…");
        geoEl.value = "";
        geoEl.onchange = () => {
          const st  = geoEl.value;
          const rec = statesInfo.rows.find(r => r.state === st);
          if (rec) renderStats(rec.NAME, rec, statesInfo.vintage);
        };
        return;
      }

      /* county or place — need state picker first */
      showStateWrap(true);
      showGeoWrap(true);
      fillOptions(geoEl, [], null);
      geoEl.innerHTML = `<option value="">Select a state first…</option>`;

      stateEl.onchange = async () => {
        const st = stateEl.value;
        if (!st) return;

        try {
          geoEl.disabled  = true;
          geoEl.innerHTML = `<option value="">Loading…</option>`;

          if (lvl === "county") {
            const { vintage, items } = await loadCounties(st);
            fillOptions(geoEl, items, "Select a county…");
            geoEl.disabled = false;
            geoEl.onchange = () => {
              const match = items.find(i => i.value === geoEl.value);
              if (match) renderStats(match.label, match.raw, vintage);
            };
          } else {
            const { vintage, items } = await loadPlaces(st);
            fillOptions(geoEl, items, "Select a place…");
            geoEl.disabled = false;
            geoEl.onchange = () => {
              const match = items.find(i => i.value === geoEl.value);
              if (match) renderStats(match.label, match.raw, vintage);
            };
          }
        } catch (e) {
          console.warn("[census-geo] geography load error:", e);
          geoEl.disabled  = false;
          geoEl.innerHTML = `<option value="">Unable to load</option>`;
        }
      };
    }

    levelEl.addEventListener("change", onLevelChange);
  }

  const start = () => init().catch(e => console.warn("[census-geo] fatal:", e));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
