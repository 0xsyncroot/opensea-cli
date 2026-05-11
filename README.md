# opensea-cli

Fast NFT public-mint CLI for Ethereum mainnet. Submits signed transactions as private bundles through **Flashbots + Titan + Beaverbuild + rsync + Payload + Blocknative** in parallel, with adaptive priority-fee bidding and on-chain auto-detection of mint price, supply, and start time.

Built for snipers who want one of the next 3 blocks, not a few seconds later.

```text
opensea-cli mint --contract 0xYourContract --to 0xColdWallet
```

That single line will:

1. probe the contract for `name`, `totalSupply`, `mintPrice`, `publicSaleStartTime`, etc.
2. wait until the mint opens (if a future start time is found on-chain)
3. re-verify the contract 30 s before fire and run a 10 s countdown
4. broadcast the same signed bundle to 6 block builders for the next 3 blocks
5. on success, auto-transfer the minted NFTs to your cold wallet

Everything is overridable by flags. The private key never touches disk.

---

## Features

- **Multi-builder bundle broadcast** — Flashbots, Titan, Beaverbuild, rsync, Payload, Blocknative in parallel (~18 submissions per mint window)
- **Adaptive priority fee** — `auto:75+0.5` reads the last 5 blocks' priority fee histogram and bids `p75 + 0.5 gwei` so you win the slot without overpaying
- **Auto-detect from contract** — `price()`, `publicSaleStartTime()`, `maxPerWallet()`, etc. are probed and filled in if you don't pass them
- **Scheduled mode** — sleeps until the announced start, then runs a final on-chain re-check (supply moved? sale flag flipped?) and a 10 s countdown before fire
- **Hard balance check** — refuses to sign if wallet balance is below mint cost; warns if below worst-case (mint + gas)
- **Auto-transfer after mint** — `--to 0xCold` parses the `Transfer(0x0 → minter, tokenId)` events and forwards minted ERC-721s to a destination wallet
- **Pre-flight simulation** — every transaction is run through `eth_callBundle` against current state; reverts are caught before any submission
- **No-key default** — private key is prompted with hidden input. CLI override (`-k`) supported, with explicit warning about shell history
- **Cancel-anytime** — Ctrl+C is handled cleanly with an accurate message about whether bundles were already broadcast

---

## Install

Requires Node.js 20 or newer.

```bash
git clone https://github.com/0xsyncroot/opensea-cli.git
cd opensea-cli
bash install.sh
opensea-cli help
```

Local-only (no global symlink):

```bash
bash install.sh local
node dist/index.js help
```

The `install.sh` script also accepts `pnpm` and `yarn` if either is on your PATH.

---

## Quick start

The CLI has three commands. Always run them in order on a new contract.

```bash
# 1. Preflight — no key needed, just sanity-check the contract
opensea-cli check --contract 0xYourContract

# 2. Dry-run — sign locally, simulate through Flashbots, do not submit
opensea-cli test --contract 0xYourContract

# 3. Mint — submit bundles to all relays
opensea-cli mint --contract 0xYourContract
```

`test` and `mint` ask for your private key with hidden input. For unattended runs you can pass `-k 0x...`, but be aware that this lands in `~/.bash_history` and is visible to `ps`.

### Public mint with auto-transfer

```bash
opensea-cli mint \
  --rpc https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY \
  --contract 0xYourContract \
  --to 0xColdWallet
```

### Scheduled mint at a known start time

```bash
opensea-cli mint --contract 0xYourContract --start-ts 1746950400
```

If the contract exposes `publicSaleStartTime`, you can omit `--start-ts` — the CLI will pick it up automatically.

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

### Multi-builder bundle broadcast

Post-merge, blocks are produced by competing builders, not by validators directly. The market is currently fragmented: Titan, Beaverbuild, rsync, Flashbots Builder, and Payload each win a meaningful share of blocks. The CLI sends the *same* signed transaction as a bundle to every relay it knows for the next *N* blocks. Whichever builder wins the slot, your tx is in their block.

```text
                          ┌── Flashbots ───┐
                          ├── Titan ───────┤
signed tx  ──▶  bundle ──▶│── Beaverbuild ─│──▶ winning block
                          ├── rsync ───────┤
                          ├── Payload ─────┤
                          └── Blocknative ─┘
```

### Adaptive priority fee

Bidding a fixed priority fee is wasteful when the network is cold and ineffective when it's hot. The CLI calls `eth_feeHistory` for the last 5 blocks and computes the percentile you choose:

| Format             | Bid                          | When to use         |
|--------------------|------------------------------|---------------------|
| `2`                | flat 2 gwei                  | manual control      |
| `auto`             | `p75 + 0.5 gwei` (default)   | normal drops        |
| `auto:75+0.5`      | same as above                | explicit            |
| `auto:99+2`        | `p99 + 2 gwei`               | hyped / FOMO drops  |

