"""Lightweight ML demand forecasting.

RandomForestRegressor on synthetic historical consumption. This module ONLY
predicts near-term daily demand. It NEVER sets risk scores, NEVER propagates
cascades, NEVER chooses interventions — the deterministic engines do that.

Trains lazily on first use (sub-second on this dataset) and degrades to a
genuine naive baseline if sklearn is unavailable. Never raises to callers.
"""
from __future__ import annotations
import json
import numpy as np
import pandas as pd
from .loader import DATA_DIR

TEST_DAYS = 7
HORIZON_DEFAULT = 7

_history = None
_service = None

def load_history() -> dict:
    global _history
    if _history is None:
        with open(DATA_DIR / "historical_consumption.json", encoding="utf-8") as f:
            _history = json.load(f)
    return _history

def _frame(history: dict) -> pd.DataFrame:
    rows = []
    fac_codes = {fid: i for i, fid in enumerate(sorted({x["facility_id"] for x in history["series"]}))}
    med_codes = {mid: i for i, mid in enumerate(sorted({x["medicine_id"] for x in history["series"]}))}
    for s in history["series"]:
        y = np.asarray(s["daily"], dtype=float)
        n = len(y)
        for t in range(14, n):
            w7, w14 = y[t - 7:t], y[t - 14:t]
            slope = float(np.polyfit(np.arange(14), w14, 1)[0])
            rows.append({"fac": s["facility_id"], "med": s["medicine_id"], "t": t,
                         "avg7": float(w7.mean()), "avg14": float(w14.mean()),
                         "slope14": slope, "dow": t % 7,
                         "fac_code": fac_codes[s["facility_id"]],
                         "med_code": med_codes[s["medicine_id"]],
                         "last": float(y[t - 1]), "y": float(y[t])})
    df = pd.DataFrame(rows)
    df.attrs["codes"] = (fac_codes, med_codes)
    return df

FEATURES = ["avg7", "avg14", "slope14", "dow", "fac_code", "med_code", "last"]

def _naive_mae(test: pd.DataFrame) -> float:
    return float(np.abs(test["y"].to_numpy() - test["avg7"].to_numpy()).mean())

def get_service() -> dict:
    """Train once, cache. Always returns a usable service dict."""
    global _service
    if _service is not None:
        return _service
    history = load_history()
    df = _frame(history)
    n_by_pair = df.groupby(["fac", "med"])["t"].max().to_dict()
    is_test = df.apply(lambda r: r["t"] > n_by_pair[(r["fac"], r["med"])] - TEST_DAYS, axis=1)
    train, test = df[~is_test], df[is_test]
    naive_mae = _naive_mae(test)
    try:
        from sklearn.ensemble import RandomForestRegressor
        from sklearn.metrics import mean_absolute_error
        model = RandomForestRegressor(n_estimators=100, random_state=7, n_jobs=1)
        model.fit(train[FEATURES].to_numpy(), train["y"].to_numpy())
        mae = float(mean_absolute_error(test["y"].to_numpy(), model.predict(test[FEATURES].to_numpy())))
        _service = {"model": model, "model_name": "RandomForestRegressor(100 trees)",
                    "mae": round(mae, 2), "naive_mae": round(naive_mae, 2),
                    "n_train": int(len(train)), "n_test": int(len(test))}
    except Exception as exc:  # sklearn missing/broken → genuine naive fallback
        _service = {"model": None, "model_name": f"naive-fallback (ML unavailable: {exc})",
                    "mae": round(naive_mae, 2), "naive_mae": round(naive_mae, 2),
                    "n_train": int(len(train)), "n_test": int(len(test))}
    tails = {}
    hist_len = 0
    for s in history["series"]:
        tails[(s["facility_id"], s["medicine_id"])] = [float(v) for v in s["daily"][-14:]]
        hist_len = max(hist_len, len(s["daily"]))
    _service["tails"] = tails
    _service["history_len"] = hist_len
    _service["codes"] = df.attrs["codes"]
    return _service

def predict_pair(facility_id: str, medicine_id: str, horizon: int = HORIZON_DEFAULT) -> dict:
    svc = get_service()
    fac_codes, med_codes = svc["codes"]
    hist = list(svc["tails"].get((facility_id, medicine_id), []))
    if not hist:
        raise ValueError("unknown facility/medicine pair")
    horizon = max(1, min(int(horizon), 14))
    daily: list[float] = []
    window = list(hist)
    t0 = int(svc.get("history_len", 45))  # day-of-week continues past history end
    for h in range(horizon):
        w7, w14 = np.array(window[-7:]), np.array(window[-14:])
        slope = float(np.polyfit(np.arange(14), w14, 1)[0])
        if svc["model"] is not None:
            x = np.array([[w7.mean(), w14.mean(), slope, (t0 + h) % 7,
                           fac_codes[facility_id], med_codes[medicine_id], window[-1]]])
            pred = float(svc["model"].predict(x)[0])
        else:
            pred = float(w14.mean())
        pred = max(1.0, pred)
        daily.append(round(pred, 1))
        window.append(pred)
    return {"daily": daily, "predicted_daily": round(float(np.mean(daily)), 1),
            "mae": svc["mae"], "naive_mae": svc["naive_mae"], "model": svc["model_name"],
            "n_train": svc["n_train"], "n_test": svc["n_test"]}
