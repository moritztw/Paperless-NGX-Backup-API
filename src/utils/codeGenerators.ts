import type {
  ExporterFlagMeta,
  ExportRequestConfig,
  ServerAddonConfig,
} from '../types/exporter';

export const EXPORTER_FLAGS_META: ExporterFlagMeta[] = [
  {
    key: 'compare_checksums',
    cliFlag: '--compare-checksums',
    shortFlag: '-c',
    label: 'Prüfsummen vergleichen',
    description:
      'Vergleicht Datei-Prüfsummen statt nur Änderungsdatum und Dateigröße bei bestehenden Export-Ordnern.',
    impact: 'Präziser bei inkrementellen Backups, benötigt etwas mehr Disk-I/O',
  },
  {
    key: 'delete',
    cliFlag: '--delete',
    shortFlag: '-d',
    label: 'Verwaiste Dateien im Ziel löschen',
    description:
      'Entfernt Dateien im Zielverzeichnis, die nicht mehr zum aktuellen Paperless-Bestand gehören.',
    impact: 'Ideal für spiegelnde NAS-Backups (nur bei lokalem Ordner sinnvoll)',
  },
  {
    key: 'use_filename_format',
    cliFlag: '--use-filename-format',
    shortFlag: '-f',
    label: 'Paperless-Dateinamenformat nutzen',
    description:
      'Benennt exportierte Dokumente gemäß deiner PAPERLESS_FILENAME_FORMAT-Regeln statt interner IDs.',
    impact: 'Menschenlesbare Ordner- und Dateinamen im Backup',
  },
  {
    key: 'use_folder_prefix',
    cliFlag: '--use-folder-prefix',
    shortFlag: '-p',
    label: 'Ordner-Präfixe verwenden',
    description:
      'Strukturiert Dateien in Unterordnern (z. B. documents/originals, documents/archive, thumbnails).',
    impact: 'Übersichtlichere Struktur bei großen Dokumentenmengen',
  },
  {
    key: 'compare_json',
    cliFlag: '--compare-json',
    shortFlag: '-cj',
    label: 'Manifest nur bei Änderung schreiben',
    description:
      'Überschreibt manifest.json und metadata.json nur, wenn sich tatsächlich Inhalte geändert haben.',
    impact: 'Schont Snapshots (ZFS / Borg / Restic) vor unnötigen Änderungen',
  },
  {
    key: 'no_archive',
    cliFlag: '--no-archive',
    shortFlag: '-na',
    label: 'Archiv-PDFs auslassen',
    description:
      'Exportiert nur Originaldokumente und Metadaten ohne generierte OCR-Archivdateien.',
    impact: 'Spart bis zu 40–50 % Speicherplatz',
  },
  {
    key: 'no_thumbnail',
    cliFlag: '--no-thumbnail',
    shortFlag: '-nt',
    label: 'Vorschaubilder auslassen',
    description:
      'Schließt generierte Dokument-Thumbnails vom Export aus (werden beim Import neu erzeugt).',
    impact: 'Weniger Einzeldateien, schnellerer Export',
  },
  {
    key: 'split_manifest',
    cliFlag: '--split-manifest',
    shortFlag: '-sm',
    label: 'Manifest aufteilen',
    description:
      'Erzeugt pro Dokument eine eigene JSON-Metadatendatei statt einer großen Gesamtdatei.',
    impact: 'Praktisch für nachgelagerte n8n-Einzeldatei-Verarbeitung',
  },
  {
    key: 'data_only',
    cliFlag: '--data-only',
    label: 'Nur Datenbank & Metadaten',
    description:
      'Exportiert ausschließlich Datenbank-Inhalte (Tags, Korrespondenten, Metadaten) ohne Mediendateien.',
    impact: 'Sekundenschnell, ideal für häufige Metadaten-Sicherungen',
  },
  {
    key: 'zip',
    cliFlag: '--zip',
    shortFlag: '-z',
    label: 'Als ZIP-Archiv komprimieren',
    description:
      'Packt den gesamten Export direkt in eine komprimierte ZIP-Datei im Zielordner.',
    impact: 'Beim Modus „ZIP-Download“ automatisch aktiv',
  },
];

export function generateRandomApiKey(): string {
  const bytes = new Uint8Array(24);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return (
    'plx_' +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  );
}

export function buildEffectiveTargetDir(req: ExportRequestConfig, allowedDirs: string[]): string {
  const base = (req.target_dir || allowedDirs[0] || '/opt/paperless/export').replace(/\/+$/, '');
  const cleanSub = req.subfolder.trim().replace(/^\/+|\/+$/g, '');
  return cleanSub ? `${base}/${cleanSub}` : base;
}

export function buildRequestJsonPayload(
  req: ExportRequestConfig,
  allowedDirs: string[]
): Record<string, unknown> {
  const activeOptions: Record<string, unknown> = {};
  for (const meta of EXPORTER_FLAGS_META) {
    if (meta.key === 'zip' && req.mode === 'download') {
      continue; // Automatically enabled in download mode
    }
    if (req.options[meta.key]) {
      activeOptions[meta.key] = true;
    }
  }
  if (req.options.passphrase.trim().length > 0) {
    activeOptions.passphrase = req.options.passphrase.trim();
  }

  const payload: Record<string, unknown> = {
    mode: req.mode,
  };

  if (req.mode === 'local') {
    payload.target_dir = buildEffectiveTargetDir(req, allowedDirs);
  }

  if (req.async) {
    payload.async = true;
  }

  if (Object.keys(activeOptions).length > 0) {
    payload.options = activeOptions;
  }

  return payload;
}

