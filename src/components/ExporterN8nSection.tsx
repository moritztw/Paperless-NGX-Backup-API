import { useState } from 'react';
import type {
  ExporterOptions,
  ExportRequestConfig,
  ServerAddonConfig,
} from '../types/exporter';
import {
  buildEffectiveTargetDir,
  buildRequestJsonPayload,
  EXPORTER_FLAGS_META,
  generateCurlSnippet,
  generateN8nWorkflowJson,
} from '../utils/codeGenerators';
import { CodeViewer } from './CodeViewer';

interface ExporterN8nSectionProps {
  serverConfig: ServerAddonConfig;
  requestConfig: ExportRequestConfig;
  onChangeRequest: (next: ExportRequestConfig) => void;
  onJumpToSandbox: () => void;
}

type OutputTab = 'n8n' | 'curl' | 'payload' | 'cli';

const EMPTY_OPTIONS: ExporterOptions = {
  compare_checksums: false,
  compare_json: false,
  delete: false,
  use_filename_format: false,
  use_folder_prefix: false,
  no_archive: false,
  no_thumbnail: false,
  split_manifest: false,
  data_only: false,
  zip: false,
  passphrase: '',
};

export function ExporterN8nSection({
  serverConfig,
  requestConfig,
  onChangeRequest,
  onJumpToSandbox,
}: ExporterN8nSectionProps) {
  const [activeTab, setActiveTab] = useState<OutputTab>('n8n');

  const toggleFlag = (key: keyof Omit<ExporterOptions, 'passphrase'>) => {
    onChangeRequest({
      ...requestConfig,
      options: {
        ...requestConfig.options,
        [key]: !requestConfig.options[key],
      },
    });
  };

  const applyPreset = (preset: 'nas_mirror' | 'n8n_zip' | 'db_only' | 'reset') => {
    if (preset === 'nas_mirror') {
      onChangeRequest({
        ...requestConfig,
        mode: 'local',
        async: false,
        options: {
          ...EMPTY_OPTIONS,
          compare_checksums: true,
          compare_json: true,
          delete: true,
          use_filename_format: true,
          use_folder_prefix: true,
        },
      });
    } else if (preset === 'n8n_zip') {
      onChangeRequest({
        ...requestConfig,
        mode: 'download',
        async: false,
        options: {
          ...EMPTY_OPTIONS,
          no_archive: true,
          no_thumbnail: true,
          use_filename_format: true,
        },
      });
    } else if (preset === 'db_only') {
      onChangeRequest({
        ...requestConfig,
        mode: 'local',
        async: false,
        options: {
          ...EMPTY_OPTIONS,
          data_only: true,
          compare_json: true,
        },
      });
    } else {
      onChangeRequest({
        ...requestConfig,
        options: { ...EMPTY_OPTIONS },
      });
    }
  };

  const effectiveTarget =
    requestConfig.mode === 'local'
      ? buildEffectiveTargetDir(requestConfig, serverConfig.allowedDirs)
      : '/tmp/paperless_export_<auto>';

  const cliPreview = (() => {
    const parts = [
      `${serverConfig.paperlessSrcDir.replace(/\/src$/, '')}/.venv/bin/python3`,
      'manage.py',
      'document_exporter',
      effectiveTarget,
      '--no-progress-bar',
    ];
    for (const meta of EXPORTER_FLAGS_META) {
      if (meta.key === 'zip' && requestConfig.mode === 'download') {
        parts.push('--zip');
        continue;
      }
      if (requestConfig.options[meta.key]) {
        parts.push(meta.cliFlag);
      }
    }
    if (requestConfig.options.passphrase.trim()) {
      parts.push('--passphrase', '"***"');
    }
    return parts.join(' \\\n  ');
  })();

  const activeCodeInfo = (() => {
    if (activeTab === 'n8n') {
      return {
        filename: requestConfig.async
          ? 'n8n-paperless-export-async.json'
          : 'n8n-paperless-export-sync.json',
        languageLabel: 'n8n Workflow Import JSON',
        code: generateN8nWorkflowJson(serverConfig, requestConfig),
      };
    }
    if (activeTab === 'curl') {
      return {
        filename: 'trigger-export.sh',
        languageLabel: 'Bash / cURL',
        code: generateCurlSnippet(serverConfig, requestConfig),
      };
    }
    if (activeTab === 'payload') {
      return {
        filename: 'request-body.json',
        languageLabel: 'HTTP POST Body',
        code: JSON.stringify(
          buildRequestJsonPayload(requestConfig, serverConfig.allowedDirs),
          null,
          2
        ),
      };
    }
    return {
      filename: 'executed-command.txt',
      languageLabel: 'Interner Subprocess (shell=False)',
      code: cliPreview,
    };
  })();

  return (
    <section id="n8n-builder" className="scroll-mt-20">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 [text-wrap:balance]">
            02. Exporter-Parameter &amp; n8n-Workflow-Generator
          </h2>
          <p className="mt-1.5 text-sm text-slate-600 max-w-3xl">
            Stelle deinen gewünschten Export-Aufruf zusammen und übernimm das fertige JSON direkt per{' '}
            <span className="font-medium text-slate-800">Import from File</span> in n8n.
          </p>
        </div>

        <button
          type="button"
          onClick={onJumpToSandbox}
          className="px-4 py-2 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-auto"
        >
          Diesen Request in der Sandbox testen
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-slate-200 grid grid-cols-1 lg:grid-cols-12">
        {/* Left: Mode, Async & Flags */}
        <div className="lg:col-span-7 p-6 sm:p-8 space-y-7">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <span className="block text-xs font-medium text-slate-700 mb-2">
                Export-Ziel &amp; Rückgabe an n8n
              </span>
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => onChangeRequest({ ...requestConfig, mode: 'local' })}
                  className={`px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    requestConfig.mode === 'local'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Lokaler Ordner
                </button>
                <button
                  type="button"
                  onClick={() => onChangeRequest({ ...requestConfig, mode: 'download' })}
                  className={`px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    requestConfig.mode === 'download'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  ZIP-Download
                </button>
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                {requestConfig.mode === 'local'
                  ? 'Schreibt auf Server/NAS-Mount und liefert JSON-Statistik an n8n.'
                  : 'Erstellt temporäres ZIP, streamt es an n8n und räumt danach sofort auf.'}
              </p>
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-700 mb-2">
                Ausführungsmodus
              </span>
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => onChangeRequest({ ...requestConfig, async: false })}
                  className={`px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    !requestConfig.async
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Synchron warten
                </button>
                <button
                  type="button"
                  onClick={() => onChangeRequest({ ...requestConfig, async: true })}
                  className={`px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    requestConfig.async
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Async + Status-Job
                </button>
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                {!requestConfig.async
                  ? 'Ideal im LAN (1 HTTP-Node). Antwortet direkt nach Abschluss.'
                  : 'Timeout-sicher bei Tausenden PDFs (HTTP 202 + Polling-Schleife).'}
              </p>
            </div>
          </div>

          {requestConfig.mode === 'local' && (
            <div className="pt-5 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="req-target-base"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Basisverzeichnis aus Whitelist
                </label>
                <select
                  id="req-target-base"
                  value={
                    serverConfig.allowedDirs.includes(requestConfig.target_dir)
                      ? requestConfig.target_dir
                      : serverConfig.allowedDirs[0] || ''
                  }
                  onChange={(e) =>
                    onChangeRequest({ ...requestConfig, target_dir: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  {serverConfig.allowedDirs.map((dir) => (
                    <option key={dir} value={dir}>
                      {dir}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="req-subfolder"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Optionaler Unterordner
                </label>
                <input
                  id="req-subfolder"
                  type="text"
                  value={requestConfig.subfolder}
                  onChange={(e) =>
                    onChangeRequest({ ...requestConfig, subfolder: e.target.value })
                  }
                  placeholder="z.B. taeglich oder 2026-11"
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>
          )}

          <div className="pt-5 border-t border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <span className="text-xs font-semibold text-slate-900">
                Schnellprofile für typische Backups
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => applyPreset('nas_mirror')}
                  className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  NAS-Spiegelbackup
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('n8n_zip')}
                  className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Schlanker n8n-ZIP
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('db_only')}
                  className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Nur Datenbank
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('reset')}
                  className="px-2.5 py-1 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Zurücksetzen
                </button>
              </div>
            </div>

            <div className="divide-y divide-slate-200 border-t border-b border-slate-200">
              {EXPORTER_FLAGS_META.map((flag) => {
                const forcedZip = flag.key === 'zip' && requestConfig.mode === 'download';
                const checked = forcedZip ? true : requestConfig.options[flag.key];
                return (
                  <label
                    key={flag.key}
                    className={`py-3 flex items-start gap-3.5 select-none ${
                      forcedZip ? 'opacity-75 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50/70'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={forcedZip}
                      onChange={() => toggleFlag(flag.key)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-sm font-medium text-slate-900">{flag.label}</span>
                        <span className="text-xs font-mono text-emerald-800">{flag.cliFlag}</span>
                        <span className="text-xs text-slate-400" aria-hidden="true">
                          ·
                        </span>
                        <span className="text-xs text-slate-500">{flag.impact}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-600">{flag.description}</p>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="mt-4">
              <label
                htmlFor="opt-passphrase"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Optionale Verschlüsselungs-Passphrase (<code className="font-mono">--passphrase</code> für sensible DB-Geheimnisse)
              </label>
              <input
                id="opt-passphrase"
                type="password"
                value={requestConfig.options.passphrase}
                onChange={(e) =>
                  onChangeRequest({
                    ...requestConfig,
                    options: { ...requestConfig.options, passphrase: e.target.value },
                  })
                }
                placeholder="Leer lassen, falls keine Passphrase gewünscht"
                className="w-full sm:max-w-md px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
          </div>
        </div>

        {/* Right: Live n8n JSON, cURL & Payload Output */}
        <div className="lg:col-span-5 p-6 sm:p-8 flex flex-col gap-4 bg-slate-50/50">
          <div>
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
              <button
                type="button"
                onClick={() => setActiveTab('n8n')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'n8n'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                n8n Workflow
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('curl')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'curl'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                cURL
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('payload')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'payload'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                JSON Body
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('cli')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'cli'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                CLI-Befehl
              </button>
            </div>
          </div>

          <CodeViewer
            filename={activeCodeInfo.filename}
            languageLabel={activeCodeInfo.languageLabel}
            code={activeCodeInfo.code}
            maxHeightClass="max-h-[560px]"
          />

          <div className="text-xs text-slate-600 space-y-1.5 pt-2">
            <p className="font-semibold text-slate-800">So nutzt du die Vorlage in n8n:</p>
            {requestConfig.async ? (
              <p>
                Der generierte Workflow enthält bereits die komplette Schleife:{' '}
                <span className="font-mono text-slate-800">
                  Start -&gt; POST /export -&gt; 5s Wait -&gt; GET /jobs/id -&gt; IF running
                </span>
                {requestConfig.mode === 'download'
                  ? ' inklusive anschließendem Binär-Download der fertigen ZIP-Datei.'
                  : '.'}
              </p>
            ) : (
              <p>
                Kopiere das Workflow-JSON direkt per <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded text-[11px]">Strg+V</kbd> in deine geöffnete n8n-Arbeitsfläche oder lade die JSON-Datei herunter.
                {requestConfig.mode === 'download' &&
                  ' Das Ausgabeformat des HTTP-Nodes ist bereits auf „File (data)“ gestellt.'}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
