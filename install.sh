#!/usr/bin/env bash
# ==============================================================================
# Installationsskript: Paperless-NGX Exporter API Addon
# Zielsystem: Bare-Metal / Proxmox VE LXC (community-scripts/paperless-ngx)
#
# Aufruf auf dem Paperless-Server (als root):
#   bash install.sh              (interaktiv mit sinnvollen Standardwerten)
#   bash install.sh -y           (automatisch mit Standardwerten)
#   bash install.sh --reconfigure (Konfiguration / API-Key neu anlegen)
# ==============================================================================
set -euo pipefail

AUTO_YES=false
RECONFIGURE=false

for arg in "$@"; do
  case "$arg" in
    -y|--yes)
      AUTO_YES=true
      ;;
    --reconfigure)
      RECONFIGURE=true
      ;;
    -h|--help)
      echo "Verwendung: bash install.sh [-y|--yes] [--reconfigure]"
      exit 0
      ;;
    *)
      echo "Unbekannte Option: $arg"
      echo "Verwendung: bash install.sh [-y|--yes] [--reconfigure]"
      exit 1
      ;;
  esac
done

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo "FEHLER: Bitte führe dieses Skript als root auf deinem Paperless-Server aus."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_PY="${SCRIPT_DIR}/paperless_export_api.py"
RAW_BASE_URL="${RAW_BASE_URL:-}"

PAPERLESS_SRC_DIR="${PAPERLESS_SRC_DIR:-/opt/paperless/src}"
PAPERLESS_CONF_PATH="${PAPERLESS_CONF_PATH:-/opt/paperless/paperless.conf}"
INSTALL_DIR="/opt/paperless/export_api"
ENV_FILE="/etc/paperless-export-api.env"
SERVICE_FILE="/etc/systemd/system/paperless-export-api.service"

echo "==> 1/5 Prüfe Paperless-NGX Umgebung..."
if [ ! -f "${PAPERLESS_SRC_DIR}/manage.py" ]; then
  echo "FEHLER: ${PAPERLESS_SRC_DIR}/manage.py wurde nicht gefunden."
  echo "Falls Paperless in einem anderen Pfad liegt, starte mit:"
  echo "  PAPERLESS_SRC_DIR=/dein/pfad/src bash install.sh"
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "FEHLER: python3 wurde nicht gefunden."
  exit 1
fi

# Ermittle den Systemnutzer des bestehenden Paperless-Dienstes
DETECTED_USER="$(systemctl show -p User --value paperless-webserver.service 2>/dev/null || true)"
if [ -z "$DETECTED_USER" ]; then
  if id -u paperless >/dev/null 2>&1; then
    DETECTED_USER="paperless"
  else
    DETECTED_USER="root"
  fi
fi
echo "    Gefundenes Paperless-Verzeichnis: ${PAPERLESS_SRC_DIR}"
echo "    Erkannter Service-Benutzer:       ${DETECTED_USER}"

echo "==> 2/5 Installiere Python-Daemon nach ${INSTALL_DIR}..."
mkdir -p "${INSTALL_DIR}"

if [ -f "${SOURCE_PY}" ]; then
  cp "${SOURCE_PY}" "${INSTALL_DIR}/paperless_export_api.py"
elif [ -n "${RAW_BASE_URL}" ]; then
  echo "    Lade paperless_export_api.py von ${RAW_BASE_URL}..."
  curl -fsSL "${RAW_BASE_URL%/}/paperless_export_api.py" -o "${INSTALL_DIR}/paperless_export_api.py"
else
  echo "FEHLER: paperless_export_api.py wurde nicht im selben Ordner (${SCRIPT_DIR}) gefunden."
  echo "Bitte klone das gesamte Repository auf den Server und führe 'bash install.sh' im Projektordner aus."
  exit 1
fi

chmod 755 "${INSTALL_DIR}/paperless_export_api.py"
chown "${DETECTED_USER}:${DETECTED_USER}" "${INSTALL_DIR}" "${INSTALL_DIR}/paperless_export_api.py" 2>/dev/null || true

echo "==> 3/5 Richte Konfiguration (${ENV_FILE}) ein..."
GENERATED_NEW_KEY=false

if [ -f "${ENV_FILE}" ] && [ "${RECONFIGURE}" = false ]; then
  echo "    Bestehende ${ENV_FILE} gefunden – Konfiguration & API-Key bleiben erhalten."
  echo "    (Nutze 'bash install.sh --reconfigure', falls du Werte neu abfragen möchtest.)"
else
  DEFAULT_HOST="${EXPORT_API_HOST:-0.0.0.0}"
  DEFAULT_PORT="${EXPORT_API_PORT:-8095}"
  DEFAULT_DIRS="${ALLOWED_EXPORT_DIRS:-/opt/paperless/export}"

  if [ "${AUTO_YES}" = false ] && [ -t 0 ]; then
    read -r -p "    API-Port [${DEFAULT_PORT}]: " INPUT_PORT
    PORT_VAL="${INPUT_PORT:-$DEFAULT_PORT}"

    read -r -p "    Bind-Adresse (0.0.0.0 für LAN/n8n, 127.0.0.1 nur lokal) [${DEFAULT_HOST}]: " INPUT_HOST
    HOST_VAL="${INPUT_HOST:-$DEFAULT_HOST}"

    read -r -p "    Erlaubte Export-Zielpfade, kommagetrennt [${DEFAULT_DIRS}]: " INPUT_DIRS
    DIRS_VAL="${INPUT_DIRS:-$DEFAULT_DIRS}"
  else
    PORT_VAL="${DEFAULT_PORT}"
    HOST_VAL="${DEFAULT_HOST}"
    DIRS_VAL="${DEFAULT_DIRS}"
  fi

  if [ -n "${EXPORT_API_KEY:-}" ]; then
    KEY_VAL="${EXPORT_API_KEY}"
  else
    KEY_VAL="$(python3 -c "import secrets; print('plx_' + secrets.token_hex(24))")"
    GENERATED_NEW_KEY=true
  fi

  cat << EOF > "${ENV_FILE}"
