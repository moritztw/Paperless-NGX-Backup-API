import { useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';

interface CodeViewerProps {
  filename: string;
  languageLabel: string;
  code: string;
  onDownload?: () => void;
  maxHeightClass?: string;
}

export function CodeViewer({
  filename,
  languageLabel,
  code,
  onDownload,
  maxHeightClass = 'max-h-[540px]',
}: CodeViewerProps) {
  const [copied, setCopied] = useState(false);

  const lines = code.split('\n');
  const byteSize = new TextEncoder().encode(code).length;
  const sizeFormatted =
    byteSize >= 1024 ? `${(byteSize / 1024).toFixed(1)} KB` : `${byteSize} B`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = code;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };

  const handleDownloadFile = () => {
    if (onDownload) {
      onDownload();
      return;
    }
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-xl overflow-hidden bg-slate-950 border border-slate-800 text-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2 text-xs text-slate-400 min-w-0">
          <span className="font-mono font-medium text-slate-100 truncate">{filename}</span>
          <span aria-hidden="true">·</span>
          <span>{languageLabel}</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{lines.length} Zeilen</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{sizeFormatted}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Kopiert' : 'Kopieren'}</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadFile}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Datei laden</span>
          </button>
        </div>
      </div>

      <div className={`overflow-auto ${maxHeightClass} p-4 text-[13px] leading-relaxed font-mono`}>
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx} className="hover:bg-slate-900/60">
                <td className="pr-4 text-right text-slate-600 select-none tabular-nums w-9 align-top">
                  {idx + 1}
                </td>
                <td className="text-slate-200 whitespace-pre">{line || ' '}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
