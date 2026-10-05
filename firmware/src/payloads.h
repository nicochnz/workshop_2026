// Construction des messages JSON au format exact du contrat (§3).
#pragma once

#include <Arduino.h>

#include "alerts.h"
#include "sensors.h"

size_t buildTelemetry(char* out, size_t size, const Reading& r, uint32_t seq, uint32_t ts);
size_t buildAlert(char* out, size_t size, const Alert& alert, uint32_t ts);
size_t buildStatus(char* out, size_t size, const String& ip, int rssi, uint32_t uptimeS);
size_t buildAck(char* out, size_t size, const char* id, bool ok);
