import * as readline from 'readline'

const rl = readline.createInterface(process.stdin, process.stdout)
// eslint-disable-next-line @typescript-eslint/unbound-method
export const question = (prompt: string) =>
  new Promise<string>((resolve) => rl.question(prompt, (answer) => resolve(answer)))
