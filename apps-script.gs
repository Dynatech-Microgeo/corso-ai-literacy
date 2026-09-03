/**
 * Ponte per lanciare da Apps Script le funzioni di setup che terminano con "_"
 * (il menu "Esegui" dell'editor non le elenca altrimenti). Tienila in cima al
 * file: aggiungi qui nuove funzioni "_" da eseguire a mano quando servono.
 *
 * ATTENZIONE: rieseguire questa funzione richiama SEMPRE anche
 * impostaProprietaZoho_(), che nel codice qui sotto contiene i valori
 * segnaposto (client id/secret/refresh token) da compilare a mano. Se hai
 * già cancellato i valori reali da quella funzione dopo il primo setup (come
 * indicato), rieseguire runSetup() sovrascrive le Proprietà script con i
 * segnaposto e disattiva la sincronizzazione Zoho — è già successo. Se devi
 * solo (re)installare il trigger settimanale, seleziona ed esegui
 * direttamente installaTriggerSettimanale_() dal menu a tendina invece di
 * runSetup().
 */
function runSetup() {
  impostaProprietaZoho_();
  installaTriggerSettimanale_();
}

/**
 * BACKEND DI LOGGING — Google Apps Script
 * ----------------------------------------
 * Cosa fa: riceve un evento dalla pagina index.html (video aperto/completato,
 * questionario scaricato/completato, attestato inviato) e mantiene UNA RIGA PER
 * PERSONA sul Google Sheet collegato (fonte di verità in tempo reale): cerca
 * la riga per email, la crea se non esiste, e aggiorna SOLO la colonna
 * dell'evento arrivato (più Punteggio/Esito nel caso del questionario), senza
 * toccare le altre colonne. Una volta a settimana uno script pianificato copia
 * tutto il Google Sheet su un worksheet Zoho Sheet gemello, che funge da
 * specchio/backup aggiornato periodicamente (vedi sezione dedicata più sotto).
 *
 * STRUTTURA DEL FOGLIO (uguale su Google Sheet e su Zoho Sheet):
 *   Riga 1: titolo (libera, non usata dallo script)
 *   Riga 2: istruzioni (libera, non usata dallo script)
 *   Riga 3: intestazioni colonna, esattamente queste, in quest'ordine:
 *     Nome | Cognome | Email | Organizzazione | Video aperto | Video completato |
 *     Slide scaricate | Questionario scaricato | Questionario completato | Punteggio |
 *     Esito | Attestato inviato
 *   Riga 4 in poi: una riga per persona.
 *
 * COME INSTALLARLO (10 minuti, una volta sola):
 * 1. Crea il Google Sheet con la struttura sopra (titolo riga 1, istruzioni riga 2,
 *    intestazioni riga 3 come indicato).
 * 2. Nel foglio vai su Estensioni > Apps Script.
 * 3. Cancella il contenuto di default e incolla TUTTO questo file.
 * 4. Salva (icona dischetto), dai un nome al progetto (es. "Log Corso AI Act").
 * 5. In alto a destra clicca "Esegui" sulla funzione doPost per autorizzare
 *    l'accesso (Google chiederà conferma la prima volta — è normale, è il tuo script).
 * 6. Clicca "Distribuisci" > "Nuova implementazione".
 *    - Tipo: "App web"
 *    - Esegui come: Me
 *    - Chi ha accesso: Chiunque (serve per ricevere le chiamate dalla pagina)
 * 7. Copia l'URL che ti viene dato (finisce con /exec) e incollalo in
 *    index.html dentro CONFIG.logEndpoint.
 *
 * Ogni volta che modifichi questo script devi ripubblicare
 * ("Distribuisci" > "Gestisci implementazioni" > icona matita > "Nuova versione").
 *
 * SINCRONIZZAZIONE CON ZOHO SHEET (opzionale, si attiva da sola se configurata)
 * -------------------------------------------------------------------------------
 * Zoho NON viene più toccato ad ogni evento del portale (era così in una
 * versione precedente: riga per riga, in tempo reale — si è rivelato fragile,
 * vedi nota storica su aggiornaZohoSheet_ più sotto nel codice, lasciata a
 * scopo di riferimento). Il Google Sheet resta l'UNICA fonte aggiornata in
 * tempo reale. Una volta a settimana (di default ogni lunedì verso le 8:00,
 * vedi installaTriggerSettimanale_) copiaGoogleSheetSuZoho_() cancella tutte
 * le righe dati del worksheet Zoho "Registro Formazione" e le riscrive da
 * zero prendendole dal Google Sheet: Zoho diventa così uno specchio completo,
 * aggiornato una volta a settimana, pensato per consultazione/backup — non
 * per essere aggiornato in tempo reale come il Google Sheet.
 *
 * Le credenziali NON vanno scritte qui nel codice: si salvano una volta sola
 * nelle "Proprietà script" del progetto (posto sicuro, non finiscono nei file
 * che condividi o metti in un repository). Per farlo:
 * 1. Apri questo progetto Apps Script.
 * 2. Nella funzione impostaProprietaZoho_() qui sotto, incolla temporaneamente
 *    i tuoi valori (client id, client secret, refresh token).
 * 3. Selezionala dal menu a tendina delle funzioni ed esegui "Esegui" UNA VOLTA.
 * 4. Subito dopo CANCELLA i valori dal codice (restano comunque salvati nelle
 *    Proprietà script — non serve più averli in chiaro qui).
 * 5. Esegui testZohoSetup() e controlla i log per verificare che la
 *    connessione funzioni.
 * 6. Esegui copiaGoogleSheetSuZoho_() a mano UNA VOLTA per il primo mirror
 *    completo, e controlla il worksheet Zoho per assicurarti che il
 *    risultato sia corretto PRIMA di fidarti del trigger automatico.
 * 7. Esegui installaTriggerSettimanale_() UNA VOLTA per attivare la copia
 *    automatica ogni lunedì mattina (oppure runSetup(), che la richiama
 *    insieme a impostaProprietaZoho_() — leggi però l'avviso sopra runSetup()
 *    su cosa comporta rieseguirla).
 * 8. Il worksheet Zoho deve avere le stesse identiche intestazioni di colonna
 *    del Google Sheet, nella stessa riga indicata da HEADER_ROW (riga 3),
 *    carattere per carattere. zohoApiCall_() passa sempre header_row=HEADER_ROW
 *    a ogni chiamata: se la riga delle intestazioni cambia di nuovo, va aggiornata
 *    SOLO la costante HEADER_ROW, non ogni singola chiamata.
 *
 * Nota: i parametri esatti dell'API Zoho Sheet (nomi di "criteria"/"json_data",
 * struttura della risposta di records.fetch, comportamento di records.delete
 * e di records.add con più righe in una sola chiamata) sono presi dalla
 * documentazione ufficiale Zoho, ma Zoho non fornisce un sandbox pubblico per
 * un test a freddo: verifica sempre a mano (punto 6 sopra) prima di fidarti
 * del trigger automatico.
 *
 * NOTA SUL FRONT-END ATTUALE: index.html invia nome, cognome, email,
 * organizzazione e gli eventi "video_aperto", "video_completato",
 * "slide_scaricate", "questionario_scaricato", "questionario_completato".
 * L'evento "attestato_inviato" non viene mai inviato dal portale: la colonna
 * "Attestato inviato" viene invece scritta automaticamente da doPost quando
 * arriva un "questionario_completato" con Esito = "SUPERATO", che genera e
 * invia via email il PDF dell'attestato, restituendone anche l'URL di
 * download (vedi generaAttestato_ più sotto).
 */

