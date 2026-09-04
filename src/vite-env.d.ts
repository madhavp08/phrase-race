/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BENCH_PROVIDERS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
