#!/usr/bin/env python3
"""Refresh vendored FPL data snapshots in data/.

Fetches the public FPL API (server-side, so no CORS issue) and writes
trimmed JS files that assign browser globals, loaded via <script> tags.

Usage: python3 scripts/refresh_data.py
"""
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

API = "https://fantasy.premierleague.com/api"
HEADERS = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) fantasy-planner-app data refresh"}
DATA_DIR = Path(__file__).resolve().parent.parent / "data"

PLAYER_FIELDS = [
    "id", "web_name", "first_name", "second_name", "team", "element_type",
    "now_cost", "total_points", "points_per_game", "form", "ep_next",
    "selected_by_percent", "minutes", "starts", "goals_scored", "assists",
    "clean_sheets", "goals_conceded", "saves", "bonus", "bps",
    "expected_goals", "expected_assists", "expected_goal_involvements",
    "expected_goals_conceded", "ict_index", "status", "news",
    "chance_of_playing_next_round",
]
TEAM_FIELDS = ["id", "code", "name", "short_name"]
EVENT_FIELDS = ["id", "name", "deadline_time", "finished", "is_current", "is_next"]
FIXTURE_FIELDS = [
    "id", "event", "kickoff_time", "team_h", "team_a",
    "team_h_difficulty", "team_a_difficulty", "team_h_score", "team_a_score",
    "finished",
]


def fetch(path):
    req = urllib.request.Request(f"{API}/{path}", headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def trim(rows, fields):
    return [{k: row.get(k) for k in fields} for row in rows]


def write_global(filename, global_name, payload):
    path = DATA_DIR / filename
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    path.write_text(f"var {global_name} = {body};\n", encoding="utf-8")
    print(f"wrote {path} ({path.stat().st_size // 1024} KB)")


def main():
    DATA_DIR.mkdir(exist_ok=True)
    bootstrap = fetch("bootstrap-static/")
    fixtures = fetch("fixtures/")

    write_global("players.js", "FPL_PLAYERS", trim(bootstrap["elements"], PLAYER_FIELDS))
    write_global("teams.js", "FPL_TEAMS", trim(bootstrap["teams"], TEAM_FIELDS))
    write_global("events.js", "FPL_EVENTS", trim(bootstrap["events"], EVENT_FIELDS))
    write_global("fixtures.js", "FPL_FIXTURES", trim(fixtures, FIXTURE_FIELDS))
    write_global("meta.js", "FPL_META", {
        "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "total_players": bootstrap["total_players"],
    })


if __name__ == "__main__":
    main()
