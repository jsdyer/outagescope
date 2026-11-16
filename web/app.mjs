import {element, fetchJSON, get, initTheme, setStatus} from './common.mjs';
import {DAY, SOURCES, durationLabel, endpoints, entityCode, extractEntities, extractEvents, extractSignals, parseWindow, searchEndpoint, shareHref, sourceLabel} from './model.mjs';

initTheme();
const PAGE = 35;
const format = new Intl.NumberFormat('en-CA', {maximumFractionDigits:2});
const brief = new Intl.NumberFormat('en-CA', {notation:'compact',maximumFractionDigits:1});
const utcText = seconds => new Date(seconds * 1000).toISOString().slice(0,16).replace('T',' ');
const shortUTC = seconds => utcText(seconds).slice(5);
const dayText = ms => new Date(ms).toISOString().slice(0,10);
let historyRequest, finderRequest, current;
let eventLimit = PAGE;
const chartInfo = new WeakMap();
const charts = new ResizeObserver(entries => {
  for (const {target} of entries) {
    const model = chartInfo.get(target);
    if (model) paint(target, model);
  }
});

function timeDefaults() {
  const today = Date.now();
  return {from:dayText(today - 6 * DAY * 1000),through:dayText(today)};
}

function fillForm({type,code,from,through}) {
  get('type').value = type;
  get('code').value = code;
  get('from').value = from;
  get('through').value = through;
  updateCodeHint();
}

function updateCodeHint() {
  get('code').placeholder = {country:'CA',region:'Use the region finder',asn:'AS812'}[get('type').value] || '';
}

function paint(canvas, {series,window,events,minimum,maximum}) {
  const {width:cssWidth,height:cssHeight} = canvas.getBoundingClientRect();
  if (!cssWidth || !cssHeight) return;
  const ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(cssWidth * ratio);
  canvas.height = Math.round(cssHeight * ratio);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(ratio,ratio);
  const style = getComputedStyle(document.documentElement);
  const top = 9, left = 48, right = cssWidth - 8, bottom = cssHeight - 24;
  const range = maximum - minimum;
  const x = t => left + (t - window.from) * (right - left) / (window.until - window.from);
  const y = v => bottom - (v - minimum) * (bottom - top) / range;
  ctx.fillStyle = '#d0863b28';
  for (const event of events) {
    const start = Math.max(window.from,event.start), end = Math.min(window.until,event.start + event.duration);
    if (end > start) ctx.fillRect(x(start),top,Math.max(1,x(end) - x(start)),bottom - top);
  }
  ctx.font = '10px monospace'; ctx.textBaseline = 'middle';
  ctx.strokeStyle = style.getPropertyValue('--line');
  ctx.fillStyle = style.getPropertyValue('--muted');
  ctx.textAlign = 'right';
  ctx.lineWidth = 1;
  for (const fraction of [0,.5,1]) {
    const amount = minimum + range * fraction, row = y(amount);
    ctx.beginPath(); ctx.moveTo(left,row); ctx.lineTo(right,row); ctx.stroke();
    ctx.fillText(brief.format(amount),left - 5,row);
  }
  const tickCount = cssWidth > 660 ? 4 : cssWidth > 390 ? 3 : 2;
  for (let i=0;i<tickCount;i++) {
    const fraction = i/(tickCount-1), time = window.from + fraction * (window.until-window.from);
    ctx.textAlign = i===0?'left':i===tickCount-1?'right':'center';
    ctx.fillText(shortUTC(time),x(time),cssHeight - 11);
  }
  ctx.beginPath(); ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = style.getPropertyValue('--accent');
  let connect = false, plotted = 0;
  for (const point of series.samples) {
    if (point.v === null) {connect = false; continue;}
    if (connect) ctx.lineTo(x(point.t),y(point.v)); else ctx.moveTo(x(point.t),y(point.v));
    connect = true;
    plotted++;
  }
  ctx.stroke();
  if (plotted === 1) {
    const point = series.samples.find(sample => sample.v !== null);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath(); ctx.arc(x(point.t),y(point.v),3,0,2*Math.PI); ctx.fill();
  }
}

