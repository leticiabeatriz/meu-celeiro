# Meu Celeiro v0.5.0 — Supabase

Aplicação completa do Meu Celeiro, baseada na interface tablet-first da v0.4.0 e conectada ao Supabase.

## Persistência
- `settings`, `items`, `farms` e `inventory` são carregados do Supabase.
- Alterações de quantidade, farm, tradução, catálogo e regras de venda são persistidas no banco.
- Quantidade zero remove a linha correspondente de `inventory`.
- Cálculos, filtros, agrupamentos, resumo, "Onde está?" e sugestões de venda continuam no JavaScript.

## Acesso
- O banco exige uma sessão do Supabase Auth.
- A sessão fica persistida no navegador pelo `supabase-js`.
- Depois da sessão, o app pede o PIN local da interface.
- O PIN em texto não existe no repositório. A validação usa PBKDF2-SHA256 contra `pin_salt` e `pin_hash` guardados em `settings`.

## Primeira execução
Se `items` e `farms` estiverem vazios, após desbloquear o app ele oferece importar uma única vez os dados da v0.4.0 e completar o catálogo com os 374 itens do JSON incluído em `assets/`.

## Catálogo
- O ID numérico do JSON é armazenado em `items.id`.
- O `slug` continua sendo a chave textual usada pelo estado do frontend.
- Traduções e preferências de venda são preservadas durante sincronizações.
- Itens ausentes de um novo snapshot ficam `active = false`; inventário e configuração não são apagados.

## Segurança
A Project URL e a Publishable Key são próprias para uso no frontend. O acesso aos dados depende da sessão autenticada e das políticas RLS do projeto. Não use chave secret/service-role no navegador.
