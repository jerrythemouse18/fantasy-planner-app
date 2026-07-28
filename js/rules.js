// FPL squad rules and validation. Pure logic, no DOM.
const Rules = {
  BUDGET: 1000, // tenths of £m
  SQUAD_SIZE: 15,
  MAX_PER_CLUB: 3,
  // element_type -> squad slots
  SQUAD_COMPOSITION: { 1: 2, 2: 5, 3: 5, 4: 3 },
  // starting XI min/max per position
  XI_LIMITS: { 1: [1, 1], 2: [3, 5], 3: [2, 5], 4: [1, 3] },
  POSITION_NAMES: { 1: 'GKP', 2: 'DEF', 3: 'MID', 4: 'FWD' },

  cost(players) {
    return players.reduce((sum, p) => sum + p.now_cost, 0);
  },

  countByPosition(players) {
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
    players.forEach(p => { counts[p.element_type]++; });
    return counts;
  },

  countByClub(players) {
    const counts = {};
    players.forEach(p => { counts[p.team] = (counts[p.team] || 0) + 1; });
    return counts;
  },

  // Can `player` be added to the current (possibly partial) squad?
  // Returns { ok: true } or { ok: false, reason }.
  canAdd(squad, player) {
    if (squad.some(p => p.id === player.id)) {
      return { ok: false, reason: 'Already in squad' };
    }
    if (squad.length >= this.SQUAD_SIZE) {
      return { ok: false, reason: 'Squad is full (15 players)' };
    }
    const posCount = this.countByPosition(squad)[player.element_type];
    const posLimit = this.SQUAD_COMPOSITION[player.element_type];
    if (posCount >= posLimit) {
      return { ok: false, reason: `Already have ${posLimit} ${this.POSITION_NAMES[player.element_type]}` };
    }
    const clubCount = this.countByClub(squad)[player.team] || 0;
    if (clubCount >= this.MAX_PER_CLUB) {
      return { ok: false, reason: 'Max 3 players per club' };
    }
    if (this.cost(squad) + player.now_cost > this.BUDGET) {
      return { ok: false, reason: 'Over £100.0m budget' };
    }
    return { ok: true };
  },

  // Full-squad validation (for completeness checks / tests).
  validateSquad(squad) {
    const errors = [];
    if (squad.length !== this.SQUAD_SIZE) errors.push(`Need 15 players, have ${squad.length}`);
    const pos = this.countByPosition(squad);
    for (const [type, want] of Object.entries(this.SQUAD_COMPOSITION)) {
      if (pos[type] !== want) errors.push(`Need ${want} ${this.POSITION_NAMES[type]}, have ${pos[type]}`);
    }
    const clubs = this.countByClub(squad);
    for (const [team, n] of Object.entries(clubs)) {
      if (n > this.MAX_PER_CLUB) errors.push(`More than 3 players from team ${team}`);
    }
    if (this.cost(squad) > this.BUDGET) errors.push('Over budget');
    const ids = new Set(squad.map(p => p.id));
    if (ids.size !== squad.length) errors.push('Duplicate players');
    return { ok: errors.length === 0, errors };
  },

  formatPrice(tenths) {
    return '£' + (tenths / 10).toFixed(1) + 'm';
  },
};
