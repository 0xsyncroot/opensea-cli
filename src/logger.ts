import chalk from 'chalk';

const pad = (s: string, n: number) => s.padEnd(n);

export const log = {
  info: (m: string) => console.log(chalk.cyan('[i]'), m),
  ok:   (m: string) => console.log(chalk.green('[+]'), m),
  warn: (m: string) => console.log(chalk.yellow('[!]'), m),
  err:  (m: string) => console.log(chalk.red('[x]'), m),
  step: (m: string) => console.log(chalk.magenta.bold('[>]'), chalk.bold(m)),
  dim:  (m: string) => console.log(chalk.gray('    ' + m)),
  kv:   (k: string, v: string | number | bigint) =>
    console.log('   ', chalk.gray(pad(k, 22)), chalk.white(String(v))),
  num:  (k: string, v: string | number | bigint, unit = '') =>
    console.log('   ', chalk.gray(pad(k, 22)), chalk.yellow(String(v)) + (unit ? chalk.gray(' ' + unit) : '')),
  banner: (title: string) => {
    const bar = chalk.magenta('─'.repeat(title.length + 6));
    console.log();
    console.log(bar);
    console.log(chalk.magenta('│ ') + chalk.bold.white(title) + chalk.magenta(' │'));
    console.log(bar);
  },
};
