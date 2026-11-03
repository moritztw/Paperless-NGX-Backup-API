#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 moritztw and contributors
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License version 3 as
# published by the Free Software Foundation.
# ==============================================================================
# Paperless-NGX Backup API – Direkt-Installer / Updater / Deinstaller
# Repository: https://github.com/moritztw/Paperless-NGX-Backup-API
#
# Einzeiler-Installation direkt auf dem Paperless-NGX Server / Proxmox LXC:
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/moritztw/Paperless-NGX-Backup-API/main/install.sh)"
# ==============================================================================
set -euo pipefail

REPO_RAW_URL="${REPO_RAW_URL:-https://raw.githubusercontent.com/moritztw/Paperless-NGX-Backup-API/main}"
PAPERLESS_SRC_DIR="${PAPERLESS_SRC_DIR:-/opt/paperless/src}"
PAPERLESS_CONF_PATH="${PAPERLESS_CONF_PATH:-/opt/paperless/paperless.conf}"
INSTALL_DIR="/opt/paperless/export_api"
ENV_FILE="/etc/paperless-export-api.env"
SERVICE_FILE="/etc/systemd/system/paperless-export-api.service"

AUTO_YES=false
RECONFIGURE=false
UNINSTALL_MODE=false

for arg in "$@"; do
  case "$arg" in
    -y|--yes)
      AUTO_YES=true
      ;;
    --reconfigure)
      RECONFIGURE=true
      ;;
    --uninstall)
      UNINSTALL_MODE=true
      ;;
    -h|--help)
      echo "Verwendung:"
      echo "  bash -c \"\$(curl -fsSL ${REPO_RAW_URL}/install.sh)\""
      echo "  Optionen: [-y|--yes] [--reconfigure] [--uninstall]"
      exit 0
      ;;
    *)
      echo "Unbekannte Option: $arg"
      exit 1
      ;;
  esac
done

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo "FEHLER: Bitte führe diesen Befehl als root auf deinem Paperless-Server / LXC aus."
  exit 1
fi

# Hilfsfunktion für interaktive Eingaben (funktioniert bei bash -c "$(curl ...)" und curl | bash)
prompt_input() {
  local prompt_text="$1"
  local default_val="$2"
  local input_val=""

  if [ "${AUTO_YES}" = true ]; then
    printf '%s' "${default_val}"
    return
  fi

  if [ -t 0 ]; then
    read -r -p "${prompt_text} [${default_val}]: " input_val
  elif [ -t 1 ] && (: </dev/tty) 2>/dev/null; then
    read -r -p "${prompt_text} [${default_val}]: " input_val </dev/tty
  else
    printf '%s' "${default_val}"
    return
  fi

  printf '%s' "${input_val:-$default_val}"
}

run_uninstall() {
  echo "==> Stoppe und deaktiviere paperless-export-api.service..."
  systemctl disable --now paperless-export-api.service 2>/dev/null || true
  rm -f "${SERVICE_FILE}"
  systemctl daemon-reload

  echo "==> Entferne Addon-Dateien und Konfiguration..."
  rm -rf "${INSTALL_DIR}"
  rm -f "${ENV_FILE}"

  echo "==> Deinstallation abgeschlossen."
  echo "    Deine Paperless-Installation und bestehenden Backup-Ordner wurden nicht verändert."
  exit 0
}

if [ "${UNINSTALL_MODE}" = true ]; then
  run_uninstall
fi

echo "=============================================================================="
echo " Paperless-NGX Backup API – Setup (Bare-Metal / Proxmox LXC)"
echo "=============================================================================="

