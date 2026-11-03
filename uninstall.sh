#!/usr/bin/env bash
# ==============================================================================
# Deinstallation: Paperless-NGX Exporter API Addon
# Bestehende Paperless-Daten und Export-Verzeichnisse werden NICHT gelöscht.
# ==============================================================================
set -euo pipefail

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo "FEHLER: Bitte als root ausführen (z. B. sudo bash uninstall.sh)."
  exit 1
fi

echo "==> Stoppe und deaktiviere paperless-export-api.service..."
systemctl disable --now paperless-export-api.service 2>/dev/null || true
rm -f /etc/systemd/system/paperless-export-api.service
systemctl daemon-reload

echo "==> Entferne Addon-Programmdateien und Konfiguration..."
rm -rf /opt/paperless/export_api
rm -f /etc/paperless-export-api.env

echo "==> Deinstallation abgeschlossen."
echo "    Hinweis: Deine Export-/Backup-Ordner und Paperless-NGX selbst blieben unangetastet."
