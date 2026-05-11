import { Interface, parseUnits, getAddress, } from 'ethers';
import chalk from 'chalk';
import { log } from './logger.js';
// ERC721 Transfer event: Transfer(address indexed from, address indexed to, uint256 indexed tokenId)
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const ZERO_TOPIC = '0x' + '0'.repeat(64);
function topicAddress(addr) {
    return '0x' + addr.slice(2).toLowerCase().padStart(64, '0');
}
export function extractMintedIds(receipt, contract, minter) {
    const contractLc = contract.toLowerCase();
    const minterTopic = topicAddress(minter);
    const ids = [];
    for (const ev of receipt.logs) {
        if (ev.address.toLowerCase() !== contractLc)
            continue;
        if (ev.topics[0] !== TRANSFER_TOPIC)
            continue;
        if (ev.topics.length !== 4)
            continue; // ERC721 only (3-indexed). ERC20 has 3 topics.
        if (ev.topics[1] !== ZERO_TOPIC)
            continue; // must be mint (from = 0x0)
        if (ev.topics[2].toLowerCase() !== minterTopic)
            continue;
        try {
            ids.push(BigInt(ev.topics[3]));
        }
        catch { /* skip malformed */ }
    }
    return ids;
}
export async function transferAllTo(provider, minter, contract, destination, tokenIds) {
    const dest = getAddress(destination);
    const cAddr = getAddress(contract);
    const iface = new Interface([
        'function safeTransferFrom(address from, address to, uint256 tokenId)',
    ]);
    const outcomes = [];
    let nonce = await provider.getTransactionCount(minter.address, 'pending');
    for (let i = 0; i < tokenIds.length; i++) {
        const id = tokenIds[i];
        log.step(`Transfer ${i + 1}/${tokenIds.length} — tokenId ${id} → ${dest}`);
        try {
            const data = iface.encodeFunctionData('safeTransferFrom', [minter.address, dest, id]);
            const block = await provider.getBlock('latest');
            const baseFee = block?.baseFeePerGas ?? parseUnits('5', 'gwei');
            const priority = parseUnits('1.5', 'gwei');
            const maxFee = baseFee * 2n + priority;
            const txReq = {
                to: cAddr, data,
                chainId: Number((await provider.getNetwork()).chainId),
                nonce,
                gasLimit: 120000n,
                maxFeePerGas: maxFee,
                maxPriorityFeePerGas: priority,
                type: 2,
            };
            const sent = await minter.sendTransaction(txReq);
            log.dim(`  tx ${sent.hash} broadcast — waiting for confirmation…`);
            const rcpt = await sent.wait();
            nonce += 1;
            if (rcpt && rcpt.status === 1) {
                log.ok(`tokenId ${id} → transferred ${chalk.green('OK')} in block ${rcpt.blockNumber}`);
                log.dim(`  https://etherscan.io/tx/${sent.hash}`);
                outcomes.push({ tokenId: id, status: 'ok', txHash: sent.hash, blockNumber: rcpt.blockNumber });
            }
            else {
                log.err(`tokenId ${id} → transfer REVERTED on chain`);
                outcomes.push({ tokenId: id, status: 'fail', txHash: sent.hash, error: 'reverted' });
            }
        }
        catch (e) {
            log.err(`tokenId ${id} → ${e.message}`);
            outcomes.push({ tokenId: id, status: 'fail', error: e.message });
        }
    }
    return outcomes;
}
export function printTransferSummary(outcomes, destination) {
    const ok = outcomes.filter((o) => o.status === 'ok');
    const fail = outcomes.filter((o) => o.status === 'fail');
    console.log();
    console.log(chalk.magenta('─'.repeat(48)));
    console.log(chalk.bold.white(' TRANSFER SUMMARY'));
    console.log(chalk.magenta('─'.repeat(48)));
    console.log('  destination     ' + chalk.cyan(destination));
    console.log('  succeeded       ' + chalk.green.bold(ok.length + '/' + outcomes.length));
    if (ok.length) {
        for (const o of ok)
            console.log('    ' + chalk.green('✓') + ' ' + chalk.gray('id ') + chalk.white(String(o.tokenId)) + chalk.gray('  block ' + o.blockNumber));
    }
    if (fail.length) {
        console.log('  failed          ' + chalk.red.bold(fail.length));
        for (const o of fail)
            console.log('    ' + chalk.red('✗') + ' ' + chalk.gray('id ') + chalk.white(String(o.tokenId)) + chalk.red('  ' + o.error));
    }
    console.log(chalk.magenta('─'.repeat(48)));
}
