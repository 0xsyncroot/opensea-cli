import chalk from 'chalk';
const pad = (s, n) => s.padEnd(n);
export const log = {
    info: (m) => console.log(chalk.cyan('[i]'), m),
    ok: (m) => console.log(chalk.green('[+]'), m),
    warn: (m) => console.log(chalk.yellow('[!]'), m),
    err: (m) => console.log(chalk.red('[x]'), m),
    step: (m) => console.log(chalk.magenta.bold('[>]'), chalk.bold(m)),
    dim: (m) => console.log(chalk.gray('    ' + m)),
    kv: (k, v) => console.log('   ', chalk.gray(pad(k, 22)), chalk.white(String(v))),
    num: (k, v, unit = '') => console.log('   ', chalk.gray(pad(k, 22)), chalk.yellow(String(v)) + (unit ? chalk.gray(' ' + unit) : '')),
    banner: (title) => {
        const bar = chalk.magenta('─'.repeat(title.length + 6));
        console.log();
        console.log(bar);
        console.log(chalk.magenta('│ ') + chalk.bold.white(title) + chalk.magenta(' │'));
        console.log(bar);
    },
};
