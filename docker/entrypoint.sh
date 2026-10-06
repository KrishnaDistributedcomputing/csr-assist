#!/usr/bin/env bash
# Copyright (c) Microsoft Corporation.
# SPDX-License-Identifier: MIT
#
# Prepare persistent data ownership and start supervised services.

set -euo pipefail

main() {
  mkdir -p \
    /data/documents \
    /data/index \
    /data/config \
    /data/models
  chown -R csrassist:csrassist \
    /data/documents \
    /data/index \
    /data/config \
    /data/models
  exec /usr/bin/supervisord -c /etc/supervisor/conf.d/csr-assist.conf
}

main "$@"
