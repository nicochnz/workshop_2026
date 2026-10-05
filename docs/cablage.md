# Câblage — Boîtier SX-003

> Carte : **NodeMCU V3** (ESP8266 ESP-12E, variante LoLin). **Proposition à valider** avant fixation.
> Ce document sert au firmware (`/firmware`) et au schéma de câblage du dossier technique.

## Brochage

| Composant                 | Broche composant | NodeMCU | GPIO | Alim       | Remarque                                   |
|---------------------------|------------------|---------|------|------------|--------------------------------------------|
| OLED 0.96" I2C (4 broches)| SCL              | D1      | 5    | 3V3        | SSD1306, adresse I2C `0x3C`                |
| OLED 0.96" I2C (4 broches)| SDA              | D2      | 4    | 3V3        |                                            |
| DHT11 (temp. + humidité)  | DATA             | D5      | 14   | 3V3        | Pull-up 10 kΩ (souvent intégrée au module) |
| Ultrason (HC-SR04)        | ECHO             | D6      | 12   | VU (5V)    | **Pont diviseur obligatoire**, voir ci-dessous |
| Ultrason (HC-SR04)        | TRIG             | D3      | 0    | —          | Sortie uniquement, sans effet sur le boot  |
| Buzzer                    | +                | D7      | 13   | —          | Via transistor NPN si > 12 mA              |
| LED rouge                 | anode (+ 220 Ω)  | D0      | 16   | —          | Sortie uniquement                          |
| LED verte                 | anode (+ 220 Ω)  | D8      | 15   | —          | Sortie OK (LED vers GND = tirage bas)      |
| Module MQ (gaz)           | AO               | A0      | ADC  | VU (5V)    | **Pont diviseur obligatoire**, voir ci-dessous |

Toutes les masses (GND) sont communes. Sur le NodeMCU V3, la broche **VU** fournit le 5 V de l'USB.

Broches restantes : D4 (LED intégrée, à laisser libre), RX/TX (port série de débogage).

## Points d'attention

- **Broches de démarrage** : D3 (GPIO0) et D4 (GPIO2) doivent être à l'état haut et D8 (GPIO15)
  à l'état bas au démarrage. Aucune entrée dessus. TRIG sur D3 est sans risque (l'entrée TRIG du
  HC-SR04 ne tire pas la broche), une LED vers GND sur D8 la maintient bas.
- **ECHO du HC-SR04 en 5 V** : l'ESP8266 accepte **3,3 V max** sur ses broches.
  Pont diviseur entre ECHO et D6 : 1 kΩ en série, 2 kΩ entre D6 et GND (5 V × 2/3 ≈ 3,3 V).
- **Module MQ sur A0** : sa sortie AO monte jusqu'à ~5 V. Pont diviseur 10 kΩ / 20 kΩ
  (10 kΩ entre AO et A0, 20 kΩ entre A0 et GND). La sortie DO du module n'est pas utilisée.
- **MQ chauffe** : valeurs instables ~2 min après la mise sous tension. Calibrer `GAS_WARN` /
  `GAS_CRIT` (contrat §3.2) après cette chauffe.
- **Ultrason** : portée 2 → 400 cm, lecture au plus toutes les 60 ms. Calibrer `PRESENCE_CM`
  une fois le boîtier en place.
- **DHT11** : 0 → 50 °C (±2 °C), 20 → 90 % d'humidité (±5 %), une lecture par seconde max.
  Le firmware le lit toutes les 2 s.
- **Buzzer** : une broche ESP fournit ~12 mA. Un buzzer qui consomme plus doit passer par un
  transistor NPN (2N2222 + 1 kΩ sur la base). **Pas sur D3/D4** : la base du transistor
  tirerait la broche vers le bas au démarrage.

## Matériel non utilisé

- **Arduino Mega ADK** : inutile, l'ESP8266 fait tout et a le Wi-Fi.
- **Capteur lumineux** : l'ESP8266 n'a qu'une entrée analogique (A0), prise par le capteur de gaz.
  Utilisable seulement s'il a une sortie numérique (DO) ; non prévu au contrat.

## À confirmer

- Modèle exact du **module MQ** (MQ-2, MQ-135… écrit sur le capteur).
- **Résistances** : 220 Ω ×2 (LEDs), 1 kΩ + 2 kΩ (ECHO), 10 kΩ + 20 kΩ (MQ) ; transistor NPN si besoin pour le buzzer.
