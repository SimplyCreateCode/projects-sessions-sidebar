# Projects & Sessions (Orca-Plugin)

Ein Panel für Orca, das deine **Projekte** zeigt und darunter **jede Agent-Session**, laufend oder
vergangen: Status, Titel und Alter, die neueste zuerst. Gebaut nach dem Wunsch aus
[stablyai/orca#25461](https://github.com/stablyai/orca/discussions/25461) („Projects and sessions“-Sidebar
wie in Codex, Claude Desktop oder Zed).

- **Projekt → Sessions**, ohne Worktree als Zwischenebene. Eine Session aus einem Worktree, der nicht der
  Haupt-Checkout ist, bekommt ihren Branch als kleinen Tag.
- **Status je Session:** arbeitet · braucht Freigabe · wartet auf dich · bereit · beendet. Pro Projekt
  gibt es Badges für „n aktiv“ und „n warten“, außerdem „neu“ für ungelesene Updates und „aktuell“
  für den fokussierten Workspace.
- **Klick:** Eine laufende Session fokussiert ihr Terminal-Pane. Eine beendete Session wird im Workspace
  fortgesetzt, dem ihr Ordner gehört (`agent.resume`). Alles andere öffnet den Workspace.
- **+ am Projekt** startet den gewählten Agent (Claude, Codex, Gemini, OpenCode, …) oder ein reines
  Terminal im Haupt-Workspace des Projekts. Es wird kein neuer Worktree angelegt.
- **Suche und Filter:** freie Suche über Projektname, Pfad, Session-Titel, Agent und Branch; Filter nach
  Status (Alle / Läuft gerade / Braucht dich / Beendet) und nach Agent; Sortierung nach letzter
  Aktivität oder Name; leere und ausgeblendete Projekte lassen sich ein- und ausblenden.
- **„n weitere zeigen“** pro Projekt (5 pro Seite), Auf- und Zuklappen pro Projekt (wird gespeichert)
  und eine Gruppe „Weitere Sessions“ für alles, was Orca keinem Projekt zuordnen konnte.
- Der Status aktualisiert sich live über Orca-Events, ohne Polling.
- Ein Knopf blendet Orcas eigene linke Seitenleiste ein und aus, damit dieses Panel sie ersetzen kann.
- Deutsch und Englisch, je nach Orca-Sprache.

Das Plugin nutzt **nur die offizielle Host-API**. Es ruft kein `orca`-CLI auf, liest keine
Agent-Dateien auf der Platte und macht keine Netzwerkzugriffe.

## Voraussetzungen

- Orca **1.4.260 oder neuer** (getestet gegen die Plugin-Laufzeit von 1.4.268).
- Für vergangene Sessions: **Einstellungen → Agent Session History** muss an sein. Ohne sie zeigt das
  Panel nur laufende Agents und sagt das auch.

## Lokal installieren (zum Testen)

Das Testpaket liegt unter `~/.orca/bots/project-manager/totest/`:

- `projects-sessions-sidebar-0.1.1/` ist der fertige Plugin-Ordner.
- `projects-sessions-sidebar-0.1.1.zip` enthält dieselben Dateien **direkt im Zip-Stamm**. Beim
  Entpacken („Alle extrahieren“) entsteht ein Ordner `projects-sessions-sidebar-0.1.1/` mit
  `orca-plugin.json` direkt darin.

Bei Plugins aus einem lokalen Ordner setzt Orca den Publisher auf `local`, der Schlüssel lautet also
`local.projects-sessions-sidebar`.

### Variante A: über die Orca-Einstellungen (empfohlen)

1. Orca → **Einstellungen → Plugins** → **Turn on plugins** (falls Plugins noch aus sind).
2. **⋯ → Development folders…** → den **vollständigen Pfad des Plugin-Ordners selbst** eintragen,
   also des Ordners, in dem `orca-plugin.json` liegt, und **Add path** drücken. Beispiele:
   `/home/<du>/plugins/projects-sessions-sidebar-0.1.1`,
   `C:\Users\<du>\plugins\projects-sessions-sidebar-0.1.1`.
3. Orca listet, was das Plugin darf (siehe unten). Prüfen und **aktivieren**. Vorher läuft nichts.
4. In der **rechten Seitenleiste** auf das Symbol „Projects & Sessions“ (Ebenen-Icon) klicken.

### Variante B: über die Kommandozeile

