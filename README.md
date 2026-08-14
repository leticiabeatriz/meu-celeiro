# Meu Celeiro v0.5.1 — Supabase

Aplicação completa do Meu Celeiro baseada na v0.4.0, com persistência no Supabase.

## Persistência
- `settings`, `items`, `farms` e `inventory` são carregados do Supabase.
- Quantidade, farms, traduções, catálogo e regras de venda são persistidos no banco.
- Quantidade zero remove a linha correspondente de `inventory`.
- Cálculos, filtros, agrupamentos, resumo, "Onde está?" e sugestões de venda continuam no JavaScript.

## Acesso
- O banco exige uma sessão do Supabase Auth.
- A sessão fica persistida no navegador.
- Depois da sessão, o app pede o PIN da interface.
- O PIN em texto não existe no projeto; a validação usa PBKDF2-SHA256 contra `pin_salt` e `pin_hash` em `settings`.

## Recuperação de senha
A v0.5.1 inclui o fluxo completo:
1. `Esqueci minha senha` envia o e-mail pelo Supabase.
2. O link retorna ao Meu Celeiro.
3. O app detecta `PASSWORD_RECOVERY`.
4. A tela `Nova senha` chama `updateUser({ password })` e volta para o PIN.

No Supabase, configure uma vez em **Authentication > URL Configuration**:
- Site URL: `https://leticiabeatriz.github.io/meu-celeiro/`
- Redirect URLs: adicione `https://leticiabeatriz.github.io/meu-celeiro/`

O GitHub Pages não participa do banco; ele é apenas o endereço público onde a página do Meu Celeiro recebe o retorno do e-mail de recuperação.

## Segurança importante
Execute `supabase-security-owner-only.sql` no SQL Editor. Ele restringe as quatro tabelas ao UID da única conta Auth do Meu Celeiro. A primeira versão das policies permitia qualquer usuário `authenticated`; isso foi corrigido neste patch.

Também é recomendado desativar `Allow new users to sign up` no Supabase Auth, já que o aplicativo tem uma única conta.

## Sessão
O botão `Sair da conta` agora usa logout local: remove apenas a sessão deste navegador/dispositivo, em vez de derrubar todas as sessões da conta.

## Primeira execução
Se `items` e `farms` estiverem vazios, depois do PIN o app oferece importar os dados da v0.4.0 e completar o catálogo com os 374 itens do JSON incluído em `assets/`.

## Segurança das chaves
A Project URL e a Publishable Key ficam no frontend. Não coloque `sb_secret_...`, `service_role` ou outra chave privilegiada no navegador.
