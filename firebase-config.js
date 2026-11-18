/* =====================================================================
   firebase-config.js
   ---------------------------------------------------------------------
   Preencha os valores abaixo com os dados do SEU projeto Firebase
   (Configurações do projeto → Seus apps → App da Web → Configuração).

   IMPORTANTE: estes valores NÃO são segredos. Todo site que usa Firebase
   precisa expô-los no navegador. A proteção dos dados vem das REGRAS do
   Firestore (arquivo firestore.rules), não de esconder esta configuração.
   ===================================================================== */

export const firebaseConfig = {
  apiKey: "AIzaSyCEAroNklTniLqbXIseg-puFBzbOxhoD78",
  authDomain: "pixel-invader.firebaseapp.com",
  projectId: "pixel-invader",
  appId: "1:610297424046:web:82299c1043243920dba53f"
};

/* Domínio do e-mail da escola, SEM o "@".
   Exemplo: "escola.pr.gov.br"
   Só e-mails que terminam com @ESTE_DOMINIO conseguem entrar.
   Lembre-se de trocar o mesmo domínio no arquivo firestore.rules. */
export const DOMINIO_ESCOLA = "escola.pr.gov.br";