// ---- Struttura del foglio (uguale su Google Sheet e Zoho Sheet) ----
const HEADER_ROW = 3;
const DATA_START_ROW = HEADER_ROW + 1;

const COLONNE_IDENTITA = ["Nome", "Cognome", "Email", "Organizzazione"];

// evento ricevuto dal portale -> colonna che riceve il timestamp
const EVENTO_COLONNA_TIMESTAMP = {
  video_aperto: "Video aperto",
  video_completato: "Video completato",
  slide_scaricate: "Slide scaricate",
  questionario_scaricato: "Questionario scaricato",
  questionario_completato: "Questionario completato",
  attestato_inviato: "Attestato inviato"
};

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (!data.email) {
      throw new Error("email mancante nel payload");
    }

    const timestamp = data.timestamp || new Date().toISOString();

    const identita = {
      Nome: data.nome || "",
      Cognome: data.cognome || "",
      Email: data.email,
      Organizzazione: data.organizzazione || ""
    };

    const aggiornamenti = buildAggiornamentiEvento_(data, timestamp);

    aggiornaGoogleSheet_(identita, aggiornamenti);

    // Zoho non viene più toccato qui: il Google Sheet è l'unica fonte
    // aggiornata in tempo reale. La copia su Zoho avviene una volta a
    // settimana tramite copiaGoogleSheetSuZoho_() (vedi trigger installato
    // da installaTriggerSettimanale_()).

    let attestatoUrl;
    if (data.evento === "questionario_completato" && aggiornamenti["Esito"] === "SUPERATO") {
      const punteggioTesto = data.totale !== undefined
        ? data.punteggio + "/" + data.totale
        : String(data.punteggio);

      attestatoUrl = generaAttestato_({
        Nome: identita.Nome,
        Cognome: identita.Cognome,
        Email: identita.Email,
        Organizzazione: identita.Organizzazione,
        Punteggio: punteggioTesto,
        Esito: aggiornamenti["Esito"]
      });
    }

    const risposta = attestatoUrl
      ? { status: "ok", attestatoUrl: attestatoUrl }
      : { status: "ok" };

    return ContentService
      .createTextOutput(JSON.stringify(risposta))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Traduce l'evento ricevuto nell'insieme di colonne da scrivere (solo quelle:
 * le altre colonne della riga non vengono toccate).
 */
