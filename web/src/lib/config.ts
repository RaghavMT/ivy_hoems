// Read at call time, not import time, so a missing variable shows an error on the
// screen that needs it instead of blanking the whole app.
function required(name: 'VITE_API_BASE_URL' | 'VITE_API_KEY'): string {
  const value = import.meta.env[name];
  if (!value) {
    throw new Error(`${name} is not set. See web/.env.example.`);
  }
  return value;
}

export const config = {
  get apiBaseUrl(): string {
    return required('VITE_API_BASE_URL').replace(/\/+$/, '');
  },
  get apiKey(): string {
    return required('VITE_API_KEY');
  },
};