```sh
# fester Einbau aus dem Ordner (kopiert ihn in Orcas Plugin-Verzeichnis)
orca plugin install ~/.orca/bots/project-manager/totest/projects-sessions-sidebar-0.1.1
# Orca bricht mit approval_required ab und druckt den Fingerprint; dann:
orca plugin install ~/.orca/bots/project-manager/totest/projects-sessions-sidebar-0.1.1 --approve <fingerprint>

# Panel öffnen
orca plugin open local.projects-sessions-sidebar
# Logs ansehen
orca plugin logs local.projects-sessions-sidebar
```

### Fehler „Im Stammordner des Plugins fehlt orca-plugin.json“

Orca liest beim Laden genau `<eingetragener Pfad>/orca-plugin.json`. Den Pfad verwendet es
**unverändert so, wie er eingetippt wurde**. Jeder Lesefehler wird als „fehlt“ gemeldet. Häufige
Ursachen:

- **Ein übergeordneter Ordner ist eingetragen.** Das kann ein Sammelordner für Plugins sein oder die
  äußere Hälfte eines doppelt entpackten Zips (`…-0.1.0/…-0.1.0/orca-plugin.json`, betrifft das alte
  0.1.0-Zip). Ein Development-Eintrag ist immer **ein** Plugin-Ordner, kein Ordner mit mehreren
  Plugins darin.
- **Der Pfad ist nicht absolut.** `~` wird nicht aufgelöst, Anführungszeichen (zum Beispiel von
  „Als Pfad kopieren“ unter Windows) werden nicht entfernt, relative Pfade funktionieren nicht.
- **Der Pfad liegt auf einem anderen Rechner.** Der Ordner muss auf dem Computer liegen, auf dem Orca
  Desktop läuft, nicht auf einem verbundenen Server oder SSH-Host.
- **Orca darf den Ordner nicht lesen.** Unter macOS sind Schreibtisch, Dokumente und Downloads
  geschützt, das betrifft auch Flatpak- und Snap-Sandboxen. Abhilfe: den Ordner woanders hinlegen oder
  Orca den Zugriff erlauben.

Nach dem Korrigieren den alten Eintrag unter Development folders entfernen, den richtigen hinzufügen
oder die Plugins aktualisieren.

Zum Weiterentwickeln lädt `orca plugin dev watch <ordner>` (oder `dev load`) den Ordner als
Entwicklungs-Plugin. Jede gespeicherte Änderung lädt dann neu.

Entfernen: in den Einstellungen das Plugin entfernen oder `orca plugin uninstall
local.projects-sessions-sidebar` ausführen. Einen Development-Ordner löst `orca plugin dev unload <ordner>`.

## Berechtigungen und wozu

| Profil / Capability | Wozu |
| --- | --- |
| `trusted-worker` | Projekte, Workspace-Liste, Session-Verlauf, Fokus und Resume gibt es in Orca nur für Worker, nicht für Panels. Der Worker ruft ausschließlich die Host-API auf. |
| `workspace:read` | Projekte (`project.list`), Workspaces mit Status (`workspace.list`), den fokussierten Workspace |
| `workspace:write` | per Klick einen Workspace zeigen, ein Terminal fokussieren, die linke Seitenleiste umschalten |
| `agent:read` | laufende Agents je Workspace und ihre Statuswechsel |
| `history:read` | vergangene Sessions aus Orcas Agent Session History (Titel, Agent, Branch, Zeit; nie den Inhalt) |
| `agent:launch` | `+` startet einen Agent, ein Klick setzt eine beendete Session fort |
| `terminal:send` | nur für „+ Nur Terminal“ (`terminal.create`). Das Plugin tippt nie etwas in Terminals. |

## Entwicklung

`./build.sh` prüft alles (tsc, validate, test, check) und legt das Paket nach `dist/` und `totest/`.
Einzeln:

```sh
. ~/.orca/bots/project-manager/build-tools/env.sh
OP=~/.orca/bots/project-manager/build-tools/orca-plugin-sdk-1.4.268/orca-plugin
$OP plugin types .      # Typings nach .orca/types
$OP plugin validate .   # Manifest prüfen
$OP plugin test .       # Tests (src/*.test.ts[x])
$OP plugin check .      # Panel gegen Mock-Host rendern (Szenarien in src/panel.check.ts)
```

Mehr zu Aufbau, API und Grenzen steht in `HOWTO.md` im Projektordner.

## Lizenz

MIT
