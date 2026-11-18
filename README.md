# Pixel Invaders

Jogo de tiro 2D em pixel art, com 10 fases, 2 chefes, controles para computador e celular, login com e-mail da escola e progresso salvo na nuvem.

Funciona como site estático: roda no GitHub Pages, sem servidor próprio. O login e o salvamento usam o Firebase (plano gratuito).

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `index.html` | Página, telas de menu e botões |
| `style.css` | Visual dos menus e ajustes para celular |
| `game.js` | O jogo: fases, chefes, controles, telas |
| `auth.js` | Login com Google e salvamento (Firebase) |
| `firebase-config.js` | **Você preenche**: dados do Firebase e domínio da escola |
| `firestore.rules` | Regras de segurança do banco (você cola no Firebase) |

## Controles

**Computador:** `W A S D` movem, o mouse mira, o clique atira (segurar dispara em sequência). `P` ou `Esc` pausa, `M` liga/desliga o som, `R` repete a fase no fim dela.

**Celular (modo paisagem):** joystick esquerdo move, joystick direito mira e atira automaticamente. Botões no canto superior para pausar e entrar em tela cheia. O jogo pausa sozinho se você sair da aba ou girar o aparelho para a vertical.

## Como funcionam as fases

- 10 fases. Cada uma tem um objetivo: eliminar N inimigos, sobreviver X segundos ou derrotar um chefe (fases 5 e 10).
- Cada fase começa com 3 vidas. As estrelas dependem das vidas que sobraram: 3 vidas = 3 estrelas, 2 = 2, 1 = 1.
- Concluir uma fase libera a próxima. Terminar com vidas sobrando dá bônus de 100 pontos por vida.
- O "recorde" é a soma das melhores pontuações de cada fase.
- Para ajustar a dificuldade, edite a lista `FASES` no começo do `game.js` (quantidade, velocidade, tipos de inimigos e objetivo de cada fase).

---

## Passo a passo para publicar

### 1. Criar o projeto no Firebase

