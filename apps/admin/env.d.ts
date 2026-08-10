/// <reference types="vite/client" />
/// <reference types="vue/jsx" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_CBT_ADMIN_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
