# opensea-cli

Ethereum NFT public-mint CLI. Sends signed transactions as private bundles to **Flashbots, Titan, Beaverbuild, rsync, Payload, Blocknative** in parallel, with adaptive priority-fee bidding and on-chain auto-detect of mint price, supply, and start time.

```bash
opensea-cli mint --contract 0xYourContract --to 0xColdWallet
```

---

## Install

You only need **Node.js 20 or newer** ([download here](https://nodejs.org/)). Then one command:

```bash
npm install -g https://github.com/0xsyncroot/opensea-cli/tarball/main
```

Check it works:

```bash
opensea-cli --version    # → opensea-cli v0.2.0
opensea-cli help
```

### Upgrade to the latest version

npm caches the tarball by URL, so re-running the install command above can serve the old version. Force a fresh fetch:

```bash
npm uninstall -g opensea-cli && npm cache clean --force && npm install -g https://github.com/0xsyncroot/opensea-cli/tarball/main
```

To uninstall: `npm uninstall -g opensea-cli`.

---

## Quick start (3 commands)

```bash
# 1. Sanity-check the contract — no key needed, no risk
opensea-cli check --contract 0xYourContract

# 2. Dry-run with your wallet — signs locally, simulates via Flashbots, DOES NOT submit
opensea-cli test  --contract 0xYourContract

# 3. Live mint, then auto-transfer to a cold wallet
opensea-cli mint  --contract 0xYourContract --to 0xColdWallet
```

`test` and `mint` will ask for your private key (hidden, not stored). Paste it, hit Enter.

If the contract advertises a future start time on-chain (`publicSaleStartTime`), `mint` waits until then and re-verifies the contract 30 s before fire. Press Ctrl+C any time to abort.

---

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

The Transfer scan is **not restricted to the called contract** — this is what makes sale-contract proxies (next section) work end-to-end.

---

## Sale-contract / minter-proxy mints

Some platforms split minting into two contracts:

- **NFT contract** — holds the tokens, emits `Transfer` events
- **Sale contract** — handles pricing, allowlists, phases; calls into the NFT contract

Examples: Transient Labs (`TLStacks721`), Manifold lazy-mint, Zora ERC721 Drop minter modules.

For these, point `--contract` at the **sale contract**, not the NFT. The CLI:

- sends `purchase(...)` (or equivalent) to the sale contract
- the sale contract calls `externalMint` / `_mintTo` / similar on the NFT contract
- `--to` auto-transfer still works — Transfer events are picked up from the underlying NFT contract via receipt scanning

### Example — Transient Labs Still Alive

`https://www.transient.xyz/mint/still-alive` is sold through `TLStacks721 v2.3.1` at `0x384092784cfaa91efaa77870c04d958e20840242`. The underlying NFT lives at `0x52caee4275765dde6f47f874e7cf8181f5b5e5da`. Since v0.2.0 the CLI auto-detects this pattern — just give it the contracts:

```bash
opensea-cli mint \
  --contract 0x384092784cfaa91efaa77870c04d958e20840242 \
  --fn 'purchase(address,address,uint256,uint256,bytes32[])' \
  --args '["0x52caee4275765dde6f47f874e7cf8181f5b5e5da","self","qty",0,[]]' \
  --to 0xColdWalletDestination
```

When the first `--args` entry looks like an NFT address, the CLI calls `getDrop(nft)` + `protocolFee()` + `getDropPhase(nft)` on the sale contract and auto-fills:

- **--price** = `publicCost + protocolFee` per NFT (e.g. `0.0269 + 0.0009 = 0.0278`)
- **--start-ts** = `startTime + presaleDuration` (the moment presale ends and public opens)
- **--gas-limit** = bumped to 500 000 (sale contracts delegate to `externalMint`, which costs more than a plain mint)
- warns when `--qty` exceeds the on-chain per-wallet `allowance`

Override anything by passing it explicitly. For a busy drop, bump priority:

```bash
opensea-cli mint --contract 0x384092784cfaa91efaa77870c04d958e20840242 \
  --fn 'purchase(address,address,uint256,uint256,bytes32[])' \
  --args '["0x52caee4275765dde6f47f874e7cf8181f5b5e5da","self","qty",0,[]]' \
  --qty 3 --priority auto:90+2 --to 0xCold
```

ABI cheatsheet for `purchase`:

| arg | meaning | typical value |
|-----|---------|--------------|
| 0   | NFT contract            | the ERC-721 address |
| 1   | recipient               | `"self"` (minter) |
| 2   | quantity                | `"qty"` (matches `--qty`) |
| 3   | `presaleNumberCanMint`  | `0` for public phase |
| 4   | merkle proof            | `[]` for public phase |

To find the right TLStacks deployment for any Transient drop, look up [`deployments.json`](https://github.com/Transient-Labs/tl-stacks/blob/main/deployments.json) (v2.3.1 currently hosts Still Alive).

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
git clone https://github.com/0xsyncroot/opensea-cli.git
cd opensea-cli
npm install
npx tsx src/index.ts help   # run TS without rebuild
npm run build               # tsc → dist/
```

Deps: `ethers v6`, `chalk`, `dotenv`, `prompts`. Sources under `src/`.

---

## License

MIT — see [LICENSE](LICENSE).

---

## Disclaimer

Mainnet transactions move real ETH. No warranty. **You are responsible for everything you sign.** Start with `check` and `test` on a burner.
