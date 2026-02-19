/**
 * FRED KPI cards for economic-dashboard.html
 * - Pulls latest values from FRED API using window.APP_CONFIG.FRED_API_KEY (js/config.js)
 * - Updates card value elements:
 *    #statCpi (Inflation CPI YoY)
 *    #statUnemp (Unemployment rate)
 *    #stat10y (10-Year Treasury)
 *    #statStarts (Housing starts SAAR)
 */
(() => {
  const KEY = (window.APP_CONFIG && window.APP_CONFIG.FRED_API_KEY) ? window.APP_CONFIG.FRED_API_KEY : "";

  const SERIES = [
    {
      id: "CPIAUCSL",
      el: "statCpi",
      label: "Inflation (CPI YoY)",
      units: "pc1", // percent change from year ago
      format: (v) => `${v.toFixed(1)}%`,
    },
    {
      id: "UNRATE",
      el: "statUnemp",
      label: "Unemployment rate",
      units: "lin",
      format: (v) => `${v.toFixed(1)}%`,
    },
    {
      id: "DGS10",
      el: "stat10y",
      label: "10-Year Treasury",
      units: "lin",
      format: (v) => `${v.toFixed(2)}%`,
    },
    {
      id: "HOUST",
      el: "statStarts",
      label: "Housing starts (SAAR)",
      units: "lin",
      format: (v) => {
        // series is "Thousands of Units" (SAAR); show with k
        if (!isFinite(v)) return "—";
        const units = v * 1000;
        if (units >= 1_000_000) return `${(units/1_000_000).toFixed(2)}M`;
        if (units >= 1_000) return `${(units/1_000).toFixed(0)}k`;
        return `${Math.round(units)}`;
      },
    },
  ];

  const setText = (id, txt) => {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  };

  const fredUrl = (seriesId) =>
    `https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(seriesId)}&api_key=${encodeURIComponent(KEY)}&file_type=json&sort_order=desc&limit=1`;

  async function fetchLatest(seriesId, units) {
    if (!KEY) throw new Error("Missing FRED_API_KEY in window.APP_CONFIG");
    const url = fredUrl(seriesId) + (units && units !== "lin" ? `&units=${encodeURIComponent(units)}` : "");
    const res = await fetch(url);
    if (!res.ok) throw new Error(`FRED request failed (${res.status}) for ${seriesId}`);
    const data = await res.json();
    const obs = (data && data.observations && data.observations[0]) ? data.observations[0] : null;
    if (!obs) throw new Error(`No observations returned for ${seriesId}`);
    const raw = obs.value;
    const val = (raw === "." || raw === null || raw === undefined) ? NaN : Number(raw);
    return { val, date: obs.date };
  }

  async function run() {
    // show loading state
    SERIES.forEach(s => setText(s.el, "Loading…"));

    try {
      await Promise.all(SERIES.map(async (s) => {
        const { val } = await fetchLatest(s.id, s.units);
        if (!isFinite(val)) {
          setText(s.el, "—");
        } else {
          setText(s.el, s.format(val));
        }
      }));
    } catch (e) {
      console.warn("[fred-cards] error:", e);
      SERIES.forEach(s => setText(s.el, "—"));
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
