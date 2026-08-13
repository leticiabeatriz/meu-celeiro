# Meu Celeiro v0.4.0 — protótipo tablet-first

Aplicação completa do protótipo do Meu Celeiro. O arquivo de entrada é `index.html`.

## PIN de teste
`3112`

## Alterações visuais desta versão
- CSS inteiro reorganizado e revisado com tablet como formato principal.
- Conteúdo usa praticamente toda a largura disponível, com limite amplo apenas para telas muito grandes.
- Grades responsivas: 3 cartões no tablet landscape, 2 no portrait e 4 em desktop largo.
- Conferir farm, Onde está?, Farms, Catálogo, Traduções e Sugestões de venda ocupam a grade toda, sem cartões estreitos encostados à esquerda.
- Regras de venda usam colunas de fluxo para acomodar grupos de alturas diferentes sem os grandes vazios da grade anterior.
- Tipografia e controles foram recalibrados para toque: textos principais maiores, metadados ainda compactos e botões/inputs confortáveis no tablet.
- Visual Hay Day ficou mais discreto: paleta verde/dourado/creme, fundo de céu suave e ícone do celeiro, com menos sombras e menos efeito tridimensional.
- Consolidado continua como matriz comparativa, com primeira coluna e cabeçalho fixos e células mais compactas.

## Itens e tradução
- Catálogo continua sincronizado por JSON.
- O JSON com `slug`, `name_original` e `level` é aceito.
- `namePt` pertence ao próprio item e é preservado nas sincronizações.
- A subaba Traduções não exibe ID do item.

## Venda
- `O que posso vender?` usa `Sugestões | Regras de venda`.
- Não há dropdown/details para esconder as regras.
- Grupos permitem `Pode vender tudo`, `Não vender nada` e ajustes individuais de venda/mínimo.

## Importante
Ainda é protótipo sem banco de dados. Recarregar restaura os dados iniciais.
Como o JavaScript usa módulos ES, teste pelo GitHub Pages ou por um servidor local.
