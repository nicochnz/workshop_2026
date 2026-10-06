#!/usr/bin/env bash
# Génère la PKI locale de Sentinel-X (ECDSA P-256) dans certs/ (ignoré par Git).
#
#   ./scripts/generate-certs.sh             CA créée si absente, certificats serveur (re)générés
#   ./scripts/generate-certs.sh --renew-ca  nouvelle CA : il faudra redistribuer ca.crt (ESP, IA, navigateurs)
#
# Variables optionnelles :
#   SERVER_IP=192.168.10.1          IP du serveur, mise dans le SAN (l'ESP s'y connecte par IP)
#   EXTRA_SAN="IP:192.168.1.42"     SAN supplémentaires, ex. l'IP du PC de dev sur un autre réseau
#   CERTS_DIR=<racine>/certs        dossier de sortie
#
# Résultat :
#   certs/ca/ca.key, ca.crt            CA — la clé ne quitte JAMAIS ce dossier, n'est montée nulle part
#   certs/mosquitto/                   ca.crt + mosquitto.crt + mosquitto.key  → conteneur Mosquitto uniquement
#   certs/proxy/                       proxy.crt + proxy.key                   → conteneur nginx (HTTPS) uniquement
#   certs/public/ca.crt                CA publique → API, simulateur, IA, firmware ESP8266, navigateurs
#
# Aucune clé privée n'est affichée. Prérequis : openssl (fourni par Git Bash sous Windows, natif sous Linux).
set -euo pipefail

# Git Bash convertirait le sujet "/O=..." en chemin Windows (sans effet ailleurs).
export MSYS2_ARG_CONV_EXCL="/O="

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CERTS_DIR="${CERTS_DIR:-$ROOT/certs}"
SERVER_IP="${SERVER_IP:-192.168.10.1}"
EXTRA_SAN="${EXTRA_SAN:-}"
CA_DAYS=3650
# 365 jours : sous la limite de 398/825 jours appliquée par certains navigateurs et OS.
LEAF_DAYS=365

# IP:<ip>        → validation standard (Node, OpenSSL, navigateurs).
# DNS:<ip>       → BearSSL (ESP8266) ne compare le nom du serveur qu'aux dNSName du SAN.
# DNS:mosquitto  → l'API joint le broker par son nom de service Docker.
# localhost / 127.0.0.1 → tests depuis le poste qui héberge la stack.
SAN="IP:${SERVER_IP},DNS:${SERVER_IP},DNS:mosquitto,DNS:localhost,IP:127.0.0.1${EXTRA_SAN:+,$EXTRA_SAN}"

CA_DIR="$CERTS_DIR/ca"
umask 077
mkdir -p "$CA_DIR" "$CERTS_DIR/mosquitto" "$CERTS_DIR/proxy" "$CERTS_DIR/public"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

new_key() {
  openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out "$1"
  chmod 600 "$1"
}

create_ca() {
  echo "→ Création de la CA Sentinel-X (ECDSA P-256, ${CA_DAYS} jours)"
  new_key "$CA_DIR/ca.key"
  openssl req -x509 -new -key "$CA_DIR/ca.key" -sha256 -days "$CA_DAYS" \
    -subj "/O=Sentinel-X G3/CN=Sentinel-X G3 Local CA" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -addext "subjectKeyIdentifier=hash" \
    -out "$CA_DIR/ca.crt"
}

# issue_cert <dossier> <nom> <CN> : clé + CSR + certificat serveur signé par la CA, avec SAN.
issue_cert() {
  local dir="$1" name="$2" cn="$3"
  echo "→ Certificat serveur ${name} (SAN ${SAN})"
  new_key "$dir/$name.key"
  openssl req -new -key "$dir/$name.key" -subj "/O=Sentinel-X G3/CN=$cn" -out "$TMP/$name.csr"
  cat > "$TMP/$name.ext" <<EOF
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature
extendedKeyUsage=serverAuth
subjectAltName=$SAN
authorityKeyIdentifier=keyid,issuer
subjectKeyIdentifier=hash
EOF
  openssl x509 -req -in "$TMP/$name.csr" -CA "$CA_DIR/ca.crt" -CAkey "$CA_DIR/ca.key" \
    -CAcreateserial -CAserial "$CA_DIR/ca.srl" -sha256 -days "$LEAF_DAYS" \
    -extfile "$TMP/$name.ext" -out "$dir/$name.crt" 2>/dev/null
  openssl verify -CAfile "$CA_DIR/ca.crt" "$dir/$name.crt" >/dev/null
}

if [[ "${1:-}" == "--renew-ca" ]]; then
  echo "⚠ Nouvelle CA : redistribuer certs/public/ca.crt (firmware, IA, navigateurs)."
  rm -f "$CA_DIR/ca.key" "$CA_DIR/ca.crt" "$CA_DIR/ca.srl"
fi

if [[ -f "$CA_DIR/ca.key" && -f "$CA_DIR/ca.crt" ]]; then
  echo "→ CA existante conservée ($CA_DIR/ca.crt)"
else
  create_ca
fi

issue_cert "$CERTS_DIR/mosquitto" mosquitto "Sentinel-X MQTT broker"
issue_cert "$CERTS_DIR/proxy" proxy "Sentinel-X dashboard"

# Certificats publics : lisibles par les conteneurs (Mosquitto copie et resserre ses fichiers).
cp "$CA_DIR/ca.crt" "$CERTS_DIR/mosquitto/ca.crt"
cp "$CA_DIR/ca.crt" "$CERTS_DIR/public/ca.crt"
chmod 755 "$CERTS_DIR" "$CERTS_DIR/mosquitto" "$CERTS_DIR/proxy" "$CERTS_DIR/public"
chmod 644 "$CERTS_DIR"/*/*.crt
# Les clés restent en 0600 : nginx et l'entrypoint Mosquitto les lisent en root,
# puis Mosquitto reçoit sa propre copie (voir dev/mosquitto/entrypoint.sh).
chmod 700 "$CA_DIR"

echo
echo "✅ Fichiers générés dans $CERTS_DIR :"
for f in ca/ca.crt mosquitto/ca.crt mosquitto/mosquitto.crt mosquitto/mosquitto.key \
         proxy/proxy.crt proxy/proxy.key public/ca.crt; do
  echo "   $f"
done
echo "   (ca/ca.key : clé de la CA, à garder sur ce poste uniquement)"
echo
echo "SAN : $(openssl x509 -in "$CERTS_DIR/mosquitto/mosquitto.crt" -noout -ext subjectAltName | tail -n 1 | sed 's/^ *//')"
echo "Validité : $(openssl x509 -in "$CERTS_DIR/mosquitto/mosquitto.crt" -noout -enddate | cut -d= -f2)"
echo "Empreinte SHA-256 de la CA : $(openssl x509 -in "$CA_DIR/ca.crt" -noout -fingerprint -sha256 | cut -d= -f2)"