### Scheduled mode

If `--start-ts` / `--start-block` is set, or the contract exposes `publicSaleStartTime` / `mintStartTime` / `mintStart`, the CLI:

1. waits cancelably until `T - preflight-lead` (default `T - 30 s`)
2. re-probes the contract: `totalSupply` (movement?), `saleIsActive`, `paused`
3. re-fetches the gas market (p50/p75/p99)
4. shows a 10 s countdown — Ctrl+C now aborts cleanly with zero bundles broadcast
5. fires bundles to all relays for the next `blocks` blocks

### Auto-detect

These contract calls are tried during `check` / `test` / `mint` and used to fill in flags you didn't pass:

| Field            | Tried view-functions                                                                |
|------------------|-------------------------------------------------------------------------------------|
| price            | `price`, `mintPrice`, `publicSalePrice`, `cost`, `PUBLIC_PRICE`, `MINT_PRICE`       |
| start time       | `publicSaleStartTime`, `mintStartTime`, `mintStart`                                 |
| supply           | `totalSupply`, `MAX_SUPPLY` / `maxSupply` / `MAX_TOKENS`                            |
| sale state       | `saleIsActive`, `publicMintActive`, `isMintActive`, `mintActive`, `publicSaleActive`|
| per-wallet limit | `maxPerWallet`, `MAX_PER_WALLET`, `maxMintPerTx`                                    |
| paused           | `paused`                                                                            |
| identity         | `name`, `symbol`, `owner`                                                           |

If a getter is missing, that field is just left at its CLI default.

### Balance check (4 tiers)

Before signing, the CLI fetches the minter's ETH balance and prints one of:

| Condition                                | Color  | Action                                |
|------------------------------------------|--------|---------------------------------------|
| `balance == 0`                           | red    | hard exit                             |
| `balance < price × qty`                  | red    | hard exit (tx would revert)           |
| `price × qty ≤ balance < worst-case`     | yellow | warn, allow user to continue          |
| `balance ≥ worst-case`                   | green  | proceed                               |

### Auto-transfer

If `--to 0xDest` is set, after a successful mint the CLI:

1. parses the receipt for ERC-721 `Transfer(address(0), minter, tokenId)` events emitted by the target contract
2. for each minted token id, sends `safeTransferFrom(minter, dest, tokenId)` with a low priority fee (no rush)
3. prints a colored success/fail summary

ERC-1155 contracts emit `TransferSingle` / `TransferBatch` and are not currently auto-handled — transfer those manually.

---

## Safety

- **Use a fresh burner wallet** funded with only enough ETH for the mint + worst-case gas. Move funds out immediately, or pass `--to` to a cold wallet that the CLI will auto-transfer to.
- **Private key precedence**: hidden prompt → `-k` flag. There is no env-var path for the key.
- **Never commit `.env`** — it is in `.gitignore` for this reason.
- **`check` is risk-free**. `test` signs but does not submit. Only `mint` can spend ETH.
- The CLI **refuses to sign** if the minter balance is below the mint price. It will not waste your gas on a guaranteed revert.
- Cancellation with **Ctrl+C** is safe at every stage *before* the 10 s countdown finishes; after that, bundles may already be on a builder's queue.

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
npm run build           # compile TypeScript to dist/
node dist/index.js help # run from source

# during edits:
npx tsx src/index.ts help   # run TS directly without rebuild
```

The codebase is small (~1k LOC TypeScript) and intentionally dependency-light: `ethers v6`, `chalk`, `dotenv`, `prompts`. No bundler. Module layout:

```
src/
├── index.ts        — CLI entrypoint, command dispatch, mint flow
├── args.ts         — argv parsing (node:util parseArgs)
├── config.ts       — merge flags + env into a typed Config
├── flashbots.ts    — relay client (eth_sendBundle / eth_callBundle)
├── mint.ts         — calldata build, EIP-1559 sign
├── probe.ts        — generic ERC-721 / mint-state view-function probes
├── transfer.ts     — auto-transfer after successful mint
├── timing.ts       — clock drift, fee history, cancelable waits, countdown
├── prompt.ts       — hidden private-key input
└── logger.ts       — colored output helpers
```

---

## License

MIT — see [LICENSE](LICENSE).

---

## Disclaimer

This tool interacts with mainnet smart contracts and broadcasts signed transactions that move real ETH. The author makes no warranty as to correctness, profitability, or safety. **You are responsible for everything you sign.** Read the source before using a key with real funds, and start with `check` and `test` on a small burner wallet.
