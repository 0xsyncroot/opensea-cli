# opensea-cli

Ethereum NFT public-mint CLI. Submits signed transactions as private bundles to **Flashbots, Titan, Beaverbuild, rsync, Payload, Blocknative** in parallel, with adaptive priority-fee bidding and on-chain auto-detect of mint price, supply, and start time.

```bash
opensea-cli mint --contract 0xYourContract --to 0xColdWallet
```

## Features

- Multi-builder bundle broadcast — 6 relays × N blocks per mint window
- Adaptive priority fee from `eth_feeHistory` (`auto:p75+0.5` by default)
- On-chain auto-detect: `price`, `publicSaleStartTime`, `totalSupply`, sale flag, `paused`, `maxPerWallet`
- Scheduled mode with T-30 s re-probe + 10 s countdown + Ctrl+C cancel
- 4-tier balance check (refuses to sign if balance < mint price)
- Auto-transfer minted ERC-721s to a destination wallet
- Pre-flight simulation via `eth_callBundle` before every submission
- Hidden private-key prompt; `-k` override available

---

## Install

Node.js 20+.

```bash
git clone https://github.com/0xsyncroot/opensea-cli.git
cd opensea-cli
bash install.sh           # or `bash install.sh local` for no global symlink
opensea-cli help
```

---

## Quick start

```bash
opensea-cli check --contract 0xYourContract                       # preflight
opensea-cli test  --contract 0xYourContract                       # sign + simulate, no submit
opensea-cli mint  --contract 0xYourContract --to 0xColdWallet     # live mint, auto-transfer
```

`test` and `mint` ask for the private key (hidden input). `-k 0x...` skips the prompt.

Scheduled (auto if contract exposes `publicSaleStartTime`):

```bash
opensea-cli mint --contract 0xYourContract --start-ts 1746950400
```

---

## Commands

| Command | Needs key | Submits anything | Use for |
|---|---|---|---|
| `check`  | no  | no                                                | confirming address, supply, gas market |
| `test`   | yes | no (signed only, simulated via `eth_callBundle`)  | last sanity check before live mint |
| `mint`   | yes | yes (bundle broadcast to all relays)              | the real run |

---

## Options

Run `opensea-cli help` for full help. Most users only need `--contract`.

### Required

| Flag                  | Purpose                          |
|-----------------------|----------------------------------|
| `--contract 0x...`    | The NFT contract address         |

### Often passed (everything else has a sensible default)

| Flag                          | Default                         | Notes |
|-------------------------------|---------------------------------|-------|
| `--rpc <url>`                 | publicnode (rate-limited)       | Use Alchemy/Infura/QuickNode for real mints |
| `--price <eth>`               | auto-detected from contract     | Override if the on-chain probe is wrong |
| `--qty <n>`                   | `1`                             | Warns if greater than `maxPerWallet` on contract |
| `--fn <signature>`            | `mint(uint256)`                 | Other examples: `publicMint(uint256)`, `mint(address,uint256)` |
| `--args <json>`               | `["qty"]`                       | Tokens: `"self"` → minter address, `"qty"` → quantity |
| `--start-ts <unix>`           | auto-detected from contract     | Wait until this Unix timestamp before fire |
| `--start-block <n>`           | not set                         | Wait until block N before fire |
| `--priority <gwei \| auto>`   | `auto:75+0.5`                   | Adaptive tip = pXX of last 5 blocks + premium |
| `--blocks <n>`                | `3`                             | Future blocks to target per relay (= 18 submissions total) |
| `--gas-limit <n>`             | `300000`                        | Refunded by Flashbots if unused |
| `--max-fee <gwei>`            | `100`                           | `maxFeePerGas` ceiling |
| `--to <0x...>`                | not set                         | Auto-transfer minted ERC-721s after mint succeeds |
| `--preflight-lead <sec>`      | `30`                            | Seconds before fire to run the final re-check |
| `-k, --private-key <hex>`     | (prompt)                        | Funds key; CLI override of the hidden prompt |
| `-y, --yes`                   | `false`                         | Skip confirmation prompts |
| `--env <path>`                | `./.env`                        | Load env vars from a custom file |

### Lower-level network options

| Flag             | Default                            |
|------------------|------------------------------------|
| `--chain <id>`   | `1` (mainnet)                      |
| `--relays <csv>` | 6 major builders comma-separated   |
| `--auth-key <hex>` | fresh random per run             |

---

## `.env`

Everything that can be passed as a flag can also be set as an environment variable. The CLI loads `./.env` automatically.

