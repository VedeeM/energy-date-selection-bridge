const LitElement = window.LitElement || Object.getPrototypeOf(customElements.get("ha-panel-lovelace"));
const html = window.LitHtml?.html || LitElement.prototype.html;
const css = window.LitHtml?.css || LitElement.prototype.css;

const DEFAULT_CONFIG = {
  show_card: true,
  synchronize: {
    auto_sync_sessionvars: true,
    dummy_refresh_helper: "input_number.dummy_refresh",
    auto_sync_helpers: false,
    start_date_helper: "input_datetime.energy_start_date",
    end_date_helper: "input_datetime.energy_end_date",
    date_offset_helper: "input_text.energy_date_offset",
    date_span_helper: "input_text.energy_date_span",
  },
  prefer: "energy",
  debug: false,
};

const FALLBACK_TRANSLATIONS = {
  editor: {
    show_card: "Show Card",
    auto_sync_sessionvars: "Auto Sync Session Vars",
    dummy_refresh_helper: "Refresh Helper",
    auto_sync_helpers: "Auto Sync Helpers",
    start_date_helper: "Start Date Helper",
    end_date_helper: "End Date Helper",
    date_offset_helper: "Date Offset Helper",
    date_span_helper: "Date Span Helper",
    advanced: "Advanced",
    prefer: "Prefer Date Source",
    prefer_energy: "Energy (default)",
    prefer_dom: "DOM",
    prefer_url: "URL",
    debug: "Debug Mode",
    missing_helpers_warning: "⚠️ Missing helpers"
  },
  card: {
    start: "Start",
    end: "End",
    offset: "Offset",
    span: "Span",
    invisible: "Card invisible in frontend"
  }
};

/// ---- Global caches ----
window.edsTranslations        = window.edsTranslations        || {};   // lang -> data object
window.edsTranslationsLoading = window.edsTranslationsLoading || {};   // lang -> in-flight Promise
window.edsTranslationsMissing = window.edsTranslationsMissing || new Set(); // languages we know are missing
window.edsTranslationsWarned  = window.edsTranslationsWarned  || new Set(); // languages we already logged about

