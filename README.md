# Meu Celeiro — Protótipo de Front-end

Esta versão existe para validar a interface e os fluxos antes de conectar ao Supabase.

## O que funciona

- tela de PIN;
- Home / resumo;
- Farms: cadastrar, editar, reordenar, arquivar, restaurar e excluir;
- Itens: cadastrar, editar, ativar/desativar e definir estoque mínimo;
- Celeiro consolidado;
- bloqueio de item por nível da farm;
- autosave simulado com estados “Salvando…” / “Salvo”;
- totais por item;
- uso/livre por farm;
- filtros e pesquisa;
- modo Conferir Farm;
- registro de última conferência;
- Onde está?;
- O que posso vender?;
- cálculo de excedente e valor;
- backup/importação JSON;
- layout responsivo.

## Importante

Nesta versão **não existe banco de dados**. Os dados ficam apenas em arrays/objetos JavaScript na memória. Ao recarregar a página, o estado volta aos dados de demonstração definidos em `js/mock-data.js`.

Isso é intencional: primeiro validamos a experiência. Depois substituímos a camada de dados pelo Supabase sem refazer a interface.

## PIN do protótipo

`3112`

Nesta etapa isso não é segurança real; é apenas para testar o fluxo da tela de acesso.

## Estrutura

- `index.html`
- `css/base.css`
- `css/layout.css`
- `css/components.css`
- `js/app.js`
- `js/mock-data.js`
- `js/navigation.js`
- `js/farms.js`
- `js/items.js`
- `js/inventory.js`
- `js/calculations.js`
- `js/icons.js`
- `js/backup.js`

## Como testar no PC

Pode subir a pasta no GitHub Pages. Para testar localmente, dentro da pasta rode:

`python -m http.server 8000`

E abra `http://localhost:8000`.

## Depois da aprovação

A próxima etapa será conectar o Supabase. Vamos manter no JavaScript tudo o que não precisar estar no banco por segurança, integridade ou persistência.