function buildAggiornamentiEvento_(data, timestamp) {
  const colonnaTimestamp = EVENTO_COLONNA_TIMESTAMP[data.evento];
  if (!colonnaTimestamp) {
    throw new Error("Evento non riconosciuto: " + data.evento);
  }

  const aggiornamenti = {};
  aggiornamenti[colonnaTimestamp] = timestamp;

  if (data.evento === "questionario_completato") {
    if (data.punteggio !== undefined) aggiornamenti["Punteggio"] = data.punteggio;
    if (data.esito !== undefined) aggiornamenti["Esito"] = data.esito;
  }

  return aggiornamenti;
}

/* ============================================================
 * GOOGLE SHEET — ricerca per email + aggiornamento colonne mirate
 * ============================================================ */

function aggiornaGoogleSheet_(identita, aggiornamenti) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const headerMap = getHeaderMap_(sheet);

  const rigaEsistente = trovaRigaPerEmail_(sheet, headerMap, identita.Email);

  if (rigaEsistente) {
    scriviValoriRiga_(sheet, headerMap, rigaEsistente, aggiornamenti);
  } else {
    const nuovaRiga = Math.max(sheet.getLastRow() + 1, DATA_START_ROW);
    scriviValoriRiga_(sheet, headerMap, nuovaRiga, Object.assign({}, identita, aggiornamenti));
  }
}

/** Legge la riga 3 e restituisce una mappa { "Nome colonna": indiceColonna1based }. */
function getHeaderMap_(sheet) {
  const headers = sheet.getRange(HEADER_ROW, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach(function (h, i) {
    const nome = String(h).trim();
    if (nome) map[nome] = i + 1;
  });
  return map;
}

/** Cerca l'email (case-insensitive) nella colonna "Email", dalla riga dati in poi. */
function trovaRigaPerEmail_(sheet, headerMap, email) {
  const emailCol = headerMap["Email"];
  if (!emailCol) {
    throw new Error('Colonna "Email" non trovata in riga ' + HEADER_ROW);
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) return null;

  const values = sheet
    .getRange(DATA_START_ROW, emailCol, lastRow - DATA_START_ROW + 1, 1)
    .getValues();

  const target = String(email).trim().toLowerCase();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim().toLowerCase() === target) {
      return DATA_START_ROW + i;
    }
  }
  return null;
}

