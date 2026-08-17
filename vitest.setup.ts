process.env.VITE_SUPABASE_URL = 'https://placeholder.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'placeholder-anon-key-for-tests';

const storage = new Map<string, string>();

Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
    key: () => null,
    get length() {
      return storage.size;
    },
  },
  configurable: true,
});

Object.defineProperty(globalThis, 'window', {
  value: {
    localStorage: globalThis.localStorage,
    location: { origin: 'http://localhost:5173', search: '' },
    history: {
      pushState: (_state: unknown, _title: string, url: string) => {
        const parsed = new URL(url, 'http://localhost:5173');
        Object.defineProperty(globalThis.window.location, 'search', {
          value: parsed.search,
          configurable: true,
        });
      },
    },
  },
  configurable: true,
});
