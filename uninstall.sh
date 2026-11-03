#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 moritztw and contributors
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License version 3 as
# published by the Free Software Foundation.
# ==============================================================================
# Deinstallation: Paperless-NGX Backup API
# Direkt-Aufruf:
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/moritztw/Paperless-NGX-Backup-API/main/uninstall.sh)"
# Bestehende Paperless-Daten und Export-Verzeichnisse werden NICHT gelöscht.
# ==============================================================================
set -euo pipefail

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo "FEHLER: Bitte als root ausführen."
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
