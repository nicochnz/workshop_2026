#include "commands.h"

#include <ArduinoJson.h>

static const char* const ALLOWED_KEYS[] = {"id", "action", "state", "duration_ms"};

static bool isValidId(const char* id) {
  const size_t len = strlen(id);
  if (len < 1 || len > 16) return false;
  for (size_t i = 0; i < len; i++) {
    const char c = id[i];
    if (!(islower(c) || isdigit(c) || c == '-')) return false;
  }
  return true;
}

static bool hasOnlyAllowedKeys(JsonObjectConst obj) {
  for (JsonPairConst kv : obj) {
    bool allowed = false;
    for (const char* key : ALLOWED_KEYS) {
      if (strcmp(kv.key().c_str(), key) == 0) allowed = true;
    }
    if (!allowed) return false;
  }
  return true;
}

static bool parseAction(const char* s, CommandAction& action) {
  if (strcmp(s, "BUZZER") == 0) action = CommandAction::Buzzer;
  else if (strcmp(s, "LED_RED") == 0) action = CommandAction::LedRed;
  else if (strcmp(s, "LED_GREEN") == 0) action = CommandAction::LedGreen;
  else if (strcmp(s, "SILENCE") == 0) action = CommandAction::Silence;
  else return false;
  return true;
}

// state : obligatoire sauf SILENCE, "ON" ou "OFF"
static bool parseState(JsonVariantConst v, CommandAction action, bool& on) {
  if (v.isNull()) {
    on = false;
    return action == CommandAction::Silence;
  }
  if (!v.is<const char*>()) return false;
  const char* s = v.as<const char*>();
  if (strcmp(s, "ON") == 0) on = true;
  else if (strcmp(s, "OFF") == 0) on = false;
  else return false;
  return true;
}

// duration_ms : optionnel, entier 0 -> 10000
static bool parseDuration(JsonVariantConst v, uint32_t& durationMs) {
  durationMs = 0;
  if (v.isNull()) return true;
  if (!v.is<long>()) return false;
  const long d = v.as<long>();
  if (d < 0 || d > 10000) return false;
  durationMs = static_cast<uint32_t>(d);
  return true;
}

ParseResult parseCommand(const char* bytes, int length, Command& cmd) {
  JsonDocument doc;
  if (deserializeJson(doc, bytes, length) != DeserializationError::Ok) return ParseResult::Unreadable;

  JsonObjectConst obj = doc.as<JsonObjectConst>();
  if (obj.isNull() || !obj["id"].is<const char*>()) return ParseResult::Unreadable;

  const char* id = obj["id"].as<const char*>();
  if (!isValidId(id)) return ParseResult::Unreadable;
  strlcpy(cmd.id, id, sizeof(cmd.id));

  const bool valid = hasOnlyAllowedKeys(obj)
      && obj["action"].is<const char*>()
      && parseAction(obj["action"].as<const char*>(), cmd.action)
      && parseState(obj["state"], cmd.action, cmd.on)
      && parseDuration(obj["duration_ms"], cmd.durationMs);

  return valid ? ParseResult::Ok : ParseResult::Invalid;
}