1. Acesse o [console do Firebase](https://console.firebase.google.com/) com uma conta Google e clique em **Adicionar projeto**. Dê um nome (por exemplo, `pixel-invaders`). Você pode desativar o Google Analytics.
2. Na página inicial do projeto, clique no ícone **Web** (`</>`) para registrar um app da Web. Dê um apelido e **não** marque o Firebase Hosting.
3. O Firebase vai mostrar um bloco `firebaseConfig` com `apiKey`, `authDomain`, `projectId` e `appId`. Deixe essa tela aberta ou copie os valores.

### 2. Ativar o login com Google

1. No menu, vá em **Authentication → Começar → Sign-in method**.
2. Ative o provedor **Google**, escolha um e-mail de suporte e salve.

### 3. Autorizar o endereço do seu site

Em **Authentication → Settings → Authorized domains**, clique em **Add domain** e adicione o endereço onde o jogo ficará no GitHub Pages, **sem** `https://` e **sem** o nome do repositório:

```
SEU-USUARIO.github.io
```

O `localhost` já vem autorizado, para você testar no seu computador.

Sem este passo, o login falha com a mensagem "Este site não está autorizado no Firebase".

### 4. Criar o banco (Firestore) e colar as regras

1. No menu, vá em **Firestore Database → Criar banco de dados**.
2. Escolha uma região próxima (por exemplo, `southamerica-east1`, em São Paulo) e inicie em **modo de produção**.
3. Abra o arquivo `firestore.rules` deste projeto e **troque `DOMINIO_DA_ESCOLA`** pelo domínio do e-mail da escola. Os pontos precisam de duas barras invertidas. Exemplo para `escola.pr.gov.br`:

   ```
   request.auth.token.email.matches('.*@escola\\.pr\\.gov\\.br$')
   ```
4. Na aba **Regras** do Firestore, apague o conteúdo, cole o do `firestore.rules` e clique em **Publicar**.

### 5. Preencher o `firebase-config.js`

Abra o arquivo e preencha os valores do passo 1, mais o domínio da escola **sem o `@`**:

```js
export const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "pixel-invaders-xxxx.firebaseapp.com",
  projectId: "pixel-invaders-xxxx",
  appId: "1:123456789:web:abcdef"
};

export const DOMINIO_ESCOLA = "escola.pr.gov.br";
```

Enquanto os valores originais (`COLE_AQUI...`) estiverem lá, o botão de login fica desativado e só o modo convidado funciona.

### 6. Testar no seu computador

Os módulos JavaScript não funcionam abrindo o `index.html` com duplo clique. Use um servidor local, na pasta do projeto:

```bash
python3 -m http.server 8000
```

Abra `http://localhost:8000`. Teste o login, jogue uma fase, feche a aba e entre de novo: o progresso deve voltar.

### 7. Publicar no GitHub Pages

1. Crie um repositório no GitHub e envie **todos os arquivos na raiz** (`index.html`, `style.css`, `game.js`, `auth.js`, `firebase-config.js`, `firestore.rules`, `README.md`).
2. No repositório, vá em **Settings → Pages**.
3. Em **Build and deployment**, escolha **Deploy from a branch**, selecione a branch `main` e a pasta `/ (root)` e salve.
4. Em um ou dois minutos o site estará em `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`. Passe esse link para os amigos.

---

## Segurança e privacidade

**A configuração do Firebase é pública, e isso é normal.** Todo site que usa Firebase precisa colocar esses valores no navegador. Esconder o `firebase-config.js` não protege nada. A proteção vem das **regras do Firestore**, que o servidor do Firebase aplica a cada leitura e escrita:

- só entra quem está logado com e-mail **verificado** do domínio da escola;
- cada jogador lê e escreve **apenas o próprio documento** (`users/{uid}`);
- o formato dos dados é validado: fase de 1 a 10, estrelas de 0 a 3, pontuações dentro de limites razoáveis;
- todo o resto do banco é negado.

O código do jogo também confere o domínio, mas essa checagem acontece no navegador e pode ser contornada. Por isso as regras são a barreira de verdade.

**O que é guardado:** apenas o `uid` (um identificador gerado pelo Firebase) e os dados de progresso. O e-mail e o nome **não** são gravados no banco. O primeiro nome aparece só na tela, durante a sessão.

**Limite honesto:** as regras impedem que uma pessoa mexa no progresso de outra, mas não impedem que alguém altere o *próprio* progresso pelas ferramentas do navegador, dentro dos limites das regras. Para um jogo entre amigos isso costuma bastar. Para ranking competitivo, seria preciso validar as pontuações em um servidor.

**Estudantes menores de idade:** como o login usa e-mails escolares, converse com a escola antes de divulgar o jogo para os alunos. Vale confirmar se ela autoriza o uso da conta escolar em serviços de terceiros e se há exigência de ciência dos responsáveis (LGPD).

---

## Problemas comuns

| Sintoma | O que fazer |
|---|---|
| Botão "Login indisponível" | `firebase-config.js` ainda com os valores originais, ou sem internet para carregar o Firebase. |
| "Este site não está autorizado no Firebase" | Faltou adicionar `SEU-USUARIO.github.io` em Authentication → Settings → Authorized domains (passo 3). |
| "Use o seu e-mail da escola" | A conta usada não termina com o domínio configurado em `DOMINIO_ESCOLA`. |
| Entra, mas o progresso não salva ("Sem conexão com o servidor…") | Regras não publicadas, domínio errado ou sem escape dos pontos no `firestore.rules`. O jogo continua funcionando e guarda o progresso no aparelho. |
| Aparece "app bloqueado" ao entrar com a conta da escola | O administrador do Google Workspace da escola restringiu apps de terceiros. Peça à TI da escola para liberar o app. |
| O pop-up de login não abre no celular | O jogo tenta automaticamente o login por redirecionamento. Se o navegador bloquear, permita pop-ups para o site. |
| Tela preta ou nada acontece ao abrir o arquivo direto | Abra por um servidor (passo 6) ou pelo link do GitHub Pages. |
| Botão de tela cheia não aparece no iPhone | O Safari do iPhone não oferece tela cheia para páginas. Use "Adicionar à Tela de Início" para jogar sem as barras do navegador. |
