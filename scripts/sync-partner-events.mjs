#!/usr/bin/env node
/**
 * Sync partner events into src/data/events.ts.
 *
 * Sources (all machine-readable feeds, no HTML scraping):
 *   - Austin Forum on Technology & Society  (Squarespace JSON)
 *   - Austin AI Alliance                    (The Events Calendar REST API)
 *   - Austin LangChain AIMUG                (Meetup iCal feed)
 *   - ACM Austin                            (Meetup iCal feed)
 *
 * New events are appended to the allEvents array with their exact event
 * links. Events with no feed image fall back to the partner's standard
 * thumbnail. Prints a markdown report to stdout; exits 0 always unless a
 * feed is unreachable AND nothing could be fetched at all.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const EVENTS_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'events.ts');
const UA = 'Mozilla/5.0 (compatible; cgcs-events-sync/1.0; +https://cgcs-acc.org)';
const TZ = 'America/Chicago';

const PARTNERS = {
  forum: {
    name: 'Austin Forum',
    hrefKey: 'austinforum.org',
    fallbackImage:
      'https://images.squarespace-cdn.com/content/v1/6655f10a960c803d55554e19/b40b978c-9822-46fb-a1ad-ee407739aab7/AIDebate.JPEG',
  },
  alliance: {
    name: 'Austin AI Alliance',
    hrefKey: 'austin-ai.org',
    fallbackImage: 'https://austin-ai.org/wp-content/uploads/2025/03/Color-full.png',
    fallbackObjectFit: 'contain',
  },
  aimug: {
    name: 'Austin LangChain AIMUG',
    hrefKey: 'meetup.com/austin-langchain-ai-group',
    fallbackImage: 'https://secure.meetupstatic.com/photos/event/6/5/5/highres_531601621.jpeg',
  },
  acm: {
    name: 'ACM Austin',
    hrefKey: 'meetup.com/acm-austin',
    fallbackImage: 'https://secure.meetupstatic.com/photos/event/4/2/0/d/highres_530236909.jpeg',
  },
};

// ---------- helpers ----------

const decodeEntities = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();

/** "2026-09-01", 18, 15 -> "6:15 pm" */
function fmtTime(h, m) {
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function fmtDisplayDate(iso) {
  const [y, mo, d] = iso.split('-').map(Number);
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${months[mo - 1]} ${d}, ${y}`;
}

/** epoch ms -> { iso, h, m } in Central time */
function centralParts(ms) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const get = (t) => parts.find((p) => p.type === t).value;
  return { iso: `${get('year')}-${get('month')}-${get('day')}`, h: Number(get('hour')), m: Number(get('minute')) };
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

const normTitle = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// ---------- source fetchers (each returns [{title, isoDate, time, href, image?, objectFit?, partner}]) ----------

async function fetchForum() {
  const data = JSON.parse(await fetchText('https://www.austinforum.org/events?format=json'));
  return (data.upcoming || []).map((it) => {
    const start = centralParts(it.startDate);
    const end = it.endDate ? centralParts(it.endDate) : null;
    return {
      partner: 'forum',
      title: `Austin Forum: ${decodeEntities(it.title)}`,
      isoDate: start.iso,
      time: end ? `${fmtTime(start.h, start.m)} - ${fmtTime(end.h, end.m)}` : fmtTime(start.h, start.m),
      startTime: fmtTime(start.h, start.m),
      href: `https://www.austinforum.org${it.fullUrl}`,
      image: it.assetUrl || null,
    };
  });
}

async function fetchAlliance() {
  const data = JSON.parse(
    await fetchText('https://austin-ai.org/wp-json/tribe/events/v1/events?per_page=50&start_date=now'),
  );
  return (data.events || []).map((e) => {
    const [iso, hm] = e.start_date.split(' ');
    const [h, m] = hm.split(':').map(Number);
    const [, endHm] = (e.end_date || '').split(' ');
    const [eh, em] = endHm ? endHm.split(':').map(Number) : [null, null];
    return {
      partner: 'alliance',
      title: decodeEntities(e.title),
      isoDate: iso,
      time: eh !== null ? `${fmtTime(h, m)} - ${fmtTime(eh, em)}` : fmtTime(h, m),
      startTime: fmtTime(h, m),
      href: e.url,
      image: (e.image && e.image.url) || null,
    };
  });
}

function parseIcs(ics, partner) {
  const unfolded = ics.replace(/\r?\n[ \t]/g, '');
  const events = [];
  for (const block of unfolded.split('BEGIN:VEVENT').slice(1)) {
    const field = (name) => {
      const m = block.match(new RegExp(`^${name}[^:]*:(.+)$`, 'm'));
      return m ? m[1].trim() : null;
    };
    const summary = field('SUMMARY');
    const dtstart = field('DTSTART');
    const dtend = field('DTEND');
    const url = field('URL');
    if (!summary || !dtstart) continue;
    // DTSTART;TZID=America/Chicago:20260902T180000 -> already local Central time
    const p = (s) => ({
      iso: `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`,
      h: Number(s.slice(9, 11)),
      m: Number(s.slice(11, 13)),
    });
    const start = p(dtstart);
    const end = dtend ? p(dtend) : null;
    events.push({
      partner,
      title: decodeEntities(summary.replace(/\\,/g, ',').replace(/\\;/g, ';')),
      isoDate: start.iso,
      time: end ? `${fmtTime(start.h, start.m)} - ${fmtTime(end.h, end.m)}` : fmtTime(start.h, start.m),
      startTime: fmtTime(start.h, start.m),
      href: url,
      image: null, // Meetup ICS has no images; partner fallback is used
    });
  }
  return events;
}

const fetchAimug = async () =>
  parseIcs(await fetchText('https://www.meetup.com/austin-langchain-ai-group/events/ical/'), 'aimug');
