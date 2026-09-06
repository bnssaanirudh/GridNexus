/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BROKER_URL: string;
  readonly VITE_ENGINE_URL: string;
  readonly VITE_SHINY_URL: string;
  readonly VITE_POWERBI_EMBED_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