export function generateEnvFileContent(config: ServerAddonConfig): string {
  const dirs = config.allowedDirs.filter((d) => d.trim().length > 0).join(',');
  return `# Konfiguration für Paperless-NGX Exporter API Addon
# Dateipfad auf dem Proxmox-LXC: /etc/paperless-export-api.env (chmod 600)

EXPORT_API_HOST=${config.bindHost}
EXPORT_API_PORT=${config.port}
EXPORT_API_KEY=${config.apiKey}

# Kommagetrennte Whitelist erlaubter Basisverzeichnisse für mode="local"
ALLOWED_EXPORT_DIRS=${dirs}

# Paperless-NGX Bare-Metal Pfade (community-scripts Standard)
PAPERLESS_SRC_DIR=${config.paperlessSrcDir}
PAPERLESS_CONFIGURATION_PATH=${config.paperlessConfPath}

# Aufbewahrungsdauer für abgeschlossene Async-Jobs & temporäre ZIPs (Sekunden)
CLEANUP_TTL_SECONDS=${Math.max(1, config.cleanupTtlMinutes) * 60}

# Maximale Laufzeit eines einzelnen document_exporter-Prozesses (Sekunden)
COMMAND_TIMEOUT_SECONDS=${Math.max(1, config.commandTimeoutMinutes) * 60}
`;
}

