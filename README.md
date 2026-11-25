# My Monday

Gestione task interna ispirata a monday.com: board raggruppabile per progetto, sprint, stato o campo
personalizzato; kanban dello sprint attivo; calendario giornaliero/settimanale a slot da 30 minuti (8–19);
stati, priorità e campi personalizzati configurabili; allegati e aggiornamenti in thread; documenti Markdown
in cartelle; import da monday.com.

**Stack:** Spring Boot 4 (Java 21) + MongoDB, frontend React/TypeScript (Vite) servito dallo stesso WAR,
autenticazione JWT.

## Avvio in locale

**Tutto in Docker** (applicazione + MongoDB):

```bash
docker compose up -d          # costruisce l'immagine dell'app e avvia app (:8080) e MongoDB (:27017)
docker compose logs -f app    # log dell'applicazione
docker compose down           # ferma tutto; i dati restano nel volume mongo-data (NON usare -v)
```

L'immagine viene ricostruita a ogni `up` (`pull_policy: build`), quindi parte sempre il codice corrente.

**App da IDE/terminale** (per il debug), con solo MongoDB in Docker:

```bash
docker compose up -d mongo    # solo MongoDB su localhost:27017
./mvnw package                # compila frontend + backend → target/my-monday-0.0.1-SNAPSHOT.war
java -jar target/my-monday-0.0.1-SNAPSHOT.war
```

Le due modalità usano entrambe la porta 8080: prima di avviare l'app da IDE ferma il container
(`docker compose stop app`).

In IntelliJ le stesse modalità sono già configurate in `.run/`:
- "MyMonday in Docker (app + MongoDB)"
- "MongoDB (solo database)"
- "MyMonday locale + MongoDB"

Servono il plugin Docker e una connessione Docker chiamata `Docker`.

Apri http://localhost:8080 e accedi con `admin` / `admin1234` (utente creato al primo avvio: cambia la
password dalla pagina Profilo).

### Sviluppo frontend con hot reload

```bash
./mvnw -Dskip.frontend=true spring-boot:run     # backend su :8080
cd src/main/frontend && npm run dev              # frontend su :5173, /api inoltrato a :8080
```

## Configurazione (variabili d'ambiente)

| Variabile | Default | Note |
|---|---|---|
| `MONGODB_URI` | `mongodb://localhost:27017/mymonday` | es. stringa di connessione MongoDB Atlas |
| `APP_JWT_SECRET` | segreto di sviluppo | **obbligatorio in produzione**, almeno 32 caratteri casuali |
| `APP_ADMIN_USERNAME` / `APP_ADMIN_PASSWORD` | `admin` / `admin1234` | usati solo se il database non ha utenti |
| `MONDAY_API_TOKEN` | vuoto | facoltativo: token usato dall'import se non lo si inserisce nella pagina |

## Import da monday.com

Menu **Import monday** (solo amministratori): si inserisce il token API personale (avatar → Developers →
My access tokens), si scelgono board e documenti e si avvia l'import, che gira in background.

- ogni board diventa un **progetto**; i gruppi con un periodo nel nome ("Ottobre 2026", "13 - 17 Ottobre 2025",
  "Luglio W4 21/07 -> 25/07"…) diventano **sprint**, gli altri (SOSPESE, Segnalazioni…) finiscono nel backlog;
  il gruppo originale resta nel campo "Gruppo monday", utilizzabile anche per raggruppare la board
- colonne: Status e Priority → etichette di stato/priorità, Persone → persone assegnate, Timeline → inizio/scadenza,
  numeri con "(h)" → ore stimate/effettive, tutte le altre (Type, Epic, Rif. Ticket, Branch name…) → campi personalizzati
- sottoelementi → sottotask (stato, persona, data, stima); aggiornamenti e risposte → commenti; file → allegati
- documenti (Knowledge Base, Note applicative…) → sezione **Documenti**, convertiti in Markdown con le cartelle
- gli utenti monday vengono creati **disattivati**: vanno abilitati e dotati di password dalla pagina Utenti
- l'import è ripetibile: gli oggetti già importati vengono aggiornati senza duplicati (i dati monday prevalgono sui
  campi importati, il contenuto dei documenti viene sovrascritto); ciò che è creato solo in MyMonday resta intatto

## Pubblicazione

Il WAR è sia eseguibile (`java -jar`) sia installabile su un Tomcat 11 esterno. In produzione servilo
dietro HTTPS (reverse proxy o piattaforma che termina TLS), dato che il token viaggia nell'header
`Authorization`.

## Modello dati (collezioni MongoDB)

- `projects`: nome, descrizione, colore, archiviato
- `sprints`: nome, obiettivo, date, stato (PLANNED / ACTIVE / CLOSED; un solo sprint attivo alla volta)
- `tasks`: titolo, descrizione, stato e priorità (id di `labels`), progetto, sprint (null = backlog), persone,
  inizio/scadenza, ore stimate/effettive, campi personalizzati, sottotask, commenti e riferimenti agli allegati
- `labels`: stati e priorità configurabili (nome, colore, ordine, flag "completato")
- `fields`: definizioni dei campi personalizzati (testo, numero, data, etichette)
- `docs`, `doc_folders`: documenti Markdown e cartelle
- `fs.files` / `fs.chunks` (GridFS): allegati e immagini dei documenti
- `timeslots`: blocchi di calendario (task, utente, inizio, fine); un task può averne più di uno
- `users`: username, nome, ruoli (USER / ADMIN), password in hash
