#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 4 ]]; then
  echo "Usage: $0 <stellar-cli> <config-dir> <source-account> <verification-event-id>" >&2
  exit 64
fi

stellar_cli="$1"
config_dir="$2"
source_account="$3"
verification_event_id="$4"
refundable_rsvp_id="CBIT5JKA4XGV37FIIMXNSXQNHTYC52P7J65JO6J3QRYQ3YP3DIZPZRRN"
directory_wasm="target/wasm32v1-none/release/event_directory.wasm"

if [[ ! -x "$stellar_cli" ]]; then
  echo "Stellar CLI is not executable: $stellar_cli" >&2
  exit 66
fi

"$stellar_cli" contract build --package event-directory

directory_id="$(
  "$stellar_cli" contract deploy \
    --wasm "$directory_wasm" \
    --source-account "$source_account" \
    --network testnet \
    --alias event_directory \
    --config-dir "$config_dir"
)"

echo "Event directory contract: $directory_id"

"$stellar_cli" contract invoke \
  --id "$directory_id" \
  --source-account "$source_account" \
  --network testnet \
  --config-dir "$config_dir" \
  -- \
  index_event \
  --source_contract "$refundable_rsvp_id" \
  --event_id "$verification_event_id"

echo "Cross-contract verification complete."