export function generatePythonDaemonCode(config: ServerAddonConfig): string {
  const defaultDirs = config.allowedDirs.filter((d) => d.trim().length > 0).join(',');
  return `#!/usr/bin/env python3
"""
Paperless-NGX Document Exporter REST-API Addon
Optimiert für Proxmox VE Bare-Metal / LXC Installationen (community-scripts).

Merkmale:
- 100 % Python-Standardbibliothek (0 externe pip-Abhängigkeiten, ~15 MB RAM)
- Automatische Erkennung von Python/.venv/uv in ${config.paperlessSrcDir}
- Bearer-Token-Authentifizierung (zeitkonstanter Vergleich via hmac.compare_digest)
- Strikte Pfad-Whitelist gegen Path-Traversal (Path.resolve)
- Kombinierter Modus: Synchroner Direkt-Aufruf oder Async-Hintergrundjob
- Wahlweise lokaler Ordner-Export oder speicherschonendes ZIP-Streaming (64 KB Chunks)
- Prozess-Lock gegen parallele Doppel-Exporte (HTTP 409 Conflict)
"""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
import hmac
import json
import logging
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import uuid

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("paperless-export-api")


def load_dotenv_fallback(env_path: str = "/etc/paperless-export-api.env") -> None:
    """Lädt /etc/paperless-export-api.env, falls das Skript manuell ohne systemd gestartet wird."""
    path = Path(env_path)
    if not path.is_file():
        return
    try:
        for raw_line in path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))
    except OSError:
        pass


load_dotenv_fallback()

HOST = os.environ.get("EXPORT_API_HOST", "${config.bindHost}")
PORT = int(os.environ.get("EXPORT_API_PORT", "${config.port}"))
API_KEY = os.environ.get("EXPORT_API_KEY", "").strip()
SRC_DIR = Path(os.environ.get("PAPERLESS_SRC_DIR", "${config.paperlessSrcDir}")).resolve()
CONF_PATH = Path(os.environ.get("PAPERLESS_CONFIGURATION_PATH", "${config.paperlessConfPath}"))
CLEANUP_TTL = int(os.environ.get("CLEANUP_TTL_SECONDS", "${Math.max(1, config.cleanupTtlMinutes) * 60}"))
CMD_TIMEOUT = int(os.environ.get("COMMAND_TIMEOUT_SECONDS", "${Math.max(1, config.commandTimeoutMinutes) * 60}"))
MAX_BODY_BYTES = 65536

RAW_ALLOWED_DIRS = os.environ.get("ALLOWED_EXPORT_DIRS", "${defaultDirs}")
ALLOWED_ROOTS = [
    Path(p.strip()).resolve(strict=False)
    for p in RAW_ALLOWED_DIRS.split(",")
    if p.strip().startswith("/")
]

BOOLEAN_FLAG_MAP = {
    "compare_checksums": "--compare-checksums",
    "compare_json": "--compare-json",
    "delete": "--delete",
    "use_filename_format": "--use-filename-format",
    "use_folder_prefix": "--use-folder-prefix",
    "no_archive": "--no-archive",
    "no_thumbnail": "--no-thumbnail",
    "split_manifest": "--split-manifest",
    "data_only": "--data-only",
    "zip": "--zip",
}

EXPORT_LOCK = threading.Lock()
JOBS_LOCK = threading.Lock()
JOBS: dict[str, dict] = {}
ACTIVE_JOB_ID: str | None = None


def detect_runner(src_dir: Path) -> list[str]:
    """Erkennt automatisch .venv, uv oder System-Python im Proxmox Paperless-LXC."""
    custom_cmd = os.environ.get("PAPERLESS_PYTHON_CMD", "").strip()
    if custom_cmd:
        return [*custom_cmd.split(), "manage.py"]

    venv_candidates = [
        src_dir.parent / ".venv" / "bin" / "python3",
        src_dir.parent / "venv" / "bin" / "python3",
        src_dir / ".venv" / "bin" / "python3",
    ]
    for candidate in venv_candidates:
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return [str(candidate), "manage.py"]

    for uv_candidate in [shutil.which("uv"), "/usr/local/bin/uv", "/root/.local/bin/uv"]:
        if uv_candidate and Path(uv_candidate).is_file():
            return [str(uv_candidate), "run", "--no-sync", "python3", "manage.py"]

    return [sys.executable, "manage.py"]


RUNNER_CMD = detect_runner(SRC_DIR)


def is_within_whitelist(candidate: Path) -> bool:
    for root in ALLOWED_ROOTS:
        if candidate == root or root in candidate.parents:
            return True
    return False


def validate_and_prepare_target_dir(raw_target: str) -> Path:
    if not raw_target or not raw_target.startswith("/"):
        raise ValueError("target_dir muss ein absoluter Linux-Pfad sein.")
    if not ALLOWED_ROOTS:
        raise PermissionError("Keine ALLOWED_EXPORT_DIRS auf dem Server konfiguriert.")

    resolved = Path(raw_target).resolve(strict=False)
    if not is_within_whitelist(resolved):
        raise PermissionError(f"Zielpfad '{raw_target}' liegt nicht in der Pfad-Whitelist.")

    resolved.mkdir(parents=True, exist_ok=True)
    real_after_mkdir = resolved.resolve(strict=True)
    if not is_within_whitelist(real_after_mkdir):
        raise PermissionError("Symlink-Ziel außerhalb der Whitelist erkannt und blockiert.")
    return real_after_mkdir


def build_command(target_dir: Path, options: dict, force_zip: bool) -> tuple[list[str], list[str]]:
    """Erstellt ein sicheres Argument-Array (ohne Shell) sowie eine maskierte Log-Ansicht."""
    cmd = [*RUNNER_CMD, "document_exporter", str(target_dir), "--no-progress-bar"]
    opts = dict(options or {})
    if force_zip:
        opts["zip"] = True

    for key, cli_flag in BOOLEAN_FLAG_MAP.items():
        if bool(opts.get(key, False)):
            cmd.append(cli_flag)

    safe_cmd = list(cmd)
    passphrase = opts.get("passphrase")
    if isinstance(passphrase, str) and passphrase.strip():
        cmd.extend(["--passphrase", passphrase.strip()])
        safe_cmd.extend(["--passphrase", "***"])

    return cmd, safe_cmd


def cleanup_expired_jobs() -> None:
    now = time.time()
    expired_ids = []
    with JOBS_LOCK:
        for jid, job in JOBS.items():
            if job["status"] in ("completed", "failed") and (now - job["updated_ts"]) > CLEANUP_TTL:
                expired_ids.append(jid)
        for jid in expired_ids:
            job = JOBS.pop(jid, None)
            if job and job.get("_temp_dir"):
                shutil.rmtree(job["_temp_dir"], ignore_errors=True)


def summarize_directory(directory: Path) -> tuple[int, int]:
    files_count = 0
    total_bytes = 0
    for entry in directory.rglob("*"):
        if entry.is_file():
            files_count += 1
            try:
                total_bytes += entry.stat().st_size
            except OSError:
                pass
    return files_count, total_bytes


def execute_export_job(job_id: str, cmd: list[str], target_dir: Path, mode: str, temp_dir: str | None) -> None:
    global ACTIVE_JOB_ID
    start_ts = time.monotonic()
    child_env = os.environ.copy()
    child_env.setdefault("UV_CACHE_DIR", "/tmp/paperless-uv-cache")
    if CONF_PATH.is_file():
        child_env.setdefault("PAPERLESS_CONFIGURATION_PATH", str(CONF_PATH))

    try:
        logger.info("Starte Export-Job %s (mode=%s, target=%s)", job_id, mode, target_dir)
        proc = subprocess.run(
            cmd,
            cwd=str(SRC_DIR),
            env=child_env,
            shell=False,
            capture_output=True,
            text=True,
            timeout=CMD_TIMEOUT,
        )
        duration = round(time.monotonic() - start_ts, 2)
        stdout_lines = [ln for ln in (proc.stdout or "").splitlines() if ln.strip()][-25:]
        stderr_lines = [ln for ln in (proc.stderr or "").splitlines() if ln.strip()][-25:]

        if proc.returncode != 0:
            err_msg = "\\n".join(stderr_lines or stdout_lines) or f"Exit-Code {proc.returncode}"
            with JOBS_LOCK:
                JOBS[job_id].update({
                    "status": "failed",
                    "return_code": proc.returncode,
                    "duration_sec": duration,
                    "error": err_msg,
                    "stdout": stdout_lines,
                    "updated_ts": time.time(),
                })
            if temp_dir:
                shutil.rmtree(temp_dir, ignore_errors=True)
                JOBS[job_id]["_temp_dir"] = None
            logger.error("Export-Job %s fehlgeschlagen: %s", job_id, err_msg)
            return

        zip_file_path: Path | None = None
        if mode == "download":
            zips = sorted(target_dir.glob("*.zip"), key=lambda p: p.stat().st_mtime, reverse=True)
            if not zips:
                raise RuntimeError("document_exporter hat keine ZIP-Datei erzeugt.")
            zip_file_path = zips[0]
            files_count = 1
            size_bytes = zip_file_path.stat().st_size
        else:
            files_count, size_bytes = summarize_directory(target_dir)

        with JOBS_LOCK:
            JOBS[job_id].update({
                "status": "completed",
                "return_code": 0,
                "duration_sec": duration,
                "files_exported": files_count,
                "size_bytes": size_bytes,
                "download_ready": zip_file_path is not None,
                "_zip_path": str(zip_file_path) if zip_file_path else None,
                "stdout": stdout_lines,
                "updated_ts": time.time(),
            })
        logger.info("Export-Job %s erfolgreich beendet in %.2fs (%d Bytes)", job_id, duration, size_bytes)

    except subprocess.TimeoutExpired:
        duration = round(time.monotonic() - start_ts, 2)
        if temp_dir:
            shutil.rmtree(temp_dir, ignore_errors=True)
        with JOBS_LOCK:
            JOBS[job_id].update({
                "status": "failed",
                "duration_sec": duration,
                "error": f"Zeitüberschreitung nach {CMD_TIMEOUT} Sekunden.",
                "_temp_dir": None,
                "updated_ts": time.time(),
            })
    except Exception as exc:
        duration = round(time.monotonic() - start_ts, 2)
        if temp_dir:
            shutil.rmtree(temp_dir, ignore_errors=True)
        with JOBS_LOCK:
            JOBS[job_id].update({
                "status": "failed",
                "duration_sec": duration,
                "error": str(exc),
                "_temp_dir": None,
                "updated_ts": time.time(),
            })
    finally:
        ACTIVE_JOB_ID = None
        EXPORT_LOCK.release()


def public_job_view(job: dict) -> dict:
    return {k: v for k, v in job.items() if not k.startswith("_")}


class ExportAPIHandler(BaseHTTPRequestHandler):
    server_version = "PaperlessExportAPI/1.0"

    def log_message(self, fmt: str, *args) -> None:
        logger.info("%s - %s", self.address_string(), fmt % args)

    def send_json(self, status_code: int, payload: dict) -> None:
        raw = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def check_auth(self) -> bool:
        if len(API_KEY) < 12:
            self.send_json(500, {"error": "Server-Fehlkonfiguration: EXPORT_API_KEY ist zu kurz oder leer."})
            return False

        auth_header = self.headers.get("Authorization", "")
        token = ""
        if auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
        elif self.headers.get("X-API-Key"):
            token = self.headers.get("X-API-Key", "").strip()

        if not token or not hmac.compare_digest(token.encode("utf-8"), API_KEY.encode("utf-8")):
            self.send_json(401, {"error": "Nicht autorisiert. Gültiger Bearer API-Key erforderlich."})
            return False
        return True

    def stream_zip_and_cleanup(self, zip_path: Path, temp_dir: str | None, delete_after: bool = True) -> None:
        try:
            size = zip_path.stat().st_size
            self.send_response(200)
            self.send_header("Content-Type", "application/zip")
            self.send_header("Content-Disposition", f'attachment; filename="{zip_path.name}"')
            self.send_header("Content-Length", str(size))
            self.end_headers()
            with zip_path.open("rb") as f:
                shutil.copyfileobj(f, self.wfile, length=65536)
        except (BrokenPipeError, ConnectionResetError):
            logger.warning("Client hat die Verbindung während des ZIP-Downloads getrennt.")
        finally:
            if delete_after and temp_dir:
                shutil.rmtree(temp_dir, ignore_errors=True)

    def do_GET(self) -> None:
        cleanup_expired_jobs()
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"

        if path == "/health":
            manage_ok = (SRC_DIR / "manage.py").is_file()
            self.send_json(200 if manage_ok else 503, {
                "status": "ok" if manage_ok else "misconfigured",
                "export_running": EXPORT_LOCK.locked(),
                "active_job_id": ACTIVE_JOB_ID,
                "manage_py_found": manage_ok,
                "runner": RUNNER_CMD,
            })
            return

        if not self.check_auth():
            return

        if path == "/jobs":
            with JOBS_LOCK:
                items = [public_job_view(j) for j in JOBS.values()]
            self.send_json(200, {"jobs": items})
            return

        if path.startswith("/jobs/"):
            parts = path.strip("/").split("/")
            job_id = parts[1]
            with JOBS_LOCK:
                job = JOBS.get(job_id)

            if not job:
                self.send_json(404, {"error": f"Job '{job_id}' nicht gefunden oder bereits abgelaufen."})
                return

            if len(parts) == 2:
                self.send_json(200, public_job_view(job))
                return

            if len(parts) == 3 and parts[2] == "download":
                if job["status"] == "running":
                    self.send_json(409, {"error": "Export läuft noch. Bitte Status abwarten.", "status": "running"})
                    return
                zip_str = job.get("_zip_path")
                if job["status"] != "completed" or not zip_str or not Path(zip_str).is_file():
                    self.send_json(404, {"error": "Keine herunterladbare ZIP-Datei für diesen Job vorhanden."})
                    return

                query = parse_qs(parsed.query)
                keep_file = query.get("keep", ["0"])[0] == "1"
                temp_dir = job.get("_temp_dir")
                if not keep_file:
                    with JOBS_LOCK:
                        job["download_ready"] = False
                        job["_zip_path"] = None
                        job["_temp_dir"] = None
                self.stream_zip_and_cleanup(Path(zip_str), temp_dir, delete_after=not keep_file)
                return

        self.send_json(404, {"error": "Endpunkt nicht gefunden."})

    def do_POST(self) -> None:
        global ACTIVE_JOB_ID
        cleanup_expired_jobs()
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        if path != "/export":
            self.send_json(404, {"error": "Endpunkt nicht gefunden. Nutze POST /export."})
            return

        if not self.check_auth():
            return

        content_len = int(self.headers.get("Content-Length", "0"))
        if content_len > MAX_BODY_BYTES:
            self.send_json(413, {"error": "JSON-Payload zu groß (max. 64 KB)."})
            return

        body: dict = {}
        if content_len > 0:
            try:
                body = json.loads(self.rfile.read(content_len).decode("utf-8"))
                if not isinstance(body, dict):
                    raise ValueError("JSON-Objekt erwartet.")
            except Exception as exc:
                self.send_json(400, {"error": f"Ungültiges JSON: {exc}"})
                return

        mode = str(body.get("mode", "local")).lower()
        if mode not in ("local", "download"):
            self.send_json(400, {"error": "Ungültiger 'mode'. Erlaubt sind 'local' oder 'download'."})
            return

        is_async = bool(body.get("async", False))
        options = body.get("options") or {}
        if not isinstance(options, dict):
            self.send_json(400, {"error": "'options' muss ein JSON-Objekt sein."})
            return

        if not (SRC_DIR / "manage.py").is_file():
            self.send_json(500, {"error": f"manage.py nicht unter '{SRC_DIR}' gefunden."})
            return

        if not EXPORT_LOCK.acquire(blocking=False):
            self.send_json(409, {
                "error": "Ein anderer Export läuft bereits. Bitte warten.",
                "active_job_id": ACTIVE_JOB_ID,
            })
            return

        temp_dir: str | None = None
        try:
            if mode == "download":
                temp_dir = tempfile.mkdtemp(prefix="paperless_export_")
                target_dir = Path(temp_dir)
            else:
                default_target = str(ALLOWED_ROOTS[0]) if ALLOWED_ROOTS else ""
                raw_target = str(body.get("target_dir") or default_target).strip()
                target_dir = validate_and_prepare_target_dir(raw_target)

            cmd, safe_cmd = build_command(target_dir, options, force_zip=(mode == "download"))
        except PermissionError as exc:
            EXPORT_LOCK.release()
            if temp_dir:
                shutil.rmtree(temp_dir, ignore_errors=True)
            self.send_json(403, {"error": str(exc)})
            return
        except ValueError as exc:
            EXPORT_LOCK.release()
            if temp_dir:
                shutil.rmtree(temp_dir, ignore_errors=True)
            self.send_json(400, {"error": str(exc)})
            return

        job_id = uuid.uuid4().hex[:12]
        ACTIVE_JOB_ID = job_id
        with JOBS_LOCK:
            JOBS[job_id] = {
                "job_id": job_id,
                "status": "running",
                "mode": mode,
                "target_dir": str(target_dir) if mode == "local" else "stream://zip-download",
                "command": safe_cmd,
                "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "duration_sec": 0.0,
                "return_code": None,
                "files_exported": 0,
                "size_bytes": 0,
                "download_ready": False,
                "stdout": [],
                "error": None,
                "updated_ts": time.time(),
                "_temp_dir": temp_dir,
                "_zip_path": None,
            }

        if is_async:
            worker = threading.Thread(
                target=execute_export_job,
                args=(job_id, cmd, target_dir, mode, temp_dir),
                daemon=True,
            )
            worker.start()
            self.send_json(202, {
                "job_id": job_id,
                "status": "running",
                "mode": mode,
                "status_url": f"/jobs/{job_id}",
                "download_url": f"/jobs/{job_id}/download" if mode == "download" else None,
            })
            return

        # Synchroner Modus: Direkt im Request ausführen (EXPORT_LOCK wird in execute_export_job freigegeben)
        execute_export_job(job_id, cmd, target_dir, mode, temp_dir)
        with JOBS_LOCK:
            finished_job = JOBS[job_id]

        if finished_job["status"] != "completed":
            self.send_json(500, public_job_view(finished_job))
            return

        if mode == "download":
            zip_str = finished_job.get("_zip_path")
            with JOBS_LOCK:
                finished_job["download_ready"] = False
                finished_job["_zip_path"] = None
                finished_job["_temp_dir"] = None
            if not zip_str or not Path(zip_str).is_file():
                self.send_json(500, {"error": "Erzeugte ZIP-Datei nicht auffindbar."})
                return
            self.stream_zip_and_cleanup(Path(zip_str), temp_dir, delete_after=True)
            return

        self.send_json(200, public_job_view(finished_job))


def main() -> None:
    if len(API_KEY) < 12:
        logger.warning("WARNUNG: EXPORT_API_KEY ist leer oder kürzer als 12 Zeichen!")
    logger.info("Starte Paperless Export API auf %s:%d", HOST, PORT)
    logger.info("Erkannter Runner: %s (in %s)", " ".join(RUNNER_CMD), SRC_DIR)
    logger.info("Erlaubte Export-Pfade: %s", [str(p) for p in ALLOWED_ROOTS])

    server = ThreadingHTTPServer((HOST, PORT), ExportAPIHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Beende Server...")
        server.server_close()


if __name__ == "__main__":
    main()
`;
}

