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
  var email = ((e && e.parameter && e.parameter.email) || '').trim().toLowerCase();
  var source = ((e && e.parameter && e.parameter.source) || 'homepage').slice(0, 50);

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return jsonResponse({ success: false, message: 'Invalid email' });
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getOrCreateSheet();
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var existing = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
      for (var i = 0; i < existing.length; i++) {
        if (String(existing[i][0]).trim().toLowerCase() === email) {
          // Duplicate: succeed without a new row so re-signups never error.
          return jsonResponse({ success: true, duplicate: true });
        }
      }
    }
    sheet.appendRow([new Date(), email, source]);
  } finally {
    lock.releaseLock();
  }

  return jsonResponse({ success: true });
}

function getOrCreateSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Timestamp', 'Email', 'Source']);
    sheet.getRange(1, 1, 1, 3).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
