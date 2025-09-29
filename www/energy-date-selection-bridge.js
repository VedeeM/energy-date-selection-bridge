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

let translations = {};
async function loadTranslations(lang) {
  if (translations[lang]) return translations[lang];
  try {
    const resp = await fetch(
      new URL(`./translations/${lang}.json`, import.meta.url)
    );
    const data = await resp.json();
    translations[lang] = data;
    return data;
  } catch (err) {
    console.warn(`No translation found for ${lang}, falling back to en`, err);
    if (lang !== "en") return loadTranslations("en");
    return {};
  }
}

function t(lang, key) {
  const parts = key.split(".");
  let value = translations[lang];
  for (const p of parts) {
    if (!value) break;
    value = value[p];
  }
  return value || key;
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
  }

setConfig(config) {
  if (!config) throw new Error("Missing config for energy-date-selection-bridge");

  // Deep merge user config with defaults
  this._config = {
    ...DEFAULT_CONFIG,
    ...config,
    synchronize: {
      ...DEFAULT_CONFIG.synchronize,
      ...(config.synchronize || {}),
    },
  };
  if (this.hass?.language) {
    loadTranslations(this.hass.language);
  } else {
    loadTranslations("en");
  }
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
    `;
  }

  render() {
    if (!this._config) return html`<p>Loading configuration...</p>`;
    const sync = this._config.synchronize;

    return html`
      <div class="card-config">
        ${this._renderSwitch(t(this.hass?.language || "en", "editor.show_card"), "show_card", this._config.show_card)}
        ${this._renderSwitch(t(this.hass?.language || "en", "editor.auto_sync_sessionvars"), "synchronize.auto_sync_sessionvars", sync.auto_sync_sessionvars)}
        ${sync.auto_sync_sessionvars ? this._renderTextField(t(this.hass.language, "editor.dummy_refresh_helper"), "synchronize.dummy_refresh_helper", sync.dummy_refresh_helper) : ""}
        ${this._renderSwitch(t(this.hass?.language || "en", "editor.auto_sync_helpers"), "synchronize.auto_sync_helpers", sync.auto_sync_helpers)}
        ${sync.auto_sync_helpers ? html`
          <div class="sub-option">
            ${this._renderTextField(t(this.hass?.language || "en", "editor.start_date_helper"), "synchronize.start_date_helper", sync.start_date_helper)}
            ${this._renderTextField(t(this.hass?.language || "en", "editor.end_date_helper"), "synchronize.end_date_helper", sync.end_date_helper)}
            ${this._renderTextField(t(this.hass?.language || "en", "editor.date_offset_helper"), "synchronize.date_offset_helper", sync.date_offset_helper)}
            ${this._renderTextField(t(this.hass?.language || "en", "editor.date_span_helper"), "synchronize.date_span_helper", sync.date_span_helper)}
          </div>` : ""}
        ${this._renderPreferSelect()}
        ${this._renderSwitch(t(this.hass?.language || "en", "editor.debug"), "debug", this._config.debug)}
      </div>

      ${this._renderMissingHelpersWarning()}
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
          label=${t(this.hass?.language || "en", "editor.prefer")}
          .configValue=${"prefer"}
          .value=${this._config.prefer}
          @selected=${ev => this._updateConfigValue("prefer", ev.target.value)}
          @closed=${ev => ev.stopPropagation()}
        >
          <ha-list-item value="energy">${t(this.hass?.language || "en", "editor.prefer_energy")}</ha-list-item>
          <ha-list-item value="dom">${t(this.hass?.language || "en", "editor.prefer_dom")}</ha-list-item>
          <ha-list-item value="url">${t(this.hass?.language || "en", "editor.prefer_url")}</ha-list-item>
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
        ⚠️ ${t(this.hass.language, "editor.missing_helpers_warning")}:
        ${missing.map(id => html`<div>${id}</div>`)}
      </div>`;
  }
}
loadTranslations("en");

customElements.define("energy-date-selection-bridge-editor", EnergyDateSelectionBridgeEditor);

/* -----------------------------
 * MAIN CARD
 * ----------------------------- */
class EnergyDateSelectionBridge extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass = null;
    this._config = null;
    this._energyObj = this._energyUnsub = null;
    this._retryTimer = this._retryStart = this._lastDates = null;
  }

  static getConfigElement() {
    return document.createElement('energy-date-selection-bridge-editor');
  }

  static getStubConfig() {
    return {
      type: "custom:energy-date-selection-bridge",
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
      debug: false,
    };
  }

  getCardSize() {
    return 1;
  }

setConfig(config) {
  if (!config) throw new Error("Missing config for energy-date-selection-bridge");

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

  connectedCallback() { this._ensureEnergySubscription(); }
  disconnectedCallback() { this._cleanupSubscription(); }

  set hass(hass) {
    this._hass = hass;
    if (hass?.language) {
      loadTranslations(hass.language);
    } else {
      loadTranslations("en")
    }
    this._ensureEnergySubscription();
    this.updateDates();
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
        console.debug("Energy subscribe failed:", err);
        this.updateDates();
      }
    } else {
      if (!this._retryStart) this._retryStart = Date.now();
      if (Date.now() - this._retryStart < 10000) {
        this._retryTimer = setTimeout(() => this._ensureEnergySubscription(), 100);
      } else {
        console.debug("Energy data not available. Add `type: energy-date-selection` card.");
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
      if (this?._config?.debug) console.log(`Energy dates used: ${en.start} to ${en.end}  `);
      const s = this._parseDate(en.start), e = this._parseDate(en.end);
      if (s && e) return [s, e];
    }
    return null;
  }

  _getDOMDates() {
    const picker = document.querySelector("energy-date-selection");
    if (picker?._startDate && picker?._endDate) {
      if (this?._config?.debug) console.log(`DOM dates used: ${picker._startDate} to ${picker._endDate}  `);
      return [this._parseDate(picker._startDate), this._parseDate(picker._endDate)];
    }
    return null;
  }

  _getURLDates() {
    try {
      const params = new URLSearchParams(window.location.search);
      const startDate = this._parseDate(params.get("start_date"), "dd-mm-yyyy");
      const endDate = this._parseDate(params.get("end_date"), "dd-mm-yyyy");
      if (this?._config?.debug) console.log(`URL dates used: ${startDate} to ${endDate}`);
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
    this.render(start, end);
    this._syncToHelpers(start, end);
  }

  _formatDateForHelper(d) { return d.toISOString().split("T")[0]; }
  
  // _formatDate(d) {
  //   try { return d.toLocaleDateString(this._hass?.locale?.language || "en", { year: "numeric", month: "2-digit", day: "2-digit" }); }
  //   catch { return d.toISOString().slice(0, 10); }
  // }

  _formatDate(d) {
    try {
      return d.toLocaleDateString(this._hass?.locale?.language || "en", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      // Fallback to manual formatting if `toLocaleDateString` fails
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      return `${day}-${month}-${year}`;
    }
  }

  _calculateDateOffset(s) { return s ? `${Math.sign((s - new Date().setHours(0,0,0,0)) / 86400000) >= 0 ? "+" : ""}${Math.round((s - new Date().setHours(0,0,0,0)) / 86400000)}d` : "-0d"; }
  _calculateDateSpan(s, e) { return !s || !e ? "1d" : `${Math.round((e - s) / 86400000)}d`; }

  async _callServiceSafe(domain, service, data) {
    try { await this._hass.callService(domain, service, data); }
    catch (err) { console.warn(`Service call failed: ${domain}.${service}`, err); }
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
    }
    if (sync.auto_sync_sessionvars) {
      sessionStorage.setItem("session_start_date", this._formatDateForHelper(s));
      sessionStorage.setItem("session_end_date", this._formatDateForHelper(e));
      sessionStorage.setItem("session_offset", offset);
      sessionStorage.setItem("session_span", span);
      this._callServiceSafe("input_number", "set_value", { entity_id: sync.dummy_refresh_helper, value: Math.random() });
    }
    if (debug) console.log(`energy-date-selection-bridge: synced ${s} to ${e}`);
  }

  render(s, e) {
    const offset = this._calculateDateOffset(s), span = this._calculateDateSpan(s, e);
    this.shadowRoot.innerHTML = `
<style>
  .card {
    padding: 16px;
    background: var(--card-background-color);
    border-radius: var(--ha-card-border-radius, 4px);
    box-shadow: var(--ha-card-box-shadow);
    display: ${this._config?.show_card ? "flex" : "none"};
    flex-direction: column;
    gap: 12px;
  }

  .invisible {
    color: red;
    text-align: center;
    display: ${this._config?.show_card ? "none" : "block"};
  }

  :host-context(.edit-mode),
  :host-context([editmode]),
  :host-context(.editmode) {
    .card {
      display: flex !important;
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
</style>

<div class="card">
  <div class="dates">
    <div class="date">${t(this._hass?.language || "en", "card.start")}: ${this._formatDate(s)}</div>
    <div class="separator">⇄</div>
    <div class="date">${t(this._hass?.language || "en", "card.end")}: ${this._formatDate(e)}</div>
  </div>
  <div class="dates">
    <div class="date">${t(this._hass?.language || "en", "card.offset")}: ${offset}</div>
    <div class="date">${t(this._hass?.language || "en", "card.span")}: ${span}</div>
  </div>
  <div class="invisible">${t(this._hass?.language || "en", "card.invisible")}</div>
</div>`;

  }
}
customElements.define("energy-date-selection-bridge", EnergyDateSelectionBridge);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "energy-date-selection-bridge",
  name: "Energy Date Selection Bridge",
  description: "Synchronizes sessionStorage or helpers with the core energy date selection system.",
});

loadTranslations("en");