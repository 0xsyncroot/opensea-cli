import { parseArgs } from 'node:util';

export interface Flags {
  // commands (positional)
  command: 'check' | 'test' | 'mint' | 'help' | 'unknown';
  // overrides (all optional — merged onto env-loaded defaults)
  rpc?: string;
  chain?: string;
  relays?: string;
  authKey?: string;
  contract?: string;
  fn?: string;
  args?: string;
  qty?: string;
  price?: string;
  gasLimit?: string;
  priority?: string;          // "<gwei>" or "auto" or "auto:<pct>+<gwei>"
  maxFee?: string;
  blocks?: string;
  startTs?: string;
  startBlock?: string;
  preflightLead?: string;
  envPath?: string;
  privateKey?: string;
  to?: string;
  yes?: boolean;
  help?: boolean;
}

export function parseFlags(argv: string[]): Flags {
  const { values, positionals } = parseArgs({
    args: argv,
    strict: false,
    allowPositionals: true,
    options: {
      rpc:           { type: 'string' },
      chain:         { type: 'string' },
      relays:        { type: 'string' },
      'auth-key':    { type: 'string' },
      contract:      { type: 'string' },
      fn:            { type: 'string' },
      args:          { type: 'string' },
      qty:           { type: 'string' },
      price:         { type: 'string' },
      'gas-limit':   { type: 'string' },
      priority:      { type: 'string' },
      'max-fee':     { type: 'string' },
      blocks:        { type: 'string' },
      'start-ts':    { type: 'string' },
      'start-block': { type: 'string' },
      'preflight-lead': { type: 'string' },
      env:           { type: 'string' },
      'private-key': { type: 'string', short: 'k' },
      to:            { type: 'string' },
      yes:           { type: 'boolean', short: 'y' },
      help:          { type: 'boolean', short: 'h' },
    },
  });

  const first = positionals[0]?.toLowerCase();
  let command: Flags['command'] = 'unknown';
  if (!first || first === 'help' || values.help) command = 'help';
  else if (first === 'check' || first === 'info' || first === 'preflight') command = 'check';
  else if (first === 'test' || first === 'sim' || first === 'simulate')   command = 'test';
  else if (first === 'mint' || first === 'go' || first === 'send')         command = 'mint';

  return {
    command,
    rpc:        values.rpc as string | undefined,
    chain:      values.chain as string | undefined,
    relays:     values.relays as string | undefined,
    authKey:    values['auth-key'] as string | undefined,
    contract:   values.contract as string | undefined,
    fn:         values.fn as string | undefined,
    args:       values.args as string | undefined,
    qty:        values.qty as string | undefined,
    price:      values.price as string | undefined,
    gasLimit:   values['gas-limit'] as string | undefined,
    priority:   values.priority as string | undefined,
    maxFee:     values['max-fee'] as string | undefined,
    blocks:     values.blocks as string | undefined,
    startTs:    values['start-ts'] as string | undefined,
    startBlock: values['start-block'] as string | undefined,
    preflightLead: values['preflight-lead'] as string | undefined,
    envPath:    values.env as string | undefined,
    privateKey: values['private-key'] as string | undefined,
    to:         values.to as string | undefined,
    yes:        Boolean(values.yes),
    help:       Boolean(values.help),
  };
}
