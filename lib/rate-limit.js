// Limitador simples em memória (janela deslizante por IP).
// Em serverless cada instância tem a sua memória, então isto é uma barreira
// "melhor esforço"; para produção, complemente com o rate limit da plataforma
// (Vercel Firewall / Cloudflare WAF).
const buckets = new Map();

export function rateLimit(key, { limit, windowMs }) {
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 10_000) buckets.clear(); // evita crescimento ilimitado
  return hits.length <= limit;
}