/** Scrive solo le colonne presenti in `valori` sulla riga indicata. */
function scriviValoriRiga_(sheet, headerMap, rigaIndex, valori) {
  Object.keys(valori).forEach(function (colName) {
    const col = headerMap[colName];
    if (!col) {
      throw new Error('Colonna "' + colName + '" non trovata in riga ' + HEADER_ROW);
    }
    sheet.getRange(rigaIndex, col).setValue(valori[colName]);
  });
}

/* ============================================================
 * ATTESTATO PDF — generazione da template Google Slides + invio email
 * ------------------------------------------------------------
 * Template Google Slides con segnaposto testuali {{NOME}}, {{COGNOME}},
 * {{EMAIL}}, {{ESITO}}, {{PUNTEGGIO}}, {{DATA_CORSO}}, {{DATA_FIRMA}},
 * {{ORA_FIRMA}}, {{ID_ATTESTATO}} (nome organizzazione fisso nel template,
 * non è un segnaposto). Gli ID dei due template vanno salvati a mano nelle
 * Proprietà script del progetto (Impostazioni progetto > Proprietà script):
 *   DYNATECH_SLIDES_TEMPLATE_ID
 *   MICROGEO_SLIDES_TEMPLATE_ID
 * ============================================================ */

/** ID del template Slides da usare per l'organizzazione indicata. */
function attestatoTemplateId_(organizzazione) {
  const org = String(organizzazione || "").trim().toLowerCase();
  const props = PropertiesService.getScriptProperties();
  if (org === "dynatech") return props.getProperty("DYNATECH_SLIDES_TEMPLATE_ID");
  if (org === "microgeo") return props.getProperty("MICROGEO_SLIDES_TEMPLATE_ID");
  throw new Error("Organizzazione non riconosciuta per il template attestato: " + organizzazione);
}

/** Prefisso dell'ID attestato in base all'organizzazione. */
function attestatoPrefissoId_(organizzazione) {
  const org = String(organizzazione || "").trim().toLowerCase();
  if (org === "dynatech") return "DYN";
  if (org === "microgeo") return "MGO";
  throw new Error("Organizzazione non riconosciuta per il prefisso attestato: " + organizzazione);
}

/**
 * Trova (o crea) la cartella "Attestati Generati" nella stessa cartella
 * padre del file template passato.
 */
function cartellaAttestatiGenerati_(templateFile) {
  const parents = templateFile.getParents();
  const cartellaPadre = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();

  const esistenti = cartellaPadre.getFoldersByName("Attestati Generati");
  if (esistenti.hasNext()) return esistenti.next();
  return cartellaPadre.createFolder("Attestati Generati");
}

function attestatoFormattaData_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "dd/MM/yyyy");
}

function attestatoFormattaOra_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "HH:mm");
}

/** Genera un ID attestato tipo "DYN-20260903-143502". */
function generaIdAttestato_(organizzazione, date) {
  const prefisso = attestatoPrefissoId_(organizzazione);
  const timestamp = Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyyMMdd-HHmmss");
  return prefisso + "-" + timestamp;
}

/**
 * Genera il PDF dell'attestato per `identita` a partire dal template Google
 * Slides dell'organizzazione, con doppio canale di consegna: lo invia via
 * email al destinatario (allegato) E lo rende scaricabile tramite link
 * condiviso, il cui URL viene restituito dalla funzione (usato da doPost per
 * il pulsante di download sul portale). Salva il PDF nella cartella
 * "Attestati Generati" e aggiorna la colonna "Attestato inviato" sul Google
 * Sheet.
 *
 * identita: { Nome, Cognome, Email, Organizzazione, Punteggio, Esito }
 * (Punteggio già formattato come testo, es. "16/18").
 *
 * @return {string} URL di download del PDF (accesso: chiunque abbia il link, sola lettura).
 */
