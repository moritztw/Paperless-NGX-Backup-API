import { useState } from 'react';
import { Download } from 'lucide-react';
import { ExporterN8nSection } from './components/ExporterN8nSection';
import { LiveSandboxSection } from './components/LiveSandboxSection';
import { ServerCodeSection } from './components/ServerCodeSection';
import { ServerConfigSection } from './components/ServerConfigSection';
import type { ExportRequestConfig, ServerAddonConfig } from './types/exporter';
import {
  generateEnvFileContent,
  generateInstallScript,
  generateN8nWorkflowJson,
  generatePythonDaemonCode,
  generateRandomApiKey,
  generateReadmeContent,
  generateSystemdServiceContent,
  generateUninstallScript,
} from './utils/codeGenerators';
import { buildZipArchive } from './utils/zipBuilder';

export default function App() {
  const [serverConfig, setServerConfig] = useState<ServerAddonConfig>(() => ({
    bindHost: '0.0.0.0',
    port: 8095,
    lxcAddress: '192.168.178.50',
    paperlessSrcDir: '/opt/paperless/src',
    paperlessConfPath: '/opt/paperless/paperless.conf',
    serviceUser: 'auto',
    apiKey: generateRandomApiKey(),
    allowedDirs: ['/opt/paperless/export', '/mnt/nas/paperless'],
    cleanupTtlMinutes: 60,
    commandTimeoutMinutes: 30,
  }));

  const [requestConfig, setRequestConfig] = useState<ExportRequestConfig>({
    mode: 'local',
    target_dir: '/opt/paperless/export',
    subfolder: '',
    async: false,
    options: {
      compare_checksums: true,
      compare_json: true,
      delete: true,
      use_filename_format: true,
      use_folder_prefix: false,
      no_archive: false,
      no_thumbnail: false,
      split_manifest: false,
      data_only: false,
      zip: false,
      passphrase: '',
    },
  });

  const handleDownloadFullBundle = () => {
    const syncReq: ExportRequestConfig = { ...requestConfig, async: false };
    const asyncReq: ExportRequestConfig = { ...requestConfig, async: true };

    const zipBytes = buildZipArchive([
      {
        name: 'paperless-export-api/install.sh',
        content: generateInstallScript(serverConfig),
        executable: true,
      },
      {
        name: 'paperless-export-api/uninstall.sh',
        content: generateUninstallScript(),
        executable: true,
      },
      {
        name: 'paperless-export-api/paperless_export_api.py',
        content: generatePythonDaemonCode(serverConfig),
        executable: true,
      },
      {
        name: 'paperless-export-api/paperless-export-api.service',
        content: generateSystemdServiceContent(serverConfig),
      },
      {
        name: 'paperless-export-api/export-api.env',
        content: generateEnvFileContent(serverConfig),
      },
      {
        name: 'paperless-export-api/n8n-workflow-sync.json',
        content: generateN8nWorkflowJson(serverConfig, syncReq),
      },
      {
        name: 'paperless-export-api/n8n-workflow-async.json',
        content: generateN8nWorkflowJson(serverConfig, asyncReq),
      },
      {
        name: 'paperless-export-api/README.md',
        content: generateReadmeContent(serverConfig),
      },
    ]);

    const blob = new Blob([zipBytes], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'paperless-export-api-lxc.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const scrollToSandbox = () => {
    const el = document.getElementById('live-sandbox');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div id="top" className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-slate-200">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-8 px-6 py-3.5">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="#top"
            className="text-base sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            Paperless Exporter API
          </a>

          {/* Zone 2: 4 concise single-line text navigation links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a
              href="#konfiguration"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Konfiguration
            </a>
            <a
              href="#n8n-builder"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Exporter &amp; n8n
            </a>
            <a
              href="#server-code"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Server-Code
            </a>
            <a
              href="#live-sandbox"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Live-Sandbox
            </a>
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleDownloadFullBundle}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>LXC-Paket laden</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-10 sm:py-12 space-y-16">
        {/* Hero Overview */}
        <section className="space-y-8">
          <div className="max-w-3xl space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>Proxmox Bare-Metal / LXC</span>
              <span aria-hidden="true">·</span>
              <span>community-scripts/paperless-ngx</span>
              <span aria-hidden="true">·</span>
              <span>Python 3 Standardbibliothek</span>
              <span aria-hidden="true">·</span>
              <span>n8n Integration</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-bold tracking-tight text-slate-900 leading-[1.15] [text-wrap:balance]">
              Ressourcenarmes REST-API-Addon für den Paperless-NGX Document Exporter
            </h1>

            <p className="text-base text-slate-600 leading-relaxed max-w-2xl">
              Steuere Backups und Dokumenten-Abzüge direkt per HTTP-Aufruf aus n8n – abgesichert durch deinen eigenen Bearer API-Key und eine strikte Verzeichnis-Whitelist, komplett ohne zusätzliche Python-Pakete auf deinem Proxmox-Container.
            </p>
          </div>

          {/* 4-Column Quantitative Architecture Strip */}
          <div className="bg-white border border-slate-200 rounded-xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
            <div className="p-5">
              <div className="text-xs text-slate-500">Externe Abhängigkeiten</div>
              <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900">
                0 pip-Pakete
              </div>
              <div className="mt-1 text-xs text-slate-600">
                Reine Python-Stdlib, wartungsfrei bei Paperless-Updates
              </div>
            </div>

            <div className="p-5">
              <div className="text-xs text-slate-500">Speicherbedarf im Leerlauf</div>
              <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900">
                ~14–18 MB RAM
              </div>
              <div className="mt-1 text-xs text-slate-600">
                64-KB-Streaming-Puffer auch bei großen ZIP-Archiven
              </div>
            </div>

            <div className="p-5">
              <div className="text-xs text-slate-500">Ausführungsmodi für n8n</div>
              <div className="mt-1 text-xl font-bold text-slate-900">Sync &amp; Async</div>
              <div className="mt-1 text-xs text-slate-600">
                Direktantwort oder Hintergrund-Job inkl. 409-Prozesssperre
              </div>
            </div>

            <div className="p-5">
              <div className="text-xs text-slate-500">Absicherung</div>
              <div className="mt-1 text-xl font-bold text-slate-900">Key + Whitelist</div>
              <div className="mt-1 text-xs text-slate-600">
                Zeitkonstanter HMAC-Vergleich &amp; <code className="font-mono">shell=False</code>
              </div>
            </div>
          </div>
        </section>

        <ServerConfigSection config={serverConfig} onChange={setServerConfig} />

        <ExporterN8nSection
          serverConfig={serverConfig}
          requestConfig={requestConfig}
          onChangeRequest={setRequestConfig}
          onJumpToSandbox={scrollToSandbox}
        />

        <ServerCodeSection
          config={serverConfig}
          onDownloadBundle={handleDownloadFullBundle}
        />

        <LiveSandboxSection
          serverConfig={serverConfig}
          requestConfig={requestConfig}
        />
      </main>

      <footer className="border-t border-slate-200 bg-white mt-16">
        <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>
            Entwickelt für Paperless-NGX Bare-Metal / Proxmox LXC (
            <code className="font-mono text-slate-700">/opt/paperless/src/manage.py document_exporter</code>
            )
          </p>
          <div className="flex items-center gap-5">
            <a href="#konfiguration" className="hover:text-slate-900 transition-colors">
              Konfiguration
            </a>
            <a href="#server-code" className="hover:text-slate-900 transition-colors">
              install.sh
            </a>
            <a href="#live-sandbox" className="hover:text-slate-900 transition-colors">
              Sandbox
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
