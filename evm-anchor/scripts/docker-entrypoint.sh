#!/bin/sh
# Start Hardhat JSON-RPC, deploy SettlementAnchor, then keep the node in the foreground.
set -eu

npm run node -w @oursay/evm-anchor &
NODE_PID=$!

echo "[evm] waiting for JSON-RPC on :8545"
i=0
while [ "$i" -lt 60 ]; do
  if node -e "fetch('http://127.0.0.1:8545',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]})}).then(r=>r.json()).then(j=>{if(!j.result)process.exit(1)}).catch(()=>process.exit(1))"; then
    echo "[evm] JSON-RPC ready"
    break
  fi
  i=$((i + 1))
  sleep 1
done
if [ "$i" -ge 60 ]; then
  echo "[evm] timed out waiting for JSON-RPC" >&2
  kill "$NODE_PID" 2>/dev/null || true
  exit 1
fi

npm run deploy:local -w @oursay/evm-anchor

trap 'kill "$NODE_PID" 2>/dev/null || true' INT TERM
wait "$NODE_PID"
