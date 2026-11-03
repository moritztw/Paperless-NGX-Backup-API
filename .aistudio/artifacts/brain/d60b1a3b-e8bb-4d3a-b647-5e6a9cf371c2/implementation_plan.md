# Paperless-NGX Exporter API – Addon & Konfigurator für Proxmox LXC & n8n

Ein extrem ressourcenschonendes Python-Addon (ohne externe Abhängigkeiten) für deine Proxmox-Bare-Metal/LXC-Installation (`community-scripts`), das den offiziellen `document_exporter` sicher per REST-API für **n8n** bereitstellt – begleitet von einer interaktiven Web-Workbench zum Konfigurieren, Testen und direkten Installieren auf deinem Server.

## User Review & Bestätigte Entscheidungen

> [!IMPORTANT]
> Alle vier Kernentscheidungen aus unserer Abstimmung sind fest eingeplant. Prüfe kurz die untenstehenden Standardwerte (Port & Auto-Cleanup) – du kannst diese später jederzeit auch direkt in der Oberfläche anpassen.

- **Bestätigt – Reine Python-Standardbibliothek**: Das Server-Addon nutzt ausschließlich Module aus Pythons Standardbibliothek (`http.server`, `subprocess`, `threading`, `hmac`, `pathlib`, `tempfile`). Es benötigt 0 zusätzliche `pip`-Pakete, belegt im Leerlauf nur ca. 12–18 MB RAM und erkennt automatisch die `uv`- bzw. `venv`-Umgebung in `/opt/paperless/src`.
- **Bestätigt – Lokaler Export & Direkter ZIP-Download**: Pro API-Call aus n8n entscheidest du flexibel, ob in einen lokalen Pfad/NAS-Mount exportiert wird (JSON-Ergebnis) oder ob das fertige ZIP-Archiv direkt im HTTP-Response an n8n gestreamt wird.
- **Bestätigt – Kombinierter Sync-/Async-Modus**: Schnelle Läufe warten synchron (`async: false`, nur ein einziger HTTP-Node in n8n nötig). Für große Dokumentenmengen startet `async: true` einen Hintergrund-Job und liefert eine `job_id` samt Status- und Download-Endpunkt zurück. Ein interner Lock verhindert zuverlässig doppelte Parallel-Exporte (`409 Conflict`).
- **Bestätigt – Bearer API-Key & Pfad-Whitelist**: Authentifizierung über einen eigenen API-Key (zeitkonstanter Vergleich mit `hmac.compare_digest`) sowie strikte Prüfung aller Zielpfade gegen deine Whitelist (`Path.resolve()` verhindert Path-Traversal wie `../`).
- **Empfohlener Standardwert – Port & Auto-Cleanup**: Als Standard-Port ist `8095` voreingestellt (kein Konflikt mit Paperless auf Port `8000`). Temporäre ZIP-Dateien für den Direkt-Download werden nach der Übertragung bzw. nach 60 Minuten automatisch gelöscht, damit die LXC-Disk nicht vollläuft.

---

## 1. Überblick & Kernkonzept

- **Was entsteht**:
  1. **Das Proxmox-LXC Python-Addon**: Ein übersichtlicher, gut dokumentierter Single-File-Daemon inkl. gehärteter `systemd`-Service-Datei (`User=paperless`), Konfigurationsdatei und einem 1-Befehl-Installationsskript speziell für das `community-scripts/paperless-ngx`-Layout.
  2. **Interaktive Konfigurations- & Test-Workbench (Web-App)**: Eine aufgeräumte Entwickler-Oberfläche hier in AI Studio, in der du deine Serverpfade, Whitelist-Ordner, Exporter-Flags und deinen API-Key zusammenklickst, fertige **n8n-Workflow-Vorlagen** (JSON & `curl`) generierst und die API-Logik live gegen eine integrierte Sandbox testen kannst.
- **Zielgruppe & Einsatzszenario**: Selbsthoster mit Paperless-NGX im Proxmox-LXC, die automatisierte Backups, Archiv-Abzüge oder Weiterverarbeitungen zuverlässig aus n8n triggern möchten, ohne SSH-Keys oder unsichere Shell-Wrapper in n8n pflegen zu müssen.
- **Hauptmehrwert**: Maximale Wartungsfreiheit bei Paperless-Updates, minimale Serverlast auf Proxmox und eine saubere, gegen Fehlbedienung abgesicherte Schnittstelle für n8n.

---

## 2. User Experience & Visuelles Design der Workbench

