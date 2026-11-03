import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Request, Response } from 'express';
import { buildZipArchive } from './src/utils/zipBuilder.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface InternalSandboxJob {
  job_id: string;
  status: 'running' | 'completed' | 'failed';
  mode: 'local' | 'download';
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
  _zipBuffer: Uint8Array | null;
  _zipFileName: string;
}

const BOOLEAN_FLAGS: Record<string, string> = {
  compare_checksums: '--compare-checksums',
  compare_json: '--compare-json',
  delete: '--delete',
  use_filename_format: '--use-filename-format',
  use_folder_prefix: '--use-folder-prefix',
  no_archive: '--no-archive',
  no_thumbnail: '--no-thumbnail',
  split_manifest: '--split-manifest',
  data_only: '--data-only',
  zip: '--zip',
};

const jobs = new Map<string, InternalSandboxJob>();
let activeJobId: string | null = null;

function constantTimeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function checkSandboxAuth(req: Request, res: Response): boolean {
  const expectedKey = String(req.header('X-Sandbox-Expected-Key') || '').trim();
  if (expectedKey.length < 12) {
    res.status(500).json({
      error: 'Server-Fehlkonfiguration: EXPORT_API_KEY ist zu kurz oder leer (mind. 12 Zeichen).',
    });
    return false;
  }

  const authHeader = String(req.header('Authorization') || '');
  let provided = '';
  if (authHeader.startsWith('Bearer ')) {
    provided = authHeader.slice(7).trim();
  } else if (req.header('X-API-Key')) {
    provided = String(req.header('X-API-Key') || '').trim();
  }

  if (!provided || !constantTimeCompare(provided, expectedKey)) {
    res.status(401).json({
      error: 'Nicht autorisiert. Gültiger Bearer API-Key erforderlich.',
    });
    return false;
  }
  return true;
}

function isWithinPosixWhitelist(resolvedTarget: string, allowedRoots: string[]): boolean {
  return allowedRoots.some((rawRoot) => {
    const root = path.posix.resolve(rawRoot);
    return resolvedTarget === root || resolvedTarget.startsWith(root === '/' ? '/' : `${root}/`);
  });
}

function createSampleExportZip(options: Record<string, unknown>): {
  zipBytes: Uint8Array;
  filesCount: number;
} {
  const dateStr = new Date().toISOString().slice(0, 10);
  const useFormat = Boolean(options.use_filename_format);
  const usePrefix = Boolean(options.use_folder_prefix);
  const dataOnly = Boolean(options.data_only);
  const noArchive = Boolean(options.no_archive);
  const splitManifest = Boolean(options.split_manifest);

  const manifestDocs = [
    {
      model: 'documents.document',
      pk: 101,
      fields: {
        title: 'Glasfaser Monatsabrechnung Oktober',
        correspondent: 'Stadtwerke Netze GmbH',
        created: `${dateStr}T08:15:00Z`,
        archive_serial_number: 20260101,
      },
    },
    {
      model: 'documents.document',
      pk: 102,
      fields: {
        title: 'Proxmox Server Hardware-Beleg',
        correspondent: 'IT Systemhaus Süd',
        created: `${dateStr}T09:42:00Z`,
        archive_serial_number: 20260102,
      },
    },
  ];

  const entries = [
    {
      name: 'metadata.json',
      content: JSON.stringify(
        {
          version: '2.14.0',
          exported_at: new Date().toISOString(),
          exporter: 'paperless-ngx document_exporter (Sandbox-Vorschau)',
          options_applied: options,
        },
        null,
        2
      ),
    },
  ];

  if (splitManifest) {
    entries.push(
      {
        name: 'manifest-doc-000101.json',
        content: JSON.stringify([manifestDocs[0]], null, 2),
      },
      {
        name: 'manifest-doc-000102.json',
        content: JSON.stringify([manifestDocs[1]], null, 2),
      }
    );
  } else {
    entries.push({
      name: 'manifest.json',
      content: JSON.stringify(manifestDocs, null, 2),
    });
  }

  if (!dataOnly) {
    const origPrefix = usePrefix ? 'originals/' : '';
    const archPrefix = usePrefix ? 'archive/' : '';
    const doc1Name = useFormat
      ? '2026-10_Stadtwerke_Glasfaser-Abrechnung.txt'
      : '000101_original.txt';
    const doc2Name = useFormat
      ? '2026-11_Systemhaus_Proxmox-Beleg.txt'
      : '000102_original.txt';

    entries.push(
      {
        name: `${origPrefix}${doc1Name}`,
        content:
          'Beispiel-Originaldatei aus der Paperless-NGX Exporter Sandbox.\nAuf deinem Proxmox-LXC liegt hier das echte Original-PDF.',
      },
      {
        name: `${origPrefix}${doc2Name}`,
        content:
          'Zweites Beispiel-Dokument aus der Sandbox.\nAuf deinem Proxmox-LXC liegt hier das echte Original-PDF.',
      }
    );

    if (!noArchive) {
      entries.push({
        name: `${archPrefix}${useFormat ? '2026-10_Stadtwerke_OCR-Archiv.txt' : '000101_archive.txt'}`,
        content: 'Beispiel für eine OCR-Archivdatei (entfällt bei --no-archive).',
      });
    }
  }

  const zipBytes = buildZipArchive(entries);
  return { zipBytes, filesCount: entries.length };
}

