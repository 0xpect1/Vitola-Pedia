/* ══════════════════════════════════════════════════════════════════
   VITOLA PEDIA — CLIENT-SIDE CONTENT MODERATION (STOPGAP)
   ══════════════════════════════════════════════════════════════════

   ⚠️  THIS IS A STOPGAP, NOT A SOLUTION. ⚠️

   The client-side blocklist below catches the most egregious terms
   before they reach the DOM — but it can be bypassed by anyone who
   reads the source. Real enforcement is server-side:

     • RLS policies block banned members from writing (see
       docs/lounge-moderation-schema.sql).
     • Admin tools (hide, ban, report) are in the adapter and UI.
     • The `lounge_report()` SECURITY DEFINER function persists
       reports for the admin to review.

   This file exists so that the worst content never renders in the
   first place — a first line of defense, not the last.

   OWNER POLICY IS NON-NEGOTIABLE:
     STRICTLY no illegal activities, no CP/CSAM, nothing in that
     nature — ever. If any such content appears, hide it immediately,
     ban the member, and report to the appropriate authorities if
     required by law.

   This file exposes a global `MODERATION` object:
     • MODERATION.checkContent(text) → { blocked, reason }
     • MODERATION.filterText(text)  → sanitized string or '[removed]'
     • MODERATION.BLOCKLIST         → array of patterns (for reference)
   ══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /*
   * BLOCKLIST
   *
   * Each entry is a case-insensitive substring or regex pattern matched
   * against the raw text. When a match is found, checkContent() returns
   * { blocked: true, reason: '...' } and filterText() replaces the
   * entire message with '[content removed]'.
   *
   * We do NOT list explicit CSAM terms verbatim in this file — doing so
   * would itself be harmful. Instead, we use category-level patterns
   * that catch the structural signals of the worst content without
   * reproducing it. These patterns are deliberately broad.
   *
   * Categories covered:
   *   1. CSAM / underage sexual content (structural patterns)
   *   2. Illegal drug sales / trafficking
   *   3. Weapons trafficking
   *   4. Doxxing / PII harvesting
   *   5. Solicitation of illegal acts
   */

  var BLOCKLIST = [
    /* ── Category 1: CSAM / underage sexual content ─────────────
       We match structural signals (age + sexual context) rather
       than listing explicit terms. These patterns catch combinations
       like "12 year old" + sexual keywords, "underage" + sexual
       keywords, "lolli" (common CSAM dogwhistle), etc. */
    /\b(\d{1,2})\s*(yr|yrs|year|years?|yo)\s*(old)?\b.*\b(nude|nudes|naked|sex|sexy|sexual|fuck|porn|nsfw|explicit)\b/i,
    /\b(nude|nudes|naked|sex|sexy|sexual|fuck|porn|nsfw|explicit)\b.*\b(\d{1,2})\s*(yr|yrs|year|years?|yo)\s*(old)?\b/i,
    /\b(under[- ]?age|minor|child|children|kid|kids|teen|teens|preteen|pre[- ]?teen|toddler|baby|infant)\b.*\b(nude|nudes|naked|sex|sexy|sexual|fuck|porn|nsfw|explicit|lewd|cp|csam)\b/i,
    /\b(nude|nudes|naked|sex|sexy|sexual|fuck|porn|nsfw|explicit|lewd|cp|csam)\b.*\b(under[- ]?age|minor|child|children|kid|kids|teen|teens|preteen|pre[- ]?teen|toddler|baby|infant)\b/i,
    /\b(lolli|lolibest|c[pP]\b|csam|ptsc|hurtcore|baby\s*play)\b/i,
    /\b(jailbait|jail\s*bait)\b/i,
    /\b(family\s*therapy|taboo\s*tiny|tiny\s*taboo)\b/i, // common CSAM site names

    /* ── Category 2: Illegal drug sales / trafficking ──────────
       Catches solicitation patterns for selling controlled
       substances. Note: cigars and pipe tobacco are legal products
       — this targets illicit drug trafficking, not tobacco. */
    /\b(sell|selling|sells|buy|buying|buys|order|ordering|ship|shipping|deliver|delivery)\b.*\b(cocaine|coke|crack|heroin|meth|methamphetamine|fentanyl| MDMA|ecstasy|lsd|psilocybin|shrooms|molly|oxy|oxycodone|perc|percs|adderall|xanax|kodeine|codeine|lean|syrup)\b/i,
    /\b(cocaine|coke|crack|heroin|meth|methamphetamine|fentanyl| MDMA|ecstasy|lsd|psilocybin|shrooms|molly|oxy|oxycodone|perc|percs|adderall|xanax|kodeine|codeine|lean|syrup)\b.*\b(sell|selling|sells|buy|buying|buys|order|ordering|ship|shipping|deliver|delivery|price|prices?|dollar|\$)\b/i,
    /\b(weed|kush|bud|cart|carts|vape|vape\s*pen|dank|dispensary)\b.*\b(sell|selling|sells|buy|buying|buys|order|ordering|ship|shipping|deliver|delivery|price|dollar|\$|dm\s*me|pm\s*me)\b/i,
    /\b(plug|source|connect|menu|strain\s*list)\b.*\b(weed|kush|bud|cart|carts|cocaine|coke|heroin|meth|pills|perc|percs|xanax|oxy)\b/i,
    /\b(dm\s*me|pm\s*me|hit\s*me\s*up|hmu|snap\s*me|snapchat|telegram|signal|wickr)\b.*\b(weed|kush|bud|cart|carts|cocaine|coke|crack|heroin|meth|pills|perc|percs|xanax|oxy|fentanyl|lsd|shrooms|molly)\b/i,

    /* ── Category 3: Weapons trafficking ─────────────────────── */
    /\b(sell|selling|buy|buying|ship|shipping|deliver|delivery|wholesale|bulk)\b.*\b(handgun|pistol|rifle|assault|ak[- ]?47|ar[- ]?15|glock|silencer|suppressor|switch\s*blade|machine\s*gun|full\s*auto|conversion\s*kit|ghost\s*gun)\b/i,
    /\b(handgun|pistol|rifle|assault|ak[- ]?47|ar[- ]?15|glock|silencer|suppressor|switch\s*blade|machine\s*gun|full\s*auto|conversion\s*kit|ghost\s*gun)\b.*\b(sell|selling|buy|buying|ship|shipping|deliver|delivery|wholesale|bulk|price|\$)\b/i,

    /* ── Category 4: Doxxing / PII harvesting ──────────────────
       Catches patterns that look like sharing someone's real
       identity (full name + address, SSN, etc.) without consent. */
    /\b(ssn|social\s*security\s*number|dob|date\s*of\s*birth)\b.*\b(leak|leak(ed)?|dox|doxx(ed)?|expos(e|ed)|drop(ped)?)\b/i,
    /\b(home\s*address|real\s*name|full\s*name|phone\s*number|cell\s*number)\b.*\b(leak|leak(ed)?|dox|doxx(ed)?|expos(e|ed)|drop(ped)?|share(d)?)\b/i,

    /* ── Category 5: Solicitation of illegal acts ───────────── */
    /\b(hitman|contract\s*kill(er|ing)|murder\s*for\s*hire|assassination|assassin)\b/i,
    /\b(human\s*traffick|trafficking\s*person|sex\s*traffick|smuggle\s*people)\b/i,
    /\b(money\s*launder|launder(ing)?\s*money|wash\s*money|clean\s*dirty\s*money)\b/i,
    /\b(stolen\s*credit|stolen\s*card|stolen\s*cc|cc\s*dumps|fullz|cvv\s*dump|carding)\b/i,
    /\b(counterfeit\s*(money|cash|bills|currency|notes))\b/i,
    /\b(bomb\s*making|how\s*to\s*(make|build)\s*(a\s*)?(bomb|explosive|pipe\s*bomb))\b/i,
  ];

  /*
   * checkContent(text) — returns { blocked: boolean, reason: string }
   *
   * Runs the text against every blocklist pattern. Returns on the
   * first match. If nothing matches, returns { blocked: false }.
   */
  function checkContent(text) {
    if (!text || typeof text !== 'string') return { blocked: false };
    var str = text;

    for (var i = 0; i < BLOCKLIST.length; i++) {
      var pattern = BLOCKLIST[i];
      if (pattern.test(str)) {
        return {
          blocked: true,
          reason: 'Content matched a blocked pattern (category ' + (Math.floor(i / 10) + 1) + '). ' +
                  'This content violates the site policy: strictly no illegal activities, ' +
                  'no CSAM/CP, nothing in that nature — ever.'
        };
      }
    }

    return { blocked: false };
  }

  /*
   * filterText(text) — returns the text if it passes, or '[content removed]'
   * if it fails. This is the convenience wrapper for render sites.
   */
  function filterText(text) {
    var result = checkContent(text);
    if (result.blocked) return '[content removed]';
    return text;
  }

  /*
   * isBlocked(text) — simple boolean check.
   */
  function isBlocked(text) {
    return checkContent(text).blocked;
  }

  // Expose the global.
  window.MODERATION = {
    BLOCKLIST: BLOCKLIST,
    checkContent: checkContent,
    filterText: filterText,
    isBlocked: isBlocked,
    REMOVED_TEXT: '[content removed]',
  };
})();
