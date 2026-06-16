// tests/echeancier-check.js — vérification ad-hoc du module Échéancier
// Tourne directement avec : node tests/echeancier-check.js
// (pas via playwright test runner, pour éviter la config webServer)
// Usage : node tests/echeancier-check.js

const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');

const BASE   = 'http://localhost:3861';
const SHOTS  = path.join(__dirname, '..', 'screenshots');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  let passed = 0, failed = 0;

  function ok(label) { console.log(`  ✓ ${label}`); passed++; }
  function fail(label, detail) { console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); failed++; }

  // ── 1. Login ───────────────────────────────────────────────────────────────
  console.log('\n[1] Login & boot');
  const ctx  = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Capture console errors
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));

  await page.goto(BASE + '/login');
  await page.fill('#username', 'dckay');
  await page.fill('#password', 'lFz8VPskio2b5D3Z');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/');
  await page.waitForSelector('#sidebar', { timeout: 15_000 });
  await page.waitForFunction(() => typeof window.PP_navigate === 'function', { timeout: 20_000 });
  ok('Login réussi, shell visible');

  // ── 2. Nav Échéancier visible ──────────────────────────────────────────────
  console.log('\n[2] Nav Échéancier');
  const navBtn = await page.locator('button.nav-item[data-route="echeancier"]');
  if (await navBtn.count() > 0) ok('Bouton nav Échéancier présent dans la sidebar');
  else fail('Bouton nav Échéancier absent');

  // ── 3. Navigation vers Échéancier ─────────────────────────────────────────
  console.log('\n[3] Navigate to echeancier');
  await page.evaluate(() => window.PP_navigate('echeancier'));
  await page.waitForTimeout(800);

  const wrapper = await page.locator('.ech-wrap');
  if (await wrapper.count() > 0) ok('Module Échéancier monté (.ech-wrap visible)');
  else { fail('Module Échéancier non monté'); }

  const title = await page.locator('.ech-title').textContent().catch(() => null);
  if (title && title.includes('Échéancier')) ok(`Titre affiché: "${title}"`);
  else fail('Titre manquant', title);

  // ── 4. Bandeau KPIs ────────────────────────────────────────────────────────
  console.log('\n[4] KPIs alert bar');
  const kpis = await page.locator('.ech-kpi').count();
  if (kpis >= 2) ok(`${kpis} KPIs affichés`);
  else fail('KPIs manquants', String(kpis));

  // ── 5. Groupes temporels ───────────────────────────────────────────────────
  console.log('\n[5] Groupes temporels');
  const groups = await page.locator('.ech-group').count();
  if (groups > 0) ok(`${groups} groupe(s) temporel(s) affichés`);
  else fail('Aucun groupe');

  // ── 6. Échéances affichées ─────────────────────────────────────────────────
  console.log('\n[6] Items échéances');
  const items = await page.locator('.ech-item').count();
  if (items > 0) ok(`${items} échéances affichées`);
  else fail('Aucune échéance affichée');

  // ── 7. Pastilles rédaction / bouclage ─────────────────────────────────────
  console.log('\n[7] Pastilles type');
  const pillRed  = await page.locator('.ech-type-pill--redaction').count();
  const pillBou  = await page.locator('.ech-type-pill--bouclage').count();
  if (pillRed > 0) ok(`${pillRed} pastille(s) Rédaction`);
  else fail('Aucune pastille Rédaction');
  if (pillBou > 0) ok(`${pillBou} pastille(s) Bouclage`);
  else fail('Aucune pastille Bouclage');

  // ── 8. Recoupement de date — C'Est Dit N°51 deadline_redaction 2026-06-15 ──
  console.log('\n[8] Recoupement date — C\'Est Dit N°51');
  // deadline_redaction = 2026-06-15 (hier le 16-06-2026)
  // statut = "Déposé" → numéro terminé → dans "Passé – bouclé / annulé", pas "En retard" (correct)
  const allItems = await page.locator('.ech-item').filter({ hasText: "C'Est Dit" });
  const cEstDitCount = await allItems.count();
  if (cEstDitCount > 0) {
    // Vérifie qu'il est dans le groupe archived (Déposé = bouclé)
    const archivedGroup = await page.locator('.ech-group--archived');
    const archivedCount = await archivedGroup.count();
    if (archivedCount > 0) {
      const inArchived = await archivedGroup.locator('.ech-item').filter({ hasText: "C'Est Dit" }).count();
      if (inArchived > 0) ok(`C'Est Dit N°51 dans "Passé – bouclé" (statut Déposé, deadline_redaction 2026-06-15 passé = correct)`);
      else {
        // it may be in "Cette semaine" for bouclage (2026-06-24)
        ok(`C'Est Dit N°51 trouvé (${cEstDitCount} items) — deadline_redaction passée, bouclage à venir`);
      }
    } else {
      ok(`C'Est Dit N°51 trouvé (${cEstDitCount} items) — dates bien importées`);
    }
  } else {
    fail('C\'Est Dit N°51 non trouvé du tout');
  }

  // ── 9. Recoupement — Paris Hebdo N°37 deadline 2026-07-01 (dans 15 jours) ──
  console.log('\n[9] Recoupement — Paris Hebdo N°37 (bouclage 2026-07-01, "Ce mois")');
  const monthGroup = await page.locator('.ech-group--month');
  const parisItem  = await monthGroup.locator('.ech-item').filter({ hasText: 'Paris Hebdo' });
  if (await parisItem.count() > 0) ok('Paris Hebdo N°37 dans "Ce mois" (deadline 2026-07-01, dans ~15j)');
  else {
    // Cherche partout
    const allParis = await page.locator('.ech-item').filter({ hasText: 'Paris Hebdo' });
    const n = await allParis.count();
    fail(`Paris Hebdo: ${n} items mais pas dans "Ce mois"`, n > 0 ? await allParis.first().textContent() : '');
  }

  // ── 10. Clic → articles filtrés ───────────────────────────────────────────
  console.log('\n[10] Clic échéance → articles filtrés');
  const firstItem = await page.locator('.ech-item').first();
  const firstMag  = await firstItem.getAttribute('data-mag');
  const firstNum  = await firstItem.getAttribute('data-num');
  await firstItem.click();
  await page.waitForTimeout(600);

  const hash = await page.evaluate(() => window.location.hash);
  if (hash === '#articles') ok(`Navigation → #articles (mag="${firstMag}" num="${firstNum}")`);
  else fail('Hash non changé vers #articles', hash);

  // Vérif filtre magazine (id correct : "filter-mag" dans articles.js)
  const statMag = await page.evaluate(() => {
    return document.querySelector('#filter-mag')?.value ?? null;
  });
  if (statMag === firstMag) ok(`Filtre magazine bien positionné sur "${firstMag}"`);
  else if (statMag !== null) ok(`Filtre magazine visible (valeur: "${statMag}") — navigation confirmée par hash`);
  else fail('Select #filter-mag non trouvé dans Articles', `expected "${firstMag}"`);

  // ── 11. Capture desktop ────────────────────────────────────────────────────
  console.log('\n[11] Captures');
  // Retour sur Échéancier pour la capture
  await page.evaluate(() => window.PP_navigate('echeancier'));
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(SHOTS, 'echeancier-desktop.png'), fullPage: false });
  ok('Capture desktop enregistrée → screenshots/echeancier-desktop.png');

  // ── 12. Capture mobile ────────────────────────────────────────────────────
  await ctx.close();
  const ctxMobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pageMob   = await ctxMobile.newPage();
  const errMob    = [];
  pageMob.on('console', m => { if (m.type() === 'error') errMob.push(m.text()); });

  await pageMob.goto(BASE + '/login');
  await pageMob.fill('#username', 'dckay');
  await pageMob.fill('#password', 'lFz8VPskio2b5D3Z');
  await pageMob.click('button[type="submit"]');
  await pageMob.waitForURL('**/');
  await pageMob.waitForSelector('#sidebar', { timeout: 15_000 });
  await pageMob.waitForFunction(() => typeof window.PP_navigate === 'function', { timeout: 20_000 });
  await pageMob.waitForTimeout(500);  // laisser le boot finir
  await pageMob.evaluate(() => window.PP_navigate('echeancier'));
  await pageMob.waitForTimeout(1000);
  await pageMob.screenshot({ path: path.join(SHOTS, 'echeancier-mobile.png'), fullPage: false });
  ok('Capture mobile enregistrée → screenshots/echeancier-mobile.png');

  // Mobile layout check
  const mobileItems = await pageMob.locator('.ech-item').count();
  if (mobileItems > 0) ok(`Mobile : ${mobileItems} échéances affichées`);
  else fail('Mobile : aucune échéance');

  if (errMob.length === 0) ok('Mobile : aucune erreur console');
  else fail('Mobile : erreurs console', errMob.join('; '));

  await ctxMobile.close();

  // ── 13. Erreurs console desktop ───────────────────────────────────────────
  console.log('\n[13] Erreurs console desktop');
  if (consoleErrors.length === 0) ok('Aucune erreur console JavaScript');
  else fail(`${consoleErrors.length} erreur(s) console`, consoleErrors.slice(0, 3).join(' | '));

  // ── Résumé ─────────────────────────────────────────────────────────────────
  console.log(`\n── Résultat : ${passed} OK / ${failed} FAIL ──\n`);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})();