const fetchAcm = async () =>
  parseIcs(await fetchText('https://www.meetup.com/acm-austin/events/ical/'), 'acm');

// ---------- main ----------

async function main() {
  const src = readFileSync(EVENTS_FILE, 'utf8');

  // Existing entries (including commented-out ones, so deliberately removed
  // events are not re-added). Entry objects are flat — no nested braces.
  const existing = [];
  for (const m of src.matchAll(/\{[^{}]*\}/g)) {
    const block = m[0];
    const g = (re) => (block.match(re) || [])[1] || null;
    existing.push({
      title: g(/title:\s*'((?:[^'\\]|\\.)*)'/) || g(/title:\s*"([^"]*)"/),
      isoDate: g(/isoDate:\s*'([^']*)'/),
      href: g(/href:\s*'([^']*)'/),
      startTime: (g(/time:\s*'([^']*)'/) || '').split(' - ')[0] || null,
    });
  }

  const existingHrefs = new Set(existing.map((e) => e.href).filter(Boolean));
  const existsSlot = (iso, startTime) =>
    existing.some((e) => e.isoDate === iso && e.startTime && e.startTime === startTime);
  const existsPartnerDay = (iso, hrefKey) =>
    existing.some((e) => e.isoDate === iso && e.href && e.href.includes(hrefKey));
  const existsTitleDay = (iso, title) =>
    existing.some((e) => e.isoDate === iso && e.title && normTitle(e.title).includes(normTitle(title).slice(0, 30)));

  const today = centralParts(Date.now()).iso;

  // Forum first: it is canonical for its own events, which the Alliance
  // calendar cross-posts (sometimes with stale titles).
  const sources = [
    ['forum', fetchForum],
    ['alliance', fetchAlliance],
    ['aimug', fetchAimug],
    ['acm', fetchAcm],
  ];

  const added = [];
  const skipped = [];
  const errors = [];

  for (const [key, fn] of sources) {
    let events;
    try {
      events = await fn();
    } catch (err) {
      errors.push(`${PARTNERS[key].name}: ${err.message}`);
      continue;
    }
    for (const ev of events) {
      if (ev.isoDate <= today) continue; // only future events
      if (/\bTBA\b/i.test(ev.title)) {
        skipped.push(`${ev.title} (${ev.isoDate}) — title still TBA`);
        continue;
      }
      if (ev.href && existingHrefs.has(ev.href)) continue; // exact link already listed
      if (existsPartnerDay(ev.isoDate, PARTNERS[ev.partner].hrefKey)) {
        skipped.push(`${ev.title} (${ev.isoDate}) — ${PARTNERS[ev.partner].name} already has an entry that day`);
        continue;
      }
      // Cross-source duplicate (e.g. Alliance cross-posting a Forum event):
      // same day + same start time, or same day + same title.
      if (existsSlot(ev.isoDate, ev.startTime) || existsTitleDay(ev.isoDate, ev.title)) {
        skipped.push(`${ev.title} (${ev.isoDate}) — duplicate of an event already listed that day`);
        continue;
      }
      added.push(ev);
      // Make later sources dedupe against this one too
      existing.push({ title: ev.title, isoDate: ev.isoDate, href: ev.href, startTime: ev.startTime });
      if (ev.href) existingHrefs.add(ev.href);
    }
  }

  // ---- write new entries into events.ts ----
  if (added.length > 0) {
    const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
    const entries = added
      .map((ev) => {
        const partner = PARTNERS[ev.partner];
        const image = ev.image || partner.fallbackImage;
        const objectFit = ev.image ? null : partner.fallbackObjectFit || null;
        const lines = [
          '  {',
          `    title: ${q(ev.title)},`,
          `    date: ${q(fmtDisplayDate(ev.isoDate))},`,
          `    time: ${q(ev.time)},`,
          `    image: ${q(image)},`,
          ...(objectFit ? [`    objectFit: ${q(objectFit)},`] : []),
          `    href: ${q(ev.href)},`,
          '    newTab: true,',
          `    isoDate: ${q(ev.isoDate)},`,
          '  },',
        ];
        return lines.join('\n');
      })
      .join('\n');

    const marker = '\n];';
    const idx = src.indexOf(marker);
    if (idx === -1) throw new Error('Could not find end of allEvents array in events.ts');
    writeFileSync(EVENTS_FILE, src.slice(0, idx) + '\n' + entries + src.slice(idx), 'utf8');
  }

  // ---- report (markdown, printed to stdout) ----
  const lines = [`## Partner events sync — ${today}`, ''];
  if (added.length) {
    lines.push(`### Added (${added.length})`, '');
    for (const ev of added) {
      lines.push(`- **${ev.title}** — ${fmtDisplayDate(ev.isoDate)}, ${ev.time} (${PARTNERS[ev.partner].name}) — [link](${ev.href})`);
    }
  } else {
    lines.push('No new events found.');
  }
  if (skipped.length) {
    lines.push('', `### Skipped (${skipped.length})`, '');
    for (const s of skipped) lines.push(`- ${s}`);
  }
  if (errors.length) {
    lines.push('', `### Feed errors (${errors.length})`, '');
    for (const e of errors) lines.push(`- ${e}`);
  }
  console.log(lines.join('\n'));

  // For the GitHub Actions step: expose whether anything changed
  if (process.env.GITHUB_OUTPUT) {
    const summary = added.map((e) => `${e.title} (${e.isoDate})`).join(', ');
    writeFileSync(process.env.GITHUB_OUTPUT, `added=${added.length}\nsummary=${summary}\n`, { flag: 'a' });
  }

  if (errors.length === sources.length) process.exit(1); // every feed failed
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