function generaAttestato_(identita) {
  const templateId = attestatoTemplateId_(identita.Organizzazione);
  if (!templateId) {
    throw new Error(
      "Template Slides mancante per l'organizzazione '" + identita.Organizzazione +
      "': imposta la Script Property corrispondente (DYNATECH_SLIDES_TEMPLATE_ID / MICROGEO_SLIDES_TEMPLATE_ID)."
    );
  }

  const templateFile = DriveApp.getFileById(templateId);
  const cartella = cartellaAttestatiGenerati_(templateFile);

  const ora = new Date();
  const dataCorso = attestatoFormattaData_(ora);
  const dataFirma = dataCorso;
  const oraFirma = attestatoFormattaOra_(ora);
  const idAttestato = generaIdAttestato_(identita.Organizzazione, ora);
  const punteggioTesto = String(identita.Punteggio || "");

  const nomeFile = "Attestato - " + identita.Nome + " " + identita.Cognome + " - " + idAttestato;

  const copiaFile = templateFile.makeCopy(nomeFile, cartella);
  const presentazione = SlidesApp.openById(copiaFile.getId());

  const sostituzioni = {
    "{{NOME}}": identita.Nome || "",
    "{{COGNOME}}": identita.Cognome || "",
    "{{EMAIL}}": identita.Email || "",
    "{{ESITO}}": identita.Esito || "",
    "{{PUNTEGGIO}}": punteggioTesto,
    "{{DATA_CORSO}}": dataCorso,
    "{{DATA_FIRMA}}": dataFirma,
    "{{ORA_FIRMA}}": oraFirma,
    "{{ID_ATTESTATO}}": idAttestato
  };

  presentazione.getSlides().forEach(function (slide) {
    Object.keys(sostituzioni).forEach(function (segnaposto) {
      slide.replaceAllText(segnaposto, sostituzioni[segnaposto]);
    });
  });
  presentazione.saveAndClose();

  // Metodo più semplice e affidabile in Apps Script per esportare un Google
  // Slides come PDF: File#getAs(MimeType.PDF) sul file Drive della copia.
  const pdfBlob = copiaFile.getAs(MimeType.PDF).setName(nomeFile + ".pdf");
  const pdfFile = cartella.createFile(pdfBlob);

  // La copia Google Slides intermedia non serve più: basta il PDF salvato.
  copiaFile.setTrashed(true);

  // Canale 2: link condiviso in sola lettura, per il pulsante di download sul portale.
  pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const pdfUrl = pdfFile.getUrl();

  // Canale 1: email di cortesia con il PDF allegato.
  MailApp.sendEmail({
    to: identita.Email,
    subject: "Il tuo attestato di formazione AI Literacy",
    body:
      "Gentile " + identita.Nome + " " + identita.Cognome + ",\n\n" +
      "in allegato trovi l'attestato di completamento del corso di formazione AI Literacy (EU AI Act), " +
      "con punteggio " + punteggioTesto + ".\n\n" +
      "L'attestato resta comunque scaricabile in qualsiasi momento dal portale del corso.\n\n" +
      "Cordiali saluti.",
    attachments: [pdfBlob]
  });

  aggiornaGoogleSheet_(
    {
      Nome: identita.Nome,
      Cognome: identita.Cognome,
      Email: identita.Email,
      Organizzazione: identita.Organizzazione
    },
    { "Attestato inviato": ora.toISOString() }
  );

  return pdfUrl;
}

/* ============================================================
 * ZOHO SHEET SYNC — copia completa settimanale (specchio del Google Sheet)
 * ============================================================ */

/**
 * ESEGUI UNA VOLTA SOLA a mano dall'editor Apps Script, poi cancella i valori
 * incollati qui sotto (restano salvati nelle Proprietà script del progetto).
 */
