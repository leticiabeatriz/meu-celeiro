# Meu Celeiro v0.2.0 — protótipo de front-end

Esta versão existe para validar a interface antes de conectar o Supabase.

## PIN de teste

`3112`

## Importante

Os dados ficam apenas em memória. Recarregar a página restaura `js/mock-data.js`.

## Mudanças principais desta versão

- Home removida; o site abre em Celeiros.
- Resumo virou uma seção recolhida dentro de Celeiros.
- Confirmações usam modal do próprio site, não `confirm()` do navegador.
- Cabeçalho das farms no consolidado tem exatamente duas linhas: nome e `Nv. X · capacidade/ocupado`.
- Cada farm possui cor configurável.
- Colunas e campos da matriz ficaram mais compactos.
- Ícones pequenos e sem fundo arredondado.
- Última coluna do consolidado ficou somente com total + barra de distribuição.
- Preferências de venda ficam em “O que posso vender?”.
- Cada item pode ser marcado como não vendável e ter estoque mínimo próprio.
- Itens bloqueados por nível preservam o registro, mas deixam de contar nos cálculos.
- Farms arquivadas deixam de participar de todos os cálculos e consultas normais.
- Catálogo passa a ser sincronizado por JSON; não existe cadastro manual item a item.
- Sincronização por JSON adiciona novos, atualiza alterados e remove ausentes após confirmação.

## Catálogo JSON

`assets/catalogo-hayday-exemplo.json` está incluído só para testar a sincronização.

O importador aceita uma lista direta ou um objeto com `items` e reconhece, entre outros:

- `id`
- `namePt` / `name_pt`
- `nameEn` / `name_en`
- `unlockLevel` / `unlock_level`
- `category`
- `machine` / `machine_origin`
- `maxSalePrice` / `max_sale_price`

Campos extras são ignorados.

## Estrutura

```text
/
├── index.html
├── css/
│   ├── base.css
│   ├── layout.css
│   └── components.css
├── js/
│   ├── app.js
│   ├── mock-data.js
│   ├── navigation.js
│   ├── farms.js
│   ├── items.js
│   ├── inventory.js
│   ├── calculations.js
│   ├── catalog.js
│   ├── icons.js
│   └── backup.js
└── assets/
    └── catalogo-hayday-exemplo.json
```

Quando a interface estiver aprovada, a camada de persistência será criada separadamente e o máximo possível de regra continuará no JavaScript.
