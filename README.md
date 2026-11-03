# Paperless-NGX Backup API

Ein schlankes, ressourcenarmes REST-API-Addon für **Paperless-NGX** auf Bare-Metal- und Proxmox-LXC-Installationen (insbesondere für Setups auf Basis der [Proxmox VE Helper-Scripts / community-scripts](https://community-scripts.org/scripts/paperless-ngx)).

Das Addon stellt den offiziellen [`document_exporter`](https://docs.paperless-ngx.com/administration/#exporter) über einen abgesicherten HTTP-Endpunkt bereit – ideal, um automatisierte Backups oder Dokumenten-Abzüge direkt aus **n8n**, Cronjobs oder anderen Automatisierungstools anzustoßen, ohne SSH-Zugänge in Workflows hinterlegen zu müssen.

---

## Schnellinstallation (1 Befehl)

Führe diesen Befehl als `root` direkt in der Konsole deines **Paperless-NGX Servers / Proxmox LXC-Containers** aus (es muss nichts manuell vorab heruntergeladen oder geklont werden):

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/moritztw/Paperless-NGX-Backup-API/main/install.sh)"
```

* **Erstinstallation:** Fragt Port (`8095`) und erlaubte Backup-Pfade (`/opt/paperless/export`) interaktiv mit Standardwerten ab, lädt `paperless_export_api.py` direkt aus diesem Repository, generiert einen sicheren API-Key, richtet den `systemd`-Dienst ein und zeigt dir am Ende deinen fertigen Testbefehl an.
* **Update / Neu konfigurieren / Deinstallieren:** Wenn du denselben Einzeiler später erneut ausführst, erkennt das Skript die bestehende Installation automatisch und bietet dir ein Auswahlmenü zum **Aktualisieren** (behält API-Key & Pfade bei), **Neu konfigurieren** oder **Deinstallieren** an.

Für eine komplett unbeaufsichtigte Installation mit Standardwerten:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/moritztw/Paperless-NGX-Backup-API/main/install.sh)" -- -y
```

---

## Haftungsausschluss & Nutzung auf eigene Verantwortung (Disclaimer)

> [!WARNING]
> **Bitte vor der Installation und Nutzung sorgfältig lesen:**
>
> 1. **Kein offizielles Projekt:** Dieses Repository ist ein unabhängiges Community-Addon und steht in keiner offiziellen Verbindung zum Paperless-NGX-Projekt oder zu Proxmox Community Scripts.
> 2. **Nutzung auf eigene Gefahr & Verantwortung:** Die Bereitstellung dieses Programms erfolgt gemäß Abschnitt 15 und 16 der [GNU General Public License v3.0 (GPLv3)](./LICENSE) **ohne jegliche Gewährleistung** (*WITHOUT ANY WARRANTY*). Die Nutzung auf eigenen Servern geschieht vollständig auf eigenes Risiko. Jegliche Haftung der Autoren oder Mitwirkenden für Datenverlust, beschädigte Archive, Fehlkonfigurationen, Systemausfälle oder Sicherheitsvorfälle ist ausgeschlossen.
> 3. **Eigenverantwortung für Netzwerksicherheit:** Das Addon spricht nativ unverschlüsseltes HTTP für den Einsatz im geschützten lokalen Heim-/Servernetzwerk (LAN/VLAN/VPN). **Gib den Port niemals ungeschützt ins öffentliche Internet frei.** Wenn ein Zugriff über Netzwerkgrenzen hinweg nötig ist, liegt eine vorgeschaltete TLS-Verschlüsselung (Reverse Proxy wie Nginx, Caddy oder Traefik) sowie eine geeignete Firewall-Absicherung allein in deiner Verantwortung.
> 4. **Vorsicht bei Zielpfaden & `--delete`:** Die Option `"delete": true` (`--delete`) löscht im angegebenen Export-Zielverzeichnis alle Dateien, die nicht zum aktuellen Paperless-Bestand gehören. Gib in `ALLOWED_EXPORT_DIRS` ausschließlich dedizierte, leere Backup-Verzeichnisse frei – niemals Ordner mit anderen wichtigen Daten!
> 5. **Backup-Verifizierung:** Ein automatisierter Export ersetzt keine Prüfung. Überprüfe regelmäßig selbst, ob deine erzeugten Backups vollständig sind und sich im Ernstfall über den offiziellen `document_importer` wiederherstellen lassen.

---

## KI-Offenlegung (AI Disclosure)

> [!NOTE]
> **Transparenzhinweis zur Entstehung dieses Projekts:**
>
> Konzeption, Quellcode (`paperless_export_api.py`), Installations- und Deinstallationsskripte (`install.sh`, `uninstall.sh`) sowie diese Dokumentation wurden **mithilfe künstlicher Intelligenz (KI-gestützte Softwareentwicklung)** erstellt.
>
> Der gesamte Python-Code wurde bewusst frei von externen Abhängigkeiten in einer einzigen, übersichtlichen Datei (~430 Zeilen reine Python-3-Standardbibliothek) gehalten. Jeder Nutzer sollte die Skripte (`install.sh` und `paperless_export_api.py`) vor der Ausführung als `root` auf produktiven Systemen eigenständig prüfen und nachvollziehen.

---

## Funktionsumfang & Architektur

- **Null externe Abhängigkeiten:** Nutzt ausschließlich die Python-3-Standardbibliothek (`http.server`, `subprocess`, `threading`, `hmac`, `pathlib`, `tempfile`). Kein `pip install`, kein eigenes `venv` nötig – übersteht Paperless-Updates wartungsfrei.
- **Minimaler Ressourcenverbrauch:** Ca. 14–18 MB RAM im Leerlauf; große ZIP-Archive werden in speicherschonenden 64-KB-Blöcken gestreamt.
- **Automatische Umgebungs-Erkennung:** Findet selbstständig `.venv`, `uv` oder System-Python unter `/opt/paperless/src` sowie den aktiven Systemnutzer (`paperless` bzw. `root`) aus `paperless-webserver.service`.
- **Zwei Export-Modi für n8n:**
  - `mode: "local"` – Exportiert in einen freigegebenen Ordner oder gemounteten Proxmox-NAS-Share und gibt eine JSON-Zusammenfassung zurück.
  - `mode: "download"` – Erstellt ein temporäres ZIP-Archiv, streamt die `.zip`-Datei direkt im HTTP-Response an n8n und löscht das temporäre Verzeichnis sofort danach.
- **Kombinierter Synchron- & Async-Modus:**
  - `async: false` *(Standard)* – Wartet bis zum Abschluss und antwortet direkt (nur ein einziger *HTTP Request*-Node in n8n nötig).
  - `async: true` – Startet einen Hintergrund-Job (`HTTP 202`) mit Status- und Download-Endpunkt, damit große Archive nicht in Reverse-Proxy- oder HTTP-Timeouts laufen.
- **Sicherheitsmechanismen:**
  - Eigener statischer Bearer API-Key mit zeitkonstantem Vergleich (`hmac.compare_digest`).
  - Kanonische Pfad-Whitelist (`Path.resolve()`), die Path-Traversal (`../`) und Symlink-Ausbrüche mit `HTTP 403` blockiert.
  - Prozess-Sperre (`HTTP 409 Conflict`), falls bereits ein Export läuft.
  - Sichere Prozessausführung strikt mit `shell=False` (keine Command-Injection möglich).

---

## Voraussetzungen

- Debian/Ubuntu-basierte Bare-Metal- oder Proxmox-LXC-Installation von **Paperless-NGX** (z. B. installiert über `community-scripts/paperless-ngx` unter `/opt/paperless`).
- Vorhandenes `python3`, `curl` und `systemd` (standardmäßig vorinstalliert).
- `root`-Zugriff auf der Konsole des Paperless-Containers für die Einrichtung.

---

## Konfiguration (`/etc/paperless-export-api.env`)

Die Konfigurationsdatei wird mit `chmod 600` angelegt. Nach manuellen Änderungen genügt ein `systemctl restart paperless-export-api`.

| Variable | Standardwert | Beschreibung |
| :--- | :--- | :--- |
| `EXPORT_API_HOST` | `0.0.0.0` | Bind-Adresse (`0.0.0.0` für LAN/n8n, `127.0.0.1` nur lokal) |
| `EXPORT_API_PORT` | `8095` | TCP-Port des Addons (Paperless selbst nutzt Port `8000`) |
| `EXPORT_API_KEY` | *(zufällig generiert)* | Geheimer Bearer-Token (mindestens 16 Zeichen erforderlich) |
| `ALLOWED_EXPORT_DIRS` | `/opt/paperless/export` | Kommagetrennte Liste erlaubter Basisordner für `mode="local"` |
| `PAPERLESS_SRC_DIR` | `/opt/paperless/src` | Pfad zum Verzeichnis mit `manage.py` |
| `PAPERLESS_CONFIGURATION_PATH` | `/opt/paperless/paperless.conf` | Pfad zur Paperless-Konfigurationsdatei |
| `CLEANUP_TTL_SECONDS` | `3600` | Aufbewahrungszeit (Sekunden) für erledigte Async-Jobs & Temp-ZIPs |
| `COMMAND_TIMEOUT_SECONDS` | `1800` | Maximale Laufzeit (Sekunden) eines Export-Vorgangs |

> **Tipp für Proxmox NAS-Mounts:** Wenn du ein NAS in deinen LXC gemountet hast (z. B. `/mnt/nas/paperless`), gib den Pfad bei der Installation an oder trage ihn kommagetrennt in `ALLOWED_EXPORT_DIRS=/opt/paperless/export,/mnt/nas/paperless` ein und stelle sicher, dass der Systemnutzer `paperless` Schreibrechte auf diesem Verzeichnis besitzt.

---

## API-Dokumentation

Alle Endpunkte (außer `GET /health`) erwarten den Header:
```http
Authorization: Bearer <DEIN_EXPORT_API_KEY>
```

### 1. `GET /health`
Prüft ohne Authentifizierung, ob der Dienst erreichbar ist, `manage.py` gefunden wurde und ob aktuell ein Export läuft.

```json
{
  "status": "ok",
  "export_running": false,
  "active_job_id": null,
  "manage_py_found": true
}
```

### 2. `POST /export`
Startet den Paperless `document_exporter`.

#### Beispiel-Body (JSON)
```json
{
  "mode": "local",
  "target_dir": "/opt/paperless/export/taeglich",
  "async": false,
  "options": {
    "compare_checksums": true,
    "compare_json": true,
    "delete": true,
    "use_filename_format": true,
    "use_folder_prefix": false,
    "no_archive": false,
    "no_thumbnail": false,
    "split_manifest": false,
    "data_only": false,
    "zip": false,
    "passphrase": ""
  }
}
```

#### Unterstützte `options`-Felder (entsprechen den offiziellen Paperless-CLI-Flags)

| JSON-Feld | Paperless CLI-Flag | Wirkung |
| :--- | :--- | :--- |
| `compare_checksums` | `--compare-checksums` | Prüfsummen statt nur Zeitstempel/Größe vergleichen |
| `compare_json` | `--compare-json` | Manifest-Dateien nur bei inhaltlichen Änderungen überschreiben |
| `delete` | `--delete` | Verwaiste Dateien im Zielordner entfernen (Spiegel-Backup) |
| `use_filename_format` | `--use-filename-format` | Konfiguriertes Paperless-Dateinamenformat verwenden |
| `use_folder_prefix` | `--use-folder-prefix` | Unterordner-Präfixe beibehalten |
| `no_archive` | `--no-archive` | Generierte OCR-Archivdateien weglassen (spart Speicherplatz) |
| `no_thumbnail` | `--no-thumbnail` | Vorschaubilder vom Export ausschließen |
| `split_manifest` | `--split-manifest` | Eigene JSON-Metadatendatei je Dokument schreiben |
| `data_only` | `--data-only` | Nur Datenbank/Metadaten ohne Mediendateien sichern |
| `zip` | `--zip` | Export als ZIP-Datei komprimieren (bei `mode: "download"` immer aktiv) |
| `passphrase` | `--passphrase <wert>` | Optionale Passphrase zum Export sensibler DB-Einstellungen |

### 3. `GET /jobs/<job_id>`
Liefert den aktuellen Status eines mit `"async": true` gestarteten Hintergrund-Jobs (`running`, `completed` oder `failed`) inklusive Laufzeit, Dateianzahl und Dateigröße.

### 4. `GET /jobs/<job_id>/download`
Lädt nach Abschluss eines asynchronen Downloads (`"mode": "download", "async": true`) die fertige `.zip`-Datei herunter und löscht das temporäre Verzeichnis auf dem Server anschließend automatisch (außer `?keep=1` wird angehängt).

---

## Einbindung in n8n (Praxisbeispiele)

### Variante A: Lokales Backup auf Server / Proxmox-NAS (1 Node)
1. **HTTP Request Node** in n8n anlegen:
   - **Method:** `POST`
   - **URL:** `http://<DEINE-LXC-IP>:8095/export`
   - **Authentication:** Header Auth (`Authorization` = `Bearer <DEIN_API_KEY>`)
   - **Send Body:** JSON
   - **JSON:**
     ```json
     {
       "mode": "local",
       "target_dir": "/opt/paperless/export",
       "options": {
         "compare_checksums": true,
         "delete": true,
         "use_filename_format": true
       }
     }
     ```
   - **Options -> Timeout:** z. B. `300000` (5 Minuten, je nach Dokumentenanzahl)

### Variante B: Direkter ZIP-Download nach n8n (z. B. für Upload zu Nextcloud / S3 / Google Drive)
1. **HTTP Request Node** wie oben, jedoch:
   - **JSON Body:**
     ```json
     {
       "mode": "download",
       "options": {
         "use_filename_format": true,
         "no_thumbnail": true
       }
     }
     ```
   - **Options -> Response -> Response Format:** `File` (Binary Property `data`)
2. Direkt im nächsten Node steht das fertige Backup als Binärdatei `data` zur Weiterleitung bereit; auf dem Paperless-LXC ist die temporäre Datei bereits wieder aufgeräumt.

### Variante C: Große Archive ohne Timeout-Risiko (Async + Polling)
1. **HTTP Request (`POST /export`)** mit `"async": true` -> liefert sofort `job_id`.
2. **Wait Node** (z. B. 5–10 Sekunden warten).
3. **HTTP Request (`GET /jobs/{{ $json.job_id }}`)** -> prüft `status`.
4. **IF Node** (`{{ $json.status }} == "running"`):
   - *True:* zurück zum **Wait Node**.
   - *False:* fertig (bei `mode: "download"` folgt noch ein abschließender `GET /jobs/{{ $json.job_id }}/download` mit Response Format `File`).

---

## Deinstallation & Logs

```bash
# Direkt per Einzeiler deinstallieren (Paperless & Backups bleiben erhalten)
bash -c "$(curl -fsSL https://raw.githubusercontent.com/moritztw/Paperless-NGX-Backup-API/main/uninstall.sh)"

# Dienststatus prüfen
systemctl status paperless-export-api

# Live-Logs ansehen
journalctl -u paperless-export-api -f
```

---

## Lizenz

Dieses Projekt ist unter der **[GNU General Public License v3.0 (GPLv3)](./LICENSE)** lizenziert.
