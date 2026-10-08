// Écran OLED 0.96" (SSD1306, I2C) : état réseau et dernières mesures.
#pragma once

#include <Arduino.h>

#include "sensors.h"

void displayBegin();
void displayRender(const Reading& r, bool wifiUp, bool mqttUp, const String& ip);
