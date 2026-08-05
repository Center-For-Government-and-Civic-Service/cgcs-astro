/**
 * CGCS Newsletter Signups — Google Apps Script receiver.
 *
 * Source of truth for the script deployed on the CGCS Google account.
 * If you edit this file, re-paste it into the Apps Script editor and
 * create a NEW deployment version (Deploy → Manage deployments → Edit →
 * Version: New version) — the /exec URL stays the same.
 *
 * Bound to the "CGCS Newsletter Signups" Google Sheet.
 * Deployed as Web app: Execute as Me, Who has access: Anyone.
 */

var SHEET_NAME = 'Signups';
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function doPost(e) {
  // Bulk mode: POST param `bulk` = JSON array of {email, name?, source?}.
  // Used for one-off imports (e.g. the legacy ListServ XLSX); appends all
  // valid new rows in a single execution with the same dedupe rules.
  if (e && e.parameter && e.parameter.bulk) {
    return bulkImport(e.parameter.bulk);
  }

  var email = ((e && e.parameter && e.parameter.email) || '').trim().toLowerCase();
  var source = ((e && e.parameter && e.parameter.source) || 'homepage').slice(0, 50);

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return jsonResponse({ success: false, message: 'Invalid email' });
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getOrCreateSheet();
    if (existingEmailSet(sheet)[email]) {
      // Duplicate: succeed without a new row so re-signups never error.
      return jsonResponse({ success: true, duplicate: true });
    }
    sheet.appendRow([new Date(), email, source]);
  } finally {
    lock.releaseLock();
  }

  return jsonResponse({ success: true });
}

function bulkImport(json) {
  var entries;
  try {
    entries = JSON.parse(json);
  } catch (err) {
    return jsonResponse({ success: false, message: 'Bad bulk JSON' });
  }
  if (!entries || !entries.length) {
    return jsonResponse({ success: false, message: 'Empty bulk payload' });
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = getOrCreateSheet();
    var seen = existingEmailSet(sheet);
    var rows = [];
    var skippedDuplicate = 0;
    var skippedInvalid = 0;
    var now = new Date();

    for (var i = 0; i < entries.length; i++) {
      var email = String(entries[i].email || '').trim().toLowerCase();
      if (!EMAIL_RE.test(email) || email.length > 254) {
        skippedInvalid++;
        continue;
      }
      if (seen[email]) {
        skippedDuplicate++;
        continue;
      }
      seen[email] = true;
      rows.push([
        now,
        email,
        String(entries[i].source || 'import').slice(0, 50),
        String(entries[i].name || '').slice(0, 100),
      ]);
    }

    if (rows.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 4).setValues(rows);
    }
    return jsonResponse({
      success: true,
      added: rows.length,
      skippedDuplicate: skippedDuplicate,
      skippedInvalid: skippedInvalid,
    });
  } finally {
    lock.releaseLock();
  }
}

function existingEmailSet(sheet) {
  var seen = {};
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var values = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
    for (var i = 0; i < values.length; i++) {
      seen[String(values[i][0]).trim().toLowerCase()] = true;
    }
  }
  return seen;
}

function getOrCreateSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Timestamp', 'Email', 'Source', 'Name']);
    sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
    sheet.setFrozenRows(1);
  } else if (sheet.getRange(1, 4).getValue() !== 'Name') {
    // Upgrade older 3-column headers in place.
    sheet.getRange(1, 4).setValue('Name').setFontWeight('bold');
  }
  return sheet;
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
