/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_USE_MOCK_BACKEND: string;
  readonly VITE_SMS_PROVIDER_CONFIGURED: string;
  readonly VITE_ADMIN_PASSCODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