- **Zentrale Nutzer-Flows**:
  1. **Server- & Sicherheits-Setup**: Port (`8095`), Paperless-Pfad (`/opt/paperless/src`), Systemnutzer (`paperless`), API-Key (per Klick kryptografisch generierbar) und erlaubte Whitelist-Verzeichnisse (z. B. `/opt/paperless/export`, `/mnt/nas/backup`) festlegen.
  2. **API-Request & Exporter-Flag-Builder**: Gewünschten Modus (`Lokaler Pfad` vs. `ZIP-Download`, `Synchron` vs. `Async-Job`) und offizielle `document_exporter`-Optionen (`--compare-checksums`, `--delete`, `--use-filename-format`, `--no-archive`, `--data-only`, Passwortschutz etc.) per Schalter auswählen – die passenden `curl`-Befehle und kopierfertigen **n8n-Nodes / Workflow-JSONs** aktualisieren sich in Echtzeit.
  3. **Live-API-Sandbox**: Direkt in der Oberfläche Test-Requests abfeuern, um Authentifizierungsfehler (`401`), Whitelist-Blockaden (`403`), Parallel-Sperren (`409`), Async-Polling und den echten ZIP-Download vorab durchzuspielen.
  4. **Deployment auf Proxmox**: Den generierten Python-Code, die `systemd`-Unit und das Installationsskript prüfen, einzeln kopieren oder als komplettes Installationspaket herunterladen.
- **Visuelle Identität & Theme**:
  - *Ästhetische Richtung*: Präzise, ruhige Entwickler- und Infrastruktur-Konsole ohne verspielte Dekoration.
  - *Farbpalette (60-30-10 Prinzip)*: 60 % heller, kühler Arbeitsflächen-Hintergrund (`#F8FAFC`), 30 % klar abgegrenzte Strukturflächen (`#FFFFFF` mit feinen `1px`-Rahmen in `#E2E8F0` sowie dunkle Code-Inspektoren in `#0F172A`), 10 % funktionaler Akzent in Paperless-Smaragdgrün (`#15803D`) ausschließlich für primäre Aktionen und aktive Zustände.
  - *Typografie*: `Plus Jakarta Sans` für klare Überschriften und Bedienelemente kombiniert mit `JetBrains Mono` (`tabular-nums`) für Python-Code, Pfade, CLI-Parameter, Ports und Zeitstempel.
  - *Layout & Struktur*: Einzeilige Top-Bar im 3-Zonen-Aufbau (`Wordmark` — `4 Navigationspunkte` — `1 primärer Download-Button`), volle 1440px Desktop-Präsenz mit zweispaltiger Arbeitsfläche (links interaktive Parameter & Erklärungen, rechts Live-Code/n8n-Output) auf einer flachen Kartenebene ohne verschachtelte Boxen.
- **Interaktives Feedback**: Sofortige Aktualisierung aller generierten Skripte und Payloads ohne Ladeverzögerung ($\le 150\text{ms}$), direktes Kopier-Feedback an Codeblöcken sowie realistische Laufzeit-Simulation in der Sandbox für mehrsekündige Async-Exporte.

---

## 3. Wichtige Architektur-Entscheidungen & Abwägungen

- **Entscheidung 1: `ThreadingHTTPServer` + `subprocess.run(..., shell=False)` in reinem Python**
  - *Gewählter Ansatz*: Ein kompakter Multi-Threaded HTTP-Server aus Pythons `http.server`-Modul mit explizitem `threading.Lock` für Export-Prozesse und strikten Argument-Arrays für `subprocess`.
  - *Warum*: Während ein Export im Hintergrund läuft, bleibt der Server reaktionsfähig für `GET /health` und `GET /jobs/<id>` aus n8n. Durch `shell=False` und feste Flag-Mappings ist Command-Injection technisch ausgeschlossen.
  - *Verworfene Alternative*: Einzeiliger `HTTPServer` ohne Threading (würde während eines laufenden Exports alle Status-Abfragen aus n8n blockieren).
- **Entscheidung 2: Automatische Runner-Erkennung (`uv` vs. `.venv` vs. System-Python) für `community-scripts`**
  - *Gewählter Ansatz*: Das Addon prüft beim Start automatisch, ob im Proxmox-Container `uv` vorhanden ist (wie in aktuellen `community-scripts`-Installationen üblich: `uv run --no-progress manage.py document_exporter --no-progress-bar ...`) oder eine klassische Python-Umgebung vorliegt, und setzt `WorkingDirectory=/opt/paperless/src`.
  - *Warum*: Verhindert den häufigsten Fehler auf Bare-Metal-Installationen (`ModuleNotFoundError: No module named 'django'`) und unterdrückt unnötige Terminal-Fortschrittsbalken (`--no-progress-bar`) im Log.
- **Entscheidung 3: Sicheres Streaming & Auto-Cleanup bei ZIP-Downloads**
  - *Gewählter Ansatz*: Beim Modus `mode: "download"` erstellt das Addon ein isoliertes temporäres Arbeitsverzeichnis, führt `document_exporter --zip` dort aus, streamt die erzeugte `.zip`-Datei in Speicherschonenden 64-KB-Chunks an n8n und räumt das temporäre Verzeichnis danach restlos auf.
  - *Warum*: Selbst mehrerer Gigabyte große Archive belasten weder den Arbeitsspeicher des LXC-Containers noch dauerhaft die Festplatte.