export function generateSystemdServiceContent(config: ServerAddonConfig): string {
  const userLine =
    config.serviceUser === 'auto'
      ? '# Wird durch install.sh automatisch auf den aktiven Paperless-Service-User gesetzt\nUser=paperless'
      : `User=${config.serviceUser}`;

  return `[Unit]
Description=Paperless-NGX Document Exporter REST API Addon
After=network.target paperless-webserver.service
Wants=network.target

[Service]
Type=simple
${userLine}
WorkingDirectory=${config.paperlessSrcDir}
EnvironmentFile=/etc/paperless-export-api.env
ExecStart=/usr/bin/python3 /opt/paperless/export_api/paperless_export_api.py
Restart=on-failure
RestartSec=5

# Sicherheits-Härtung ohne Einschränkung für große ZIP-Exporte
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
`;
}

export function generateInstallScript(config: ServerAddonConfig): string {
  const pythonCode = generatePythonDaemonCode(config);
  const envContent = generateEnvFileContent(config);
  const dirsBashArray = config.allowedDirs
    .filter((d) => d.trim().length > 0)
    .map((d) => `"${d.replace(/"/g, '')}"`)
    .join(' ');

  const detectUserBlock =
    config.serviceUser === 'auto'
      ? `# Automatische Erkennung des Systemnutzers aus dem bestehenden community-scripts Service
DETECTED_USER=$(systemctl show -p User --value paperless-webserver.service 2>/dev/null || true)
if [ -z "$DETECTED_USER" ]; then
  if id -u paperless >/dev/null 2>&1; then
    DETECTED_USER="paperless"
  else
    DETECTED_USER="root"
  fi
fi`
      : `DETECTED_USER="${config.serviceUser}"`;

  return `#!/usr/bin/env bash
# ==============================================================================
# 1-Befehl Installer: Paperless-NGX Exporter API für Proxmox LXC (community-scripts)
# Ausführen als root in der Konsole deines Paperless-NGX LXC-Containers:
#   bash install.sh
# ==============================================================================
set -euo pipefail

echo "==> Prüfe Paperless-NGX Installation unter ${config.paperlessSrcDir}..."
if [ ! -f "${config.paperlessSrcDir}/manage.py" ]; then
  echo "FEHLER: ${config.paperlessSrcDir}/manage.py wurde nicht gefunden."
  echo "Bitte prüfe PAPERLESS_SRC_DIR in der Konfiguration."
  exit 1
fi

${detectUserBlock}
echo "==> Verwende Service-Nutzer: $DETECTED_USER"

INSTALL_DIR="/opt/paperless/export_api"
mkdir -p "$INSTALL_DIR"

echo "==> Schreibe Python-Daemon nach $INSTALL_DIR/paperless_export_api.py..."
cat << 'EOF_PYTHON_DAEMON' > "$INSTALL_DIR/paperless_export_api.py"
${pythonCode}EOF_PYTHON_DAEMON

chmod 755 "$INSTALL_DIR/paperless_export_api.py"
chown "$DETECTED_USER":"$DETECTED_USER" "$INSTALL_DIR" "$INSTALL_DIR/paperless_export_api.py" 2>/dev/null || true

echo "==> Schreibe geschützte Konfigurationsdatei /etc/paperless-export-api.env..."
cat << 'EOF_ENV_CONFIG' > /etc/paperless-export-api.env
${envContent}EOF_ENV_CONFIG

chmod 600 /etc/paperless-export-api.env

echo "==> Lege erlaubte Export-Verzeichnisse an..."
ALLOWED_DIRS=(${dirsBashArray})
for DIR in "\${ALLOWED_DIRS[@]}"; do
  if [ ! -d "$DIR" ]; then
    mkdir -p "$DIR"
    chown "$DETECTED_USER":"$DETECTED_USER" "$DIR" 2>/dev/null || true
    echo "    Erstellt: $DIR"
  else
    echo "    Vorhanden: $DIR"
  fi
done

echo "==> Richte systemd-Service paperless-export-api.service ein..."
cat << EOF_SYSTEMD > /etc/systemd/system/paperless-export-api.service
[Unit]
Description=Paperless-NGX Document Exporter REST API Addon
After=network.target paperless-webserver.service
Wants=network.target

[Service]
Type=simple
User=$DETECTED_USER
WorkingDirectory=${config.paperlessSrcDir}
EnvironmentFile=/etc/paperless-export-api.env
ExecStart=/usr/bin/python3 /opt/paperless/export_api/paperless_export_api.py
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF_SYSTEMD

systemctl daemon-reload
systemctl enable --now paperless-export-api.service
systemctl restart paperless-export-api.service

sleep 1
echo "==> Prüfe Service-Status & Health-Endpunkt..."
if curl -fsS "http://127.0.0.1:${config.port}/health" ; then
  echo ""
  echo "==> Installation erfolgreich abgeschlossen! API läuft auf Port ${config.port}."
else
  echo ""
  echo "WARNUNG: Service antwortet noch nicht. Prüfe Logs mit: journalctl -u paperless-export-api -n 30"
  exit 1
fi
`;
}