# Falls bereits installiert und interaktiv aufgerufen: Auswahlmenü anbieten
if [ -f "${ENV_FILE}" ] && [ "${RECONFIGURE}" = false ] && [ "${AUTO_YES}" = false ]; then
  if [ -t 0 ] || { [ -t 1 ] && (: </dev/tty) 2>/dev/null; }; then
    echo "Bestehende Installation gefunden (${ENV_FILE})."
    echo "  [1] Aktualisieren (neuesten Code laden, API-Key & Pfade behalten)"
    echo "  [2] Neu konfigurieren (Port, Pfade & API-Key neu festlegen)"
    echo "  [3] Deinstallieren (Addon entfernen, Backups behalten)"
    echo "  [4] Abbrechen"
    ACTION_CHOICE="$(prompt_input "Auswahl" "1")"
    case "${ACTION_CHOICE}" in
      1) RECONFIGURE=false ;;
      2) RECONFIGURE=true ;;
      3) run_uninstall ;;
      4) echo "Abgebrochen."; exit 0 ;;
      *) echo "Ungültige Auswahl."; exit 1 ;;
    esac
    echo ""
  fi
fi

echo "==> 1/5 Prüfe Paperless-NGX Umgebung..."
if [ ! -f "${PAPERLESS_SRC_DIR}/manage.py" ]; then
  echo "FEHLER: ${PAPERLESS_SRC_DIR}/manage.py wurde nicht gefunden."
  echo "Falls Paperless in einem anderen Pfad installiert ist, setze PAPERLESS_SRC_DIR:"
  echo "  PAPERLESS_SRC_DIR=/dein/pfad/src bash -c \"\$(curl -fsSL ${REPO_RAW_URL}/install.sh)\""
  exit 1
fi

for cmd in python3 curl systemctl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "FEHLER: Benötigtes Systemwerkzeug '$cmd' wurde nicht gefunden."
    exit 1
  fi
done

DETECTED_USER="$(systemctl show -p User --value paperless-webserver.service 2>/dev/null || true)"
if [ -z "${DETECTED_USER}" ]; then
  if id -u paperless >/dev/null 2>&1; then
    DETECTED_USER="paperless"
  else
    DETECTED_USER="root"
  fi
fi
echo "    Paperless-Verzeichnis: ${PAPERLESS_SRC_DIR}"
echo "    Service-Benutzer:      ${DETECTED_USER}"

echo "==> 2/5 Lade und prüfe paperless_export_api.py..."
mkdir -p "${INSTALL_DIR}"
TMP_PY="$(mktemp /tmp/paperless_export_api.XXXXXX.py)"
trap 'rm -f "${TMP_PY}"' EXIT

# Nutze lokale Datei nur, wenn das Skript direkt aus einem geklonten Ordner aufgerufen wurde
LOCAL_SCRIPT_DIR=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  LOCAL_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

if [ -n "${LOCAL_SCRIPT_DIR}" ] && [ -f "${LOCAL_SCRIPT_DIR}/paperless_export_api.py" ]; then
  echo "    Verwende lokale Datei aus ${LOCAL_SCRIPT_DIR}/paperless_export_api.py"
  cp "${LOCAL_SCRIPT_DIR}/paperless_export_api.py" "${TMP_PY}"
else
  echo "    Lade aktuelle ${REPO_RAW_URL}/paperless_export_api.py herunter..."
  curl -fsSL "${REPO_RAW_URL%/}/paperless_export_api.py?cb=$(date +%s)" -o "${TMP_PY}"
fi

# Prüfe Python-Syntax vor dem Überschreiben einer bestehenden Installation
python3 -B -m py_compile "${TMP_PY}"
install -m 0755 "${TMP_PY}" "${INSTALL_DIR}/paperless_export_api.py"
chown "${DETECTED_USER}:${DETECTED_USER}" "${INSTALL_DIR}" "${INSTALL_DIR}/paperless_export_api.py" 2>/dev/null || true

echo "==> 3/5 Konfiguriere ${ENV_FILE}..."
GENERATED_NEW_KEY=false

if [ -f "${ENV_FILE}" ] && [ "${RECONFIGURE}" = false ]; then
  echo "    Bestehende Konfiguration & API-Key in ${ENV_FILE} bleiben unverändert."
  if ! grep -qE '^(TMPDIR|EXPORT_TMP_DIR)=' "${ENV_FILE}"; then
    printf '\n# Festplatten-Temp statt RAM-tmpfs (verhindert Swap-Überlauf bei großen ZIPs)\nTMPDIR=/var/tmp\n' >> "${ENV_FILE}"
    echo "    Ergänzt: TMPDIR=/var/tmp in ${ENV_FILE}"
  fi
