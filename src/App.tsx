import { useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import readmeRaw from '../README.md?raw';
import installShRaw from '../install.sh?raw';
import pythonApiRaw from '../paperless_export_api.py?raw';
import uninstallShRaw from '../uninstall.sh?raw';
import licenseRaw from '../LICENSE?raw';

type RepoFileKey = 'readme' | 'install' | 'python' | 'uninstall' | 'license';

interface RepoFileItem {
  key: RepoFileKey;
  filename: string;
  description: string;
  content: string;
}

const REPO_FILES: RepoFileItem[] = [
  {
    key: 'readme',
    filename: 'README.md',
    description: 'GitHub-Dokumentation inkl. Haftungsausschluss & KI-Offenlegung',
    content: readmeRaw,
  },
  {
    key: 'install',
    filename: 'install.sh',
    description: 'Installationsskript zur Ausführung auf dem Paperless-Server',
    content: installShRaw,
  },
  {
    key: 'python',
    filename: 'paperless_export_api.py',
    description: 'Reiner Python-3-Standardbibliothek REST-API-Daemon',
    content: pythonApiRaw,
  },
  {
    key: 'uninstall',
    filename: 'uninstall.sh',
    description: 'Saubere Deinstallation ohne Datenverlust',
    content: uninstallShRaw,
  },
  {
    key: 'license',
    filename: 'LICENSE',
    description: 'MIT-Lizenz (AS IS / ohne Gewährleistung)',
    content: licenseRaw,
  },
];

export default function App() {
  const [activeKey, setActiveKey] = useState<RepoFileKey>('readme');
  const [copied, setCopied] = useState(false);

  const activeFile = REPO_FILES.find((f) => f.key === activeKey) ?? REPO_FILES[0];
  const lines = activeFile.content.split('\n');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeFile.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Ignore if clipboard blocked
    }
  };

  const handleDownload = (item: RepoFileItem) => {
    const blob = new Blob([item.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = item.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-8 px-6 py-4">
          <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            paperless-ngx-export-api
          </span>

          <nav className="hidden md:flex items-center gap-5 text-sm font-medium text-slate-600">
            {REPO_FILES.map((file) => (
              <button
                key={file.key}
                type="button"
                onClick={() => setActiveKey(file.key)}
                className={`font-mono text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeKey === file.key
                    ? 'text-emerald-700 font-semibold underline underline-offset-4'
                    : 'hover:text-slate-900'
                }`}
              >
                {file.filename}
              </button>
            ))}
          </nav>

          <button
            type="button"
            onClick={() => handleDownload(activeFile)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{activeFile.filename} laden</span>
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-base font-semibold text-slate-900">
              GitHub-Repository Dateien (Standalone für deinen Paperless-Server)
            </h1>
            <p className="text-xs text-slate-600">
              Für GitHub und deinen Proxmox-Server werden ausschließlich diese 5 Dateien im Hauptverzeichnis benötigt:{' '}
              <code className="font-mono text-slate-800">README.md</code>,{' '}
              <code className="font-mono text-slate-800">install.sh</code>,{' '}
              <code className="font-mono text-slate-800">paperless_export_api.py</code>,{' '}
              <code className="font-mono text-slate-800">uninstall.sh</code> und{' '}
              <code className="font-mono text-slate-800">LICENSE</code>.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg w-fit max-w-full">
          {REPO_FILES.map((file) => (
            <button
              key={file.key}
              type="button"
              onClick={() => setActiveKey(file.key)}
              className={`px-3 py-1.5 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeKey === file.key
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {file.filename}
            </button>
          ))}
        </div>

        <div className="rounded-xl overflow-hidden bg-slate-950 border border-slate-800 text-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 bg-slate-900 border-b border-slate-800">
            <div className="flex items-center gap-2 text-xs text-slate-400 min-w-0">
              <span className="font-mono font-medium text-slate-100">{activeFile.filename}</span>
              <span aria-hidden="true">·</span>
              <span className="truncate">{activeFile.description}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums shrink-0">{lines.length} Zeilen</span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copied ? 'Kopiert' : 'Inhalt kopieren'}</span>
              </button>
              <button
                type="button"
                onClick={() => handleDownload(activeFile)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Datei laden</span>
              </button>
            </div>
          </div>

          <div className="overflow-auto max-h-[680px] p-4 text-[13px] leading-relaxed font-mono">
            <table className="w-full border-collapse">
              <tbody>
                {lines.map((line, idx) => (
                  <tr key={idx} className="hover:bg-slate-900/60">
                    <td className="pr-4 text-right text-slate-600 select-none tabular-nums w-10 align-top">
                      {idx + 1}
                    </td>
                    <td className="text-slate-200 whitespace-pre-wrap break-words">{line || ' '}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