function impostaProprietaZoho_() {
  PropertiesService.getScriptProperties().setProperties({
    ZOHO_CLIENT_ID: "INSERISCI_QUI_IL_CLIENT_ID",
    ZOHO_CLIENT_SECRET: "INSERISCI_QUI_IL_CLIENT_SECRET",
    ZOHO_REFRESH_TOKEN: "INSERISCI_QUI_IL_REFRESH_TOKEN",
    ZOHO_RESOURCE_ID: "q14ou45468cb2d30c4e56b5ba67b89aa8a515",
    ZOHO_WORKSHEET_NAME: "Registro Formazione"
  });
}

function zohoConfig_() {
  const p = PropertiesService.getScriptProperties();
  const cfg = {
    clientId: p.getProperty("ZOHO_CLIENT_ID"),
    clientSecret: p.getProperty("ZOHO_CLIENT_SECRET"),
    refreshToken: p.getProperty("ZOHO_REFRESH_TOKEN"),
    resourceId: p.getProperty("ZOHO_RESOURCE_ID"),
    worksheetName: p.getProperty("ZOHO_WORKSHEET_NAME") || "Registro Formazione",
    // datacenter EU, come nel test OAuth già completato
    accountsBase: "https://accounts.zoho.eu",
    apiBase: "https://sheet.zoho.eu/api/v2"
  };
  if (!cfg.clientId || !cfg.clientSecret || !cfg.refreshToken || !cfg.resourceId) {
    throw new Error(
      "Proprietà Zoho mancanti: esegui impostaProprietaZoho_() con i tuoi valori prima di usare la sincronizzazione."
    );
  }
  return cfg;
}

/** Ottiene un access token valido, riusando quello in cache se non è scaduto. */
function getZohoAccessToken_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get("ZOHO_ACCESS_TOKEN");
  if (cached) return cached;

  const cfg = zohoConfig_();
  const resp = UrlFetchApp.fetch(cfg.accountsBase + "/oauth/v2/token", {
    method: "post",
    payload: {
      grant_type: "refresh_token",
      refresh_token: cfg.refreshToken,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret
    },
    muteHttpExceptions: true
  });

  const json = JSON.parse(resp.getContentText());
  if (!json.access_token) {
    throw new Error("Refresh del token Zoho fallito: " + resp.getContentText());
  }

  // Il token dura tipicamente 3600s: lo teniamo in cache un po' meno per sicurezza.
  const ttl = Math.max(60, (json.expires_in || 3600) - 120);
  cache.put("ZOHO_ACCESS_TOKEN", json.access_token, ttl);
  return json.access_token;
}

/**
 * Chiamata generica all'API Zoho Sheet v2.
 * method: es. "worksheet.records.fetch" / ".add" / ".update"
 * formPayload: parametri inviati nel corpo della POST (criteria, json_data, ...)
 *
 * IMPORTANTE: header_row indica a Zoho su quale riga del worksheet si trovano le
 * intestazioni colonna. Di default l'API assume riga 1; il nostro foglio ha titolo
 * in riga 1 e istruzioni in riga 2, quindi senza questo parametro Zoho non
 * riconosce nomi colonna come "Email" (né nel criteria né nel json_data) e le
 * chiamate falliscono con errori come "Mentioned criteria is not valid".
 */
function zohoApiCall_(method, formPayload) {
  const cfg = zohoConfig_();
  const token = getZohoAccessToken_();

  const url =
    cfg.apiBase +
    "/" +
    cfg.resourceId +
    "?method=" +
    encodeURIComponent(method) +
    "&worksheet_name=" +
    encodeURIComponent(cfg.worksheetName) +
    "&header_row=" +
    HEADER_ROW;

  const resp = UrlFetchApp.fetch(url, {
    method: "post",
    headers: { Authorization: "Zoho-oauthtoken " + token },
    payload: formPayload || {},
    muteHttpExceptions: true
  });

  const text = resp.getContentText();
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    json = { raw: text };
  }

  if (resp.getResponseCode() >= 300) {
    throw new Error("Zoho API " + method + " -> HTTP " + resp.getResponseCode() + ": " + text);
  }
  return json;
}

