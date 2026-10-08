// Validation stricte des commandes reçues sur cmd (contrat §3.4).
#pragma once

#include <Arduino.h>

enum class CommandAction : uint8_t { Buzzer, LedRed, LedGreen, Silence };

struct Command {
  char id[17];  // 1-16 caractères [a-z0-9-] + '\0'
  CommandAction action;
  bool on;
  uint32_t durationMs;
};

enum class ParseResult : uint8_t {
  Ok,          // commande valide : exécuter + ack ok
  Invalid,     // id lisible mais commande invalide : ack ok:false
  Unreadable,  // JSON invalide ou id illisible : impossible d'acquitter
};

ParseResult parseCommand(const char* bytes, int length, Command& cmd);
