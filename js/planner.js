// Multi-gameweek planner: transfer suggestions and chip advice across a
// horizon of upcoming gameweeks. Pure logic, no DOM — fixtures are passed in.
//
// Model (documented in README): 1 free transfer per week, no point hits,
// players bought/sold at current price. Each week the single swap that most
// improves the squad's summed score over the REMAINING horizon is suggested
// (only if it clears MIN_GAIN — otherwise hold and bank the transfer).
const Planner = {
  DEFAULT_HORIZON: 3,
  MIN_GAIN: 3,       // composite-score points a swap must add to be worth it
  CANDIDATES_PER_POSITION: 40,

  gwFixtures(allFixtures, gw) {
    return allFixtures.filter(f => f.event === gw);
  },

  // Sum of a player's gameweek scores across the given gameweeks.
  horizonScore(p, stats, allFixtures, gws) {
    return gws.reduce(
      (sum, gw) => sum + Scoring.gwScore(p, stats, this.gwFixtures(allFixtures, gw)).total, 0);
  },

  // Prune the market to the strongest players per position (by base score)
  // so transfer search stays fast.
  candidatesByPosition(allPlayers, stats) {
    const byPos = { 1: [], 2: [], 3: [], 4: [] };
    allPlayers.forEach(p => {
      if (!Scoring.UNAVAILABLE_STATUSES[p.status]) byPos[p.element_type].push(p);
    });
    Object.keys(byPos).forEach(k => {
      byPos[k].sort((a, b) => Scoring.baseScore(b, stats) - Scoring.baseScore(a, stats));
      byPos[k] = byPos[k].slice(0, this.CANDIDATES_PER_POSITION);
    });
    return byPos;
  },

  // Best single same-position swap for the remaining horizon, respecting
  // budget (bank + sale price) and the 3-per-club limit. Null if no legal
  // swap improves the squad.
  bestTransfer(squad, bank, stats, allFixtures, gws, candidates) {
    const squadIds = new Set(squad.map(p => p.id));
    let best = null;
    for (const out of squad) {
      const budget = bank + out.now_cost;
      const clubCounts = Rules.countByClub(squad.filter(p => p.id !== out.id));
      const outScore = this.horizonScore(out, stats, allFixtures, gws);
      for (const cand of candidates[out.element_type]) {
        if (squadIds.has(cand.id)) continue;
        if (cand.now_cost > budget) continue;
        if ((clubCounts[cand.team] || 0) >= Rules.MAX_PER_CLUB) continue;
        const gain = this.horizonScore(cand, stats, allFixtures, gws) - outScore;
        if (gain > 0 && (!best || gain > best.gain)) best = { out, in: cand, gain };
      }
    }
    return best;
  },

  // Walk the horizon week by week: suggest a transfer, apply it, pick the
  // best XI for that week's fixtures with the updated squad.
  plan(squad, allPlayers, stats, allFixtures, startGw, horizon) {
    const gws = [];
    for (let g = startGw; g < startGw + horizon && g <= 38; g++) gws.push(g);
    const candidates = this.candidatesByPosition(allPlayers, stats);
    let current = [...squad];
    let bank = Rules.BUDGET - Rules.cost(squad);
    const weeks = [];

    gws.forEach((gw, i) => {
      const remaining = gws.slice(i);
      let transfer = null;
      const suggestion = this.bestTransfer(current, bank, stats, allFixtures, remaining, candidates);
      if (suggestion && suggestion.gain >= this.MIN_GAIN) {
        current = current.map(p => (p.id === suggestion.out.id ? suggestion.in : p));
        bank += suggestion.out.now_cost - suggestion.in.now_cost;
        transfer = suggestion;
      }
      const xi = Scoring.bestXI(current, stats, this.gwFixtures(allFixtures, gw));
      const benchTotal = xi ? xi.bench.reduce((s, b) => s + b.score.total, 0) : 0;
      weeks.push({ gw, transfer, xi, benchTotal, squad: [...current], bank });
    });

    return { weeks, chips: this.chipAdvice(weeks) };
  },

  // Within the planned window: Triple Captain -> week with the strongest
  // captain; Bench Boost -> week with the strongest bench; Free Hit -> only
  // flagged when one week is dramatically weaker than the window's best
  // (blanks or a wall of hard fixtures).
  FH_THRESHOLD: 0.85,
  chipAdvice(weeks) {
    const valid = weeks.filter(w => w.xi);
    if (!valid.length) return null;
    const tripleCaptain = valid.reduce((a, b) =>
      (b.xi.captain.score.total > a.xi.captain.score.total ? b : a));
    const benchBoost = valid.reduce((a, b) => (b.benchTotal > a.benchTotal ? b : a));
    const maxTotal = Math.max(...valid.map(w => w.xi.total));
    const weakest = valid.reduce((a, b) => (b.xi.total < a.xi.total ? b : a));
    const freeHit = weakest.xi.total < this.FH_THRESHOLD * maxTotal ? weakest : null;
    return { tripleCaptain, benchBoost, freeHit };
  },
};
