# Architecture

- `data/*.json` — single synthetic source of truth (also mirrored in `frontend/src/data/synthetic.ts`).
- `backend/app/main.py` — FastAPI routes: GET facilities/medicines/suppliers/network/risks/alerts, POST simulate/intervention/reset.
- `backend/app/services/risk.py` — deterministic risk formula (must stay in sync with `frontend/src/services/localEngine.ts`).
- `backend/app/services/cascade.py` — NetworkX graph, downstream reachability, regional exposure, timeline, alerts, surplus, interventions.
- `frontend/src/services/api.ts` — tries API with timeout, falls back to local engine; returns `engine: "api"|"local"`.
- `frontend/src/network/CascadeGraph.tsx` — React Flow hero visualization.
- `frontend/src/App.tsx` — tabbed dashboard (Overview/Network/Shortages/Simulator/Interventions/Alerts).
- Parity test vector: Supplier Alpha +7d → Hospital A score 65/high, regional High 42.9 — identical in both engines (verified).
- ML forecasting (`forecast.py`, `GET /api/forecast`, `ForecastPanel.tsx`): RandomForest on
  `data/historical_consumption.json` (mirrored in `frontend/src/data/history.ts`).
  Predicts demand only; feeds forecast-coverage display, never risk/cascade/interventions.
  Measured MAE 36.95 vs naive 46.62 (240 train / 70 test). Endpoint degrades gracefully;
  frontend falls back to an offline trend estimate. Demo never depends on it.
