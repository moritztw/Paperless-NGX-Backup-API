export type ExportMode = 'local' | 'download';

export type ServiceUserOption = 'auto' | 'paperless' | 'root';

export interface ServerAddonConfig {
  bindHost: string;
  port: number;
  lxcAddress: string;
  paperlessSrcDir: string;
  paperlessConfPath: string;
  serviceUser: ServiceUserOption;
  apiKey: string;
  allowedDirs: string[];
  cleanupTtlMinutes: number;
  commandTimeoutMinutes: number;
}

export interface ExporterOptions {
  compare_checksums: boolean;
  compare_json: boolean;
  delete: boolean;
  use_filename_format: boolean;
  use_folder_prefix: boolean;
  no_archive: boolean;
  no_thumbnail: boolean;
  split_manifest: boolean;
  data_only: boolean;
  zip: boolean;
  passphrase: string;
}

export interface ExportRequestConfig {
  mode: ExportMode;
  target_dir: string;
  subfolder: string;
  async: boolean;
  options: ExporterOptions;
}

export interface ExporterFlagMeta {
  key: keyof Omit<ExporterOptions, 'passphrase'>;
  cliFlag: string;
  shortFlag?: string;
  label: string;
  description: string;
  impact: string;
}

export interface SandboxJobState {
  job_id: string;
  status: 'running' | 'completed' | 'failed';
  mode: ExportMode;
  target_dir: string;
  command: string[];
  created_at: string;
  finished_at: string | null;
  duration_sec: number;
  return_code: number | null;
  files_exported: number;
  size_bytes: number;
  download_ready: boolean;
  stdout: string[];
  error: string | null;
}

export interface SandboxExecutionLog {
  id: string;
  timestamp: string;
  method: string;
  endpoint: string;
  status: number;
  durationMs: number;
  responseType: 'json' | 'zip';
  payloadSummary: string;
  responseBody: string;
  zipDownloadBlobUrl?: string;
  zipFileName?: string;
  zipSizeBytes?: number;
}
