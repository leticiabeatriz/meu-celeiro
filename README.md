# Meu Celeiro v0.3.0 — protótipo completo

Esta pasta é a aplicação completa, não apenas um patch. O arquivo de entrada é `index.html`.

## PIN de teste
`3112`

## Alterações desta rodada
- Itens continua sincronizando por JSON.
- O JSON de reconhecimento com `slug`, `name_original` e `level` é aceito.
- Traduções PT-BR ficam no próprio item e não são apagadas por nova sincronização.
- Itens ganhou as subabas `Catálogo` e `Traduções`.
- `O que posso vender?` ganhou `Sugestões` e `Regras de venda`.
- Regras de venda são agrupadas por máquina/origem ou categoria, com controle em grupo e exceções por item.
- Correção dos nomes: `Ração das galinhas` e `Ração das vacas`.
- Camada visual temática do Hay Day, incluindo o ícone do celeiro carregado pela Hay Day Wiki.

## Importante
Ainda é protótipo sem banco de dados. Recarregar restaura os dados iniciais.

Como o JavaScript usa módulos ES, o modo mais confiável de testar é pelo GitHub Pages ou por um servidor local, em vez de abrir `index.html` diretamente por `file://` em navegadores que bloqueiam módulos locais.