export function generateUninstallScript(): string {
  return `#!/usr/bin/env bash
# Saubere Deinstallation des Paperless-NGX Exporter API Addons
# Bestehende Export-Ordner und Paperless-Daten bleiben vollständig unangetastet!
set -euo pipefail

echo "==> Stoppe und entferne paperless-export-api.service..."
systemctl disable --now paperless-export-api.service 2>/dev/null || true
rm -f /etc/systemd/system/paperless-export-api.service
systemctl daemon-reload

echo "==> Entferne Addon-Dateien..."
rm -rf /opt/paperless/export_api
rm -f /etc/paperless-export-api.env

echo "==> Deinstallation abgeschlossen. Deine Paperless-Installation und Backups wurden nicht verändert."
`;
}

export function generateCurlSnippet(
  config: ServerAddonConfig,
  req: ExportRequestConfig
): string {
  const baseUrl = `http://${config.lxcAddress || '192.168.178.50'}:${config.port}`;
  const payload = JSON.stringify(buildRequestJsonPayload(req, config.allowedDirs), null, 2);

  if (!req.async && req.mode === 'download') {
    return `# Synchroner Export mit direktem ZIP-Stream-Download
curl -fSL -X POST "${baseUrl}/export" \\
  -H "Authorization: Bearer ${config.apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '${payload}' \\
  -o "paperless-backup-$(date +%F).zip"`;
  }

  if (req.async) {
    const step3 =
      req.mode === 'download'
        ? `\n# 3. Sobald status == "completed": Fertige ZIP herunterladen (räumt Temp-Ordner automatisch auf)\ncurl -fSL "${baseUrl}/jobs/<JOB_ID>/download" \\\n  -H "Authorization: Bearer ${config.apiKey}" \\\n  -o "paperless-backup.zip"`
        : '';
    return `# 1. Hintergrund-Job starten (liefert sofort HTTP 202 + job_id)
curl -fsS -X POST "${baseUrl}/export" \\
  -H "Authorization: Bearer ${config.apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '${payload}'

# 2. Job-Status abfragen (in n8n per Wait + HTTP-Node Loop)
curl -fsS "${baseUrl}/jobs/<JOB_ID>" \\
  -H "Authorization: Bearer ${config.apiKey}"${step3}`;
  }

  return `# Synchroner Export in lokalen Pfad / NAS-Mount auf dem LXC
curl -fsS -X POST "${baseUrl}/export" \\
  -H "Authorization: Bearer ${config.apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '${payload}'`;
}

