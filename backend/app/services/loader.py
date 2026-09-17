"""Loader for synthetic JSON data."""
import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[3] / "data"

def _load(name: str):
    with open(DATA_DIR / name, encoding="utf-8") as f:
        return json.load(f)

def load_all():
    return {"facilities": _load("facilities.json"), "medicines": _load("medicines.json"),
            "suppliers": _load("suppliers.json"), "inventory": _load("inventory.json"),
            "network": _load("network.json")}
