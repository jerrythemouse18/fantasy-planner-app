// Composite player score and best-XI selection. Pure logic, no DOM.
//
// Composite score blends normalised FPL metrics, then adjusts for the
// gameweek's fixture difficulty. Weights are documented in README.md.
const Scoring = {
  WEIGHTS: {
    form: 0.30,          // FPL form (avg points over last 30 days)
    pointsPerGame: 0.25, // sustained output
    xInvolvement: 0.20,  // expected goal involvements per start
    ict: 0.15,           // FPL's influence/creativity/threat index
    minutes: 0.10,       // minutes reliability (share of possible minutes)
  },
  // FDR multipliers: fixture difficulty 2 (easiest seen) .. 5 (hardest).
  FDR_MULTIPLIER: { 1: 1.20, 2: 1.10, 3: 1.00, 4: 0.85, 5: 0.70 },
  UNAVAILABLE_STATUSES: { i: 'Injured', s: 'Suspended', u: 'Unavailable' },

  // Normalise a raw value against the population max (0 guard included).
  norm(value, max) {
    return max > 0 ? Math.max(0, value) / max : 0;
  },

  // Precompute population maxima once per dataset for normalisation.
  populationStats(players) {
    const maxOf = fn => Math.max(...players.map(fn), 0.0001);
    return {
      form: maxOf(p => parseFloat(p.form) || 0),
      ppg: maxOf(p => parseFloat(p.points_per_game) || 0),
      xgiPerStart: maxOf(p => this.xgiPerStart(p)),
      ict: maxOf(p => parseFloat(p.ict_index) || 0),
      minutes: maxOf(p => p.minutes || 0),
    };
  },

  xgiPerStart(p) {
    const xgi = parseFloat(p.expected_goal_involvements) || 0;
    return p.starts > 0 ? xgi / p.starts : 0;
  },

  // Base score 0-100 from metrics alone (no fixture context).
  baseScore(p, stats) {
    const w = this.WEIGHTS;
    const s =
      w.form * this.norm(parseFloat(p.form) || 0, stats.form) +
      w.pointsPerGame * this.norm(parseFloat(p.points_per_game) || 0, stats.ppg) +
      w.xInvolvement * this.norm(this.xgiPerStart(p), stats.xgiPerStart) +
      w.ict * this.norm(parseFloat(p.ict_index) || 0, stats.ict) +
      w.minutes * this.norm(p.minutes || 0, stats.minutes);
    return s * 100;
  },

  // Average FDR multiplier across a player's fixtures in the gameweek.
  // No fixture (blank GW) -> 0. Double GW -> boosted by summing.
  fixtureMultiplier(p, gwFixtures) {
    const mine = gwFixtures.filter(f => f.team_h === p.team || f.team_a === p.team);
    if (mine.length === 0) return 0;
    return mine.reduce((sum, f) => {
      const fdr = f.team_h === p.team ? f.team_h_difficulty : f.team_a_difficulty;
      return sum + (this.FDR_MULTIPLIER[fdr] || 1.0);
    }, 0);
  },

  availabilityPenalty(p) {
    if (this.UNAVAILABLE_STATUSES[p.status]) return 0;
    if (p.status === 'd') {
      const chance = p.chance_of_playing_next_round;
      return chance == null ? 0.75 : chance / 100;
    }
    return 1;
  },

  // Gameweek score with per-factor breakdown for transparent display.
  gwScore(p, stats, gwFixtures) {
    const base = this.baseScore(p, stats);
    const fixture = this.fixtureMultiplier(p, gwFixtures);
    const availability = this.availabilityPenalty(p);
    return {
      total: base * fixture * availability,
      base, fixture, availability,
    };
  },

  // Pick the best valid starting XI from a 15-player squad for a gameweek.
  // Greedy over formations: for each valid formation, take the top-scoring
  // players per position; keep the highest-total formation.
  bestXI(squad, stats, gwFixtures) {
    const scored = squad.map(p => ({ player: p, score: this.gwScore(p, stats, gwFixtures) }));
    const byPos = { 1: [], 2: [], 3: [], 4: [] };
    scored.forEach(s => byPos[s.player.element_type].push(s));
    Object.values(byPos).forEach(list => list.sort((a, b) => b.score.total - a.score.total));

    let best = null;
    for (let def = 3; def <= 5; def++) {
      for (let mid = 2; mid <= 5; mid++) {
        const fwd = 10 - def - mid;
        if (fwd < 1 || fwd > 3) continue;
        if (byPos[2].length < def || byPos[3].length < mid || byPos[4].length < fwd) continue;
        if (byPos[1].length < 1) continue;
        const xi = [
          byPos[1][0],
          ...byPos[2].slice(0, def),
          ...byPos[3].slice(0, mid),
          ...byPos[4].slice(0, fwd),
        ];
        const total = xi.reduce((sum, s) => sum + s.score.total, 0);
        if (!best || total > best.total) {
          best = { xi, total, formation: `${def}-${mid}-${fwd}` };
        }
      }
    }
    if (!best) return null;
    const xiIds = new Set(best.xi.map(s => s.player.id));
    best.bench = scored
      .filter(s => !xiIds.has(s.player.id))
      .sort((a, b) => b.score.total - a.score.total);
    best.captain = best.xi.reduce((top, s) => (s.score.total > top.score.total ? s : top), best.xi[0]);
    return best;
  },
};
