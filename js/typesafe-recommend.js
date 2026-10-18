/* ================================================================
   VITOLA PEDIA — Jev-Powered AI Cigar Engine
   --------------------------------------------------------------
   Uses TypeSafe / Jev (System One) for structured decisions:
     • recommendCigar(userPrefs)  — AI picks one ideal cigar
     • scoreCigarMatch(cigar,prefs) — score a specific cigar 0–100
     • rerankResults(cigars, query) — semantic rerank of candidates
     • moderateMessage(text)       — Noul-based spam/toxicity check
     • smartSearch(query, cigars)   — natural-language cigar search

   All calls are client-side fetch() to the Jev endpoint. Every
   function degrades gracefully: if Jev is unreachable, the key is
   missing, or the call errors, it falls back to a deterministic
   local heuristic (random for recommend, keyword for search,
   permissive for moderation) so the site never breaks.
   ================================================================ */

(function () {
  'use strict';

  var ENDPOINT = (window.TYPESAFE_ENDPOINT || 'https://api.typesafe.ai/v1/systemone');
  var MODEL = (window.TYPESAFE_MODEL || 'jev-latest');

  /* ── Core: one Jev call ─────────────────────────────────────────
     state    : string | object
     questions: { id: { type, instructions, criteria } }
     returns  : { answers: { id: { type, choice|score|noul, ... } } }
     throws   : Error on network/HTTP failure or missing key        */
  function callJev(state, questions) {
    var key = window.TYPESAFE_API_KEY;
    if (!key) {
      return Promise.reject(new Error('No TypeSafe API key configured'));
    }
    var body = JSON.stringify({ state: state, model: MODEL, questions: questions });
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key
      },
      body: body
    }).then(function (resp) {
      if (!resp.ok) {
        return resp.text().then(function (t) {
          throw new Error('Jev HTTP ' + resp.status + ': ' + t.slice(0, 200));
        });
      }
      return resp.json();
    }).then(function (data) {
      if (!data || !data.answers) throw new Error('Jev: malformed response');
      return data;
    });
  }

  /* ── Helpers ─────────────────────────────────────────────────── */
  function norm(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  // Normalize a strength number (1–5) into a label band.
  function strengthBand(n) {
    n = Number(n) || 3;
    if (n <= 1) return 'mild';
    if (n <= 2) return 'mild-medium';
    if (n <= 3) return 'medium';
    if (n <= 4) return 'medium-full';
    return 'full';
  }

  // Collect distinct wrapper families actually present in the data.
  var WRAPPER_FAMILIES = [
    'connecticut', 'connecticut shade', 'connecticut broadleaf',
    'habano', 'maduro', 'corojo', 'sumatra', 'cameroon', 'criollo',
    'broadleaf', 'shade'
  ];

  function wrapperFamily(wrapper) {
    var w = norm(wrapper);
    // order matters: broadleaf before connecticut, shade after
    var families = [
      'connecticut broadleaf', 'connecticut shade', 'connecticut',
      'broadleaf', 'shade', 'habano', 'maduro', 'corojo', 'sumatra',
      'cameroon', 'criollo'
    ];
    for (var i = 0; i < families.length; i++) {
      if (w.indexOf(families[i]) >= 0) return families[i];
    }
    return 'habano';
  }

  // Top origins present in the library (kept short for the choice set).
  var COMMON_ORIGINS = [
    'Nicaragua', 'Dominican Republic', 'Cuba', 'Honduras',
    'Guatemala', 'Ecuador', 'Mexico', 'Costa Rica'
  ];

  /* ══════════════════════════════════════════════════════════════
     1. recommendCigar(userPrefs)
     --------------------------------------------------------------
     Asks Jev for the ideal wrapper, origin, strength level, and a
     price-match score + pairing fit, then picks the best-rated local
     cigar matching those attributes within the user's price range.
     Returns: { cigar, attributes, fallback, reason }
     ══════════════════════════════════════════════════════════════ */
  function recommendCigar(userPrefs) {
    userPrefs = userPrefs || {};
    var prefs = {
      strength: userPrefs.strength || 'all',
      priceMin: userPrefs.priceMin != null ? userPrefs.priceMin : 0,
      priceMax: userPrefs.priceMax != null ? userPrefs.priceMax : 65,
      flavors: userPrefs.flavors || [],
      origin: userPrefs.origin || 'all',
      wrapper: userPrefs.wrapper || 'all',
      pairing: userPrefs.pairing || '',
      experience: userPrefs.experience || 'intermediate',
      timeOfDay: userPrefs.timeOfDay || 'any'
    };

    // Build a natural-language state for Jev.
    var bits = [];
    bits.push('User wants a cigar.');
    if (prefs.strength !== 'all') bits.push('Preferred strength: ' + strengthBand(prefs.strength) + '.');
    else bits.push('Strength: open to anything.');
    bits.push('Budget: $' + prefs.priceMin + '–$' + prefs.priceMax + ' per stick.');
    if (prefs.flavors.length) bits.push('Flavor preferences: ' + prefs.flavors.join(', ') + '.');
    if (prefs.origin !== 'all') bits.push('Preferred origin: ' + prefs.origin + '.');
    else bits.push('Origin: no strong preference.');
    if (prefs.wrapper !== 'all') bits.push('Preferred wrapper: ' + prefs.wrapper + '.');
    if (prefs.pairing) bits.push('Plans to pair it with: ' + prefs.pairing + '.');
    bits.push('Experience level: ' + prefs.experience + '.');
    if (prefs.timeOfDay && prefs.timeOfDay !== 'any') bits.push('Time of day: ' + prefs.timeOfDay + '.');
    var state = bits.join(' ');

    // Choice criteria built from real data.
    var wrapperCriteria = {};
    WRAPPER_FAMILIES.forEach(function (f) {
      wrapperCriteria[f] = f.charAt(0).toUpperCase() + f.slice(1) + ' wrapper';
    });
    wrapperCriteria['any'] = 'No wrapper preference';

    var originCriteria = {};
    COMMON_ORIGINS.forEach(function (o) { originCriteria[o] = o + ' tobacco'; });
    originCriteria['any'] = 'No origin preference';

    var questions = {
      wrapper: {
        type: 'choice',
        instructions: 'Which wrapper family best suits this cigar request? Pick "any" only if the user has no wrapper preference.',
        criteria: wrapperCriteria
      },
      origin: {
        type: 'choice',
        instructions: 'Which tobacco origin best suits this cigar request? Pick "any" only if the user has no origin preference.',
        criteria: originCriteria
      },
      strength: {
        type: 'choice',
        instructions: 'Which strength level best suits this cigar request?',
        criteria: {
          mild: 'Mild, light, easy on the palate',
          'mild-medium': 'Mild to medium, gentle complexity',
          medium: 'Medium body, balanced complexity',
          'medium-full': 'Medium-full, bold but not overpowering',
          full: 'Full, bold, intense'
        }
      },
      price_match: {
        type: 'score',
        instructions: 'How well does a cigar priced around the midpoint of the user\'s budget match what they want?',
        criteria: ['Way over budget', 'Slightly over', 'Right on budget', 'Great value', 'Steal']
      },
      pairing_fit: {
        type: 'noul',
        instructions: 'Does a cigar with creamy, cedar, and balanced flavors pair well with the user\'s stated pairing and occasion?',
        criteria: { yes: 'It pairs well', no: 'It does not pair well' }
      }
    };

    return callJev(state, questions).then(function (data) {
      var a = data.answers || {};
      var want = {
        wrapper: a.wrapper ? a.wrapper.choice : 'any',
        origin: a.origin ? a.origin.choice : 'any',
        strength: a.strength ? a.strength.choice : 'all',
        priceScore: a.price_match ? a.price_match.score : null,
        pairingFit: a.pairing_fit ? a.pairing_fit.noul : null
      };

      var pick = pickByAttributes(want, prefs);
      return {
        cigar: pick.cigar,
        attributes: want,
        fallback: pick.fallback,
        reason: pick.reason
      };
    }).catch(function (err) {
      console.warn('[VP_AI] recommendCigar Jev failed, using fallback:', err.message);
      var pick = fallbackRecommend(prefs);
      return {
        cigar: pick.cigar,
        attributes: { wrapper: 'any', origin: 'any', strength: 'all' },
        fallback: true,
        reason: 'AI unavailable — picked a top-rated cigar in your budget.'
      };
    });
  }

  // Local selection given Jev-chosen attributes.
  function pickByAttributes(want, prefs) {
    if (typeof CIGARS === 'undefined' || !CIGARS.length) {
      return { cigar: null, fallback: true, reason: 'No cigar data loaded.' };
    }

    var pool = CIGARS.filter(function (c) {
      return c.price >= prefs.priceMin && c.price <= prefs.priceMax;
    });
    if (!pool.length) pool = CIGARS.slice();

    function matchesAttr(c) {
      if (want.wrapper && want.wrapper !== 'any') {
        if (wrapperFamily(c.wrapper) !== want.wrapper) return false;
      }
      if (want.origin && want.origin !== 'any') {
        if (norm(c.origin) !== norm(want.origin)) return false;
      }
      if (want.strength && want.strength !== 'all') {
        if (strengthBand(c.strength) !== want.strength) return false;
      }
      return true;
    }

    var matched = pool.filter(matchesAttr);

    // Relax progressively if too strict.
    if (matched.length === 0) {
      matched = pool.filter(function (c) {
        if (want.origin !== 'any' && norm(c.origin) === norm(want.origin)) return true;
        if (want.wrapper !== 'any' && wrapperFamily(c.wrapper) === want.wrapper) return true;
        if (want.strength !== 'all' && strengthBand(c.strength) === want.strength) return true;
        return false;
      });
    }
    if (matched.length === 0) matched = pool.filter(function (c) { return c.rating >= 90; });
    if (matched.length === 0) matched = pool.slice();

    // Rank: rating first, then price proximity to budget midpoint,
    // then pairing/flavor overlap if the user named any.
    var mid = (prefs.priceMin + prefs.priceMax) / 2;
    function score(c) {
      var s = c.rating;
      s -= Math.abs(c.price - mid) * 0.2;
      if (prefs.flavors.length) {
        var cf = (c.flavors || []).map(norm);
        var hit = prefs.flavors.filter(function (f) {
          return cf.some(function (x) { return x.indexOf(norm(f)) >= 0 || norm(f).indexOf(x) >= 0; });
        }).length;
        s += hit * 3;
      }
      if (prefs.pairing) {
        var cp = (c.pairings || []).join(' ').toLowerCase();
        if (cp.indexOf(norm(prefs.pairing).split(' ')[0]) >= 0) s += 4;
      }
      return s;
    }
    matched.sort(function (a, b) { return score(b) - score(a); });

    return {
      cigar: matched[0],
      fallback: false,
      reason: 'Jev selected a ' + want.wrapper + ' / ' + want.origin +
              ' / ' + want.strength + ' cigar rated ' + matched[0].rating + '.'
    };
  }

  // Deterministic fallback when Jev is down.
  function fallbackRecommend(prefs) {
    var pool = (typeof CIGARS !== 'undefined' ? CIGARS : []).filter(function (c) {
      return c.price >= prefs.priceMin && c.price <= prefs.priceMax && c.rating >= 90;
    });
    if (!pool.length && typeof CIGARS !== 'undefined') pool = CIGARS.filter(function (c) { return c.rating >= 90; });
    if (!pool.length && typeof CIGARS !== 'undefined') pool = CIGARS.slice();
    if (!pool.length) return { cigar: null };
    pool.sort(function (a, b) { return b.rating - a.rating; });
    // small random offset within the top 8 for variety
    var top = pool.slice(0, Math.min(8, pool.length));
    return { cigar: top[Math.floor(Math.random() * top.length)] };
  }

  /* ══════════════════════════════════════════════════════════════
     2. scoreCigarMatch(cigar, userPrefs)
     --------------------------------------------------------------
     Scores a specific cigar against user prefs with Jev. Returns a
     0–100 numeric match score plus the per-dimension Jev answers.
     ══════════════════════════════════════════════════════════════ */
  function scoreCigarMatch(cigar, userPrefs) {
    userPrefs = userPrefs || {};
    if (!cigar) return Promise.resolve({ score: 0, fallback: true });

    var state = {
      cigar: {
        name: cigar.name, brand: cigar.brand, origin: cigar.origin,
        wrapper: cigar.wrapper, strength: strengthBand(cigar.strength),
        price: cigar.price, rating: cigar.rating,
        flavors: cigar.flavors || [], pairings: cigar.pairings || []
      },
      user: {
        strength: userPrefs.strength ? strengthBand(userPrefs.strength) : 'any',
        priceMin: userPrefs.priceMin != null ? userPrefs.priceMin : 0,
        priceMax: userPrefs.priceMax != null ? userPrefs.priceMax : 65,
        flavors: userPrefs.flavors || [],
        origin: userPrefs.origin || 'any',
        wrapper: userPrefs.wrapper || 'any',
        pairing: userPrefs.pairing || '',
        experience: userPrefs.experience || 'intermediate'
      }
    };

    var questions = {
      flavor_match: {
        type: 'score',
        instructions: 'How well do `cigar.flavors` match `user.flavors`? If the user listed no flavor preferences, judge general appeal.',
        criteria: ['No overlap', 'Weak overlap', 'Some overlap', 'Strong overlap', 'Perfect match']
      },
      strength_match: {
        type: 'score',
        instructions: 'How well does `cigar.strength` fit the user\'s preferred strength (`user.strength`)? If "any", a balanced cigar scores well.',
        criteria: ['Very wrong', 'Off', 'Acceptable', 'Good fit', 'Ideal']
      },
      price_match: {
        type: 'score',
        instructions: 'How well does `cigar.price` fit the user\'s budget (`user.priceMin`–`user.priceMax`)?',
        criteria: ['Way over budget', 'Over', 'At the edge', 'In budget', 'Great value']
      },
      pairing_fit: {
        type: 'noul',
        instructions: 'Does `cigar.pairings` pair well with `user.pairing`? If the user named no pairing, answer yes for a versatile cigar.',
        criteria: { yes: 'It pairs well', no: 'It does not pair well' }
      }
    };

    return callJev(state, questions).then(function (data) {
      var a = data.answers || {};
      // Normalize each score (0..4) to 0..100-ish, weight them.
      var f = a.flavor_match ? a.flavor_match.score : 2;
      var s = a.strength_match ? a.strength_match.score : 2;
      var p = a.price_match ? a.price_match.score : 2;
      var pair = a.pairing_fit ? a.pairing_fit.noul : 0.5;

      var flavorPct = (f / 4) * 100;
      var strengthPct = (s / 4) * 100;
      var pricePct = (p / 4) * 100;
      var pairPct = pair * 100;

      var total = Math.round(
        flavorPct * 0.35 + strengthPct * 0.25 + pricePct * 0.25 + pairPct * 0.15
      );
      return {
        score: total,
        flavor: flavorPct, strength: strengthPct, price: pricePct, pairing: pairPct,
        raw: a, fallback: false
      };
    }).catch(function (err) {
      console.warn('[VP_AI] scoreCigarMatch Jev failed, using local heuristic:', err.message);
      return { score: localScore(cigar, userPrefs), fallback: true };
    });
  }

  // Fast local match score (fallback + used to pre-rank).
  function localScore(cigar, prefs) {
    var score = 0;
    // price
    if (cigar.price >= (prefs.priceMin || 0) && cigar.price <= (prefs.priceMax || 65)) score += 25;
    else score += Math.max(0, 25 - Math.abs(cigar.price - (prefs.priceMax || 65)) * 0.6);
    // strength
    if (prefs.strength && prefs.strength !== 'all') {
      if (strengthBand(cigar.strength) === strengthBand(prefs.strength)) score += 25;
      else score += 10;
    } else score += 18;
    // flavors
    if (prefs.flavors && prefs.flavors.length) {
      var cf = (cigar.flavors || []).map(norm);
      var hit = prefs.flavors.filter(function (f) {
        return cf.some(function (x) { return x.indexOf(norm(f)) >= 0 || norm(f).indexOf(x) >= 0; });
      }).length;
      score += Math.min(25, hit * 8);
    } else score += 15;
    // pairing
    if (prefs.pairing) {
      var cp = (cigar.pairings || []).join(' ').toLowerCase();
      if (cp.indexOf(norm(prefs.pairing).split(' ')[0]) >= 0) score += 25;
      else score += 8;
    } else score += 15;
    // rating bonus
    score += Math.max(0, (cigar.rating - 90) * 0.5);
    return Math.round(Math.min(100, score));
  }

  /* ══════════════════════════════════════════════════════════════
     3. rerankResults(cigars, query)
     --------------------------------------------------------------
     Reranks a small candidate list by semantic relevance to a
     natural-language query, using one Jev score question per
     candidate. Caps input at 12 candidates to keep the call cheap.
     Returns an array of { cigar, score } sorted desc.
     ══════════════════════════════════════════════════════════════ */
  function rerankResults(cigars, query) {
    cigars = cigars || [];
    if (!cigars.length || !query) {
      return Promise.resolve(cigars.map(function (c) { return { cigar: c, score: 0, fallback: true }; }));
    }
    var capped = cigars.slice(0, 12);

    var state = {
      query: query,
      candidates: capped.map(function (c, i) {
        return {
          i: i,
          name: c.name,
          brand: c.brand,
          origin: c.origin,
          wrapper: c.wrapper,
          strength: strengthBand(c.strength),
          price: c.price,
          rating: c.rating,
          flavors: c.flavors || [],
          pairings: c.pairings || []
        };
      })
    };

    var questions = {};
    capped.forEach(function (c, i) {
      questions['rel_' + i] = {
        type: 'score',
        instructions: 'How relevant is `candidates[' + i + ']` to `query`? Consider flavor, strength, price, origin, wrapper, and pairing cues in the query.',
        criteria: ['Irrelevant', 'Weak', 'Related', 'Strong match', 'Exact match']
      };
    });

    return callJev(state, questions).then(function (data) {
      var a = data.answers || {};
      var scored = capped.map(function (c, i) {
        var ans = a['rel_' + i];
        var sc = ans ? ans.score : 0;
        return { cigar: c, score: (sc / 4) * 100, confidence: ans ? ans.confidence : null };
      });
      scored.sort(function (x, y) { return y.score - x.score; });
      return scored;
    }).catch(function (err) {
      console.warn('[VP_AI] rerankResults Jev failed, using local ranking:', err.message);
      var scored = capped.map(function (c) {
        return { cigar: c, score: localScore(c, { flavors: [query], pairing: query }), fallback: true };
      });
      scored.sort(function (x, y) { return y.score - x.score; });
      return scored;
    });
  }

  /* ══════════════════════════════════════════════════════════════
     4. moderateMessage(text)
     --------------------------------------------------------------
     Noul-based spam / toxicity / off-topic check for lounge chat.
     Returns { flagged, spam, toxic, safe, reason }.
     flagged = true when the message should be blocked.
     ══════════════════════════════════════════════════════════════ */
  function moderateMessage(text) {
    if (!text || !text.trim()) return Promise.resolve({ flagged: false, reason: 'empty' });

    var state = { message: text, context: 'A cigar enthusiast lounge chat. Cigars, pipe tobacco, pairings, and friendly banter are on-topic. Spam, scams, abuse, and illegal solicitation are not.' };
    var questions = {
      is_spam: {
        type: 'noul',
        instructions: 'Is `message` spam? (repeated promotion, unsolicited links, scam/bait, copy-paste marketing)',
        criteria: { yes: 'It is spam', no: 'It is not spam' }
      },
      is_toxic: {
        type: 'noul',
        instructions: 'Is `message` toxic, harassing, hateful, or abusive toward a person or group?',
        criteria: { yes: 'It is toxic', no: 'It is not toxic' }
      },
      is_safe: {
        type: 'noul',
        instructions: 'Is `message` safe and appropriate to post in the lounge? (on-topic cigar talk or friendly chat)',
        criteria: { yes: 'Safe to post', no: 'Not safe to post' }
      }
    };

    return callJev(state, questions).then(function (data) {
      var a = data.answers || {};
      var spam = a.is_spam ? a.is_spam.noul : 0;
      var toxic = a.is_toxic ? a.is_toxic.noul : 0;
      var safe = a.is_safe ? a.is_safe.noul : 1;
      var flagged = spam > 0.6 || toxic > 0.6 || safe < 0.35;
      var reason;
      if (flagged) {
        if (toxic > 0.6) reason = 'Flagged as toxic or abusive.';
        else if (spam > 0.6) reason = 'Flagged as spam.';
        else reason = 'Flagged as not appropriate for the lounge.';
      } else {
        reason = 'OK';
      }
      return { flagged: flagged, spam: spam, toxic: toxic, safe: safe, reason: reason, fallback: false };
    }).catch(function (err) {
      console.warn('[VP_AI] moderateMessage Jev failed, deferring to local blocklist:', err.message);
      // Defer to the existing MODERATION blocklist — never silently allow.
      var blocked = (typeof MODERATION !== 'undefined' && MODERATION.isBlocked && MODERATION.isBlocked(text));
      return {
        flagged: blocked, spam: blocked ? 1 : 0, toxic: 0, safe: blocked ? 0 : 1,
        reason: blocked ? 'Matched local blocklist.' : 'OK (local)', fallback: true
      };
    });
  }

  /* ══════════════════════════════════════════════════════════════
     5. smartSearch(query, cigars)
     --------------------------------------------------------------
     Natural-language cigar search. First narrows the library with a
     fast local keyword filter, then reranks the top candidates with
     Jev for semantic relevance. Returns an ordered array of cigar
     objects (best first), plus a flag if Jev was used.
     ══════════════════════════════════════════════════════════════ */
  function smartSearch(query, cigars) {
    cigars = cigars || (typeof CIGARS !== 'undefined' ? CIGARS : []);
    if (!cigars.length || !query || !query.trim()) {
      return Promise.resolve({ cigars: [], usedAI: false });
    }
    var q = query.trim();

    // Stage 1: local keyword narrowing — full blob substring + token OR.
    var nq = norm(q);
    var tokens = nq.split(/\s+/).filter(function (t) { return t.length > 2; });
    var scored = cigars.map(function (c) {
      var blob = norm([
        c.name, c.brand, c.origin, c.region, c.wrapper, c.size,
        (c.flavors || []).join(' '), (c.pairings || []).join(' ')
      ].join(' '));
      var sc = 0;
      if (blob.indexOf(nq) >= 0) sc += 50;
      tokens.forEach(function (t) { if (blob.indexOf(t) >= 0) sc += 5; });
      // cheap price cue: "under $15"
      var pm = nq.match(/under\s*\$?(\d+)/);
      if (pm && c.price <= parseFloat(pm[1])) sc += 8;
      return { cigar: c, sc: sc };
    }).filter(function (x) { return x.sc > 0; });
    scored.sort(function (a, b) { return b.sc - a.sc; });

    // If local found nothing broad enough, fall back to rating-sorted pool
    // so Jev still has something to rerank.
    var candidates;
    if (scored.length === 0) {
      candidates = cigars.slice().sort(function (a, b) { return b.rating - a.rating; }).slice(0, 12);
    } else {
      candidates = scored.slice(0, 12).map(function (x) { return x.cigar; });
    }

    // Stage 2: Jev rerank.
    return rerankResults(candidates, q).then(function (ranked) {
      var order = ranked.map(function (r) { return r.cigar; });
      return { cigars: order, usedAI: true, scores: ranked };
    }).catch(function () {
      // rerankResults already falls back internally, but guard the chain.
      return { cigars: candidates, usedAI: false };
    });
  }

  /* ══════════════════════════════════════════════════════════════
     Expose the engine on window.VP_AI
     ══════════════════════════════════════════════════════════════ */
  window.VP_AI = {
    recommendCigar: recommendCigar,
    scoreCigarMatch: scoreCigarMatch,
    rerankResults: rerankResults,
    moderateMessage: moderateMessage,
    smartSearch: smartSearch,
    callJev: callJev
  };
})();
