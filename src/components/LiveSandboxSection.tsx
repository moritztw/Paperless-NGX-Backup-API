import { useEffect, useRef, useState } from 'react';
import { Download, Play, RotateCcw } from 'lucide-react';
import type {
  ExportRequestConfig,
  SandboxExecutionLog,
  SandboxJobState,
  ServerAddonConfig,
} from '../types/exporter';
import { buildRequestJsonPayload } from '../utils/codeGenerators';

interface LiveSandboxSectionProps {
  serverConfig: ServerAddonConfig;
  requestConfig: ExportRequestConfig;
}

function formatStatusLabel(status: number): { text: string; toneClass: string } {
  if (status === 200) return { text: '200 OK', toneClass: 'text-emerald-700 font-semibold' };
  if (status === 202) return { text: '202 Angenommen', toneClass: 'text-emerald-700 font-semibold' };
  if (status === 401) return { text: '401 Unautorisiert', toneClass: 'text-red-700 font-semibold' };
  if (status === 403) return { text: '403 Blockiert', toneClass: 'text-red-700 font-semibold' };
  if (status === 409) return { text: '409 Gesperrt (Lock)', toneClass: 'text-amber-700 font-semibold' };
  if (status >= 400) return { text: `${status} Fehler`, toneClass: 'text-red-700 font-semibold' };
  return { text: String(status), toneClass: 'text-slate-700 font-semibold' };
}