/**
 * NOTA STORICA (settembre 2026): questa sincronizzazione in origine
 * aggiornava Zoho riga per riga a ogni evento del portale, cercando la riga
 * per email con worksheet.records.fetch + criteria. Si è rivelato fragile:
 * worksheet.records.fetch con criteria sulla colonna "Email" restituiva
 * sempre records:[], anche per email sicuramente presenti nel foglio
 * (verificato a mano: la riga esisteva ed era visibile nell'interfaccia Zoho
 * Sheet, ma il fetch filtrato non la trovava mai) — molto probabilmente
 * perché Zoho formatta automaticamente la colonna Email come link cliccabile
 * e il motore "criteria" non la confronta più come stringa semplice. Il
 * risultato era che ogni evento dopo il primo veniva trattato come "riga non
 * trovata" e il tentativo di scriverlo falliva silenziosamente.
 * Per eliminare questa fragilità, ora Zoho non viene più aggiornato evento
 * per evento: una volta a settimana copiaGoogleSheetSuZoho_() cancella tutte
 * le righe dati su Zoho e le riscrive da zero prendendole dal Google Sheet
 * (che resta l'unica fonte in tempo reale). Vedi quella funzione più sotto.
 */

/**
 * Sostituisce COMPLETAMENTE le righe dati del worksheet Zoho con quelle
 * lette dal Google Sheet collegato a questo progetto: cancella tutte le
 * righe da DATA_START_ROW in poi su Zoho, poi le riscrive da zero prendendole
 * dal Google Sheet. Pensata per girare una volta a settimana (vedi
 * installaTriggerSettimanale_), non ad ogni evento: il Google Sheet resta
 * l'unica fonte aggiornata in tempo reale, Zoho è solo uno specchio.
 */
function copiaGoogleSheetSuZoho_() {
  const righe = leggiRigheGoogleSheet_();
  console.log("Lette " + righe.length + " righe dal Google Sheet.");

  cancellaRigheZoho_();

  if (righe.length > 0) {
    const addResp = zohoApiCall_("worksheet.records.add", { json_data: JSON.stringify(righe) });
    console.log("Scritte su Zoho: " + JSON.stringify(addResp));
  }

  console.log("Copia completata: " + righe.length + " righe copiate dal Google Sheet a Zoho.");
}

/**
 * Legge tutte le righe dati (da DATA_START_ROW in poi) del Google Sheet
 * collegato, come array di oggetti { "Nome colonna": valore }, nello stesso
 * formato richiesto da Zoho per worksheet.records.add. Salta le righe
 * completamente vuote.
 */
function leggiRigheGoogleSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const headerMap = getHeaderMap_(sheet);
  const nomiColonne = Object.keys(headerMap);

  const lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) return [];

  const lastCol = sheet.getLastColumn();
  const valori = sheet
    .getRange(DATA_START_ROW, 1, lastRow - DATA_START_ROW + 1, lastCol)
    .getValues();

  return valori
    .filter(function (riga) {
      return riga.some(function (v) { return v !== "" && v !== null; });
    })
    .map(function (riga) {
      const obj = {};
      nomiColonne.forEach(function (nome) {
        obj[nome] = riga[headerMap[nome] - 1];
      });
      return obj;
    });
}

/**
 * Cancella tutte le righe dati (da DATA_START_ROW in poi) del worksheet
 * Zoho, prima di riscriverle da zero in copiaGoogleSheetSuZoho_().
 *
 * DA VERIFICARE nel primo test manuale: il criteria usa la colonna "Nome"
 * (mai formattata automaticamente da Zoho, a differenza di "Email" — vedi la
 * nota storica sopra) con l'operatore "!=" per intercettare tutte le righe
 * non vuote. Se dopo la cancellazione restano comunque righe (controlla il
 * log qui sotto), verifica su documentazione Zoho il criteria corretto per
 * "cancella tutto" e sostituiscilo qui.
 */
