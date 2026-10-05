# Câblage — Boîtier SX-003

> Carte : NodeMCU ESP8266 (ESP-12E). **Proposition à valider** avec l'équipe avant soudure / fixation.
> Ce document sert au firmware (`/firmware`) et au schéma de câblage du dossier technique.

## Brochage

| Composant          | Broche composant | Broche NodeMCU | GPIO | Alim  | Remarque                                  |
|--------------------|------------------|----------------|------|-------|-------------------------------------------|
| OLED SSD1306 I2C   | SCL              | D1             | 5    | 3V3   | Adresse I2C `0x3C`                        |
| OLED SSD1306 I2C   | SDA              | D2             | 4    | 3V3   |                                           |
| DHT22              | DATA             | D5             | 14   | 3V3   | Pull-up 10 kΩ (souvent intégrée au module)|
| PIR HC-SR501       | OUT              | D6             | 12   | VIN (5V) | Sortie 3,3 V, compatible ESP           |
| Buzzer             | +                | D7             | 13   | —     | Via transistor NPN si > 12 mA             |
| LED rouge          | anode (+ 220 Ω)  | D0             | 16   | —     | Sortie uniquement                         |
| LED verte          | anode (+ 220 Ω)  | D8             | 15   | —     | Sortie OK (LED vers GND = tirage bas)     |
| MQ-2               | AO               | A0             | ADC  | VIN (5V) | **Pont diviseur obligatoire**, voir ci-dessous |

Toutes les masses (GND) sont communes.

## Points d'attention

- **D3, D4, D8 au démarrage** : D3 (GPIO0) et D4 (GPIO2) doivent être à l'état haut et D8 (GPIO15)
  à l'état bas pour que l'ESP démarre. On n'y branche donc **aucune entrée**. D8 accepte une LED
  vers GND, qui le maintient bas.
- **MQ-2 sur A0** : le module est alimenté en 5 V et sa sortie AO peut monter jusqu'à ~5 V.
  L'entrée A0 du NodeMCU accepte **3,3 V max**. Mettre un pont diviseur
  (ex. 10 kΩ entre AO et A0, 20 kΩ entre A0 et GND → 5 V × 20/30 ≈ 3,3 V).
- **MQ-2 chauffe** : valeurs instables pendant ~2 min après la mise sous tension.
  Calibrer `GAS_WARN` / `GAS_CRIT` (contrat §3.2) après cette chauffe.
- **Buzzer** : une broche ESP fournit ~12 mA. Un buzzer actif qui consomme plus doit passer par
  un transistor NPN (2N2222 + 1 kΩ sur la base).
- **PIR** : réglage des deux potentiomètres (sensibilité, temporisation) au minimum de
  temporisation pour des fronts nets ; ~1 min d'initialisation au démarrage.