function publicJobView(job: InternalSandboxJob): Record<string, unknown> {
  const { _zipBuffer, _zipFileName, ...rest } = job;
  void _zipBuffer;
  void _zipFileName;
  return rest;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/sandbox/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      export_running: activeJobId !== null,
      active_job_id: activeJobId,
      manage_py_found: true,
      runner: ['/opt/paperless/.venv/bin/python3', 'manage.py'],
      environment: 'AI Studio Live-Sandbox (spiegelt Python-Daemon 1:1)',
    });
  });

  app.post('/api/sandbox/reset', (_req: Request, res: Response) => {
    jobs.clear();
    activeJobId = null;
    res.status(200).json({ status: 'reset', active_job_id: null });
  });

  app.get('/api/sandbox/jobs', (req: Request, res: Response) => {
    if (!checkSandboxAuth(req, res)) return;
    const list = Array.from(jobs.values())
      .reverse()
      .map((j) => publicJobView(j));
    res.status(200).json({ jobs: list });
  });

  app.get('/api/sandbox/jobs/:id', (req: Request, res: Response) => {
    if (!checkSandboxAuth(req, res)) return;
    const job = jobs.get(String(req.params.id));
    if (!job) {
      res.status(404).json({
        error: `Job '${req.params.id}' nicht gefunden oder bereits abgelaufen.`,
      });
      return;
    }
    res.status(200).json(publicJobView(job));
  });

  app.get('/api/sandbox/jobs/:id/download', (req: Request, res: Response) => {
    if (!checkSandboxAuth(req, res)) return;
    const job = jobs.get(String(req.params.id));
    if (!job) {
      res.status(404).json({ error: `Job '${req.params.id}' nicht gefunden.` });
      return;
    }
    if (job.status === 'running') {
      res.status(409).json({
        error: 'Export läuft noch. Bitte Status abwarten.',
        status: 'running',
      });
      return;
    }
    if (job.status !== 'completed' || !job._zipBuffer) {
      res.status(404).json({
        error:
          'Keine herunterladbare ZIP-Datei vorhanden (entweder lokaler Modus oder bereits heruntergeladen & bereinigt).',
      });
      return;
    }

    const keep = req.query.keep === '1';
    const zipBuffer = Buffer.from(job._zipBuffer);
    const fileName = job._zipFileName;
    if (!keep) {
      job._zipBuffer = null;
      job.download_ready = false;
      job.stdout.push('[Auto-Cleanup] Temporäres ZIP-Verzeichnis nach Download gelöscht.');
    }

    res.status(200);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', String(zipBuffer.length));
    res.send(zipBuffer);
  });

  app.post('/api/sandbox/export', async (req: Request, res: Response) => {
    if (!checkSandboxAuth(req, res)) return;

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const mode = String(body.mode || 'local').toLowerCase();
    if (mode !== 'local' && mode !== 'download') {
      res.status(400).json({
        error: "Ungültiger 'mode'. Erlaubt sind 'local' oder 'download'.",
      });
      return;
    }

    const isAsync = Boolean(body.async);
    const options =
      body.options && typeof body.options === 'object' && !Array.isArray(body.options)
        ? (body.options as Record<string, unknown>)
        : {};

    if (activeJobId !== null) {
      res.status(409).json({
        error: 'Ein anderer Export läuft bereits. Bitte warten.',
        active_job_id: activeJobId,
      });
      return;
    }

    const rawAllowedHeader = String(
      req.header('X-Sandbox-Allowed-Dirs') || '/opt/paperless/export'
    );
    const allowedRoots = rawAllowedHeader
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.startsWith('/'));

    let resolvedTarget = 'stream://zip-download';
    let cmdTarget = '/tmp/paperless_export_tmp';

    if (mode === 'local') {
      const rawTarget = String(body.target_dir || allowedRoots[0] || '').trim();
      if (!rawTarget || !rawTarget.startsWith('/')) {
        res.status(400).json({
          error: 'target_dir muss ein absoluter Linux-Pfad sein.',
        });
        return;
      }
      if (allowedRoots.length === 0) {
        res.status(403).json({
          error: 'Keine ALLOWED_EXPORT_DIRS auf dem Server konfiguriert.',
        });
        return;
      }
      resolvedTarget = path.posix.resolve(rawTarget);
      if (!isWithinPosixWhitelist(resolvedTarget, allowedRoots)) {
        res.status(403).json({
          error: `Zielpfad '${rawTarget}' (aufgelöst: '${resolvedTarget}') liegt nicht in der Pfad-Whitelist.`,
        });
        return;
      }
      cmdTarget = resolvedTarget;
    }

    const effectiveOpts = { ...options };
    if (mode === 'download') {
      effectiveOpts.zip = true;
    }

    const safeCmd = [
      '/opt/paperless/.venv/bin/python3',
      'manage.py',
      'document_exporter',
      cmdTarget,
      '--no-progress-bar',
    ];
    for (const [key, flag] of Object.entries(BOOLEAN_FLAGS)) {
      if (effectiveOpts[key]) {
        safeCmd.push(flag);
      }
    }
    if (typeof effectiveOpts.passphrase === 'string' && effectiveOpts.passphrase.trim()) {
      safeCmd.push('--passphrase', '***');
    }

    const jobId = crypto.randomBytes(6).toString('hex');
    activeJobId = jobId;
    const createdAt = new Date().toISOString();
    const dateStamp = createdAt.slice(0, 10);
    const zipFileName = `export-${dateStamp}.zip`;

    const job: InternalSandboxJob = {
      job_id: jobId,
      status: 'running',
      mode,
      target_dir: resolvedTarget,
      command: safeCmd,
      created_at: createdAt,
      finished_at: null,
      duration_sec: 0,
      return_code: null,
      files_exported: 0,
      size_bytes: 0,
      download_ready: false,
      stdout: [`Starte document_exporter nach ${cmdTarget} ...`],
      error: null,
      _zipBuffer: null,
      _zipFileName: zipFileName,
    };
    jobs.set(jobId, job);

    const requestedSimMs = Number(req.header('X-Sandbox-Simulated-Ms') || 0);
    const delayMs =
      requestedSimMs > 0 ? Math.min(requestedSimMs, 15000) : isAsync ? 3500 : 450;

    const finalizeJob = () => {
      const { zipBytes, filesCount } = createSampleExportZip(effectiveOpts);
      const finishedAt = new Date().toISOString();
      job.status = 'completed';
      job.finished_at = finishedAt;
      job.duration_sec = Number((delayMs / 1000).toFixed(2));
      job.return_code = 0;
      job.files_exported = mode === 'download' ? 1 : filesCount;
      job.size_bytes = zipBytes.length;
      job.download_ready = mode === 'download';
      job._zipBuffer = mode === 'download' ? zipBytes : null;
      job.stdout.push(
        `Exportiere Metadaten und Dokumente (${filesCount} Einträge)...`,
        mode === 'download'
          ? `ZIP-Archiv ${zipFileName} erstellt (${zipBytes.length} Bytes).`
          : `Export nach ${resolvedTarget} erfolgreich abgeschlossen.`
      );
      activeJobId = null;
    };

    if (isAsync) {
      setTimeout(finalizeJob, delayMs);
      res.status(202).json({
        job_id: jobId,
        status: 'running',
        mode,
        status_url: `/jobs/${jobId}`,
        download_url: mode === 'download' ? `/jobs/${jobId}/download` : null,
      });
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
    finalizeJob();

    if (mode === 'download' && job._zipBuffer) {
      const zipBuffer = Buffer.from(job._zipBuffer);
      job._zipBuffer = null;
      job.download_ready = false;
      job.stdout.push('[Auto-Cleanup] Temporäre ZIP nach Stream-Antwort bereinigt.');
      res.status(200);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);
      res.setHeader('Content-Length', String(zipBuffer.length));
      res.send(zipBuffer);
      return;
    }

    res.status(200).json(publicJobView(job));
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}

startServer();
