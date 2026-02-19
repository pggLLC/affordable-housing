/**
 * Census snapshot (ACS Profile) with geography dropdowns for:
 *  - States
 *  - Counties (within a state)
 *  - Places (within a state)
 *
 * Uses window.APP_CONFIG.CENSUS_API_KEY (js/config.js)
 * Writes cards into .census-grid inside #census-stats.
 */
(() => {
  const KEY = (window.APP_CONFIG && window.APP_CONFIG.CENSUS_API_KEY) ? window.APP_CONFIG.CENSUS_API_KEY : "";
  const VINTAGES = ["2023", "2022", "2021", "2020"]; // try most recent first
  const DATASET = (v) => `https://api.census.gov/data/${v}/acs/acs5/profile`;

  const METRICS = [
    { key: "DP05_0001E", label: "Population", fmt: (n) => formatNumber(n) },
    { key: "DP03_0062E", label: "Median household income", fmt: (n) => formatCurrency(n) },
    { key: "DP04_0134E", label: "Median gross rent", fmt: (n) => formatCurrency(n) },
    { key: "DP04_0089E", label: "Median home value", fmt: (n) => formatCurrency(n) },
  ];

  const $ = (sel) => document.querySelector(sel);

  function formatNumber(n) {
    if (!isFinite(n)) return "—";
    return Math.round(n).toLocaleString();
  }
  function formatCurrency(n) {
    if (!isFinite(n)) return "—";
    return Math.round(n).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  }

  async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Census request failed (${res.status})`);
    return res.json();
  }

  function buildUrl(vintage, geography, params) {
    const vars = ["NAME", ...METRICS.map(m => m.key)].join(",");
    const apiKey = KEY ? `&key=${encodeURIComponent(KEY)}` : "";
    if (geography === "state") {
      return `${DATASET(vintage)}?get=${vars}&for=state:*${apiKey}`;
    }
    if (geography === "county") {
      return `${DATASET(vintage)}?get=${vars}&for=county:*&in=state:${params.state}${apiKey}`;
    }
    if (geography === "place") {
      return `${DATASET(vintage)}?get=${vars}&for=place:*&in=state:${params.state}${apiKey}`;
    }
    throw new Error("Unknown geography");
  }

  async function getWorkingVintage(geography, params) {
    for (const v of VINTAGES) {
      try {
        const url = buildUrl(v, geography, params);
        const data = await fetchJson(url);
        if (Array.isArray(data) && data.length > 1) return { vintage: v, data };
      } catch (e) {
        // try next
      }
    }
    throw new Error("No working ACS vintage found");
  }

  function toRows(table) {
    const [header, ...rows] = table;
    return rows.map(r => Object.fromEntries(header.map((h, i) => [h, r[i]])));
  }

  function fillOptions(selectEl, items, placeholder = "Select…") {
    selectEl.innerHTML = "";
    const ph = document.createElement("option");
    ph.value = "";
    ph.textContent = placeholder;
    selectEl.appendChild(ph);
    items.forEach(it => {
      const o = document.createElement("option");
      o.value = it.value;
      o.textContent = it.label;
      selectEl.appendChild(o);
    });
  }

  function renderStats(name, record, vintage) {
    const grid = $(".census-grid");
    const vintageEl = document.querySelector("[data-census-vintage]");
    if (vintageEl) vintageEl.textContent = `ACS ${vintage} 5-year (profile) • ${name}`;

    grid.innerHTML = "";
    METRICS.forEach(m => {
      const val = Number(record[m.key]);
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <p class="num">${m.fmt(val)}</p>
        <p class="lbl">${m.label}</p>
      `;
      grid.appendChild(card);
    });
  }

  async function loadStates() {
    const { vintage, data } = await getWorkingVintage("state", {});
    const rows = toRows(data);
    const states = rows.map(r => ({ value: r.state, label: r.NAME }))
      .sort((a,b) => a.label.localeCompare(b.label));
    return { vintage, states, rows };
  }

  async function loadCounties(stateFips) {
    const { vintage, data } = await getWorkingVintage("county", { state: stateFips });
    const rows = toRows(data);
    const items = rows.map(r => ({ value: `${r.state}:${r.county}`, label: r.NAME, raw: r }))
      .sort((a,b) => a.label.localeCompare(b.label));
    return { vintage, items };
  }

  async function loadPlaces(stateFips) {
    const { vintage, data } = await getWorkingVintage("place", { state: stateFips });
    const rows = toRows(data);
    const items = rows.map(r => ({ value: `${r.state}:${r.place}`, label: r.NAME, raw: r }))
      .sort((a,b) => a.label.localeCompare(b.label));
    return { vintage, items };
  }

  async function renderDefault(usStatesInfo) {
    // default: United States aggregate isn't available in ACS5 profile same way; choose "Colorado" if available else first
    const defaultState = usStatesInfo.states.find(s => s.label === "Colorado") || usStatesInfo.states[0];
    if (!defaultState) return;
    $("#censusLevel").value = "state";
    $("#censusStateWrap").style.display = "none";
    fillOptions($("#censusGeo"), usStatesInfo.states, "Select a state…");
    $("#censusGeo").value = defaultState.value;

    const record = usStatesInfo.rows.find(r => r.state === defaultState.value);
    if (record) renderStats(record.NAME, record, usStatesInfo.vintage);
  }

  async function init() {
    const levelEl = $("#censusLevel");
    const stateWrap = $("#censusStateWrap");
    const stateEl = $("#censusState");
    const geoEl = $("#censusGeo");

    if (!levelEl || !stateWrap || !stateEl || !geoEl) return;

    if (!KEY) console.warn("[census-geo] Missing CENSUS_API_KEY in window.APP_CONFIG (requests may fail if rate-limited).");

    // Load state list once
    let statesInfo;
    try {
      statesInfo = await loadStates();
      fillOptions(stateEl, statesInfo.states, "Select a state…");
      await renderDefault(statesInfo);
    } catch (e) {
      console.warn("[census-geo] init error:", e);
      const v = document.querySelector("[data-census-vintage]");
      if (v) v.textContent = "Unable to load Census data";
      return;
    }

    async function onLevelChange() {
      const lvl = levelEl.value;
      if (lvl === "state") {
        stateWrap.style.display = "none";
        fillOptions(geoEl, statesInfo.states, "Select a state…");
        geoEl.value = "";
        geoEl.onchange = () => {
          const st = geoEl.value;
          const rec = statesInfo.rows.find(r => r.state === st);
          if (rec) renderStats(rec.NAME, rec, statesInfo.vintage);
        };
        return;
      }

      // county/place needs state first
      stateWrap.style.display = "";
      geoEl.innerHTML = `<option value="">Select…</option>`;

      stateEl.onchange = async () => {
        const st = stateEl.value;
        if (!st) return;

        try {
          geoEl.disabled = true;
          geoEl.innerHTML = `<option value="">Loading…</option>`;

          if (lvl === "county") {
            const { vintage, items } = await loadCounties(st);
            fillOptions(geoEl, items, "Select a county…");
            geoEl.disabled = false;
            geoEl.onchange = async () => {
              const val = geoEl.value;
              const match = items.find(i => i.value === val);
              if (match) renderStats(match.label, match.raw, vintage);
            };
          } else {
            const { vintage, items } = await loadPlaces(st);
            fillOptions(geoEl, items, "Select a place…");
            geoEl.disabled = false;
            geoEl.onchange = async () => {
              const val = geoEl.value;
              const match = items.find(i => i.value === val);
              if (match) renderStats(match.label, match.raw, vintage);
            };
          }
        } catch (e) {
          console.warn("[census-geo] geography load error:", e);
          geoEl.disabled = false;
          geoEl.innerHTML = `<option value="">Unable to load</option>`;
        }
      };
    }

    levelEl.addEventListener("change", onLevelChange);
    await onLevelChange();
  }

  const start = () => init().catch(e => console.warn("[census-geo] fatal:", e));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