```env
RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
CHAIN_ID=1
RELAYS=https://relay.flashbots.net,https://rpc.titanbuilder.xyz,https://rpc.beaverbuild.org,https://rsync-builder.xyz,https://rpc.payload.de,https://api.blocknative.com/v1/auction

CONTRACT_ADDRESS=0xYourContract
MINT_FUNCTION_SIGNATURE=mint(uint256)
MINT_ARGS=["qty"]
MINT_QUANTITY=1

# Optional — leave blank to auto-detect from contract
# MINT_PRICE_ETH=0.05
# MINT_START_TS=1746950400

ADAPTIVE_PRIORITY=75+0.5
MAX_PRIORITY_FEE_GWEI=50
MAX_FEE_GWEI=100
BLOCKS_TO_TARGET=3
PREFLIGHT_LEAD_SEC=30
```

**Never put your private key in `.env`.** The CLI does not read it from there — the hidden prompt or `-k` are the only supported channels.

---

## How it works

### Multi-builder broadcast

The same signed transaction is sent as a bundle to every relay for the next *N* blocks. Whichever builder wins the slot, the tx is in the block.

```text
                          ┌── Flashbots ───┐
                          ├── Titan ───────┤
signed tx  ──▶  bundle ──▶│── Beaverbuild ─│──▶ winning block
                          ├── rsync ───────┤
                          ├── Payload ─────┤
                          └── Blocknative ─┘
```

### Priority fee modes (`--priority`)

| Value             | Bid                          |
|-------------------|------------------------------|
| `2`               | flat 2 gwei                  |
| `auto` (default)  | `p75 + 0.5 gwei`             |
| `auto:99+2`       | `p99 + 2 gwei` (FOMO drops)  |

Percentiles come from `eth_feeHistory` over the last 5 blocks.

### Scheduled mode

Triggered by `--start-ts`, `--start-block`, or auto-detected `publicSaleStartTime` on the contract:

1. cancelable wait until `T − preflight-lead` (default 30 s)
2. re-probe contract (`totalSupply`, sale flag, `paused`), re-fetch gas market
3. 10 s countdown — Ctrl+C still aborts with zero bundles broadcast
4. fire bundles to all relays for the next *N* blocks

### Auto-detected view functions

| Field      | Tried                                                                                |
|------------|--------------------------------------------------------------------------------------|
| price      | `price`, `mintPrice`, `publicSalePrice`, `cost`, `PUBLIC_PRICE`, `MINT_PRICE`        |
| start time | `publicSaleStartTime`, `mintStartTime`, `mintStart`                                  |
| supply     | `totalSupply`, `MAX_SUPPLY` / `maxSupply` / `MAX_TOKENS`                             |
| sale state | `saleIsActive`, `publicMintActive`, `isMintActive`, `mintActive`, `publicSaleActive` |
| per-wallet | `maxPerWallet`, `MAX_PER_WALLET`, `maxMintPerTx`                                     |
| identity   | `name`, `symbol`, `owner`, `paused`                                                  |

Missing getters fall back to the CLI default.

### Balance check

| Condition                            | Action                       |
|--------------------------------------|------------------------------|
| `balance == 0`                       | red hard exit                |
| `balance < price × qty`              | red hard exit (would revert) |
| `price × qty ≤ balance < worst-case` | yellow warn, continue        |
| `balance ≥ worst-case`               | green, proceed               |

### Auto-transfer (`--to`)

After a successful mint, parses ERC-721 `Transfer(0x0, minter, tokenId)` events from the receipt and sends `safeTransferFrom(minter, dest, tokenId)` for each. ERC-1155 is not auto-handled.

---

## Safety

- Use a fresh burner wallet; pass `--to` to forward NFTs to a cold wallet right after mint.
- Private key: hidden prompt by default, or `-k` (logged in shell history & `ps`).
- `check` and `test` cannot spend ETH. Only `mint` broadcasts.
- The CLI refuses to sign if balance < mint price.
- Ctrl+C aborts cleanly until the 10 s countdown ends.

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `Missing contract`                  | pass `--contract 0x...` or set `CONTRACT_ADDRESS` |
| `Invalid contract address`          | malformed hex — must be 20 bytes, with or without `0x` |
| `NO BYTECODE at <addr>`             | wrong address, wrong chain, or contract not deployed yet |
| `sim REVERT: ...`                   | check `--fn` signature, `--args`, `--price`, sale flag, and allowlist on Etherscan |
| `balance < price × qty`             | top up the minter wallet |
| `bundle not included within window` | priority fee was too low — re-run with `--priority auto:99+2` or higher |
| `relay rate-limited`                | switch from publicnode to a private RPC (Alchemy/Infura/QuickNode) |
| `opensea-cli not found`             | `bash install.sh` again, or fall back to `node dist/index.js help` |

---

## Development

```bash
npm install
npm run build               # tsc → dist/
node dist/index.js help     # run compiled
npx tsx src/index.ts help   # run TS without rebuild
```

Deps: `ethers v6`, `chalk`, `dotenv`, `prompts`. Sources under `src/`.

---

## License

MIT — see [LICENSE](LICENSE).

---

## Disclaimer

Mainnet transactions move real ETH. No warranty. **You are responsible for everything you sign.** Start with `check` and `test` on a burner.