---

## 4. Technische Architektur & API-Design *(Technische Referenz)*

### System- & Datenfluss-Diagramm

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 1. AI STUDIO WORKBENCH (Konfiguration, n8n-Generator & Live-Sandbox)         │
│                                                                              │
│  ┌─────────────────────────┐    ┌──────────────────────┐    ┌─────────────┐  │
│  │ Setup & Whitelist Panel │───▶│ Python & Systemd Gen │───▶│ LXC-Paket   │  │
│  └─────────────────────────┘    └──────────────────────┘    │ Download    │  │
│  ┌─────────────────────────┐    ┌──────────────────────┐    └─────────────┘  │
│  │ Exporter-Flag-Builder   │───▶│ n8n JSON & cURL Gen  │                     │
│  └─────────────────────────┘    └──────────────────────┘                     │
│  ┌─────────────────────────┐    ┌──────────────────────┐                     │
│  │ Live API Test-Konsole   │───▶│ Express Sandbox API  │ (Spiegelt LXC-API)  │
│  └─────────────────────────┘    └──────────────────────┘                     │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ 2. ZIELSYSTEM AUF PROXMOX LXC (community-scripts /opt/paperless)             │
│                                                                              │
│  ┌──────────────┐   Bearer Key + JSON   ┌─────────────────────────────────┐  │
│  │ n8n Instanz  │ ────────────────────▶ │ paperless_export_api.py (:8095) │  │
│  │ HTTP Request │ ◀──────────────────── │  ├─ Auth (hmac.compare_digest)  │  │
│  └──────────────┘   JSON Status / ZIP   │  ├─ Pfad-Whitelist (resolve)    │  │
│                                         │  ├─ Export-Lock (max 1 aktiv)   │  │
│                                         │  └─ Job-Store (Sync & Async)    │  │
│                                         └───────────────┬─────────────────┘  │
│                                                         │ subprocess (safe)  │
│                                                         ▼                    │
│                                         ┌─────────────────────────────────┐  │
│                                         │ /opt/paperless/src/manage.py    │  │
│                                         │ document_exporter --no-progress │  │
│                                         └───────────────┬─────────────────┘  │
│                                                         ▼                    │
│                                      [ Whitelist-Ordner / Temp-ZIP-Stream ]  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### API-Endpunkte des Python-Addons

- **`GET /health`**: Schneller Vitalitätscheck (gibt zurück, ob Paperless-Pfad gefunden wurde und ob aktuell ein Export-Lock aktiv ist).
- **`POST /export`**: Startet den `document_exporter`.
  - Unterstützte JSON-Felder:
    - `mode`: `"local"` (in Whitelist-Pfad schreiben) oder `"download"` (als `.zip` zurückliefern)
    - `target_dir`: Zielpfad bei `mode: "local"` (wird strikt gegen die konfigurierte Pfad-Whitelist validiert)
    - `async`: `false` (synchron warten) oder `true` (Hintergrund-Job starten, liefert `202 Accepted` + `job_id`)
    - `options`: Sauber validierte Booleans/Werte für `zip`, `delete`, `compare_checksums`, `compare_json`, `use_filename_format`, `use_folder_prefix`, `no_archive`, `no_thumbnail`, `split_manifest`, `data_only`, `passphrase`
- **`GET /jobs/<job_id>`**: Liefert Status (`running`, `completed`, `failed`), Laufzeit in Sekunden, Exit-Code, Dateigröße/Dateianzahl und bereinigte CLI-Ausgabe für n8n-Polling-Schleifen.
- **`GET /jobs/<job_id>/download`**: Streamt nach einem abgeschlossenen Async-Download-Job die erzeugte `.zip`-Datei an n8n und bereinigt optional direkt danach die temporäre Datei.

### Interaktive Komponenten & State-Mapping in der Workbench

- **Konfigurations-State**: Hält Port, Host-Bindung, API-Key, Paperless-Pfad, Service-User und die Liste der erlaubten Whitelist-Pfade (mit Hinzufügen/Entfernen und Validierung auf absolute Linux-Pfade). Jede Änderung aktualisiert sofort das Python-Skript, die `.env`-Datei, die `systemd`-Unit und das `install.sh`-Skript.
- **Request-Builder-State**: Steuert Modus (`local`/`download`), Ausführung (`sync`/`async`), Zielordner-Auswahl aus der Whitelist und alle `document_exporter`-Flags; generiert daraus live sowohl den `curl`-Aufruf als auch kopierfertige **n8n-Workflow-JSONs** (Einzel-Node für Sync sowie kompletter Polling-Ablauf mit *HTTP Request* -> *Wait* -> *IF* für Async).
- **Sandbox-Tester**: Führt echte Requests gegen den lokalen Backend-Simulator aus, zeigt HTTP-Status, Antwort-Header, Laufzeit, JSON-Payload sowie Server-Logzeilen an und bietet bei ZIP-Exports einen echten Datei-Download zum Testen.
