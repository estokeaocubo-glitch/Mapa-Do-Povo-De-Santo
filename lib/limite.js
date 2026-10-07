// Limite de tentativas guardado no D1: vale para todas as instâncias do
// Worker no mundo (um contador em memória seria zerado a cada instância).
// O IP é guardado apenas como hash SHA-256.
import { sha256Hex } from './senha.js';

export async function dentroDoLimite(db, tipo, ip, { limite, janelaMs }) {
  const chave = `${tipo}:${await sha256Hex(`mapa-povo-de-santo:${ip}`)}`;
  const agora = Date.now();
  const { total } = await db
    .prepare('SELECT COUNT(*) AS total FROM tentativas WHERE chave = ?1 AND em > ?2')
    .bind(chave, agora - janelaMs)
    .first();
  if (total >= limite) return false;
  await db.batch([
    db.prepare('INSERT INTO tentativas (chave, em) VALUES (?1, ?2)').bind(chave, agora),
    // Faxina: nada é guardado por mais de 24 h.
    db.prepare('DELETE FROM tentativas WHERE em < ?1').bind(agora - 24 * 60 * 60 * 1000),
  ]);
  return true;
}
