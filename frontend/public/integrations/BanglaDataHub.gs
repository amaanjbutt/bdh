/**
 * PakDataHub for Google Sheets — Pakistan's official economic and financial data in a cell.
 * https://pakdatahub.com/docs/spreadsheets
 *
 * Install (once per spreadsheet, about a minute):
 *   1. Extensions -> Apps Script. Delete what's there, paste this whole file, click Save.
 *   2. Reload the spreadsheet. A "PakDataHub" menu appears -> "Set API key" -> paste your key
 *      (free at https://pakdatahub.com/signup). It is stored in your own Google account
 *      (UserProperties), never in a cell.
 *
 * Functions:
 *   =PAKDATA("fx.rate.avg.usd")                          full table: Date | Value (oldest first)
 *   =PAKDATA("inflation.cpi.national.yoy", "2020-01-01")  from a date
 *   =PAKDATA("rates.kibor.3m", "2025-01-01", , "side:offer")   with a dimension filter
 *   =PAKDATA("inflation.cpi.national", "2015-01-01", , , "yoy") server-side transform
 *   =PAKDATA_LATEST("rates.policy")                      the latest value, as a number
 *   =PAKDATA_LATEST("rates.kibor.3m", "side:offer")
 *   =PAKDATA_SEARCH("remittances")                       find series ids
 *   =PAKDATA_INFO("fx.rate.avg.usd")                     name, unit, frequency, source, dates
 *
 * Every PAKDATA / PAKDATA_LATEST call is one API request. Results are cached (6 hours for
 * tables, 1 hour for latest values) so recalculating a sheet doesn't spend your free
 * plan's 500 monthly calls. PAKDATA_SEARCH and PAKDATA_INFO use public endpoints and
 * cost nothing.
 */

var PAKDATA_BASE = "https://api.pakdatahub.com";
var PAKDATA_KEY_PROP = "PAKDATA_API_KEY";
var PAKDATA_VERSION = "1.0.0";

// ---- menu -------------------------------------------------------------------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("PakDataHub")
    .addItem("Set API key", "pakdataSetKey")
    .addItem("Refresh data (clear cache)", "pakdataClearCache")
    .addItem("Help", "pakdataHelp")
    .addToUi();
}

function pakdataSetKey() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt(
    "PakDataHub API key",
    "Paste your API key (starts with pk_live_). Get one free at pakdatahub.com/signup.",
    ui.ButtonSet.OK_CANCEL
  );
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var key = String(res.getResponseText() || "").trim();
  if (!/^pk_(live|test)_/.test(key)) {
    ui.alert("That doesn't look like a PakDataHub key (it should start with pk_live_).");
    return;
  }
  PropertiesService.getUserProperties().setProperty(PAKDATA_KEY_PROP, key);
  pakdataClearCache();
  ui.alert("Saved. =PAKDATA(...) formulas will now use this key.");
}

function pakdataClearCache() {
  // Bump a generation counter: every cache key includes it, so old entries are ignored.
  var props = PropertiesService.getUserProperties();
  props.setProperty("PAKDATA_CACHE_GEN", String(Date.now()));
  SpreadsheetApp.getActive().toast("PakDataHub: cache cleared. Edit or reload a formula to refetch.");
}

