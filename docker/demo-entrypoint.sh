#!/usr/bin/env bash
# Copyright (c) Microsoft Corporation.
# SPDX-License-Identifier: MIT
#
# Starts the read-only public demo with isolated ephemeral storage.

set -euo pipefail

main() {
  mkdir -p \
    /tmp/csr-assist/documents \
    /tmp/csr-assist/index \
    /tmp/csr-assist/config \
    /tmp/csr-assist/models
  cp /opt/csr-assist/sample-documents/*.md /tmp/csr-assist/documents/
  chown -R csrassist:csrassist /tmp/csr-assist
  exec /usr/local/bin/csr-assist-entrypoint
}

main "$@"
