import { parseArgs } from 'node:util';
export function parseFlags(argv) {
    const { values, positionals } = parseArgs({
        args: argv,
        strict: false,
        allowPositionals: true,
        options: {
            rpc: { type: 'string' },
            chain: { type: 'string' },
            relays: { type: 'string' },
            'auth-key': { type: 'string' },
            contract: { type: 'string' },
            fn: { type: 'string' },
            args: { type: 'string' },
            qty: { type: 'string' },
            price: { type: 'string' },
            'gas-limit': { type: 'string' },
            priority: { type: 'string' },
            'max-fee': { type: 'string' },
            blocks: { type: 'string' },
            'start-ts': { type: 'string' },
            'start-block': { type: 'string' },
            'preflight-lead': { type: 'string' },
            env: { type: 'string' },
            'private-key': { type: 'string', short: 'k' },
            to: { type: 'string' },
            yes: { type: 'boolean', short: 'y' },
            help: { type: 'boolean', short: 'h' },
        },
    });
    const first = positionals[0]?.toLowerCase();
    let command = 'unknown';
    if (!first || first === 'help' || values.help)
        command = 'help';
    else if (first === 'check' || first === 'info' || first === 'preflight')
        command = 'check';
    else if (first === 'test' || first === 'sim' || first === 'simulate')
        command = 'test';
    else if (first === 'mint' || first === 'go' || first === 'send')
        command = 'mint';
    return {
        command,
        rpc: values.rpc,
        chain: values.chain,
        relays: values.relays,
        authKey: values['auth-key'],
        contract: values.contract,
        fn: values.fn,
        args: values.args,
        qty: values.qty,
        price: values.price,
        gasLimit: values['gas-limit'],
        priority: values.priority,
        maxFee: values['max-fee'],
        blocks: values.blocks,
        startTs: values['start-ts'],
        startBlock: values['start-block'],
        preflightLead: values['preflight-lead'],
        envPath: values.env,
        privateKey: values['private-key'],
        to: values.to,
        yes: Boolean(values.yes),
        help: Boolean(values.help),
    };
}
