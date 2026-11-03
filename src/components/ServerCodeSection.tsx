import { useState } from 'react';
import { Download } from 'lucide-react';
import type { ServerAddonConfig } from '../types/exporter';
import {
  generateEnvFileContent,
  generateInstallScript,
  generatePythonDaemonCode,
  generateSystemdServiceContent,
  generateUninstallScript,
} from '../utils/codeGenerators';
import { CodeViewer } from './CodeViewer';

interface ServerCodeSectionProps {
  config: ServerAddonConfig;
  onDownloadBundle: () => void;
}

type ServerFileTab = 'python' | 'install' | 'systemd' | 'env' | 'uninstall';

export function ServerCodeSection({ config, onDownloadBundle }: ServerCodeSectionProps) {
  const [selectedFile, setSelectedFile] = useState<ServerFileTab>('python');

  const files: Record<
    ServerFileTab,
    { label: string; filename: string; languageLabel: string; content: string }
  > = {
    python: {
      label: 'paperless_export_api.py',
      filename: 'paperless_export_api.py',
      languageLabel: 'Python 3 Standardbibliothek',
      content: generatePythonDaemonCode(config),
    },
    install: {
      label: 'install.sh',
      filename: 'install.sh',
      languageLabel: 'Proxmox LXC 1-Befehl-Installer',
      content: generateInstallScript(config),
    },
    systemd: {
      label: 'paperless-export-api.service',
      filename: 'paperless-export-api.service',
      languageLabel: 'systemd Service Unit',
      content: generateSystemdServiceContent(config),
    },
    env: {
      label: 'export-api.env',
      filename: 'export-api.env',
      languageLabel: '/etc/paperless-export-api.env (0600)',
      content: generateEnvFileContent(config),
    },
    uninstall: {
      label: 'uninstall.sh',
      filename: 'uninstall.sh',
      languageLabel: 'Sauberes Deinstallations-Skript',
      content: generateUninstallScript(),
    },
  };

  const current = files[selectedFile];

  return (
    <section id="server-code" className="scroll-mt-20">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 [text-wrap:balance]">
            03. Generierter Python-Code &amp; Proxmox-Installation
          </h2>
          <p className="mt-1.5 text-sm text-slate-600 max-w-3xl">
            Komplett ohne Drittanbieter-Bibliotheken: Eine übersichtliche Python-Datei, die die vorhandene Umgebung deines{' '}
            <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-800">
              /opt/paperless
            </code>{' '}
            Containers automatisch erkennt.
          </p>
        </div>

        <button
          type="button"
          onClick={onDownloadBundle}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-auto"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Komplettpaket (.zip) herunterladen</span>
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
        {/* 3-Step Installation Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pb-6 border-b border-slate-200">
          <div>
            <span className="text-xs font-mono text-emerald-700 font-semibold">Schritt 01</span>
            <h3 className="mt-1 text-sm font-semibold text-slate-900">
              In den Proxmox Paperless-LXC wechseln
            </h3>
            <p className="mt-1 text-xs text-slate-600 leading-relaxed">
              Öffne in deiner Proxmox-Oberfläche die Konsole deines Paperless-NGX LXC-Containers als{' '}
              <code className="font-mono text-slate-800">root</code>.
            </p>
          </div>

          <div>
            <span className="text-xs font-mono text-emerald-700 font-semibold">Schritt 02</span>
            <h3 className="mt-1 text-sm font-semibold text-slate-900">
              install.sh anlegen &amp; ausführen
            </h3>
            <p className="mt-1 text-xs text-slate-600 leading-relaxed">
              Kopiere den Tab <code className="font-mono text-slate-800">install.sh</code> in eine Datei auf dem Container und starte{' '}
              <code className="font-mono text-slate-800">bash install.sh</code> – alle Dateien und Rechte werden automatisch eingerichtet.
            </p>
          </div>

          <div>
            <span className="text-xs font-mono text-emerald-700 font-semibold">Schritt 03</span>
            <h3 className="mt-1 text-sm font-semibold text-slate-900">
              Aus n8n auf Port {config.port} zugreifen
            </h3>
            <p className="mt-1 text-xs text-slate-600 leading-relaxed">
              Der Dienst startet automatisch mit dem Container, prüft per Selbsttest{' '}
              <code className="font-mono text-slate-800">GET /health</code> und nimmt sofort API-Calls aus n8n entgegen.
            </p>
          </div>
        </div>

        {/* File Selector Tabs */}
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit max-w-full">
          {(Object.keys(files) as ServerFileTab[]).map((tabKey) => (
            <button
              key={tabKey}
              type="button"
              onClick={() => setSelectedFile(tabKey)}
              className={`px-3 py-1.5 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selectedFile === tabKey
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {files[tabKey].label}
            </button>
          ))}
        </div>

        <CodeViewer
          filename={current.filename}
          languageLabel={current.languageLabel}
          code={current.content}
          maxHeightClass="max-h-[600px]"
        />
      </div>
    </section>
  );
}