function cancellaRigheZoho_() {
  const resp = zohoApiCall_("worksheet.records.delete", { criteria: '"Nome"!=""' });
  console.log("Cancellazione righe Zoho: " + JSON.stringify(resp));

  const rimaste = zohoApiCall_("worksheet.records.fetch", { records_count: 1 });
  const numRimaste = (rimaste && rimaste.records && rimaste.records.length) || 0;
  if (numRimaste > 0) {
    console.error(
      "ATTENZIONE: dopo la cancellazione risultano ancora righe su Zoho " +
      "(il criteria potrebbe non funzionare come atteso). Controlla il worksheet a mano."
    );
  }
}

/**
 * ESEGUI A MANO UNA VOLTA SOLA (richiamata anche da runSetup(), vedi in cima
 * al file — leggi però l'avviso lì su cosa comporta rieseguire runSetup())
 * per installare il trigger settimanale che tiene sincronizzato Zoho Sheet
 * come specchio del Google Sheet. Cancella eventuali trigger precedenti
 * sulla stessa funzione prima di crearne uno nuovo, così rieseguirla non
 * crea trigger doppioni.
 * Nota: Apps Script garantisce l'esecuzione "verso" l'ora indicata, non
 * esattamente a quel minuto (in genere entro un'ora dall'orario scelto).
 */
function installaTriggerSettimanale_() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === "copiaGoogleSheetSuZoho_") {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger("copiaGoogleSheetSuZoho_")
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(8)
    .create();

  console.log("Trigger settimanale installato: copiaGoogleSheetSuZoho_ ogni lunedì verso le 8:00.");
}

/**
 * ESEGUI A MANO dall'editor Apps Script per verificare la connessione a Zoho
 * prima di fidarti del trigger automatico di copiaGoogleSheetSuZoho_().
 * Guarda i log: menu "Esecuzioni" a sinistra, oppure Ctrl+Enter dopo l'esecuzione.
 */
function testZohoSetup() {
  console.log("1) Provo a ottenere un access token...");
  const token = getZohoAccessToken_();
  console.log("Access token ottenuto (primi 12 caratteri): " + token.substring(0, 12) + "...");

  console.log("2) Provo una lettura di prova del worksheet...");
  const found = zohoApiCall_("worksheet.records.fetch", { records_count: 1 });
  console.log("Risposta fetch: " + JSON.stringify(found));

  console.log(
    "OK: connessione a Zoho funzionante. Per testare la copia completa esegui " +
    "copiaGoogleSheetSuZoho_() e controlla il worksheet 'Registro Formazione'."
  );
}

/**
 * ESEGUI A MANO per verificare la stessa logica sul Google Sheet collegato a
 * questo progetto Apps Script (senza passare da Zoho). Aggiorna la colonna
 * "Slide scaricate" per controllare che la nuova colonna sia mappata correttamente.
 */
function testGoogleSheetSetup() {
  const identita = {
    Nome: "Test",
    Cognome: "Connessione",
    Email: "test.sheet.sync@dynatech.it",
    Organizzazione: "Dynatech"
  };
  aggiornaGoogleSheet_(identita, { "Slide scaricate": new Date().toISOString() });
  console.log(
    "OK: riga di test scritta/aggiornata sul Google Sheet per " + identita.Email +
    ". Controlla che il valore sia finito nella colonna 'Slide scaricate' e non altrove."
  );
}

/**
 * ESEGUI A MANO dal menu "Esegui" dell'editor Apps Script per testare la
 * generazione e l'invio dell'attestato con dati finti, senza passare dal
 * questionario reale. Modifica l'email sotto con un indirizzo che puoi
 * controllare prima di eseguirla. Non è richiamata da runSetup().
 */
function testGeneraAttestato() {
  const identita = {
    Nome: "Mario",
    Cognome: "Rossi",
    Email: "test.attestato@example.com",
    Organizzazione: "Dynatech",
    Punteggio: "16/18",
    Esito: "SUPERATO"
  };
  const url = generaAttestato_(identita);
  console.log("Attestato di test generato. URL PDF: " + url);
}