async function loadTranslations(lang, debug = false) {
  if (!lang) return null;
  const key = String(lang).toLowerCase();

  // Already loaded?
  if (window.edsTranslations[key]) return window.edsTranslations[key];

  // Known missing? Don't retry or log again.
  if (window.edsTranslationsMissing.has(key)) return null;

  // Already fetching? Deduplicate.
  if (window.edsTranslationsLoading[key]) return window.edsTranslationsLoading[key];

  // Start a single fetch for this language
  window.edsTranslationsLoading[key] = (async () => {
    try {
      const url  = new URL(`./translations/${key}.json`, import.meta.url);
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`); // 404 etc.
      const data = await resp.json();
      window.edsTranslations[key] = data;
      return data;
    } catch (err) {
      // Remember it's missing; prevent future GETs
      window.edsTranslationsMissing.add(key);

      // Only print once per language, and only when debug is ON
      if (debug && !window.edsTranslationsWarned.has(key)) {
        console.debug(`[EDS-Bridge] Missing translation file: ${key}.json (${err.message})`);
        window.edsTranslationsWarned.add(key);
      }
      return null;
    } finally {
      delete window.edsTranslationsLoading[key];
    }
  })();

  return window.edsTranslationsLoading[key];
}

function _baseLang(code) { return code?.toLowerCase().split("-")[0] ?? "en"; }

function localize(hassOrLang, key) {
  const lang = typeof hassOrLang === "string"
    ? hassOrLang
    : (hassOrLang?.locale?.language || hassOrLang?.language || "en");

  const norm = lang.toLowerCase();
  const base = _baseLang(norm);
  const getPath = (src) => key.split(".").reduce((acc, p) => (acc ? acc[p] : undefined), src);

  return (
    getPath(window.edsTranslations?.[norm]) ||
    getPath(window.edsTranslations?.[base]) ||
    getPath(window.edsTranslations?.en) ||
    getPath(FALLBACK_TRANSLATIONS) ||
    key
  );
}

/* -----------------------------
 * CONFIG EDITOR
 * ----------------------------- */
class EnergyDateSelectionBridgeEditor extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      _config: { type: Object },
    };
  }

  constructor() {
    super();
    this._config = null;
    this._tabIndex = 0;
  }

setConfig(config) {
  if (!config) throw new Error("[eds-bridge] Missing config for energy-date-selection-bridge");

  // Deep merge user config with defaults
  this._config = {
    ...DEFAULT_CONFIG,
    ...config,
    synchronize: {
      ...DEFAULT_CONFIG.synchronize,
      ...(config.synchronize || {}),
    },
  };
}

  static get styles() {
    return css`
      ha-formfield { display: block; padding: 8px 0; }
      ha-switch { margin: 0 8px; }
      ha-textfield { display: block; width: 100%; }
      .sub-option {
        margin-left: 32px; margin-top: 8px;
        display: flex; flex-wrap: wrap; gap: 16px;
      }
      .card-config {display: grid; gap: 16px; }
      .row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 16px; }
    `;
  }

  static get properties() { return { hass: {type: Object}, _config: {type: Object}, _tabIndex: {type: Number} }; }

  render() {
    if (!this._config) return html`<p>Loading configuration...</p>`;
    const sync = this._config.synchronize;

    return html`
      <div class="card-config">
        ${this._renderSwitch(localize(this.hass, "editor.show_card"), "show_card", this._config.show_card)}
        ${this._renderSwitch(localize(this.hass, "editor.auto_sync_sessionvars"), "synchronize.auto_sync_sessionvars", sync.auto_sync_sessionvars)}
        ${sync.auto_sync_sessionvars ? this._renderTextField(localize(this.hass, "editor.dummy_refresh_helper"), "synchronize.dummy_refresh_helper", sync.dummy_refresh_helper) : ""}
        ${this._renderSwitch(localize(this.hass, "editor.auto_sync_helpers"), "synchronize.auto_sync_helpers", sync.auto_sync_helpers)}
        ${sync.auto_sync_helpers ? html`
          <div class="sub-option">
            ${this._renderTextField(localize(this.hass, "editor.start_date_helper"), "synchronize.start_date_helper", sync.start_date_helper)}
            ${this._renderTextField(localize(this.hass, "editor.end_date_helper"), "synchronize.end_date_helper", sync.end_date_helper)}
            ${this._renderTextField(localize(this.hass, "editor.date_offset_helper"), "synchronize.date_offset_helper", sync.date_offset_helper)}
            ${this._renderTextField(localize(this.hass, "editor.date_span_helper"), "synchronize.date_span_helper", sync.date_span_helper)}
          </div>` : ""}
        <ha-expansion-panel outlined>
          <div slot="header">${localize(this.hass, "editor.advanced")}</div>
          <div class="row">
            ${this._renderPreferSelect()}
            ${this._renderSwitch(localize(this.hass, "editor.debug"), "debug", this._config.debug)}
          </div>
        </ha-expansion-panel>  
      ${this._renderMissingHelpersWarning()}
      </div>
    `;
  }

  _renderSwitch(label, path, checked) {
    return html`
      <ha-formfield label=${label}>
        <ha-switch .checked=${checked} .configValue=${path} @change=${this._handleSwitchChange}></ha-switch>
      </ha-formfield>
    `;
  }

  _renderTextField(label, path, value) {
    return html`
      <ha-textfield label=${label} .value=${value} .configValue=${path} @input=${this._handleInputChange}></ha-textfield>
    `;
  }

_renderPreferSelect() {
  return html`
    <div class="select-wrapper">
      <ha-formfield>
        <ha-select
          label=${localize(this.hass, "editor.prefer")}
          .configValue=${"prefer"}
          .value=${this._config.prefer}
          @selected=${ev => this._updateConfigValue("prefer", ev.target.value)}
          @closed=${ev => ev.stopPropagation()}
        >
          <ha-list-item value="energy">${localize(this.hass, "editor.prefer_energy")}</ha-list-item>
          <ha-list-item value="dom">${localize(this.hass, "editor.prefer_dom")}</ha-list-item>
          <ha-list-item value="url">${localize(this.hass, "editor.prefer_url")}</ha-list-item>
        </ha-select>
      </ha-formfield>
    </div>
  `;
}

  _handleSwitchChange(ev) {
    this._updateConfigValue(ev.target.configValue, ev.target.checked);
  }

  _handleInputChange(ev) {
    this._updateConfigValue(ev.target.configValue, ev.target.value);
  }

  _updateConfigValue(path, value) {
    if (!path) return;
    const [section, key] = path.split(".");
    if (key) this._config[section][key] = value;
    else this._config[path] = value;
    this._dispatchConfig();
  }

_stripDefaults(obj, defaults) {
  const result = {};
  for (const [key, val] of Object.entries(obj)) {
    const defVal = defaults[key];
    if (typeof val === "object" && val !== null && !Array.isArray(val)) {
      const nested = this._stripDefaults(val, defVal || {});
      if (Object.keys(nested).length > 0) result[key] = nested;
    } else if (val !== defVal) {
      result[key] = val;
    }
  }
  return result;
}

_dispatchConfig() {
  const cleanConfig = this._stripDefaults(this._config, DEFAULT_CONFIG);
  this.dispatchEvent(new CustomEvent("config-changed", {
    detail: { config: { type: "custom:energy-date-selection-bridge", ...cleanConfig } },
    bubbles: true, composed: true,
  }));
}

  _renderMissingHelpersWarning() {
    const sync = this._config.synchronize;
    const effective = {
      start_date_helper: sync.start_date_helper,
      end_date_helper: sync.end_date_helper,
      date_offset_helper: sync.date_offset_helper,
      date_span_helper: sync.date_span_helper,
      dummy_refresh_helper: sync.dummy_refresh_helper,
    };

    const required = [];
    if (sync.auto_sync_helpers) {
      required.push(effective.start_date_helper, effective.end_date_helper, effective.date_offset_helper, effective.date_span_helper);
    }
    if (sync.auto_sync_sessionvars) required.push(effective.dummy_refresh_helper);

    const missing = required.filter(id => !this.hass?.states[id]);
    if (!missing.length) return "";
    return html`
      <div style="color: var(--error-color, red); margin-left:32px; font-weight:bold;">
        ${localize(this.hass, "editor.missing_helpers_warning")}:
        ${missing.map(id => html`<div>${id}</div>`)}
      </div>`;
  }
}

customElements.define("energy-date-selection-bridge-editor", EnergyDateSelectionBridgeEditor);

/* -----------------------------
 * MAIN CARD
 * ----------------------------- */

class EnergyDateSelectionBridge extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      _config: { type: Object },
      _lastDates: { type: String },
      _start: { type: Object },
      _end: { type: Object },
      _langReady: { type: Boolean },
      _currentLang: { type: String },
    };
  }

  constructor() {
    super();
    this._config = null;
    this._lastDates = null;
    this._start = null;
    this._end = null;
    this._energyObj = this._energyUnsub = null;
    this._retryTimer = this._retryStart = null;
    this._langReady = false;
    this._currentLang = undefined;
    this._langPromise = null;
  }

  set hass(hass) {
    this._hass = hass;
    this._ensureLanguageLoaded();
    this._ensureEnergySubscription();
    this.updateDates();
  }

  _ensureLanguageLoaded() {
    const lang = this._hass?.locale?.language || this._hass?.language || "en";
  
    // Already loaded, or already in-flight for this language? Bail out.
    if (lang === this._currentLang && (this._langReady || this._langPromise)) return;
  
    this._currentLang = lang;
    const norm = lang.toLowerCase();
    const base = norm.includes("-") ? norm.split("-")[0] : norm;
    const dbg  = !!this._config?.debug;
  
    // Build a unique list: e.g. ['nl-be', 'nl', 'en'] or ['nl','en']
    const langs = Array.from(new Set([norm, base, "en"].filter(Boolean)));
  
    // Fetch each at most once; errors are handled & debug-gated in loadTranslations()
    this._langPromise = Promise.all(langs.map((l) => loadTranslations(l, dbg)))
      .then(() => { this._langReady = true; })
      .catch(() => { this._langReady = true; })
      .finally(() => { this._langPromise = null; this.requestUpdate(); });
  }
  
  static getConfigElement() {
    return document.createElement("energy-date-selection-bridge-editor");
  }

  static getStubConfig() {
    return {
      type: "custom:energy-date-selection-bridge",
      ...DEFAULT_CONFIG,
    };
  }

  getCardSize() {
    return 1;
  }

  setConfig(config) {
    if (!config) throw new Error("Missing config for energy-date-selection-bridge");
    this._config = {
      ...DEFAULT_CONFIG,
      ...config,
      synchronize: {
        ...DEFAULT_CONFIG.synchronize,
        ...(config.synchronize || {}),
      },
    };
  }

  connectedCallback() {
    super.connectedCallback();
    this._ensureEnergySubscription();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._cleanupSubscription();
  }

  /* ---- subscription handling ---- */
  _ensureEnergySubscription() {
    if (!this._hass?.connection) return;
    const energy = this._hass.connection._energy;
    if (energy === this._energyObj) return;

    this._cleanupSubscription();
    this._energyObj = energy;

    if (energy?.subscribe) {
      try {
        const unsub = energy.subscribe(this._onEnergyData.bind(this));
        this._energyUnsub = typeof unsub === "function" ? unsub : unsub?.unsubscribe?.bind(unsub) || null;
      } catch (err) {
        console.debug("[eds-bridge] Energy subscribe failed:", err);
        this.updateDates();
      }
    } else {
      if (!this._retryStart) this._retryStart = Date.now();
      if (Date.now() - this._retryStart < 10000) {
        this._retryTimer = setTimeout(() => this._ensureEnergySubscription(), 100);
      } else {
        console.debug("[eds-bridge] Energy data not available. Add `type: energy-date-selection` card.");
      }
    }
  }

  _cleanupSubscription() {
    if (this._energyUnsub) try { this._energyUnsub(); } catch {} 
    this._energyUnsub = this._energyObj = this._retryStart = null;
    if (this._retryTimer) clearTimeout(this._retryTimer);
    this._retryTimer = null;
  }

  _onEnergyData(data) {
    const [s, e] = [this._parseDate(data?.start), this._parseDate(data?.end)];
    if (s && e) this._handleNewDates(s, e);
    else this.updateDates(); // fallback
  }

  /* ---- date detection ---- */
  updateDates() {
    let s, e;

    switch (this._config?.prefer) {
      case "url":
        [s, e] = this._getURLDates() || [];
        break;
      case "dom":
        [s, e] = this._getDOMDates() || [];
        break;
      default: // energy
        [s, e] = this._getEnergyDates() || [];
    }

    // fallback chain if chosen source failed
    if (!s || !e) {
      [s, e] = this._getEnergyDates() || this._getDOMDates() || this._getURLDates() || [];
    }

    // final fallback = today
    if (!s || !e) {
      const today = new Date();
      s = new Date(today.setHours(0, 0, 0, 0));
      e = new Date(today.setHours(23, 59, 59, 999));
    }
    this._handleNewDates(s, e);
  }

  _getEnergyDates() {
    const en = this._hass?.connection?._energy;
    if (en?.start && en?.end) {
      if (this?._config?.debug) console.log(`[eds-bridge] Energy dates used: ${en.start} to ${en.end}  `);
      const s = this._parseDate(en.start), e = this._parseDate(en.end);
      if (s && e) return [s, e];
    }
    return null;
  }

  _getDOMDates() {
    const picker = document.querySelector("energy-date-selection");
    if (picker?._startDate && picker?._endDate) {
      if (this?._config?.debug) console.log(`[eds-bridge] DOM dates used: ${picker._startDate} to ${picker._endDate}  `);
      return [this._parseDate(picker._startDate), this._parseDate(picker._endDate)];
    }
    return null;
  }

  _getURLDates() {
    try {
      const params = new URLSearchParams(window.location.search);
      const startDate = this._parseDate(params.get("start_date"), "dd-mm-yyyy");
      const endDate = this._parseDate(params.get("end_date"), "dd-mm-yyyy");
      if (this?._config?.debug) console.log(`[eds-bridge] URL dates used: ${startDate} to ${endDate}`);
      return [startDate, endDate];
    } catch {
      return null;
    }
  }

  _parseDate(val, format = "iso") {
    if (!val) return null;
  
    if (format === "dd-mm-yyyy") {
      const [day, month, year] = val.split("-");
      if (day && month && year) {
        const parsedDate = new Date(`${year}-${month}-${day}`);
        return isNaN(parsedDate) ? null : parsedDate;
      }
    }
  
    // Default ISO format parsing
    const d = val instanceof Date ? val : new Date(val);
    return isNaN(d) ? null : d;
  }

  // _getURLDates() {
  //   try {
  //     if (this?._config?.debug) console.log(`URL dates used`);
  //     const params = new URLSearchParams(window.location.search);
  //     return [this._parseDate(params.get("start_date")), this._parseDate(params.get("end_date"))];
  //   } catch { return null; }
  // }

  // _parseDate(val) {
  //   if (!val) return null;
  //   const d = val instanceof Date ? val : new Date(val);
  //   return isNaN(d) ? null : d;
  // }

  /* ---- rendering / syncing ---- */
  _handleNewDates(start, end) {
    const hash = `${start.getTime()}-${end.getTime()}`;
    if (this._lastDates === hash) return;
    this._lastDates = hash;
    this._start = start;
    this._end = end;
    this._syncToHelpers(start, end);
    this.requestUpdate();
  }

  _formatDateForHelper(d) {
    return d.toISOString().split("T")[0];
  }

  _formatDate(d) {
    try {
      return d.toLocaleDateString(this._hass?.locale?.language || "en", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      return `${day}-${month}-${year}`;
    }
  }

  _calculateDateOffset(s) {
    return s
      ? `${Math.sign((s - new Date().setHours(0, 0, 0, 0)) / 86400000) >= 0 ? "+" : ""}${Math.round(
          (s - new Date().setHours(0, 0, 0, 0)) / 86400000
        )}d`
      : "-0d";
  }

  _calculateDateSpan(s, e) {
    return !s || !e ? "1d" : `${Math.round((e - s) / 86400000)}d`;
  }

  async _callServiceSafe(domain, service, data) {
    try { await this._hass.callService(domain, service, data); }
    catch (err) { console.warn(`[eds-bridge] Service call failed: ${domain}.${service}`, err); }
  }

  async _syncToHelpers(s, e) {
    if (!this._hass?.callService) return;
    const { synchronize: sync, debug } = this._config;
    const offset = this._calculateDateOffset(s), span = this._calculateDateSpan(s, e);

    if (sync.auto_sync_helpers) {
      await Promise.all([
        this._callServiceSafe("input_datetime", "set_datetime", { entity_id: sync.start_date_helper, date: this._formatDateForHelper(s) }),
        this._callServiceSafe("input_datetime", "set_datetime", { entity_id: sync.end_date_helper, date: this._formatDateForHelper(e) }),
        this._callServiceSafe("input_text", "set_value", { entity_id: sync.date_offset_helper, value: offset }),
        this._callServiceSafe("input_text", "set_value", { entity_id: sync.date_span_helper, value: span }),
      ]);
      if (debug) console.log(`[eds-bridge] sessionStorage synced ${s} to ${e}`);
    }
    if (sync.auto_sync_sessionvars) {
      sessionStorage.setItem("session_start_date", this._formatDateForHelper(s));
      sessionStorage.setItem("session_end_date", this._formatDateForHelper(e));
      sessionStorage.setItem("session_offset", offset);
      sessionStorage.setItem("session_span", span);
      this._callServiceSafe("input_number", "set_value", { entity_id: sync.dummy_refresh_helper, value: Math.random() });
      if (debug) console.log(`[eds-bridge] helpers synced ${s} to ${e}`);
      }
  }

  /* ---------------- STYLES ---------------- */
  static get styles() {
    return css`
      ha-card {
        padding: 16px;
        background: var(--card-background-color);
        border-radius: var(--ha-card-border-radius, 12px);
        box-shadow: var(--ha-card-box-shadow);
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      /* show card in edit and preview mode */
      :host-context(.edit-mode),
      :host-context([editmode]),
      :host-context(.editmode),
      :host-context(.preview),
      :host-context([preview]) {
        ha-card {
          display: flex !important;
        }
        .invisible {
          color: red;
          text-align: center;
        }
      }
      .dates {
        display: flex;
        justify-content: space-between;
        gap: 8px;
      }
      .separator {
        flex: 0;
        align-self: center;
      }
    `;
  }

  /* ---------------- RENDER ---------------- */
  render() {
    if (!this._start || !this._end) {
      return html`<ha-card><p>Loading dates...</p></ha-card>`;
    }

    const offset = this._calculateDateOffset(this._start);
    const span = this._calculateDateSpan(this._start, this._end);

    return html`
      <ha-card style="display:${this._config?.show_card ? "block" : "none"}">
          <div class="dates">
            <div class="date">${localize(this._hass, "card.start")}: ${this._formatDate(this._start)}</div>
            <div class="separator">⇄</div>
            <div class="date">${localize(this._hass, "card.end")}: ${this._formatDate(this._end)}</div>
          </div>
          <div class="dates">
            <div class="date">${localize(this._hass, "card.offset")}: ${offset}</div>
            <div class="date">${localize(this._hass, "card.span")}: ${span}</div>
          </div>
          ${!this._config?.show_card
            ? html`<div class="invisible">${localize(this._hass, "card.invisible")}</div>`
            : ""}
      </ha-card>
    `;
  }
}
customElements.define("energy-date-selection-bridge", EnergyDateSelectionBridge);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "energy-date-selection-bridge",
  name: "Energy Date Selection Bridge",
  description: "Synchronizes sessionStorage or helpers with the core energy date selection system.",
});