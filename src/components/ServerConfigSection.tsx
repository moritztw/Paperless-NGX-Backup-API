import { useState } from 'react';
import { Check, Copy, Plus, RefreshCw, Trash2 } from 'lucide-react';
import type { ServerAddonConfig, ServiceUserOption } from '../types/exporter';
import { generateRandomApiKey } from '../utils/codeGenerators';

interface ServerConfigSectionProps {
  config: ServerAddonConfig;
  onChange: (next: ServerAddonConfig) => void;
}

const PRESET_DIRS = [
  '/opt/paperless/export',
  '/mnt/nas/paperless',
  '/mnt/backup/paperless',
  '/var/backups/paperless',
];

export function ServerConfigSection({ config, onChange }: ServerConfigSectionProps) {
  const [newDirInput, setNewDirInput] = useState('');
  const [dirError, setDirError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const updateField = <K extends keyof ServerAddonConfig>(
    key: K,
    value: ServerAddonConfig[K]
  ) => {
    onChange({ ...config, [key]: value });
  };

  const handleAddDirectory = (rawPath?: string) => {
    const candidate = (rawPath ?? newDirInput).trim().replace(/\/+$/, '');
    if (!candidate) {
      return;
    }
    if (!candidate.startsWith('/')) {
      setDirError('Bitte einen absoluten Linux-Pfad angeben (beginnend mit /).');
      return;
    }
    if (candidate === '/' || candidate === '/etc' || candidate === '/root') {
      setDirError('System-Wurzelverzeichnisse (/ , /etc, /root) sind aus Sicherheitsgründen gesperrt.');
      return;
    }
    if (config.allowedDirs.includes(candidate)) {
      setDirError('Dieser Pfad ist bereits in der Whitelist enthalten.');
      return;
    }
    setDirError(null);
    updateField('allowedDirs', [...config.allowedDirs, candidate]);
    if (!rawPath) {
      setNewDirInput('');
    }
  };

  const handleRemoveDirectory = (dirToRemove: string) => {
    if (config.allowedDirs.length <= 1) {
      setDirError('Mindestens ein erlaubtes Zielverzeichnis sollte für lokale Exporte bestehen bleiben.');
      return;
    }
    setDirError(null);
    updateField(
      'allowedDirs',
      config.allowedDirs.filter((d) => d !== dirToRemove)
    );
  };

  const handleCopyApiKey = async () => {
    try {
      await navigator.clipboard.writeText(config.apiKey);
      setCopiedKey(true);
      window.setTimeout(() => setCopiedKey(false), 1600);
    } catch {
      // Fallback ignored if clipboard unavailable
    }
  };

  return (
    <section id="konfiguration" className="scroll-mt-20">
      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 [text-wrap:balance]">
          01. Proxmox-LXC &amp; Sicherheits-Konfiguration
        </h2>
        <p className="mt-1.5 text-sm text-slate-600 max-w-3xl">
          Voreingestellt auf die Verzeichnisstruktur von{' '}
          <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-800">
            community-scripts/paperless-ngx
          </code>
          . Alle Änderungen fließen sofort in den Python-Daemon, das Installationsskript und die n8n-Vorlagen ein.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-slate-200 grid grid-cols-1 lg:grid-cols-12">
        {/* Left Column: Network, Paperless Paths & API Key */}
        <div className="lg:col-span-7 p-6 sm:p-8 space-y-8">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Netzwerk &amp; Paperless-NGX Umgebung
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Paperless läuft standardmäßig auf Port 8000 – das Export-Addon nutzt Port 8095 ohne Konflikt.
            </p>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="lxc-address"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  LXC-IP / Hostname (für n8n)
                </label>
                <input
                  id="lxc-address"
                  type="text"
                  value={config.lxcAddress}
                  onChange={(e) => updateField('lxcAddress', e.target.value.trim())}
                  placeholder="192.168.178.50"
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                />
              </div>

              <div>
                <label
                  htmlFor="bind-host"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Bind-Adresse im Container
                </label>
                <select
                  id="bind-host"
                  value={config.bindHost}
                  onChange={(e) => updateField('bindHost', e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                >
                  <option value="0.0.0.0">0.0.0.0 (LAN / n8n)</option>
                  <option value="127.0.0.1">127.0.0.1 (Nur lokal)</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="addon-port"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  API-Port
                </label>
                <input
                  id="addon-port"
                  type="number"
                  min={1024}
                  max={65535}
                  value={config.port}
                  onChange={(e) =>
                    updateField('port', Math.min(65535, Math.max(1024, Number(e.target.value) || 8095)))
                  }
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="paperless-src"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Paperless Quellverzeichnis (manage.py)
                </label>
                <input
                  id="paperless-src"
                  type="text"
                  value={config.paperlessSrcDir}
                  onChange={(e) => updateField('paperlessSrcDir', e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                />
              </div>

              <div>
                <label
                  htmlFor="paperless-conf"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Paperless Konfigurationsdatei
                </label>
                <input
                  id="paperless-conf"
                  type="text"
                  value={config.paperlessConfPath}
                  onChange={(e) => updateField('paperlessConfPath', e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="service-user"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Systemd Service-User
                </label>
                <select
                  id="service-user"
                  value={config.serviceUser}
                  onChange={(e) => updateField('serviceUser', e.target.value as ServiceUserOption)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                >
                  <option value="auto">Auto-Erkennung (Empfohlen)</option>
                  <option value="paperless">paperless</option>
                  <option value="root">root</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="cleanup-ttl"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Temp-ZIP Cleanup (Minuten)
                </label>
                <input
                  id="cleanup-ttl"
                  type="number"
                  min={5}
                  max={1440}
                  value={config.cleanupTtlMinutes}
                  onChange={(e) =>
                    updateField('cleanupTtlMinutes', Math.max(5, Number(e.target.value) || 60))
                  }
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                />
              </div>

              <div>
                <label
                  htmlFor="cmd-timeout"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Max. Export-Timeout (Minuten)
                </label>
                <input
                  id="cmd-timeout"
                  type="number"
                  min={1}
                  max={360}
                  value={config.commandTimeoutMinutes}
                  onChange={(e) =>
                    updateField('commandTimeoutMinutes', Math.max(1, Number(e.target.value) || 30))
                  }
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                />
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-200">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Statischer Bearer API-Key
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Wird in <code className="font-mono">/etc/paperless-export-api.env</code> (Rechte{' '}
                  <code className="font-mono">0600</code>) hinterlegt und zeitkonstant geprüft.
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                aria-label="Bearer API-Key"
                value={config.apiKey}
                onChange={(e) => updateField('apiKey', e.target.value.trim())}
                className="flex-1 px-3 py-2 text-sm font-mono bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCopyApiKey}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {copiedKey ? (
                    <Check className="w-3.5 h-3.5 text-emerald-700" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedKey ? 'Kopiert' : 'Kopieren'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateField('apiKey', generateRandomApiKey())}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-900 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Neu generieren</span>
                </button>
              </div>
            </div>
            {config.apiKey.length < 12 && (
              <p className="mt-2 text-xs text-red-600 font-medium">
                Achtung: Der API-Key muss mindestens 12 Zeichen lang sein, sonst verweigert das Addon aus Sicherheitsgründen jeden Zugriff.
              </p>
            )}
          </div>
        </div>

        {/* Right Column: Strict Path Whitelist */}
        <div className="lg:col-span-5 p-6 sm:p-8 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Erlaubte Zielpfade (Pfad-Whitelist)
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Bei lokalem Export (<code className="font-mono">mode: &quot;local&quot;</code>) akzeptiert der Python-Server ausschließlich diese Verzeichnisse sowie deren Unterordner. Path-Traversal (<code className="font-mono">../</code>) und Symlink-Ausbrüche werden per <code className="font-mono">Path.resolve()</code> mit HTTP 403 abgewiesen.
            </p>

            <div className="mt-5 divide-y divide-slate-200 border-t border-b border-slate-200">
              {config.allowedDirs.map((dir, index) => (
                <div
                  key={dir}
                  className="py-2.5 flex items-center justify-between gap-3 text-sm"
                >
                  <div className="min-w-0 flex items-center gap-2.5">
                    <span className="text-xs text-slate-400 font-mono tabular-nums select-none">
                      0{index + 1}
                    </span>
                    <span className="font-mono text-slate-900 truncate">{dir}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveDirectory(dir)}
                    aria-label={`${dir} entfernen`}
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded-md hover:bg-slate-100 transition-colors shrink-0 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-4">
              <label htmlFor="add-whitelist-dir" className="block text-xs font-medium text-slate-700 mb-1.5">
                Weiteren Mount- oder Backup-Pfad freigeben
              </label>
              <div className="flex gap-2">
                <input
                  id="add-whitelist-dir"
                  type="text"
                  value={newDirInput}
                  onChange={(e) => {
                    setNewDirInput(e.target.value);
                    if (dirError) setDirError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddDirectory();
                    }
                  }}
                  placeholder="/mnt/proxmox-pbs/paperless"
                  className="flex-1 px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
                <button
                  type="button"
                  onClick={() => handleAddDirectory()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Hinzufügen</span>
                </button>
              </div>

              {dirError && <p className="mt-2 text-xs text-red-600">{dirError}</p>}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500">Schnellauswahl:</span>
                {PRESET_DIRS.filter((p) => !config.allowedDirs.includes(p)).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleAddDirectory(preset)}
                    className="text-xs font-mono text-emerald-800 hover:text-emerald-950 underline underline-offset-2 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    +{preset}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-200 text-xs text-slate-500 space-y-1">
            <p className="font-medium text-slate-700">Hinweis zu Proxmox Bind-Mounts:</p>
            <p>
              Falls du auf ein Proxmox-NAS exportierst (z. B. <code className="font-mono">/mnt/nas/paperless</code>), stelle sicher, dass der Systemnutzer <code className="font-mono">paperless</code> im LXC Schreibrechte auf den Mount-Punkt besitzt.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
