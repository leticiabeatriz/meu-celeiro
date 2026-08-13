# Meu Celeiro v0.3.1 — protótipo completo

PIN de teste: `3112`

## Ajustes desta versão

- `O que posso vender?` agora tem duas abas reais: `Sugestões` e `Regras de venda`.
- Foi removido o bloco expansível/dropdown de configuração de venda.
- A ordenação das sugestões usa botões, não select/dropdown.
- Os grupos de regras ficam visíveis em cartões; não usam `<details>`.
- Traduções PT-BR não exibem ID do item.
- Traduções usam cartões compactos no desktop.
- Farms, catálogo de itens, sugestões de venda e demais listas principais usam cartões compactos em vez de linhas que atravessam toda a tela.
- `Conferir farm` e `Onde está?` também usam uma grade compacta no desktop.
- O consolidado permanece como matriz porque depende da comparação item × farm, mas continua com células compactas.

## Catálogo e traduções

O catálogo continua sendo sincronizado por JSON. O formato com `slug`, `name_original` e `level` é aceito. A tradução PT-BR (`namePt`) pertence ao próprio item e uma nova sincronização não apaga uma tradução já preenchida.

## Importante

Ainda é protótipo sem banco de dados. Recarregar restaura os dados iniciais.
