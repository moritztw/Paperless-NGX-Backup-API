# Paperless-NGX Document Exporter REST-API (Bare-Metal / Proxmox LXC)

Ein schlankes, ressourcenarmes REST-API-Addon für **Paperless-NGX** auf Bare-Metal- und Proxmox-LXC-Installationen (insbesondere für Setups auf Basis der [Proxmox VE Helper-Scripts / community-scripts](https://community-scripts.org/scripts/paperless-ngx)).

Das Addon stellt den offiziellen [`document_exporter`](https://docs.paperless-ngx.com/administration/#exporter) über einen abgesicherten HTTP-Endpunkt bereit – ideal, um automatisierte Backups oder Dokumenten-Abzüge direkt aus **n8n**, Cronjobs oder anderen Automatisierungstools anzustoßen, ohne SSH-Zugänge in Workflows hinterlegen zu müssen.

---

## Haftungsausschluss & Nutzung auf eigene Verantwortung (Disclaimer)

> [!WARNING]
> **Bitte vor der Installation sorgfältig lesen:**
>
> 1. **Kein offizielles Projekt:** Dieses Repository ist ein unabhängiges Community-Addon und steht in keiner offiziellen Verbindung zum Paperless-NGX-Projekt oder zu Proxmox Community Scripts.
> 2. **Nutzung auf eigene Gefahr:** Die Bereitstellung erfolgt „wie besehen“ (*AS IS*) ohne jegliche ausdrückliche oder stillschweigende Gewährleistung (siehe [LICENSE](./LICENSE)). Jegliche Haftung für Datenverlust, beschädigte Archive, Systemausfälle oder Sicherheitsvorfälle ist ausgeschlossen.
> 3. **Eigenverantwortung für Netzwerksicherheit:** Das Addon spricht nativ unverschlüsseltes HTTP für den Einsatz im geschützten lokalen Heim-/Servernetzwerk (LAN/VLAN/VPN). **Gib den Port niemals ungeschützt ins öffentliche Internet frei.** Wenn ein Zugriff über Netzwerkgrenzen hinweg nötig ist, liegt eine vorgeschaltete TLS-Verschlüsselung (Reverse Proxy wie Nginx, Caddy oder Traefik) sowie Firewall-Absicherung in deiner eigenen Verantwortung.
> 4. **Vorsicht bei Zielpfaden & `--delete`:** Die Option `"delete": true` (`--delete`) löscht im angegebenen Export-Zielverzeichnis alle Dateien, die nicht zum aktuellen Paperless-Bestand gehören. Gib in `ALLOWED_EXPORT_DIRS` ausschließlich dedizierte, leere Backup-Verzeichnisse frei – niemals Ordner mit anderen wichtigen Daten!
> 5. **Backup-Verifizierung:** Prüfe regelmäßig selbst, ob deine erzeugten Exporte vollständig sind und sich im Ernstfall über den offiziellen `document_importer` wiederherstellen lassen.

---

## KI-Offenlegung (AI Disclosure)

> [!NOTE]
> **Transparenzhinweis zur Entstehung dieses Projekts:**
>
> Konzeption, Quellcode (`paperless_export_api.py`), Installations- und Deinstallationsskripte (`install.sh`, `uninstall.sh`) sowie diese Dokumentation wurden **mithilfe künstlicher Intelligenz (KI-gestützte Softwareentwicklung)** erstellt.
>
> Der gesamte Python-Code wurde bewusst frei von externen Abhängigkeiten in einer einzigen, klar strukturierten Datei (~420 Zeilen reine Python-3-Standardbibliothek) gehalten. Du bist ausdrücklich eingeladen – und im Sinne eines verantwortungsvollen Serverbetriebs dazu angehalten –, `paperless_export_api.py` und `install.sh` vor der Ausführung als `root` auf deinem System selbst durchzulesen und zu prüfen.

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
- Vorhandenes `python3` und `systemd` (auf jedem Paperless-Server standardmäßig installiert).
- `root`-Zugriff auf der Konsole des Paperless-Containers für die Einrichtung.

---

## Installation auf dem Paperless-Server

Öffne die Shell deines Paperless-LXC-Containers in Proxmox als `root` und führe folgende Befehle aus:

```bash
# 1. Repository klonen (URL an dein GitHub-Repository anpassen)
git clone https://github.com/<DEIN-GITHUB-USER>/<DEIN-REPO-NAME>.git /opt/paperless-export-addon
cd /opt/paperless-export-addon

# 2. Installer ausführen (fragt Port & erlaubte Backup-Pfade interaktiv ab)
bash install.sh
```

Alternativ ohne Rückfragen mit allen Standardwerten (Port `8095`, Zielordner `/opt/paperless/export` und automatisch generiertem kryptografischem API-Key):

```bash
bash install.sh -y
```

Am Ende der Installation gibt das Skript deinen **neu generierten Bearer API-Key** sowie einen fertigen `curl`-Testbefehl direkt auf der Konsole aus.

### Aktualisieren & Neu konfigurieren

```bash
cd /opt/paperless-export-addon
git pull

# Aktualisiert den Python-Code, behält aber deinen API-Key & deine Pfade bei:
bash install.sh

# Optional: Port, Pfade und API-Key komplett neu anlegen:
bash install.sh --reconfigure
```

### Deinstallation

```bash
cd /opt/paperless-export-addon
bash uninstall.sh
```

*(Bestehende Export-/Backup-Verzeichnisse sowie deine Paperless-NGX-Installation werden dabei **nicht** angerührt.)*

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

> **Tipp für Proxmox NAS-Mounts:** Wenn du ein NAS in deinen LXC gemountet hast (z. B. `/mnt/nas/paperless`), trage den Pfad kommagetrennt in `ALLOWED_EXPORT_DIRS=/opt/paperless/export,/mnt/nas/paperless` ein und stelle sicher, dass der Systemnutzer `paperless` Schreibrechte auf diesem Verzeichnis besitzt.

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
2. Direkt im nächsten Node steht das fertige Backup als Binärdatei `data` zur Weiterleitung in die Cloud bereit; auf dem Paperless-LXC ist die temporäre Datei bereits wieder aufgeräumt.

### Variante C: Große Archive ohne Timeout-Risiko (Async + Polling)
1. **HTTP Request (`POST /export`)** mit `"async": true` -> liefert sofort `job_id`.
2. **Wait Node** (z. B. 5–10 Sekunden warten).
3. **HTTP Request (`GET /jobs/{{ $json.job_id }}`)** -> prüft `status`.
4. **IF Node** (`{{ $json.status }} == "running"`):
   - *True:* zurück zum **Wait Node**.
   - *False:* fertig (bei `mode: "download"` folgt noch ein abschließender `GET /jobs/{{ $json.job_id }}/download` mit Response Format `File`).

---

## Logs & Fehlerbehebung

```bash
# Dienststatus prüfen
systemctl status paperless-export-api

# Live-Logs ansehen
journalctl -u paperless-export-api -f
```

Typische HTTP-Statuscodes der API:
- `200 OK` – Synchroner Export erfolgreich abgeschlossen (JSON oder ZIP-Stream).
- `202 Accepted` – Async-Hintergrundjob gestartet (`job_id` im JSON).
- `401 Unauthorized` – Fehlender oder falscher Bearer API-Key.
- `403 Forbidden` – Angegebener `target_dir` liegt außerhalb von `ALLOWED_EXPORT_DIRS`.
- `409 Conflict` – Es läuft bereits ein anderer Export-Vorgang.

---

## Lizenz

Veröffentlicht unter der [MIT-Lizenz](./LICENSE). Nutzung auf eigene Verantwortung.