export function generateN8nWorkflowJson(
  config: ServerAddonConfig,
  req: ExportRequestConfig
): string {
  const baseUrl = `http://${config.lxcAddress || '192.168.178.50'}:${config.port}`;
  const payload = buildRequestJsonPayload(req, config.allowedDirs);

  if (!req.async) {
    const isBinary = req.mode === 'download';
    const workflow = {
      name: `Paperless-NGX Export (${isBinary ? 'ZIP Download' : 'Lokales Backup'})`,
      nodes: [
        {
          parameters: {},
          id: 'b1000001-0000-4000-8000-000000000001',
          name: 'Manueller / Zeitplan Start',
          type: 'n8n-nodes-base.manualTrigger',
          typeVersion: 1,
          position: [240, 300],
        },
        {
          parameters: {
            method: 'POST',
            url: `${baseUrl}/export`,
            sendHeaders: true,
            headerParameters: {
              parameters: [
                {
                  name: 'Authorization',
                  value: `Bearer ${config.apiKey}`,
                },
              ],
            },
            sendBody: true,
            specifyBody: 'json',
            jsonBody: JSON.stringify(payload, null, 2),
            options: {
              timeout: Math.max(1, config.commandTimeoutMinutes) * 60 * 1000,
              ...(isBinary
                ? {
                    response: {
                      response: {
                        responseFormat: 'file',
                        outputPropertyName: 'data',
                      },
                    },
                  }
                : {}),
            },
          },
          id: 'b1000001-0000-4000-8000-000000000002',
          name: 'Paperless Exporter API (Synchron)',
          type: 'n8n-nodes-base.httpRequest',
          typeVersion: 4.2,
          position: [500, 300],
        },
      ],
      connections: {
        'Manueller / Zeitplan Start': {
          main: [
            [
              {
                node: 'Paperless Exporter API (Synchron)',
                type: 'main',
                index: 0,
              },
            ],
          ],
        },
      },
    };
    return JSON.stringify(workflow, null, 2);
  }

  // Async Polling Workflow for n8n
  const nodes: Record<string, unknown>[] = [
    {
      parameters: {},
      id: 'b2000001-0000-4000-8000-000000000001',
      name: 'Start',
      type: 'n8n-nodes-base.manualTrigger',
      typeVersion: 1,
      position: [200, 300],
    },
    {
      parameters: {
        method: 'POST',
        url: `${baseUrl}/export`,
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: 'Authorization', value: `Bearer ${config.apiKey}` }],
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: JSON.stringify({ ...payload, async: true }, null, 2),
      },
      id: 'b2000001-0000-4000-8000-000000000002',
      name: '1. Export-Job starten',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [440, 300],
    },
    {
      parameters: {
        amount: 5,
        unit: 'seconds',
      },
      id: 'b2000001-0000-4000-8000-000000000003',
      name: '2. 5s warten',
      type: 'n8n-nodes-base.wait',
      typeVersion: 1.1,
      position: [680, 300],
    },
    {
      parameters: {
        method: 'GET',
        url: `=${baseUrl}/jobs/{{ $json.job_id }}`,
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: 'Authorization', value: `Bearer ${config.apiKey}` }],
        },
      },
      id: 'b2000001-0000-4000-8000-000000000004',
      name: '3. Job-Status abfragen',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [920, 300],
    },
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
          conditions: [
            {
              id: 'cond-running',
              leftValue: '={{ $json.status }}',
              rightValue: 'running',
              operator: { type: 'string', operation: 'equals' },
            },
          ],
          combinator: 'and',
        },
      },
      id: 'b2000001-0000-4000-8000-000000000005',
      name: '4. Läuft noch?',
      type: 'n8n-nodes-base.if',
      typeVersion: 2,
      position: [1160, 300],
    },
  ];

  const connections: Record<string, unknown> = {
    Start: {
      main: [[{ node: '1. Export-Job starten', type: 'main', index: 0 }]],
    },
    '1. Export-Job starten': {
      main: [[{ node: '2. 5s warten', type: 'main', index: 0 }]],
    },
    '2. 5s warten': {
      main: [[{ node: '3. Job-Status abfragen', type: 'main', index: 0 }]],
    },
    '3. Job-Status abfragen': {
      main: [[{ node: '4. Läuft noch?', type: 'main', index: 0 }]],
    },
    '4. Läuft noch?': {
      main: [
        // True branch -> loop back to Wait node
        [{ node: '2. 5s warten', type: 'main', index: 0 }],
        // False branch -> finished (optional ZIP download node)
        req.mode === 'download'
          ? [{ node: '5. Fertige ZIP herunterladen', type: 'main', index: 0 }]
          : [],
      ],
    },
  };

  if (req.mode === 'download') {
    nodes.push({
      parameters: {
        method: 'GET',
        url: `=${baseUrl}/jobs/{{ $json.job_id }}/download`,
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: 'Authorization', value: `Bearer ${config.apiKey}` }],
        },
        options: {
          response: {
            response: {
              responseFormat: 'file',
              outputPropertyName: 'data',
            },
          },
        },
      },
      id: 'b2000001-0000-4000-8000-000000000006',
      name: '5. Fertige ZIP herunterladen',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1420, 400],
    });
  }

  return JSON.stringify(
    {
      name: `Paperless-NGX Async Export (${req.mode === 'download' ? 'Polling + ZIP' : 'Polling Lokal'})`,
      nodes,
      connections,
    },
    null,
    2
  );
}