export function LiveSandboxSection({
  serverConfig,
  requestConfig,
}: LiveSandboxSectionProps) {
  const [logs, setLogs] = useState<SandboxExecutionLog[]>([]);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [activeAsyncJob, setActiveAsyncJob] = useState<SandboxJobState | null>(null);
  const [autoPoll, setAutoPoll] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const blobUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    return () => {
      for (const u of blobUrlsRef.current) {
        URL.revokeObjectURL(u);
      }
    };
  }, []);

  const appendLog = (entry: SandboxExecutionLog) => {
    setLogs((prev) => [entry, ...prev].slice(0, 25));
    setSelectedLogId(entry.id);
  };

  const sandboxHeaders = (overrideBearerKey?: string): Record<string, string> => {
    const bearer = overrideBearerKey !== undefined ? overrideBearerKey : serverConfig.apiKey;
    return {
      Authorization: `Bearer ${bearer}`,
      'X-Sandbox-Expected-Key': serverConfig.apiKey,
      'X-Sandbox-Allowed-Dirs': serverConfig.allowedDirs.join(','),
    };
  };

  const sendSandboxRequest = async (opts: {
    method: 'GET' | 'POST';
    endpoint: string;
    body?: Record<string, unknown>;
    overrideBearer?: string;
    simulatedMs?: number;
    summaryLabel: string;
  }) => {
    setIsSending(true);
    const t0 = performance.now();
    try {
      const headers: Record<string, string> = {
        ...sandboxHeaders(opts.overrideBearer),
      };
      if (opts.body) {
        headers['Content-Type'] = 'application/json';
      }
      if (opts.simulatedMs) {
        headers['X-Sandbox-Simulated-Ms'] = String(opts.simulatedMs);
      }

      const res = await fetch(`/api/sandbox${opts.endpoint}`, {
        method: opts.method,
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });

      const durationMs = Math.round(performance.now() - t0);
      const contentType = res.headers.get('content-type') || '';

      if (contentType.includes('application/zip')) {
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        blobUrlsRef.current.push(blobUrl);
        const disp = res.headers.get('content-disposition') || '';
        const match = disp.match(/filename="([^"]+)"/);
        const zipName = match ? match[1] : `paperless-export-${Date.now()}.zip`;

        appendLog({
          id: crypto.randomUUID(),
          timestamp: new Date().toLocaleTimeString('de-DE', { hour12: false }),
          method: opts.method,
          endpoint: opts.endpoint,
          status: res.status,
          durationMs,
          responseType: 'zip',
          payloadSummary: opts.summaryLabel,
          responseBody: JSON.stringify(
            {
              stream: 'application/zip',
              filename: zipName,
              size_bytes: blob.size,
              auto_cleanup: 'Temporäres Export-Verzeichnis auf dem Server wurde nach dem Stream gelöscht.',
            },
            null,
            2
          ),
          zipDownloadBlobUrl: blobUrl,
          zipFileName: zipName,
          zipSizeBytes: blob.size,
        });

        if (activeAsyncJob && opts.endpoint.endsWith('/download')) {
          setActiveAsyncJob((prev) =>
            prev ? { ...prev, download_ready: false } : null
          );
        }
        return res;
      }

      const json = await res.json();
      appendLog({
        id: crypto.randomUUID(),
        timestamp: new Date().toLocaleTimeString('de-DE', { hour12: false }),
        method: opts.method,
        endpoint: opts.endpoint,
        status: res.status,
        durationMs,
        responseType: 'json',
        payloadSummary: opts.summaryLabel,
        responseBody: JSON.stringify(json, null, 2),
      });

      if (res.status === 202 && json.job_id) {
        setActiveAsyncJob({
          job_id: json.job_id,
          status: 'running',
          mode: json.mode,
          target_dir: '',
          command: [],
          created_at: new Date().toISOString(),
          finished_at: null,
          duration_sec: 0,
          return_code: null,
          files_exported: 0,
          size_bytes: 0,
          download_ready: false,
          stdout: ['Hintergrund-Job gestartet...'],
          error: null,
        });
      } else if (opts.endpoint.startsWith('/jobs/') && !opts.endpoint.endsWith('/download') && res.ok) {
        setActiveAsyncJob(json as SandboxJobState);
      }

      return res;
    } finally {
      setIsSending(false);
    }
  };

  // Auto-poll active running async job just like n8n's Wait + HTTP loop
  useEffect(() => {
    if (!autoPoll || !activeAsyncJob || activeAsyncJob.status !== 'running') {
      return;
    }
    const timer = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/sandbox/jobs/${activeAsyncJob.job_id}`, {
          headers: sandboxHeaders(),
        });
        if (!res.ok) return;
        const data = (await res.json()) as SandboxJobState;
        setActiveAsyncJob(data);
        if (data.status !== 'running') {
          appendLog({
            id: crypto.randomUUID(),
            timestamp: new Date().toLocaleTimeString('de-DE', { hour12: false }),
            method: 'GET',
            endpoint: `/jobs/${data.job_id}`,
            status: 200,
            durationMs: 12,
            responseType: 'json',
            payloadSummary: 'Auto-Polling abgeschlossen',
            responseBody: JSON.stringify(data, null, 2),
          });
        }
      } catch {
        // Ignore transient errors
      }
    }, 1200);

    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPoll, activeAsyncJob?.job_id, activeAsyncJob?.status, serverConfig.apiKey]);

  const handleRunConfiguredExport = () => {
    const payload = buildRequestJsonPayload(requestConfig, serverConfig.allowedDirs);
    void sendSandboxRequest({
      method: 'POST',
      endpoint: '/export',
      body: payload,
      summaryLabel: `Konfigurierter Export (${requestConfig.mode}, ${requestConfig.async ? 'async' : 'sync'})`,
    });
  };

  const handleTestParallelLock = async () => {
    const firstPayload = {
      mode: 'local',
      target_dir: serverConfig.allowedDirs[0] || '/opt/paperless/export',
      async: true,
    };
    await sendSandboxRequest({
      method: 'POST',
      endpoint: '/export',
      body: firstPayload,
      simulatedMs: 4000,
      summaryLabel: '1/2 Hintergrund-Export starten (hält Lock für 4s)',
    });
    await sendSandboxRequest({
      method: 'POST',
      endpoint: '/export',
      body: firstPayload,
      summaryLabel: '2/2 Paralleler Zweitaufruf -> prüft 409 Lock',
    });
  };

  const handleResetSandbox = async () => {
    await fetch('/api/sandbox/reset', { method: 'POST' });
    setLogs([]);
    setSelectedLogId(null);
    setActiveAsyncJob(null);
  };

  const selectedLog = logs.find((l) => l.id === selectedLogId) || logs[0] || null;

  return (
    <section id="live-sandbox" className="scroll-mt-20">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 [text-wrap:balance]">
            04. Live-API-Sandbox &amp; Sicherheits-Prüfstand
          </h2>
          <p className="mt-1.5 text-sm text-slate-600 max-w-3xl">
            Spiegelt das Verhalten des Python-Addons 1:1 auf einem echten Test-Backend. Prüfe deine Whitelist, API-Key-Ablehnung, Parallel-Sperren und echte ZIP-Streams vor dem Deployment.
          </p>
        </div>

        <button
          type="button"
          onClick={handleResetSandbox}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-auto"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Sandbox zurücksetzen</span>
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200">
        {/* Action Toolbar */}
        <div className="p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4 bg-slate-50/60">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={isSending}
              onClick={handleRunConfiguredExport}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Aktuellen Export-Request senden</span>
            </button>

            <button
              type="button"
              disabled={isSending}
              onClick={() =>
                sendSandboxRequest({
                  method: 'GET',
                  endpoint: '/health',
                  summaryLabel: 'Vitalitätscheck (GET /health)',
                })
              }
              className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              GET /health
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500 mr-1">Sicherheitstests:</span>
            <button
              type="button"
              disabled={isSending}
              onClick={() =>
                sendSandboxRequest({
                  method: 'POST',
                  endpoint: '/export',
                  body: { mode: 'local', target_dir: serverConfig.allowedDirs[0] },
                  overrideBearer: 'plx_falscher_angreifer_token_000',
                  summaryLabel: 'Sicherheitstest: Ungültiger Bearer Key',
                })
              }
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              401 Falscher Key
            </button>

            <button
              type="button"
              disabled={isSending}
              onClick={() =>
                sendSandboxRequest({
                  method: 'POST',
                  endpoint: '/export',
                  body: {
                    mode: 'local',
                    target_dir: `${serverConfig.allowedDirs[0] || '/opt/paperless/export'}/../../etc/shadow`,
                  },
                  summaryLabel: 'Sicherheitstest: Path-Traversal Ausbruch (../../etc)',
                })
              }
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              403 Path-Traversal
            </button>

            <button
              type="button"
              disabled={isSending}
              onClick={handleTestParallelLock}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              409 Parallel-Lock
            </button>
          </div>
        </div>

        {/* Active Async Job Bar (shown whenever an async job exists) */}
        {activeAsyncJob && (
          <div className="px-6 py-4 bg-slate-50 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
              <span className="font-semibold text-slate-900">
                Async-Job <code className="font-mono">{activeAsyncJob.job_id}</code>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Status:{' '}
                <strong
                  className={
                    activeAsyncJob.status === 'completed'
                      ? 'text-emerald-700'
                      : activeAsyncJob.status === 'running'
                        ? 'text-amber-700'
                        : 'text-red-700'
                  }
                >
                  {activeAsyncJob.status === 'running'
                    ? 'Läuft im Hintergrund...'
                    : activeAsyncJob.status === 'completed'
                      ? 'Abgeschlossen'
                      : 'Fehlgeschlagen'}
                </strong>
              </span>
              {activeAsyncJob.duration_sec > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">Laufzeit: {activeAsyncJob.duration_sec}s</span>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoPoll}
                  onChange={(e) => setAutoPoll(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                />
                <span>n8n Auto-Polling simulieren</span>
              </label>

              <button
                type="button"
                onClick={() =>
                  sendSandboxRequest({
                    method: 'GET',
                    endpoint: `/jobs/${activeAsyncJob.job_id}`,
                    summaryLabel: `Job-Status abfragen (${activeAsyncJob.job_id})`,
                  })
                }
                className="px-3 py-1.5 text-xs font-mono font-medium text-slate-800 bg-white border border-slate-300 rounded-md hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                GET /jobs/{activeAsyncJob.job_id}
              </button>

              {activeAsyncJob.mode === 'download' && (
                <button
                  type="button"
                  onClick={() =>
                    sendSandboxRequest({
                      method: 'GET',
                      endpoint: `/jobs/${activeAsyncJob.job_id}/download`,
                      summaryLabel: `Async-ZIP herunterladen (${activeAsyncJob.job_id})`,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>GET /jobs/{activeAsyncJob.job_id}/download</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Main Split: Request History Table + Response Inspector */}
        {logs.length === 0 ? (
          <div className="py-16 px-6 text-center">
            <h3 className="text-sm font-semibold text-slate-900">
              Noch keine Test-Aufrufe in dieser Sitzung ausgeführt
            </h3>
            <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
              Starte deinen konfigurierten Export-Aufruf oder prüfe einen der Sicherheitsfälle oben, um Statuscodes, JSON-Antworten und den echten ZIP-Download live zu sehen.
            </p>
            <button
              type="button"
              onClick={handleRunConfiguredExport}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Ersten Test-Request starten</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
            <div className="lg:col-span-6 overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50/40">
                    <th className="py-2.5 pl-6 pr-3">Zeit</th>
                    <th className="py-2.5 px-3">Aufruf</th>
                    <th className="py-2.5 px-3">HTTP-Status</th>
                    <th className="py-2.5 pl-3 pr-6 text-right">Dauer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {logs.map((entry) => {
                    const statusMeta = formatStatusLabel(entry.status);
                    const isSelected = selectedLog?.id === entry.id;
                    return (
                      <tr
                        key={entry.id}
                        onClick={() => setSelectedLogId(entry.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-emerald-50/60' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-3 pl-6 pr-3 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                          {entry.timestamp}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-mono text-slate-900">
                            <span className="font-semibold">{entry.method}</span> {entry.endpoint}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate max-w-[260px]">
                            {entry.payloadSummary}
                          </div>
                        </td>
                        <td className={`py-3 px-3 font-mono whitespace-nowrap ${statusMeta.toneClass}`}>
                          {statusMeta.text}
                        </td>
                        <td className="py-3 pl-3 pr-6 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                          {entry.durationMs} ms
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="lg:col-span-6 p-6 bg-slate-950 text-slate-100 flex flex-col justify-between">
              {selectedLog && (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-3 border-b border-slate-800">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span className="font-mono font-semibold text-white">
                        {selectedLog.method} {selectedLog.endpoint}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">HTTP {selectedLog.status}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{selectedLog.durationMs} ms</span>
                    </div>

                    {selectedLog.zipDownloadBlobUrl && selectedLog.zipFileName && (
                      <a
                        href={selectedLog.zipDownloadBlobUrl}
                        download={selectedLog.zipFileName}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 rounded-md hover:bg-emerald-600 transition-colors whitespace-nowrap shrink-0"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>
                          {selectedLog.zipFileName} speichern ({selectedLog.zipSizeBytes} B)
                        </span>
                      </a>
                    )}
                  </div>

                  <pre className="text-xs font-mono text-slate-200 overflow-auto max-h-[340px] leading-relaxed whitespace-pre-wrap">
                    {selectedLog.responseBody}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
