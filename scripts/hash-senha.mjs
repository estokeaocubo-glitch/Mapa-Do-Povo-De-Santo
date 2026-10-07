// Gera o valor de ACESSO_RESTRITO_HASH a partir da senha digitada no terminal.
// Uso: npm run hash-senha
import { createInterface } from 'node:readline/promises';
import { gerarHash } from '../lib/senha.js';

const rl = createInterface({ input: process.stdin, output: process.stdout });
const senha = await rl.question('Senha de acesso aos contatos restritos: ');
rl.close();
console.log(`\nACESSO_RESTRITO_HASH=${gerarHash(senha)}`);
