import { Client } from "stoat.js";

/**
 * Se esta instância permite que o usuário atual crie servidores.
 *
 * A instância pode restringir a criação a uma lista de usuários
 * (`restrict_server_creation`, em `GET /`). Lista vazia significa liberado
 * para todos — é o comportamento padrão.
 *
 * Sem esta checagem a interface oferece "criar servidor" para todo mundo e
 * só o servidor recusa, depois do clique: o usuário descobre a regra por um
 * erro em vez de pela ausência do botão.
 */
export function podeCriarServidor(client: Client | undefined): boolean {
  const restritos =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client?.configuration as any)?.features?.limits?.global
      ?.restrict_server_creation;

  if (!Array.isArray(restritos) || restritos.length === 0) return true;

  const eu = client?.user?.id;
  return eu ? restritos.includes(eu) : false;
}
