import { Interface, Transaction, getAddress, parseUnits, } from 'ethers';
function resolveArg(a, minter, qty) {
    if (a === 'self')
        return minter;
    if (a === 'qty' || a === 'quantity')
        return qty;
    return a;
}
export async function prepare(cfg, minter, provider, overridePriority) {
    const t0 = Date.now();
    const iface = new Interface([`function ${cfg.mintFunction}`]);
    const fnName = cfg.mintFunction.split('(')[0];
    const args = cfg.mintArgs.map((a) => resolveArg(a, minter.address, cfg.quantity));
    const data = iface.encodeFunctionData(fnName, args);
    const [block, nonce] = await Promise.all([
        provider.getBlock('latest'),
        provider.getTransactionCount(minter.address, 'pending'),
    ]);
    if (!block)
        throw new Error('no latest block from RPC');
    const baseFee = block.baseFeePerGas ?? 0n;
    const maxPriority = overridePriority ?? parseUnits(String(cfg.maxPriorityFeeGwei), 'gwei');
    let maxFee = parseUnits(String(cfg.maxFeeGwei), 'gwei');
    const minMaxFee = baseFee + maxPriority;
    if (minMaxFee > maxFee) {
        maxFee = minMaxFee + parseUnits('1', 'gwei');
    }
    const txReq = {
        to: getAddress(cfg.contract),
        data,
        value: cfg.mintValueWei,
        chainId: cfg.chainId,
        nonce,
        gasLimit: cfg.gasLimit,
        maxFeePerGas: maxFee,
        maxPriorityFeePerGas: maxPriority,
        type: 2,
    };
    const signed = await minter.signTransaction(txReq);
    const parsed = Transaction.from(signed);
    return {
        signedTx: signed,
        txHash: parsed.hash ?? '',
        nonce,
        baseFee,
        maxFee,
        maxPriority,
        blockNumber: block.number,
        data,
        prepareMs: Date.now() - t0,
    };
}
