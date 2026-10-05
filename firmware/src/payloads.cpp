#include "payloads.h"

#include <ArduinoJson.h>

#include "config.h"

// Nombre à 1 décimale, ou null si la lecture a échoué
static void setDecimalOrNull(JsonDocument& doc, const char* key, float value) {
  if (isnan(value)) doc[key] = nullptr;
  else doc[key] = serialized(String(value, 1));
}

size_t buildTelemetry(char* out, size_t size, const Reading& r, uint32_t seq, uint32_t ts) {
  JsonDocument doc;
  doc["device"] = DEVICE_ID;
  doc["ts"] = ts;
  doc["seq"] = seq;
  setDecimalOrNull(doc, "temp", r.temp);
  setDecimalOrNull(doc, "hum", r.hum);
  doc["gas"] = r.gas;
  if (r.dist < 0) doc["dist"] = nullptr;
  else doc["dist"] = r.dist;
  doc["presence"] = r.presence ? 1 : 0;
  return serializeJson(doc, out, size);
}

size_t buildAlert(char* out, size_t size, const Alert& alert, uint32_t ts) {
  JsonDocument doc;
  doc["device"] = DEVICE_ID;
  doc["ts"] = ts;
  doc["source"] = "ESP";
  doc["type"] = alert.type;
  doc["level"] = alert.level;
  doc["value"] = alert.value;
  doc["message"] = alert.message;
  return serializeJson(doc, out, size);
}

size_t buildStatus(char* out, size_t size, const String& ip, int rssi, uint32_t uptimeS) {
  JsonDocument doc;
  doc["device"] = DEVICE_ID;
  doc["state"] = "online";
  doc["ip"] = ip;
  doc["rssi"] = rssi;
  doc["uptime_s"] = uptimeS;
  doc["fw"] = FW_VERSION;
  return serializeJson(doc, out, size);
}

size_t buildAck(char* out, size_t size, const char* id, bool ok) {
  JsonDocument doc;
  doc["id"] = id;
  doc["ok"] = ok;
  if (!ok) doc["error"] = "UNKNOWN_ACTION";
  return serializeJson(doc, out, size);
}
