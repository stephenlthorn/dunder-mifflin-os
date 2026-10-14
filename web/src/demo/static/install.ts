// Points the app's /api calls at the in-browser demo office (office.ts) instead of a server: `fetch('/api/…')` and
// `new EventSource('/api/events')` are answered locally, everything else goes out as usual. Installed once, before
// the app starts, and only by the static demo page (demo.html). The app itself is unchanged: it runs the same code
// as against a real server.
import type { StaticOffice } from './office';

type Win = Window & typeof globalThis;

const isApi = (url: URL, win: Win) => url.origin === win.location.origin && url.pathname.startsWith('/api/');
const parseBody = (raw: BodyInit | null | undefined): unknown => {
  if (typeof raw !== 'string') return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

function demoFetch(win: Win, office: StaticOffice): typeof fetch {
  const real = win.fetch.bind(win);
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), win.location.href);
    if (!isApi(url, win)) return real(input, init);
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const res = await office.handle(method, url.pathname, parseBody(init?.body), url.search);
    return new Response(JSON.stringify(res.body), { status: res.status, headers: { 'content-type': 'application/json', ...res.headers } });
  };
}

function demoEventSource(win: Win, office: StaticOffice): typeof EventSource {
  const Real = win.EventSource;
  class DemoEventSource extends EventTarget {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSED = 2;
    readonly CONNECTING = 0;
    readonly OPEN = 1;
    readonly CLOSED = 2;
    readonly withCredentials = false;
    readonly url: string;
    readyState = 0;
    onopen: ((e: Event) => void) | null = null;
    onmessage: ((e: MessageEvent) => void) | null = null;
    onerror: ((e: Event) => void) | null = null;
    private stop: (() => void) | null = null;

    constructor(url: string) {
      super();
      this.url = url;
      queueMicrotask(() => {
        if (this.readyState === 2) return;
        this.readyState = 1;
        this.emit(new Event('open'));
        this.stop = office.events((update) => this.emit(new MessageEvent('message', { data: JSON.stringify(update) })));
      });
    }

    close(): void {
      this.readyState = 2;
      this.stop?.();
      this.stop = null;
    }

    private emit(e: Event): void {
      if (this.readyState === 2) return;
      this.dispatchEvent(e);
      if (e.type === 'open') this.onopen?.(e);
      else if (e.type === 'message') this.onmessage?.(e as MessageEvent);
    }
  }
  const Shim = function EventSourceShim(url: string | URL, init?: EventSourceInit) {
    const target = new URL(String(url), win.location.href);
    return isApi(target, win) && target.pathname === '/api/events' ? new DemoEventSource(target.href) : new Real(url, init);
  };
  return Object.assign(Shim, { CONNECTING: 0, OPEN: 1, CLOSED: 2 }) as unknown as typeof EventSource;
}

export function installStaticDemo(win: Win, office: StaticOffice): void {
  win.fetch = demoFetch(win, office);
  win.EventSource = demoEventSource(win, office);
}
