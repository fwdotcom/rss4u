# rss4u v2-dev branch

## Übersicht

rss4u ist ein moderner, serverloser RSS-/Atom-Feed Reader als Progressive Web App (PWA). Ziel ist es, eine einfache, schnelle und sichere Feed-Verwaltung ohne Backend bereitzustellen.


## Architektur


rss4u V2 ist ein kompletter Rewrite eines RSS-/Atom-Feed Readers mit folgenden Merkmalen:

- Serverlose PWA-App, rein auf HTML, JS und CSS basierend
- Anzeige von Feeds durch Eingabe einer Adresse
- Abspeichern des Feeds als Favorit
- Laden/Speichern der Favoriten als JSON, später OPML
- Gelesen-Markierungen
- Cachen der Feeds für offline-Zustände
- Responsive Design für mobile und Desktop
- Unterstützung von mehreren Feed-Typen (RSS, Atom)
- Import/Export von Favoriten (JSON, OPML geplant)
- Dark Mode
- Automatische Aktualisierung der Feeds
- Lokale Speicherung von Einstellungen


Für CORS-Probleme wird eine Browser-Extension bereitgestellt, die dies umgeht. Sie stellt ausschließlich die aktuellen Feeds bereit. Sämtliche Verarbeitung und Caching erfolgt in der PWA.

### Technologie

- HTML5, CSS3, JavaScript (ES6+)
- Service Worker für Offline-Funktionalität und Caching
- IndexedDB für lokale Datenhaltung
- Manifest für PWA-Installierbarkeit
- Browser-Extension (als Hilfsmittel für CORS, wird in separatem Repro entwickelt)

### Sicherheit

- Keine Speicherung persönlicher Daten auf Servern
- Alle Daten verbleiben im Browser
- Feed-URLs werden nicht an Dritte weitergegeben

### Zukunftspläne

- OPML-Import/Export
- Erweiterte Filter- und Suchfunktionen
- Benachrichtigungen bei neuen Artikeln
- Synchronisation zwischen Geräten (optional, ohne Server)
- Erweiterte Feed-Analyse (z.B. Statistiken)

### Ablauf

1. Eingabe der Feed-URL in der Adresszeile oder Auswahl eines Favoriten
2. Abrufversuch der PWA
	- Offline -> aus dem Cache
	- Online -> normaler Fetch
	    - CORS-Fehler -> Delegation des Abrufs an die Browser-Extension
	- sonstiger Fehler -> Fehlermeldung
3. Anzeige
	- Caching des Feeds, Abrufweg (fetch, Extension) und Gelesen-Markierung speichern
	- Favoritenverwaltung
	- Feed-Artikel als gelesen markieren
4. Aktualisierung
    - zeitgesteuerte Aktualisierung
