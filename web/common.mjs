export const get = id => document.getElementById(id);

export function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

export function external(label, href) {
  const link = element('a', label);
  link.href = href;
  link.rel = 'noopener noreferrer';
  link.target = '_blank';
  return link;
}

export function setStatus(message, error = false) {
  const status = get('status');
  status.textContent = message;
  status.dataset.error = error;
}

export function download(filename, body, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([body], {type}));
  const link = element('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function fetchJSON(url, {timeout = 15000, maxBytes = 5_000_000, signal} = {}) {
  const local = AbortSignal.timeout(timeout);
  const response = await fetch(url, {
    credentials: 'omit', headers: {Accept: 'application/json'}, signal: signal ? AbortSignal.any([local, signal]) : local,
    referrerPolicy: 'no-referrer',
  });
  if (!response.ok) {
    const issue = new Error(`The data source returned HTTP ${response.status}.`);
    issue.status = response.status;
    throw issue;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let body = '';
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error('The response exceeded this tool’s size limit. Narrow the request and try again.');
    }
    body += decoder.decode(value, {stream: true});
  }
  body += decoder.decode();
  try {
    return JSON.parse(body);
  } catch {
    throw new Error('The data source did not return valid JSON.');
  }
}

export function initTheme() {
  const control = get('theme');
  let theme = '';
  try { theme = localStorage.getItem('coolcode-theme') || ''; } catch {}
  const apply = dark => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    control.setAttribute('aria-pressed', String(dark));
  };
  apply(theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
  control.addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme !== 'dark';
    apply(dark);
    try { localStorage.setItem('coolcode-theme', dark ? 'dark' : 'light'); } catch {}
  });
}