export function generateReadmeContent(config: ServerAddonConfig): string {
  return `# Paperless-NGX Exporter API Addon (Proxmox LXC)

Ressourcenarmes REST-API-Addon für \`document_exporter\` auf deiner Proxmox \`community-scripts\` Bare-Metal/LXC-Installation.

## Enthaltene Dateien

- \`install.sh\` – 1-Befehl-Installer für deinen Paperless-NGX LXC-Container
- \`uninstall.sh\` – Saubere Deinstallation (Backups & Paperless bleiben unberührt)
- \`paperless_export_api.py\` – Reiner Python-3-Standardbibliothek-Daemon (~15 MB RAM, 0 externe Pakete)
- \`export-api.env\` – Konfigurationsdatei (\`/etc/paperless-export-api.env\`, \`chmod 600\`)
- \`paperless-export-api.service\` – Gehärtete \`systemd\`-Service-Unit
- \`n8n-workflow-sync.json\` & \`n8n-workflow-async.json\` – Direkt in n8n importierbare Vorlagen

## Schnellstart auf deinem Proxmox-Server

1. Öffne in Proxmox die Shell deines Paperless-NGX LXC-Containers (als \`root\`).
2. Kopiere \`install.sh\` auf den Container und führe es aus:
   \`\`\`bash
   bash install.sh
   \`\`\`
3. Prüfe den Status jederzeit mit:
   \`\`\`bash
   systemctl status paperless-export-api
   journalctl -u paperless-export-api -f
   \`\`\`

## Endpunkte

- \`GET  http://${config.lxcAddress || '<LXC-IP>'}:${config.port}/health\`
- \`POST http://${config.lxcAddress || '<LXC-IP>'}:${config.port}/export\`
- \`GET  http://${config.lxcAddress || '<LXC-IP>'}:${config.port}/jobs/<job_id>\`
- \`GET  http://${config.lxcAddress || '<LXC-IP>'}:${config.port}/jobs/<job_id>/download\`
`;
}