else
  DEFAULT_PORT="${EXPORT_API_PORT:-8095}"
  DEFAULT_HOST="${EXPORT_API_HOST:-0.0.0.0}"
  DEFAULT_DIRS="${ALLOWED_EXPORT_DIRS:-/opt/paperless/export}"

  PORT_VAL="$(prompt_input "    API-Port" "${DEFAULT_PORT}")"
  HOST_VAL="$(prompt_input "    Bind-Adresse (0.0.0.0 für LAN/n8n, 127.0.0.1 nur lokal)" "${DEFAULT_HOST}")"
  DIRS_VAL="$(prompt_input "    Erlaubte Export-Zielpfade (kommagetrennt)" "${DEFAULT_DIRS}")"

  if [ -n "${EXPORT_API_KEY:-}" ]; then
    KEY_VAL="${EXPORT_API_KEY}"
  else
    KEY_VAL="$(python3 -c "import secrets; print('plx_' + secrets.token_hex(24))")"
    GENERATED_NEW_KEY=true
  fi

  cat << EOF > "${ENV_FILE}"
# Konfiguration für Paperless-NGX Backup API
# Dateiberechtigung: chmod 600 (nur durch root lesbar, Übergabe via systemd)

EXPORT_API_HOST=${HOST_VAL}
EXPORT_API_PORT=${PORT_VAL}
EXPORT_API_KEY=${KEY_VAL}

# Kommagetrennte Whitelist erlaubter Zielverzeichnisse für mode="local"
ALLOWED_EXPORT_DIRS=${DIRS_VAL}

# Temporäres Arbeitsverzeichnis auf echter Festplatte statt RAM-tmpfs (/tmp)
TMPDIR=/var/tmp

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

ACTIVE_PORT="$(grep -E '^EXPORT_API_PORT=' "${ENV_FILE}" | cut -d= -f2- | tr -d ' "'"'" || echo "8095")"
ACTIVE_DIRS="$(grep -E '^ALLOWED_EXPORT_DIRS=' "${ENV_FILE}" | cut -d= -f2- | tr -d '"'"'" || echo "/opt/paperless/export")"
ACTIVE_KEY="$(grep -E '^EXPORT_API_KEY=' "${ENV_FILE}" | cut -d= -f2- | tr -d ' "'"'" || true)"

echo "==> 4/5 Prüfe und erstelle erlaubte Export-Verzeichnisse..."
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

echo "==> 5/5 Richte systemd-Service ein und starte Dienst..."
cat << EOF > "${SERVICE_FILE}"
[Unit]
Description=Paperless-NGX Backup API (Document Exporter REST Service)
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

if curl -fsS "http://127.0.0.1:${ACTIVE_PORT}/health" >/dev/null; then
  echo ""
  echo "=============================================================================="
  echo " Paperless-NGX Backup API ist aktiv!"
  echo "=============================================================================="
  echo " Health-Check:  http://${SERVER_IP}:${ACTIVE_PORT}/health"
  echo " Export-URL:    http://${SERVER_IP}:${ACTIVE_PORT}/export"
  echo " Konfiguration: ${ENV_FILE}"
  if [ "${GENERATED_NEW_KEY}" = true ]; then
    echo " Neuer API-Key: ${ACTIVE_KEY}"
    echo " (Bitte sicher für n8n kopieren!)"
  else
    echo " API-Key:       Unverändert aus ${ENV_FILE} übernommen"
  fi
  echo ""
  echo " Schnelltest (z. B. von deinem n8n-Server aus):"
  echo " curl -fsS -X POST \"http://${SERVER_IP}:${ACTIVE_PORT}/export\" \\"
  echo "   -H \"Authorization: Bearer ${ACTIVE_KEY}\" \\"
  echo "   -H \"Content-Type: application/json\" \\"
  echo "   -d '{\"mode\": \"local\"}'"
  echo "=============================================================================="
else
  echo ""
  echo "WARNUNG: Dienst antwortet lokal noch nicht auf Port ${ACTIVE_PORT}."
  echo "Logs prüfen mit: journalctl -u paperless-export-api -n 50 --no-pager"
  exit 1
fi
