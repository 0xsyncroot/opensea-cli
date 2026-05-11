#!/usr/bin/env node
import { JsonRpcProvider, Wallet, formatEther, parseUnits, } from 'ethers';
import chalk from 'chalk';
import { parseFlags } from './args.js';
import { loadConfig } from './config.js';
import { Flashbots } from './flashbots.js';
import { log } from './logger.js';
import { loadPrivateKey, confirm } from './prompt.js';
import { prepare } from './mint.js';
import { clockDrift, waitUntilUnix, waitUntilBlock, feeHistoryPercentiles, gwei, countdown, } from './timing.js';
import { probeContract, findProbe, probeSaleContract, PRICE_LABELS, START_LABELS, MAX_PER_WALLET_LABELS, } from './probe.js';
import { extractMintedIds, transferAllTo, printTransferSummary } from './transfer.js';
const VERSION = '0.1.0';
let submittedAny = false;
process.on('SIGINT', () => {
    process.stdout.write('\n');
    if (submittedAny) {
        log.warn('Cancelled — bundles already broadcast may still land. Check Etherscan for the minter address.');
    }
    else {
        log.warn('Cancelled by user — no transactions submitted, nothing on-chain.');
    }
    process.exit(130);
});
function printHelp() {
    const b = chalk.bold, c = chalk.cyan, g = chalk.gray, y = chalk.yellow, r = chalk.red;
    console.log();
    console.log(b('opensea-cli') + g(`  v${VERSION}  — fast NFT public-mint via Flashbots + multi-builder`));
    console.log();
    console.log(b('USAGE'));
    console.log(`  ${c('opensea-cli')} ${y('<command>')} ${r('--contract <addr>')} [${g('--price <eth>')}] [more flags]`);
    console.log();
    console.log(b('COMMANDS'));
    console.log(`  ${c('check')}   verify contract on-chain, gas market, clock           ${g('(no key)')}`);
    console.log(`  ${c('test')}    sign + simulate mint via Flashbots, do NOT submit     ${g('(key prompt)')}`);
    console.log(`  ${c('mint')}    submit signed bundle to all builders                  ${g('(key prompt)')}`);
    console.log();
    console.log(b('REQUIRED'));
    console.log(`  ${r('--contract')} <0x...>      NFT contract to mint`);
    console.log();
    console.log(b('AUTO-FILLED FROM CONTRACT') + g('  — pass to override'));
    console.log(`  ${y('--price')} <eth>           ETH per token. ${g('Default: probed from contract or 0')}`);
    console.log(`  ${y('--fn')} <sig>              Mint function. ${g('Default: mint(uint256)')}`);
    console.log(`  ${y('--qty')} <n>               Quantity. ${g('Default: 1 (warns if > maxPerWallet on contract)')}`);
    console.log(`  ${y('--start-ts')} <unix>       Mint open time. ${g('Default: probed from contract.publicSaleStartTime/mintStartTime')}`);
    console.log(`  ${y('--start-block')} <n>       Wait until block N`);
    console.log();
    console.log(b('PRIVATE KEY'));
    console.log(`  ${y('-k, --private-key')} <hex>  Funds-holding key (0x… 32-byte hex)`);
    console.log(`  ${g('(omit)')}                  Falls back to interactive hidden prompt`);
    console.log(`  ${chalk.yellow('Warning: --private-key is recorded in shell history & visible to `ps`. Clear history on shared hosts.')}`);
    console.log();
    console.log(b('AFTER MINT'));
    console.log(`  ${y('--to')} <0x...>            Auto-transfer minted NFTs to this address after success`);
    console.log();
    console.log(b('NETWORK'));
    console.log(`  ${y('--rpc')} <url>             RPC URL. ${g('Default: publicnode. For real mints use Alchemy/Infura')}`);
    console.log(`  ${y('--chain')} <id>            Chain ID. ${g('Default: 1 (mainnet)')}`);
    console.log(`  ${y('--relays')} <csv>          Override builder relays`);
    console.log();
    console.log(b('SAFE DEFAULTS') + g('  — usually leave alone'));
    console.log(`  ${y('--priority')} ${g('auto:75+0.5')}    Adaptive tip = p75 of last 5 blocks + 0.5 gwei. Min winning gas.`);
    console.log(`  ${y('--blocks')} ${g('3')}              Future blocks targeted per relay (6×3 = 18 attempts)`);
    console.log(`  ${y('--gas-limit')} ${g('300000')}      Refunded by Flashbots if unused`);
    console.log(`  ${y('--max-fee')} ${g('100')}           maxFeePerGas ceiling (gwei)`);
    console.log(`  ${y('--args')} ${g('\'["qty"]\'')}        Args; "self"→minter, "qty"→quantity`);
    console.log(`  ${y('--preflight-lead')} ${g('30')}     Final re-check N seconds before fire`);
    console.log(`  ${y('--auth-key')} <hex>        Persistent Flashbots auth (reputation)`);
    console.log(`  ${y('--env')} <path>            Load env vars from file. ${g('Default: ./.env')}`);
    console.log(`  ${y('-y, --yes')}               Skip confirmations`);
    console.log();
    console.log(b('HOW SCHEDULED MODE WORKS'));
    console.log(`  ${g('1. CLI probes contract for `publicSaleStartTime` / `mintStartTime` / `mintStart`')}`);
    console.log(`  ${g('2. Past start time, or no schedule → fires immediately at current head')}`);
    console.log(`  ${g('3. Future start time → smart wait, with FINAL re-check at T-' + chalk.yellow('30s'))}`);
    console.log(`  ${g('   (re-probes contract, re-fetches gas market, shows diff vs initial check)')}`);
    console.log(`  ${g('4. 10-second countdown before fire — press ' + chalk.red('Ctrl+C') + ' to abort safely')}`);
    console.log(`  ${g('5. Bundle blasted to all builders, then receipt polling')}`);
    console.log();
    console.log(b('EXAMPLES'));
    console.log(`  ${g('# 1. Verify before risking anything:')}`);
    console.log(`  ${c('opensea-cli check --contract 0xe10e26899704f77c2c3927b53ece41a65f913c0d')}`);
    console.log();
    console.log(`  ${g('# 2. Simulate mint (price auto-detected, signs but does NOT submit):')}`);
    console.log(`  ${c('opensea-cli test  --contract 0xABC...')}`);
    console.log();
    console.log(`  ${g('# 3. Mint right now into the minter wallet:')}`);
    console.log(`  ${c('opensea-cli mint  --contract 0xABC...')}`);
    console.log();
    console.log(`  ${g('# 4. Mint into minter, then auto-transfer to a cold wallet:')}`);
    console.log(`  ${c('opensea-cli mint  --contract 0xABC... --to 0xCOLD...')}`);
    console.log();
    console.log(`  ${g('# 5. Unattended mint with key on CLI (no prompt):')}`);
    console.log(`  ${c('opensea-cli mint  --contract 0xABC... -k 0xPRIVATEKEY --to 0xCOLD... --yes')}`);
    console.log();
    console.log(b('SAFETY'));
    console.log(g('  • Private key is prompted at runtime (hidden). Never stored.'));
    console.log(g('  • Always run ') + c('check') + g(' first to confirm contract address + state.'));
    console.log(g('  • In scheduled mode the CLI re-verifies the contract right before firing.'));
    console.log(g('  • Press ') + chalk.red('Ctrl+C') + g(' any time before fire — nothing is submitted until countdown ends.'));
    console.log();
}
async function adaptivePriority(provider, cfg) {
    if (!cfg.adaptive)
        return undefined;
    const map = await feeHistoryPercentiles(provider, [cfg.adaptive.percentile], 5);
    const p = map[cfg.adaptive.percentile] ?? 0n;
    const bid = p + parseUnits(String(cfg.adaptive.premiumGwei), 'gwei');
    const cap = parseUnits(String(cfg.maxPriorityFeeGwei), 'gwei');
    const capped = bid > cap ? cap : bid;
    log.kv('priority bid', `${gwei(capped)} gwei` + chalk.gray(`  (p${cfg.adaptive.percentile}=${gwei(p)} + ${cfg.adaptive.premiumGwei})`));
    if (bid > cap)
        log.warn(`bid capped at ${cfg.maxPriorityFeeGwei} gwei`);
    return capped;
}
async function watchInclusion(provider, txHash, startBlock, windowBlocks) {
    log.step('Watching for inclusion');
    const deadline = startBlock + windowBlocks + 2;
    while (true) {
        await new Promise((r) => setTimeout(r, 4000));
        const [receipt, head] = await Promise.all([
            provider.getTransactionReceipt(txHash),
            provider.getBlockNumber(),
        ]);
        if (receipt) {
            return receipt;
        }
        log.dim(`head=${head}, target ${startBlock + 1}..${startBlock + windowBlocks}, waiting…`);
        if (head > deadline) {
            log.warn('bundle not included within target window — bump priority and retry');
            return null;
        }
    }
}
function printMintBanner(success) {
    const bar = '═'.repeat(48);
    console.log();
    if (success) {
        console.log(chalk.green(bar));
        console.log(chalk.green.bold('  ✓ MINTED  '));
        console.log(chalk.green(bar));
    }
    else {
        console.log(chalk.red(bar));
        console.log(chalk.red.bold('  ✗ MINT FAILED  '));
        console.log(chalk.red(bar));
    }
    console.log();
}
async function checkMode(cfg) {
    log.banner('PREFLIGHT  ' + chalk.gray(cfg.contract));
    const provider = new JsonRpcProvider(cfg.rpcUrl, cfg.chainId, { staticNetwork: true });
    // 1) Bytecode first — if missing, nothing else matters
    const code = await provider.getCode(cfg.contract);
    if (code === '0x') {
        log.err(`NO BYTECODE at ${cfg.contract} — contract not deployed (or wrong address)`);
        log.dim(`verify on Etherscan: https://etherscan.io/address/${cfg.contract}`);
        process.exit(2);
    }
    // 2) Probe contract + measure drift + fee history in parallel
    const [probes, d, feeMap] = await Promise.all([
        probeContract(provider, cfg.contract).catch(() => []),
        clockDrift(provider),
        feeHistoryPercentiles(provider, [50, 75, 99], 5).catch(() => ({ 50: 0n, 75: 0n, 99: 0n })),
    ]);
    // 3) Contract identity (the most important info)
    const get = (k) => probes.find((x) => x.label === k)?.value;
    const name = get('name'), sym = get('symbol');
    const total = get('totalSupply'), max = get('MAX_SUPPLY') ?? get('maxSupply') ?? get('MAX_TOKENS');
    const price = get('price') ?? get('mintPrice') ?? get('publicSalePrice') ?? get('cost') ?? get('PUBLIC_PRICE') ?? get('MINT_PRICE');
    const startTs = get('publicSaleStartTime') ?? get('mintStartTime') ?? get('mintStart');
    const active = get('saleIsActive') ?? get('publicMintActive') ?? get('isMintActive') ?? get('mintActive') ?? get('publicSaleActive');
    const paused = get('paused');
    log.kv('name / symbol', `${chalk.bold(name ?? '?')}${sym ? chalk.gray(' (' + sym + ')') : ''}`);
    if (total && max) {
        const t = BigInt(total), m = BigInt(max);
        const rem = m - t;
        if (t >= m) {
            log.kv('supply', chalk.red.bold(`SOLD OUT (${t}/${m})`));
        }
        else {
            log.kv('supply', `${total}/${max}  ${chalk.green('(' + rem + ' left)')}`);
        }
    }
    else if (total)
        log.kv('supply', `${total} minted`);
    if (price && price !== '0') {
        try {
            log.kv('mint price', chalk.bold(formatEther(BigInt(price)) + ' ETH') + chalk.gray(' (on-chain)'));
        }
        catch { /* */ }
    }
    if (active === 'false')
        log.kv('sale state', chalk.yellow.bold('NOT OPEN') + chalk.gray(' (saleIsActive=false)'));
    else if (active === 'true')
        log.kv('sale state', chalk.green.bold('OPEN'));
    if (paused === 'true')
        log.kv('paused', chalk.red.bold('TRUE'));
    if (startTs && Number(startTs) > 0) {
        const ts = Number(startTs);
        const now = Math.floor(Date.now() / 1000);
        if (ts > now)
            log.kv('starts in', chalk.yellow(`${Math.floor((ts - now) / 60)}m${(ts - now) % 60}s`) + chalk.gray(`  (${new Date(ts * 1000).toISOString()})`));
        else
            log.kv('started at', chalk.gray(new Date(ts * 1000).toISOString()));
    }
    // 4) Network conditions — one compact line
    const driftLine = `${d.driftSec >= 0 ? '+' : ''}${d.driftSec}s`;
    const driftOk = Math.abs(d.driftSec) <= 24;
    log.kv('chain / clock', `head ${d.headBlock}  ` + (driftOk ? chalk.green(`drift ${driftLine}`) : chalk.yellow(`drift ${driftLine}`)));
    log.kv('gas market', `${chalk.bold(gwei(feeMap[75] ?? 0n))} gwei` + chalk.gray(`  (p50 ${gwei(feeMap[50] ?? 0n)} · p99 ${gwei(feeMap[99] ?? 0n)}; bid p75+0.5 to win)`));
    // 5) Links
    log.kv('etherscan', chalk.gray(`https://etherscan.io/address/${cfg.contract}#readContract`));
    log.kv('opensea', chalk.gray(`https://opensea.io/assets/ethereum/${cfg.contract}/0`));
    console.log();
    if (active === 'false')
        log.warn('sale flag is FALSE — wait for it to flip before minting');
    else if (paused === 'true')
        log.warn('contract paused — wait for unpause');
    else
        log.ok(`ready — run \`opensea-cli test --contract ${cfg.contract}\` to dry-run with your key`);
}
async function autoFillFromProbes(cfg, probes, provider) {
    const out = {};
    // PRICE / START / MAX-PER-WALLET from direct view-functions on cfg.contract
    if (!cfg.priceExplicit) {
        const p = findProbe(probes, PRICE_LABELS);
        if (p && p.value !== '0') {
            try {
                const wei = BigInt(p.value);
                cfg.mintValueWei = wei * BigInt(cfg.quantity);
                out.autoPrice = `${formatEther(wei)} ETH × ${cfg.quantity} = ${formatEther(cfg.mintValueWei)} ETH  (from contract.${p.label}())`;
            }
            catch { /* not a number */ }
        }
    }
    if (!cfg.startExplicit) {
        const s = findProbe(probes, START_LABELS);
        if (s) {
            const ts = Number(s.value);
            const now = Math.floor(Date.now() / 1000);
            if (ts > now) {
                cfg.mintStartTs = ts;
                out.autoStart = ts;
            }
        }
    }
    const m = findProbe(probes, MAX_PER_WALLET_LABELS);
    if (m) {
        try {
            const lim = BigInt(m.value);
            if (BigInt(cfg.quantity) > lim && lim > 0n) {
                out.autoMaxPerWallet = `${m.value} (your --qty ${cfg.quantity} exceeds — tx will revert)`;
            }
        }
        catch { /* */ }
    }
    // SALE-CONTRACT (TLStacks-like) probe: when args[0] looks like an NFT address,
    // try calling getDrop(nft) on cfg.contract. Fills price / start / gas-limit
    // when user did not pass them.
    const firstArg = cfg.mintArgs[0];
    if (typeof firstArg === 'string' && /^0x[0-9a-fA-F]{40}$/.test(firstArg)) {
        const tl = await probeSaleContract(provider, cfg.contract, firstArg);
        if (tl) {
            out.saleDrop = tl;
            if (!cfg.priceExplicit && tl.totalPerTokenWei > 0n) {
                cfg.mintValueWei = tl.totalPerTokenWei * BigInt(cfg.quantity);
                out.autoPrice = `${formatEther(tl.totalPerTokenWei)} ETH × ${cfg.quantity} = ${formatEther(cfg.mintValueWei)} ETH  ` +
                    `(TLStacks: publicCost ${formatEther(tl.publicCostWei)} + fee ${formatEther(tl.protocolFeeWei)})`;
            }
            if (!cfg.startExplicit && tl.publicOpensTs > Math.floor(Date.now() / 1000)) {
                cfg.mintStartTs = tl.publicOpensTs;
                out.autoStart = tl.publicOpensTs;
            }
            // TLStacks delegates to externalMint — bump gas headroom if user left default
            if (cfg.gasLimit < 400000n)
                cfg.gasLimit = 500000n;
            // Per-wallet cap from the sale contract
            if (BigInt(cfg.quantity) > tl.allowancePerWallet && tl.allowancePerWallet > 0n) {
                out.autoMaxPerWallet = `${tl.allowancePerWallet} (your --qty ${cfg.quantity} exceeds — tx will revert)`;
            }
        }
    }
    return out;
}
async function runMintFlow(cfg, flags, mode, autoYes) {
    const provider = new JsonRpcProvider(cfg.rpcUrl, cfg.chainId, { staticNetwork: true });
    // Probe contract FIRST so we can auto-fill price / start time / etc.
    log.step('Probing contract on-chain');
    let initialProbes = [];
    try {
        initialProbes = await probeContract(provider, cfg.contract);
    }
    catch (e) {
        log.warn(`probe failed: ${e.message} — proceeding with passed flags only`);
    }
    const auto = await autoFillFromProbes(cfg, initialProbes, provider);
    if (auto.saleDrop) {
        const phases = ['NOT_CONFIGURED', 'NOT_STARTED', 'PRESALE', 'PUBLIC_SALE', 'ENDED'];
        log.info(`sale-contract drop detected — ${phases[auto.saleDrop.phase] ?? 'phase ' + auto.saleDrop.phase}, ${auto.saleDrop.supplyRemaining} left, allowance ${auto.saleDrop.allowancePerWallet}/wallet`);
    }
    if (auto.autoPrice)
        log.info(`auto-detected price: ${auto.autoPrice}`);
    if (auto.autoStart)
        log.info(`auto-detected mint open at ${new Date(auto.autoStart * 1000).toISOString()} — scheduled mode`);
    if (auto.autoMaxPerWallet)
        log.warn(`maxPerWallet on contract: ${auto.autoMaxPerWallet}`);
    // Compact summary — only what affects the mint outcome
    const perToken = cfg.quantity > 0 ? cfg.mintValueWei / BigInt(cfg.quantity) : 0n;
    log.banner(mode === 'mint' ? 'MINT' : 'SIMULATION');
    log.kv('contract', cfg.contract);
    log.kv('mint', `${cfg.mintFunction} × ${cfg.quantity}` +
        (cfg.fnExplicit ? '' : chalk.gray('  (default fn)')));
    log.kv('cost', chalk.bold(formatEther(cfg.mintValueWei) + ' ETH') +
        chalk.gray(`  (${formatEther(perToken)} × ${cfg.quantity})`) +
        (cfg.priceExplicit ? '' : (auto.autoPrice ? chalk.green('  (auto)') : chalk.gray('  (default 0)'))));
    if (cfg.adaptive)
        log.kv('priority', `auto p${cfg.adaptive.percentile} + ${cfg.adaptive.premiumGwei} gwei`);
    else
        log.kv('priority', cfg.maxPriorityFeeGwei + ' gwei');
    if (cfg.mintStartTs) {
        log.kv('mint opens', new Date(cfg.mintStartTs * 1000).toISOString() + (cfg.startExplicit ? '' : chalk.green('  (auto)')));
    }
    if (cfg.mintStartBlock)
        log.kv('mint opens', `block ${cfg.mintStartBlock}`);
    if (flags.to)
        log.kv('→ transfer to', chalk.cyan(flags.to) + chalk.gray('  (after mint)'));
    const key = await loadPrivateKey({ privateKey: flags.privateKey });
    const minter = new Wallet(key, provider);
    const auth = cfg.flashbotsAuthKey ? new Wallet(cfg.flashbotsAuthKey) : Wallet.createRandom();
    const relays = cfg.relays.map((url) => ({ url, fb: new Flashbots(url, auth) }));
    const [d, balance] = await Promise.all([
        clockDrift(provider),
        provider.getBalance(minter.address),
    ]);
    log.kv('minter', minter.address + chalk.gray(`  head ${d.headBlock}  drift ${d.driftSec >= 0 ? '+' : ''}${d.driftSec}s`));
    // 3-tier balance check — clear messages because tx WILL fail if balance < mint cost
    const balEth = formatEther(balance);
    const mintEth = formatEther(cfg.mintValueWei);
    const worstGas = parseUnits(String(cfg.maxFeeGwei), 'gwei') * cfg.gasLimit;
    const worstTotal = cfg.mintValueWei + worstGas;
    const worstEth = formatEther(worstTotal);
    if (balance === 0n) {
        log.kv('balance', chalk.red.bold('0 ETH') + chalk.red('  ← wallet empty'));
        log.err(`Fund the wallet with at least ${worstEth} ETH before retrying.`);
        process.exit(2);
    }
    if (balance < cfg.mintValueWei) {
        log.kv('balance', chalk.red.bold(balEth + ' ETH') + chalk.red(`  ← LESS than mint cost ${mintEth} ETH (price × qty)`));
        log.err(`Mint WILL revert: balance < ${mintEth} ETH needed for price × quantity. Top up before retrying.`);
        process.exit(2);
    }
    if (balance < worstTotal) {
        log.kv('balance', chalk.yellow.bold(balEth + ' ETH') + chalk.yellow(`  ← OK for ${mintEth} ETH mint, but below ${worstEth} ETH worst-case (gas + mint)`));
        log.warn('mint may succeed; risk of failure if gas spikes during the block.');
    }
    else {
        log.kv('balance', chalk.green.bold(balEth + ' ETH') + chalk.green(`  ✓ covers ${worstEth} ETH worst-case`));
    }
    if (Math.abs(d.driftSec) > 60 && cfg.mintStartTs) {
        log.warn('system clock drift >60s — MINT_START_TS timing will be inaccurate');
    }
    // Scheduled mode: wait until T-lead, do FINAL preflight, then countdown
    if (cfg.mintStartTs || cfg.mintStartBlock) {
        const leadSec = cfg.preflightLeadSec;
        log.banner('SCHEDULED MODE — 2-STAGE CHECK');
        log.warn('Verify ONE MORE TIME below that the contract / function / price are correct.');
        log.warn(`Final preflight will run ${leadSec}s before fire. Cancel any time with Ctrl+C.`);
        // Stage 1: wait until lead-time before target
        if (cfg.mintStartTs) {
            await waitUntilUnix(cfg.mintStartTs, cfg.mintStartTs - leadSec);
        }
        else if (cfg.mintStartBlock) {
            const blocksLead = Math.max(1, Math.ceil(leadSec / 12));
            await waitUntilBlock(provider, cfg.mintStartBlock, cfg.mintStartBlock - blocksLead);
        }
        // Stage 2: FINAL preflight — re-probe, show diff
        log.banner('FINAL PREFLIGHT — VERIFY EVERYTHING');
        log.kv('contract', chalk.bold(cfg.contract));
        log.kv('function', chalk.bold(cfg.mintFunction));
        log.kv('quantity × price', `${cfg.quantity} × ${formatEther(cfg.mintValueWei / BigInt(cfg.quantity || 1))} ETH = ${chalk.bold(formatEther(cfg.mintValueWei) + ' ETH')}`);
        try {
            const now = await probeContract(provider, cfg.contract);
            const getNow = (k) => now.find((x) => x.label === k)?.value;
            const getOld = (k) => initialProbes.find((x) => x.label === k)?.value;
            const total = getNow('totalSupply');
            const max = getNow('MAX_SUPPLY') ?? getNow('maxSupply') ?? getNow('MAX_TOKENS');
            const oldTotal = getOld('totalSupply');
            if (total && oldTotal) {
                const diff = Number(total) - Number(oldTotal);
                log.kv('totalSupply', `${total}  ${diff > 0 ? chalk.yellow(`(+${diff} since check)`) : chalk.gray('(no change)')}`);
            }
            else if (total) {
                log.kv('totalSupply', total);
            }
            if (total && max && BigInt(total) >= BigInt(max)) {
                log.err('SOLD OUT during the wait — aborting');
                process.exit(2);
            }
            const active = getNow('saleIsActive') ?? getNow('publicMintActive') ?? getNow('isMintActive') ?? getNow('mintActive') ?? getNow('publicSaleActive');
            if (active === 'false')
                log.warn('sale flag still FALSE — your tx may revert');
            if (active === 'true')
                log.ok('sale flag is TRUE — open');
            const paused = getNow('paused');
            if (paused === 'true')
                log.err('contract is PAUSED — will revert');
        }
        catch (e) {
            log.warn(`re-probe failed: ${e.message}`);
        }
        const feeMap = await feeHistoryPercentiles(provider, [50, 75, 90, 99], 5);
        log.kv('fee p50/p75/p99', `${gwei(feeMap[50] ?? 0n)} / ${gwei(feeMap[75] ?? 0n)} / ${gwei(feeMap[99] ?? 0n)} gwei`);
        // 10-second final countdown — user can Ctrl+C
        log.step('Firing in 10 seconds — press Ctrl+C now to abort');
        await countdown(10, 'FIRING IN');
        // Stage 3: precise wait to exact target
        if (cfg.mintStartTs)
            await waitUntilUnix(cfg.mintStartTs);
        if (cfg.mintStartBlock)
            await waitUntilBlock(provider, cfg.mintStartBlock);
    }
    const overridePriority = await adaptivePriority(provider, cfg);
    const prepared = await prepare(cfg, minter, provider, overridePriority);
    log.kv('signed', `tip ${gwei(prepared.maxPriority)} gwei  cap ${gwei(prepared.maxFee)} gwei  nonce ${prepared.nonce}  ${chalk.gray(prepared.prepareMs + 'ms')}`);
    log.step('Simulating');
    const simRelay = relays.find((r) => /flashbots|titan|beaver|rsync/.test(r.url)) ?? relays[0];
    try {
        const sim = await simRelay.fb.callBundle([prepared.signedTx], prepared.blockNumber + 1);
        const txRes = sim.results?.[0];
        if (txRes?.error) {
            log.err(`sim REVERT: ${txRes.error}${txRes.revert ? ' — ' + txRes.revert : ''}`);
            if (mode === 'test')
                process.exit(2);
            if (!autoYes && !(await confirm('Send anyway?')))
                process.exit(1);
        }
        else {
            const gasUsed = txRes?.gasUsed != null ? ` (sim gas ${txRes.gasUsed})` : '';
            log.ok(`sim OK${gasUsed}`);
        }
    }
    catch (e) {
        log.err(`sim error: ${e.message}`);
        if (mode === 'test')
            process.exit(2);
        if (!autoYes && !(await confirm('Send anyway?')))
            process.exit(1);
    }
    if (mode === 'test') {
        log.ok('test complete — nothing submitted');
        return;
    }
    if (!autoYes && !cfg.mintStartTs && !cfg.mintStartBlock) {
        if (!(await confirm(chalk.yellow.bold('Submit bundle to all relays NOW?')))) {
            log.warn('aborted by user');
            return;
        }
    }
    const totalJobs = cfg.blocksToTarget * relays.length;
    log.step(`Blasting bundle: ${cfg.blocksToTarget} block(s) × ${relays.length} relay(s) = ${totalJobs} submissions`);
    const submit0 = Date.now();
    const jobs = [];
    for (let i = 1; i <= cfg.blocksToTarget; i++) {
        const target = prepared.blockNumber + i;
        for (const r of relays) {
            const host = new URL(r.url).hostname;
            jobs.push(r.fb.sendBundle([prepared.signedTx], target)
                .then((res) => {
                submittedAny = true;
                log.ok(`${host.padEnd(28)} block ${target} → ${res.bundleHash}`);
                return { relay: host, target, bundleHash: res.bundleHash };
            })
                .catch((e) => {
                log.err(`${host.padEnd(28)} block ${target}: ${e.message}`);
                return null;
            }));
        }
    }
    const submitted = (await Promise.all(jobs)).filter(Boolean);
    log.dim(`submitted ${submitted.length}/${totalJobs} bundles in ${Date.now() - submit0}ms`);
    if (submitted.length === 0) {
        log.err('all submissions failed — nothing to watch');
        return;
    }
    const receipt = await watchInclusion(provider, prepared.txHash, prepared.blockNumber, cfg.blocksToTarget);
    if (!receipt) {
        printMintBanner(false);
        log.err('bundle not included — minting failed');
        return;
    }
    if (receipt.status !== 1) {
        printMintBanner(false);
        log.err(`tx reverted on chain — block ${receipt.blockNumber}`);
        log.kv('etherscan', `https://etherscan.io/tx/${prepared.txHash}`);
        return;
    }
    printMintBanner(true);
    log.kv('block', receipt.blockNumber);
    log.kv('gas used', receipt.gasUsed.toString());
    log.kv('effective gas price', gwei(receipt.gasPrice ?? 0n) + ' gwei');
    log.kv('etherscan', `https://etherscan.io/tx/${prepared.txHash}`);
    // Auto-transfer to destination if --to is provided
    if (flags.to) {
        const tokens = extractMintedIds(receipt, cfg.contract, minter.address);
        if (tokens.length === 0) {
            log.warn('no ERC721 Transfer(from=0x0) events found — cannot identify minted tokens to forward');
            log.dim('this is normal for ERC1155 or non-standard mints; transfer manually');
            return;
        }
        log.banner(`AUTO-TRANSFER → ${flags.to}`);
        log.kv('tokens minted', `${tokens.length}  [${tokens.map((t) => t.tokenId).join(', ')}]`);
        log.kv('NFT contract', tokens[0].nftContract);
        log.kv('destination', flags.to);
        const outcomes = await transferAllTo(provider, minter, cfg.contract, flags.to, tokens);
        printTransferSummary(outcomes, flags.to);
    }
}
async function main() {
    const flags = parseFlags(process.argv.slice(2));
    if (flags.command === 'help' || flags.command === 'unknown') {
        printHelp();
        return;
    }
    const cfg = loadConfig(flags);
    if (flags.command === 'check')
        return checkMode(cfg);
    return runMintFlow(cfg, flags, flags.command, Boolean(flags.yes));
}
main().catch((e) => {
    log.err(e?.message ?? String(e));
    process.exitCode = 1;
});
