// localStorage persistence for the squad (player ids only; data files are
// the source of truth for player details).
const Storage = {
  KEY: 'fantasyplanner.squad',

  saveSquad(squad) {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(squad.map(p => p.id)));
    } catch (e) { /* private mode etc. — non-fatal */ }
  },

  loadSquad(allPlayers) {
    try {
      const ids = JSON.parse(localStorage.getItem(this.KEY) || '[]');
      const byId = new Map(allPlayers.map(p => [p.id, p]));
      return ids.map(id => byId.get(id)).filter(Boolean);
    } catch (e) {
      return [];
    }
  },

  clear() {
    try { localStorage.removeItem(this.KEY); } catch (e) { /* non-fatal */ }
  },
};
