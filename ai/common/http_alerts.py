"""POST /api/v1/alerts (contrat §3.2/§4.3) — partagé par vision/ et predictive/.

Les deux scripts IA publient des alertes de forme différente (INTRUDER vs ANOMALY), mais
le transport HTTP (URL, en-tête, erreurs) est identique : cette fonction factorise ça,
chaque script garde sa propre logique d'anti-rafale et de construction du payload.
"""

from __future__ import annotations

import requests


def post_alert(api_url: str, ingest_token: str, payload: dict, timeout: float = 3.0) -> None:
    """Lève `requests.RequestException` sur échec réseau/HTTP. À appeler depuis un thread
    d'arrière-plan : ne doit jamais bloquer une boucle de capture ou de notation."""
    response = requests.post(
        f"{api_url}/alerts",
        json=payload,
        headers={"Authorization": f"Bearer {ingest_token}"},
        timeout=timeout,
    )
    response.raise_for_status()