# Konfiguration für Paperless-NGX Exporter API Addon
# Dateiberechtigung: chmod 600 (nur durch root lesbar, Übergabe via systemd)

EXPORT_API_HOST=${HOST_VAL}
EXPORT_API_PORT=${PORT_VAL}
EXPORT_API_KEY=${KEY_VAL}

# Kommagetrennte Whitelist erlaubter Zielverzeichnisse für mode="local"
ALLOWED_EXPORT_DIRS=${DIRS_VAL}

# Paperless-NGX Pfade (community-scripts Standard)
PAPERLESS_SRC_DIR=${PAPERLESS_SRC_DIR}
PAPERLESS_CONFIGURATION_PATH=${PAPERLESS_CONF_PATH}

# Aufbewahrungsdauer für abgeschlossene Async-Jobs & temporäre ZIPs (Sekunden)
CLEANUP_TTL_SECONDS=3600

# Maximale Laufzeit eines einzelnen document_exporter-Prozesses (Sekunden)
COMMAND_TIMEOUT_SECONDS=1800
EOF

  chmod 600 "${ENV_FILE}"
fi

# Lese aktive Werte aus ENV_FILE für Ordneranlage und Abschlusstest
ACTIVE_PORT="$(grep -E '^EXPORT_API_PORT=' "${ENV_FILE}" | cut -d= -f2- | tr -d ' "'"'" || echo "8095")"
ACTIVE_DIRS="$(grep -E '^ALLOWED_EXPORT_DIRS=' "${ENV_FILE}" | cut -d= -f2- | tr -d '"'"'" || echo "/opt/paperless/export")"
ACTIVE_KEY="$(grep -E '^EXPORT_API_KEY=' "${ENV_FILE}" | cut -d= -f2- | tr -d ' "'"'" || true)"

echo "==> 4/5 Prüfe und erstelle freigegebene Export-Verzeichnisse..."
IFS=',' read -r -a DIR_ARRAY <<< "${ACTIVE_DIRS}"
for raw_dir in "${DIR_ARRAY[@]}"; do
  dir_trimmed="$(echo "${raw_dir}" | xargs)"
  if [ -n "${dir_trimmed}" ] && [[ "${dir_trimmed}" == /* ]]; then
    if [ ! -d "${dir_trimmed}" ]; then
      mkdir -p "${dir_trimmed}"
      chown "${DETECTED_USER}:${DETECTED_USER}" "${dir_trimmed}" 2>/dev/null || true
      echo "    Angelegt:  ${dir_trimmed}"
    else
      echo "    Vorhanden: ${dir_trimmed}"
    fi
  fi
done

echo "==> 5/5 Richte systemd-Service ein und starte API..."
cat << EOF > "${SERVICE_FILE}"
[Unit]
Description=Paperless-NGX Document Exporter REST API Addon
After=network.target paperless-webserver.service
Wants=network.target

[Service]
Type=simple
User=${DETECTED_USER}
WorkingDirectory=${PAPERLESS_SRC_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/python3 ${INSTALL_DIR}/paperless_export_api.py
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now paperless-export-api.service
systemctl restart paperless-export-api.service

sleep 1
SERVER_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
SERVER_IP="${SERVER_IP:-<DEINE-SERVER-IP>}"

if command -v curl >/dev/null 2>&1 && curl -fsS "http://127.0.0.1:${ACTIVE_PORT}/health" >/dev/null; then
  echo ""
  echo "=============================================================================="
  echo " Paperless-NGX Exporter API erfolgreich installiert und aktiv!"
  echo "=============================================================================="
  echo " Health-Check:  http://${SERVER_IP}:${ACTIVE_PORT}/health"
  echo " Export-URL:    http://${SERVER_IP}:${ACTIVE_PORT}/export"
  echo " Konfiguration: ${ENV_FILE}"
  if [ "${GENERATED_NEW_KEY}" = true ]; then
    echo " Neuer API-Key: ${ACTIVE_KEY}"
    echo " (Bitte sicher in deinem Passwortmanager / n8n-Credential speichern!)"
  else
    echo " API-Key:       Unverändert aus ${ENV_FILE} übernommen"
  fi
  echo ""
  echo " Schnelltest (z. B. von deinem n8n-Host aus):"
  echo " curl -fsS -X POST \"http://${SERVER_IP}:${ACTIVE_PORT}/export\" \\"
  echo "   -H \"Authorization: Bearer ${ACTIVE_KEY}\" \\"
  echo "   -H \"Content-Type: application/json\" \\"
  echo "   -d '{\"mode\": \"local\"}'"
  echo "=============================================================================="
else
  echo ""
  echo "WARNUNG: Der Dienst wurde eingerichtet, antwortet lokal aber noch nicht auf Port ${ACTIVE_PORT}."
  echo "Prüfe die Logs mit: journalctl -u paperless-export-api -n 50 --no-pager"
  exit 1
fi
