// Gera o valor do secret ACESSO_RESTRITO_HASH a partir da senha digitada.
// Uso: npm run hash-senha
import { createInterface } from 'node:readline/promises';
import { gerarHash } from '../lib/senha.js';

const rl = createInterface({ input: process.stdin, output: process.stdout });
const senha = await rl.question('Senha de acesso aos contatos restritos: ');
rl.close();
console.log(`\n${await gerarHash(senha)}\n`);
console.log('Produção:  npx wrangler secret put ACESSO_RESTRITO_HASH   (cole o valor acima)');
console.log('Local:     ACESSO_RESTRITO_HASH=<valor> no arquivo .dev.vars');
