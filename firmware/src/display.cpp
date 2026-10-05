#include "display.h"

#include <Adafruit_SSD1306.h>

#include "alerts.h"
#include "config.h"

static Adafruit_SSD1306 oled(128, 64, &Wire, -1);
static bool ready = false;

void displayBegin() {
  ready = oled.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDR);
  if (!ready) {
    Serial.println("[OLED] Initialisation impossible, affichage desactive");
    return;
  }
  oled.setTextColor(SSD1306_WHITE);
  oled.setTextSize(1);
  oled.clearDisplay();
  oled.setCursor(0, 0);
  oled.println("SENTINEL-X " DEVICE_ID);
  oled.println("Demarrage...");
  oled.display();
}

// La police par défaut ne gère pas les accents : textes en ASCII.
void displayRender(const Reading& r, bool wifiUp, bool mqttUp, const String& ip) {
  if (!ready) return;

  oled.clearDisplay();
  oled.setCursor(0, 0);
  oled.println("SENTINEL-X " DEVICE_ID);
  oled.printf("WiFi:%s  MQTT:%s\n", wifiUp ? "OK" : "--", mqttUp ? "OK" : "--");
  oled.println(wifiUp ? ip : String("IP: --"));

  if (isnan(r.temp) || isnan(r.hum)) oled.println("T: --   H: --");
  else oled.printf("T:%.1fC  H:%.0f%%\n", r.temp, r.hum);

  oled.printf("Gaz: %d\n", r.gas);
  if (r.dist < 0) oled.println("Dist: --");
  else oled.printf("Dist: %d cm\n", r.dist);
  oled.println(r.presence ? "Presence: OUI" : "Presence: non");

  if (isGasCritical(r.gas)) {
    oled.setTextColor(SSD1306_BLACK, SSD1306_WHITE);  // texte inversé
    oled.print("!! ALERTE GAZ !!");
    oled.setTextColor(SSD1306_WHITE);
  }
  oled.display();
}