function pakdataHelp() {
  SpreadsheetApp.getUi().alert(
    "PakDataHub functions",
    '=PAKDATA("fx.rate.avg.usd", "2020-01-01")\n' +
      '=PAKDATA_LATEST("rates.kibor.3m", "side:offer")\n' +
      '=PAKDATA_SEARCH("remittances")\n' +
      '=PAKDATA_INFO("fx.rate.avg.usd")\n\nDocs: https://pakdatahub.com/docs/spreadsheets',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

// ---- custom functions ------------------------------------------------------------

/**
 * Observations for a PakDataHub series as a table (Date, [dimensions], Value), oldest first.
 *
 * @param {string} seriesId  Series id, e.g. "fx.rate.avg.usd" (find ids with PAKDATA_SEARCH).
 * @param {string} from      Optional start date, "YYYY-MM-DD" (or a date cell).
 * @param {string} to        Optional end date, "YYYY-MM-DD" (or a date cell).
 * @param {string} dims      Optional dimension filter, e.g. "side:offer" or "city:karachi".
 * @param {string} transform Optional: yoy, mom, pct_change, 3ma or index.
 * @return Table of observations.
 * @customfunction
 */
function PAKDATA(seriesId, from, to, dims, transform) {
  var id = pakdataId_(seriesId);
  var q = { sort: "asc", limit: "5000" };
  if (from) q.from = pakdataDate_(from);
  if (to) q.to = pakdataDate_(to);
  if (dims) q.dims = String(dims).trim();
  if (transform) q.transform = String(transform).trim().toLowerCase();
  var body = pakdataGet_("/v1/series/" + encodeURIComponent(id), q, true, 21600);
  var rows = body.data || [];
  if (!rows.length) return [["No data for " + id + " in this range"]];
  // Dimension columns (e.g. side, city) when the series carries more than one value per date.
  var dimKeys = [];
  rows.forEach(function (r) {
    Object.keys(r.dims || {}).forEach(function (k) {
      if (dimKeys.indexOf(k) < 0) dimKeys.push(k);
    });
  });
  var header = ["Date"].concat(dimKeys).concat([pakdataValueLabel_(body.meta)]);
  var out = [header];
  rows.forEach(function (r) {
    var line = [pakdataToDate_(r.date)];
    dimKeys.forEach(function (k) {
      line.push((r.dims || {})[k] == null ? "" : String(r.dims[k]));
    });
    line.push(r.value == null ? "" : Number(r.value));
    out.push(line);
  });
  return out;
}

/**
 * The most recent value of a PakDataHub series, as a number.
 *
 * @param {string} seriesId Series id, e.g. "rates.policy".
 * @param {string} dims     Optional dimension filter, e.g. "side:offer".
 * @return The latest value.
 * @customfunction
 */
function PAKDATA_LATEST(seriesId, dims) {
  var id = pakdataId_(seriesId);
  var q = {};
  if (dims) q.dims = String(dims).trim();
  var body = pakdataGet_("/v1/series/" + encodeURIComponent(id) + "/latest", q, true, 3600);
  var rows = (body.data || []).filter(function (r) { return r.value != null; });
  if (!rows.length) throw new Error("No latest value for " + id);
  if (rows.length > 1 && !dims) {
    var keys = Object.keys(rows[0].dims || {});
    if (keys.length) {
      throw new Error(id + " has several values per date — add a filter, e.g. \"" +
        keys[0] + ":" + rows[0].dims[keys[0]] + "\"");
    }
  }
  return Number(rows[0].value);
}

/**
 * Search the PakDataHub catalog. Free — uses the public search endpoint.
 *
 * @param {string} query Words to search for, e.g. "remittances saudi".
 * @param {number} limit Optional max results (default 20, max 50).
 * @return Table of id, name, unit, frequency, module.
 * @customfunction
 */
function PAKDATA_SEARCH(query, limit) {
  if (!query) throw new Error("Give a search term, e.g. =PAKDATA_SEARCH(\"kibor\")");
  var n = Math.min(Math.max(Number(limit) || 20, 1), 50);
  var body = pakdataGet_("/v1/search", { q: String(query), limit: String(n) }, false, 21600);
  var rows = body.data || [];
  if (!rows.length) return [["No series match \"" + query + "\""]];
  var out = [["Series id", "Name", "Unit", "Frequency", "Module"]];
  rows.forEach(function (r) {
    out.push([r.id, r.name, r.unit || "", r.frequency || "", r.module || ""]);
  });
  return out;
}

/**
 * Catalog metadata for a series: name, unit, frequency, source and date range. Free.
 *
 * @param {string} seriesId Series id, e.g. "fx.rate.avg.usd".
 * @return Two-column table of fields and values.
 * @customfunction
 */
function PAKDATA_INFO(seriesId) {
  var id = pakdataId_(seriesId);
  var r = pakdataGet_("/v1/catalog/" + encodeURIComponent(id), {}, false, 21600);
  return [
    ["Series id", r.id],
    ["Name", r.name],
    ["Description", r.description || ""],
    ["Unit", r.unit || ""],
    ["Frequency", r.frequency || ""],
    ["Source", r.source || ""],
    ["First observation", r.first_date ? pakdataToDate_(r.first_date) : ""],
    ["Last observation", r.last_date ? pakdataToDate_(r.last_date) : ""],
    ["Page", "https://pakdatahub.com/series/" + r.id],
  ];
}

// ---- internals -----------------------------------------------------------------

function pakdataId_(seriesId) {
  var id = String(seriesId == null ? "" : seriesId).trim();
  if (!id) throw new Error("Give a series id, e.g. \"fx.rate.avg.usd\" (find ids with =PAKDATA_SEARCH(\"...\"))");
  return id;
}

function pakdataKey_() {
  var key = PropertiesService.getUserProperties().getProperty(PAKDATA_KEY_PROP);
  if (!key) throw new Error("No API key yet: PakDataHub menu -> Set API key (free at pakdatahub.com/signup)");
  return key;
}

function pakdataDate_(v) {
  if (Object.prototype.toString.call(v) === "[object Date]") {
    return Utilities.formatDate(v, "UTC", "yyyy-MM-dd");
  }
  var s = String(v).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error("Dates must look like 2024-01-31 (got " + s + ")");
  return s;
}

function pakdataToDate_(iso) {
  var p = String(iso).slice(0, 10).split("-");
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function pakdataValueLabel_(meta) {
  if (!meta) return "Value";
  var unit = meta.unit ? " (" + meta.unit + ")" : "";
  return (meta.transform ? meta.transform.toUpperCase() + " " : "") + "Value" + unit;
}

function pakdataQuery_(params) {
  var parts = [];
  Object.keys(params).forEach(function (k) {
    parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(params[k]));
  });
  return parts.length ? "?" + parts.join("&") : "";
}

/** GET a PakDataHub endpoint (cached). keyed=true sends the user's API key. */
function pakdataGet_(path, params, keyed, ttlSeconds) {
  var url = PAKDATA_BASE + path + pakdataQuery_(params || {});
  var gen = PropertiesService.getUserProperties().getProperty("PAKDATA_CACHE_GEN") || "0";
  var cacheKey = "pd:" + gen + ":" + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, url + (keyed ? ":k" : "")));
  var cache = CacheService.getScriptCache();
  var hit = cache && cache.get(cacheKey);
  if (hit) return JSON.parse(hit);

  var headers = { "User-Agent": "PakDataHub-Sheets/" + PAKDATA_VERSION, Accept: "application/json" };
  if (keyed) headers["X-API-Key"] = pakdataKey_();
  var res = UrlFetchApp.fetch(url, { method: "get", headers: headers, muteHttpExceptions: true });
  var code = res.getResponseCode();
  var text = res.getContentText();
  var body;
  try {
    body = JSON.parse(text);
  } catch (e) {
    throw new Error("PakDataHub returned HTTP " + code);
  }
  if (code >= 400 || body.success === false) {
    var msg = (body.error && body.error.message) || body.detail || ("HTTP " + code);
    var hint = {
      401: " — check your key (PakDataHub menu -> Set API key)",
      402: " — this month's free calls are used up; they reset on the 1st, or upgrade at pakdatahub.com/pricing",
      403: " — this needs a higher plan (pakdatahub.com/pricing)",
      404: " — unknown series id; try =PAKDATA_SEARCH(\"...\")",
      429: " — rate limit; wait a minute and recalculate",
    }[code] || "";
    throw new Error(msg + hint);
  }
  // CacheService values are capped at 100KB; skip caching very large tables.
  if (cache && text.length < 95000) cache.put(cacheKey, text, ttlSeconds);
  return body;
}
