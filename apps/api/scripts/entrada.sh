#!/bin/sh
# Entrypoint de la imagen de entrega de Eventix.
#
# 1. Prepara la base: espera a MongoDB, aplica el esquema y siembra el dataset
#    (`scripts/preparar.mjs`).
# 2. Arranca la API.
#
# `exec` deja al servidor como PID 1 para que reciba directamente las señales
# de parada del orquestador (`docker compose stop` / `down`).
set -e

node scripts/preparar.mjs

exec node dist/server.js
