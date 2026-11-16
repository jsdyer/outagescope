export const API = 'https://api.ioda.inetintel.cc.gatech.edu/v2/';
export const PAGE = 'https://ioda.inetintel.cc.gatech.edu/';
export const DAY = 86400;
export const SOURCES = Object.freeze({
  bgp: {label: 'BGP visibility', detail: 'Observed visibility of Internet routing announcements.'},
  'ping-slash24': {label: 'Active probing', detail: 'Responses from tested IPv4 network blocks.'},
  'merit-nt': {label: 'Background traffic', detail: 'Unsolicited traffic seen by the Merit Network Telescope.'},
});

export function entityCode(type, raw) {
  const input = String(raw).trim().toUpperCase();
  if (type === 'country') return /^[A-Z]{2}$/.test(input) ? input : null;
  if (!['region','asn'].includes(type)) return null;
  const digits = type === 'asn' ? input.replace(/^AS\s*/, '') : input;
  const number = /^\d{1,10}$/.test(digits) ? Number(digits) : 0;
  return number > 0 && number <= 4294967295 ? String(number) : null;
}

function midnight(raw) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const millis = Date.parse(`${raw}T00:00:00Z`);
  return Number.isFinite(millis) && new Date(millis).toISOString().slice(0,10) === raw ? millis / 1000 : null;
}

export function parseWindow(from, through, now = Math.floor(Date.now()/1000)) {
  const start = midnight(from), end = midnight(through);
  if (start === null || end === null || start > end) throw new Error('Enter a valid date range in UTC.');
  const until = Math.min(end + DAY, now);
  if (start >= until) throw new Error('The start date is still in the future.');
  if (end + DAY - start > 30 * DAY) throw new Error('Choose at most 30 days per query.');
  return {from: start, until};
}

export function endpoints(type, code, window) {
  const bounds = Object.fromEntries(Object.entries(window).map(([key,value]) => [key,String(value)]));
  const events = new URL('outages/events', API);
  events.search = new URLSearchParams({...bounds, entityType:type, entityCode:code, limit:'500'});
  const signals = new URL(`signals/raw/${type}/${encodeURIComponent(code)}`, API);
  signals.search = new URLSearchParams({...bounds, maxPoints:'640'});
  const dashboard = new URL(`${type}/${encodeURIComponent(code)}`, PAGE);
  dashboard.search = new URLSearchParams(bounds);
  return {events:events.href, signals:signals.href, dashboard:dashboard.href};
}

export function searchEndpoint(type, query) {
  const url = new URL('entities/query',API);
  url.search = new URLSearchParams({entityType:type, search:query, limit:'12'});
  return url.href;
}

function dataFrom(payload, label) {
  if (payload?.error) throw new Error(`IODA reported an error while loading ${label}.`);
  if (!Array.isArray(payload?.data)) throw new Error(`IODA returned an unexpected ${label} response.`);
  return payload.data;
}

export function extractEntities(payload, type) {
  return dataFrom(payload,'entity').filter(row => row?.type === type && entityCode(type,row.code)
    && typeof row.name === 'string').slice(0,12)
    .map(row => ({code:entityCode(type,row.code), name:row.name.slice(0,180), context:String(row.attrs?.country_name ?? row.attrs?.org ?? '').slice(0,120)}));
}

export function extractEvents(payload, window) {
  return dataFrom(payload, 'event').filter(item => item && Number.isFinite(item.start)
      && Number.isFinite(item.duration) && item.duration > 0
      && item.start < window.until && item.start + item.duration > window.from)
    .map(item => ({
      source: String(item.datasource ?? 'unknown').slice(0,120),
      name: typeof item.location_name === 'string' ? item.location_name.slice(0,180) : '',
      start: item.start,
      duration: item.duration,
    })).sort((a,b)=>a.start - b.start);
}

export function extractSignals(payload, type, code, window) {
  const results = dataFrom(payload, 'signal').flat();
  return results.filter(item => item && item.entityType === type && String(item.entityCode) === code
      && Object.hasOwn(SOURCES, item.datasource) && Array.isArray(item.values)
      && Number.isFinite(item.from) && Number.isFinite(item.step) && item.step > 0
      && item.values.length <= 20000)
    .map(item => ({
      source: item.datasource,
      name: typeof item.entityName === 'string' ? item.entityName.slice(0,180) : '',
      step: item.step,
      samples: item.values.map((v,i) => ({t:item.from + (i * item.step), v:Number.isFinite(v) ? v : null}))
        .filter(point => point.t >= window.from && point.t <= window.until),
    })).filter(group => group.samples.some(point => point.v !== null))
    .sort((a,b) => Object.keys(SOURCES).indexOf(a.source) - Object.keys(SOURCES).indexOf(b.source));
}

export function sourceLabel(source) {
  return Object.hasOwn(SOURCES,source) ? SOURCES[source].label : source;
}

export function durationLabel(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60);
  return [h ? `${h}h` : '', m ? `${m}m` : ''].filter(Boolean).join(' ');
}

export function shareHref(href, values) {
  const url = new URL(href);
  url.search = new URLSearchParams(values);
  url.hash = '';
  return url.href;
}
