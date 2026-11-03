#!/usr/bin/env python3
"""
Paperless-NGX Document Exporter REST-API Addon
Optimiert für Bare-Metal / Proxmox LXC Installationen (community-scripts).

Eigenschaften:
- 100 % Python-3-Standardbibliothek (keine externen pip-Abhängigkeiten, ~15 MB RAM)
- Automatische Erkennung von .venv, uv oder System-Python in /opt/paperless/src
- Bearer-API-Key-Authentifizierung (zeitkonstanter Vergleich via hmac.compare_digest)
- Strikte Pfad-Whitelist gegen Path-Traversal und Symlink-Ausbrüche (Path.resolve)
- Kombinierter Modus: Synchron warten (Standard) oder Async-Hintergrundjob
- Wahlweise lokaler Ordner-Export oder direkter ZIP-Stream-Download (64-KB-Chunks)
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
import signal
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
    """Lädt Konfigurationswerte, falls das Skript direkt ohne systemd gestartet wird."""
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

HOST = os.environ.get("EXPORT_API_HOST", "0.0.0.0").strip()
PORT = int(os.environ.get("EXPORT_API_PORT", "8095"))
API_KEY = os.environ.get("EXPORT_API_KEY", "").strip()
SRC_DIR = Path(os.environ.get("PAPERLESS_SRC_DIR", "/opt/paperless/src")).resolve()
CONF_PATH = Path(os.environ.get("PAPERLESS_CONFIGURATION_PATH", "/opt/paperless/paperless.conf"))
CLEANUP_TTL = int(os.environ.get("CLEANUP_TTL_SECONDS", "3600"))
CMD_TIMEOUT = int(os.environ.get("COMMAND_TIMEOUT_SECONDS", "1800"))
MAX_BODY_BYTES = 65536

RAW_ALLOWED_DIRS = os.environ.get("ALLOWED_EXPORT_DIRS", "/opt/paperless/export")
ALLOWED_ROOTS = [
    Path(p.strip()).resolve(strict=False)
    for p in RAW_ALLOWED_DIRS.split(",")
    if p.strip().startswith("/") and p.strip() not in ("/", "/etc", "/root")
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
    """Erkennt automatisch .venv, uv oder System-Python im Paperless-Verzeichnis."""
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
        raise PermissionError("Keine gültigen ALLOWED_EXPORT_DIRS auf dem Server konfiguriert.")

    resolved = Path(raw_target).resolve(strict=False)
    if not is_within_whitelist(resolved):
        raise PermissionError(f"Zielpfad '{raw_target}' liegt nicht in der Pfad-Whitelist.")

    resolved.mkdir(parents=True, exist_ok=True)
    real_after_mkdir = resolved.resolve(strict=True)
    if not is_within_whitelist(real_after_mkdir):
        raise PermissionError("Symlink-Ziel außerhalb der Whitelist erkannt und blockiert.")
    return real_after_mkdir


def build_command(target_dir: Path, options: dict, force_zip: bool) -> tuple[list[str], list[str]]:
    """Erstellt ein sicheres Argument-Array (shell=False) sowie eine maskierte Log-Ansicht."""
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


def execute_export_job(
    job_id: str,
    cmd: list[str],
    target_dir: Path,
    mode: str,
    temp_dir: str | None,
) -> None:
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
            err_msg = "\n".join(stderr_lines or stdout_lines) or f"Exit-Code {proc.returncode}"
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
                with JOBS_LOCK:
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
        if len(API_KEY) < 16:
            self.send_json(
                500,
                {"error": "Server-Fehlkonfiguration: EXPORT_API_KEY ist leer oder kürzer als 16 Zeichen."},
            )
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

    def stream_zip_and_cleanup(
        self,
        zip_path: Path,
        temp_dir: str | None,
        delete_after: bool = True,
    ) -> None:
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
            self.send_json(
                200 if manage_ok else 503,
                {
                    "status": "ok" if manage_ok else "misconfigured",
                    "export_running": EXPORT_LOCK.locked(),
                    "active_job_id": ACTIVE_JOB_ID,
                    "manage_py_found": manage_ok,
                },
            )
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
                    self.send_json(
                        409,
                        {"error": "Export läuft noch. Bitte Status abwarten.", "status": "running"},
                    )
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
            self.send_json(
                409,
                {
                    "error": "Ein anderer Export läuft bereits. Bitte warten.",
                    "active_job_id": ACTIVE_JOB_ID,
                },
            )
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
            self.send_json(
                202,
                {
                    "job_id": job_id,
                    "status": "running",
                    "mode": mode,
                    "status_url": f"/jobs/{job_id}",
                    "download_url": f"/jobs/{job_id}/download" if mode == "download" else None,
                },
            )
            return

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
    if len(API_KEY) < 16:
        logger.warning("WARNUNG: EXPORT_API_KEY ist leer oder kürzer als 16 Zeichen!")
    logger.info("Starte Paperless Export API auf %s:%d", HOST, PORT)
    logger.info("Erkannter Runner: %s (in %s)", " ".join(RUNNER_CMD), SRC_DIR)
    logger.info("Erlaubte Export-Pfade: %s", [str(p) for p in ALLOWED_ROOTS])

    server = ThreadingHTTPServer((HOST, PORT), ExportAPIHandler)

    def handle_shutdown(signum: int, _frame: object) -> None:
        logger.info("Signal %d empfangen – beende HTTP-Server...", signum)
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, handle_shutdown)
    signal.signal(signal.SIGINT, handle_shutdown)

    try:
        server.serve_forever()
    finally:
        server.server_close()
        logger.info("Server gestoppt.")


if __name__ == "__main__":
    main()