function seriesBox(series,window,events) {
  const article = element('article');
  const heading = element('div',undefined,'signal-heading');
  heading.append(element('h4',sourceLabel(series.source)),element('p',SOURCES[series.source].detail,'muted'));
  const chart = element('canvas',undefined,'signal-canvas');
  chart.setAttribute('role','img');
  const known = series.samples.filter(sample => sample.v !== null);
  const values = known.map(sample => sample.v);
  const low = Math.min(...values), high = Math.max(...values);
  const padding = Math.max((high-low)*.045,Math.abs(high)*.001,.0001);
  const minimum = low >= 0 ? Math.max(0,low-padding) : low-padding;
  const maximum = high+padding;
  const latest = known.at(-1);
  chart.setAttribute('aria-label',`${sourceLabel(series.source)} line plot. Lowest observed ${format.format(low)}, highest ${format.format(high)}, last value ${format.format(latest.v)}.`);
  const caption = element('p',`${known.length.toLocaleString()} measured points · ${series.samples.length - known.length} missing · Interval ${durationLabel(series.step)} · Last ${format.format(latest.v)} at ${utcText(latest.t)} UTC`,'chart-caption');
  const disclosure = element('details',undefined,'signal-table');
  const table = element('table'), head = element('thead'), titles = element('tr');
  for (const label of ['Time UTC','Value']) {
    const cell = element('th', label);
    cell.scope = 'col';
    titles.append(cell);
  }
  head.append(titles);
  const body = element('tbody');
  const indices = new Set();
  for (let i=0;i<12;i++) indices.add(Math.round(i*(series.samples.length-1)/11));
  for (const index of indices) {
    const {t,v} = series.samples[index];
    const row = element('tr');
    row.append(element('td',utcText(t)),element('td',v === null ? 'Missing' : format.format(v)));
    body.append(row);
  }
  table.append(head,body);
  disclosure.append(element('summary',`Sample table · ${indices.size} points`),table);
  article.append(heading,chart,caption,disclosure);
  chartInfo.set(chart,{series,window,minimum,maximum,events:events.filter(event=>event.source===series.source)});
  charts.observe(chart);
  return article;
}

function drawEvents() {
  const source = get('screen').value;
  const filtered = current.events.filter(event => !source || event.source === source);
  const rows = filtered.slice(0,eventLimit).map(event => {
    const tr = element('tr');
    tr.append(element('td',sourceLabel(event.source)),element('td',utcText(event.start)),element('td',durationLabel(event.duration)));
    return tr;
  });
  if (!rows.length) {
    const tr = element('tr');
    const message = element('td',current.eventError ? 'Detection data unavailable.' : 'No detections in this selection. Measurement coverage can vary.','muted');
    message.colSpan = 3; tr.append(message); rows.push(tr);
  }
  get('events').replaceChildren(...rows);
  get('more').hidden = filtered.length <= eventLimit;
  get('event-detail').textContent = filtered.length ? `${Math.min(eventLimit,filtered.length)} shown of ${filtered.length}` : '';
}

function render(result) {
  current = result;
  get('result-title').textContent = result.events.find(item => item.name)?.name || result.signals.find(item=>item.name)?.name ||
    (result.values.type === 'asn' ? `AS${result.values.code}` : `${result.values.type} · ${result.values.code}`);
  get('provenance').textContent = `${result.values.from} to ${result.values.through} UTC · Georgia Tech IODA · Retrieved ${utcText(Date.now()/1000)} UTC`;
  get('dashboard').href = result.urls.dashboard;
  get('raw-events').href = result.urls.events;
  get('raw-signals').href = result.urls.signals;
  get('event-count').textContent = result.eventError ? 'Unavailable' : result.events.length.toLocaleString();
  get('signal-count').textContent = result.signalError ? 'Unavailable' : result.signals.length.toLocaleString();
  get('days-count').textContent = `${Math.ceil((result.window.until - result.window.from)/DAY)} days`;
  get('share-status').hidden = true;
  get('share-fallback').hidden = true;
  get('report').hidden = false;
  charts.disconnect();
  get('signals').replaceChildren(...(result.signals.length ?
    result.signals.map(series=>seriesBox(series,result.window,result.events)) :
    [element('p',result.signalError ? 'Signal data unavailable.' : 'No primary signal samples were returned for this selection.','muted')]));
  const options = [...new Set(result.events.map(event=>event.source))];
  get('screen').replaceChildren(new Option('All signals',''),...options.map(source=>new Option(sourceLabel(source),source)));
  eventLimit = PAGE;
  drawEvents();
}

function errorText(error) {
  if (error.name === 'TimeoutError' || error instanceof TypeError) return 'IODA did not respond. Try again or use its dashboard.';
  if (error.status === 429) return 'IODA is limiting requests. Wait before trying again.';
  return error.message;
}

async function load() {
  const type = get('type').value, code = entityCode(type,get('code').value);
  if (!code) {
    const hints = {country:'Enter a two-letter country code like CA.',region:'Enter a numeric IODA region code. Use the finder to look it up.',asn:'Enter an autonomous system number such as AS812.'};
    setStatus(hints[type] || 'Choose a supported entity type.',true);
    return;
  }
  const from = get('from').value, through = get('through').value;
  let window;
  try { window = parseWindow(from,through); } catch(error) {setStatus(error.message,true); return;}
  historyRequest?.abort();
  const request = historyRequest = new AbortController();
  const values = {type,code,from,through};
  const urls = endpoints(type,code,window);
  const options = {timeout:24000,signal:request.signal,maxBytes:5_000_000};
  get('submit').disabled = true;
  get('report').hidden = true;
  setStatus('Loading detections and signals from IODA…');
  const [events,signals] = await Promise.allSettled([
    fetchJSON(urls.events,options).then(payload=>extractEvents(payload,window)),
    fetchJSON(urls.signals,options).then(payload=>extractSignals(payload,type,code,window)),
  ]);
  if (request.signal.aborted) return;
  get('submit').disabled = false;
  const eventError = events.status === 'rejected', signalError = signals.status === 'rejected';
  render({values,window,urls,eventError,signalError,events:events.value ?? [],signals:signals.value ?? []});
  if (eventError && signalError) setStatus(`Both IODA requests failed. ${errorText(events.reason)}`,true);
  else if (eventError || signalError) setStatus(`Results are partial. ${errorText(eventError ? events.reason : signals.reason)}`,true);
  else if (!events.value.length && !signals.value.length) setStatus('IODA returned no detections or primary signal samples for this window.');
  else setStatus('IODA history loaded.');
}

async function lookupEntities(event) {
  event.preventDefault();
  const term = get('find-text').value.trim(), type = get('find-type').value;
  if (term.length < 2) {get('find-status').textContent = 'Enter at least two characters.'; return;}
  finderRequest?.abort();
  const request = finderRequest = new AbortController();
  get('find-submit').disabled = true;
  get('find-results').replaceChildren();
  get('find-status').textContent = 'Searching the IODA directory…';
  try {
    const payload = await fetchJSON(searchEndpoint(type,term),{signal:request.signal,maxBytes:600_000});
    if (request.signal.aborted) return;
    const found = extractEntities(payload,type);
    get('find-results').replaceChildren(...found.map(item => {
      const li = element('li');
      const name = element('strong',item.name);
      if (item.context && item.context !== item.name) name.append(element('small',` · ${item.context}`,'muted'));
      const action = element('button',`Use ${item.code}`);
      action.type = 'button';
      action.addEventListener('click',() => {
        get('type').value = type;
        get('code').value = item.code;
        updateCodeHint();
        get('code').focus();
        get('find-status').textContent = `Selected ${item.name}. Choose a window and load history.`;
      });
      li.append(name,action);
      return li;
    }));
    get('find-status').textContent = found.length ? `${found.length} matches. Choose a code to use it in the query.` : 'No matching codes were returned.';
  } catch(error) {
    if (!request.signal.aborted) get('find-status').textContent = errorText(error);
  } finally {
    if (!request.signal.aborted) get('find-submit').disabled = false;
  }
}

get('finder').addEventListener('submit',lookupEntities);
get('lookup').addEventListener('submit',event=>{event.preventDefault();load();});
get('type').addEventListener('change',()=>{get('code').value='';updateCodeHint();});
get('canada').addEventListener('click',()=>{fillForm({type:'country',code:'CA',...timeDefaults()});load();});
get('rogers').addEventListener('click',()=>{fillForm({type:'asn',code:'812',from:'2022-07-07',through:'2022-07-10'});load();});
get('screen').addEventListener('change',()=>{eventLimit=PAGE;drawEvents();});
get('more').addEventListener('click',()=>{eventLimit+=PAGE;drawEvents();});
get('theme').addEventListener('click',()=>{
  for (const chart of document.querySelectorAll('canvas.signal-canvas')) paint(chart,chartInfo.get(chart));
});
get('share').addEventListener('click', async () => {
  const url = shareHref(location.href,current.values);
  const notice = get('share-status');
  notice.hidden = false;
  try {
    await navigator.clipboard.writeText(url);
    notice.textContent = 'Query link copied.';
    get('share-fallback').hidden = true;
  } catch {
    notice.textContent = 'Copy the query link from this field.';
    const fallback = get('share-fallback');
    fallback.value = url;
    fallback.hidden = false;
    fallback.select();
  }
});

const params = new URLSearchParams(location.search);
const saved = {type:params.get('type'),code:params.get('code'),from:params.get('from'),through:params.get('through')};
if (saved.type && saved.code && saved.from && saved.through && entityCode(saved.type,saved.code)) {
  fillForm(saved);
  load();
} else {
  fillForm({type:'country',code:'CA',...timeDefaults()});
}
