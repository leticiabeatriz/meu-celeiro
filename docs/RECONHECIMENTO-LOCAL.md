# Guia de uso e integração — Hay Day Recognizer v1.0.0

## 1. Finalidade

O reconhecedor recebe um ou vários prints do celeiro, segmenta as células visíveis, identifica a quantidade e associa cada ícone a um item do catálogo. Tudo acontece localmente no navegador; nenhuma imagem é enviada para uma API.

A v1.0.0 é a versão organizada para ser incorporada a outro programa. O algoritmo corresponde à v0.8.0 validada: filtro por nível, quantidade zero, MobileNet como peneira, OpenCV como comparador, fallback de segurança, memória de correções e remoção de sobreposições.

## 2. O que o programa hospedeiro precisa fornecer

1. Os cinco scripts, carregados na ordem descrita no README.
2. O catálogo JSON com 374 itens. De cada item, o motor lê somente `id`, `slug`, `name_original` e `level`.
3. Os 374 PNGs cujos nomes correspondem ao campo `slug` do catálogo.
4. Os três arquivos do modelo MobileNet local.
5. Um ou vários objetos `File` contendo os prints.
6. Nome e nível atual da farm.

O motor usa Canvas, IndexedDB, File API, TensorFlow.js e OpenCV.js. Portanto, deve rodar em um navegador moderno. A interface do programa hospedeiro pode ser qualquer uma.

## 3. API pública

### `configureDirectory(handle, requestPermission)`

Lê a estrutura atual da pasta `icones-hayday`. É a forma mais simples para testes locais.

```js
const handle = await showDirectoryPicker({ mode: "read" });
const summary = await HayDayRecognizer.configureDirectory(handle, true);
```

### `configureResources({ catalog, icons, models })`

Forma indicada quando o reconhecedor estiver dentro de outro programa. `icons` e `models` podem ser `Map<string, File>` ou listas de objetos `File`.

```js
await HayDayRecognizer.configureResources({
  catalog: catalogJson,
  icons: iconFiles,
  models: modelFiles,
});
```

### `recognize(files, options)`

Processa os prints em sequência e resolve um relatório geral.

```js
const report = await HayDayRecognizer.recognize(files, {
  farmName: "Farm 3",
  farmLevel: 58,
  onProgress({ message, progress, max }) {
    updateProgressBar(message, progress, max);
  },
});
```

O inventário pronto fica em `report.inventory`. Se `report.inventoryReady` for `false`, existe uma discordância ou conflito que precisa ser conferido.

### `reviewItem({ runIndex, detectionIndex, status, correctItem })`

Registra a conferência manual. Use `correct`, `incorrect` ou `unreviewed`. Somente `incorrect` alimenta a memória visual e o histórico de confusões.

```js
await HayDayRecognizer.reviewItem({
  runIndex: 0,
  detectionIndex: 5,
  status: "incorrect",
  correctItem: { id: 89 },
});
```

O `id` basta na correção: o motor recupera `slug` e nome diretamente do catálogo. O antigo código de três letras não é lido nem aparece nos resultados.

Confirmar um acerto não cria uma cópia na memória. Essa escolha mantém o banco pequeno e concentrado nos itens difíceis.

### `reviewQuantity({ runIndex, detectionIndex, correctValue })`

Corrige uma quantidade e recalcula conflitos e sobreposições.

```js
HayDayRecognizer.reviewQuantity({ runIndex: 0, detectionIndex: 5, correctValue: 17 });
```

### Métodos auxiliares

- `getReport()`: devolve o relatório atual.
- `getRuntimeRuns()`: devolve estruturas temporárias, inclusive Canvas, para montar a conferência visual.
- `getLearningSummary()`: informa quantas correções e confusões estão guardadas.
- `exportLearningData()`: devolve um objeto JSON serializável com toda a memória aprendida.
- `importLearningData(data, { replace })`: importa a memória; por padrão mescla, e com `replace: true` substitui o conteúdo local.
- `dispose()`: libera matrizes do OpenCV e encerra o lote atual.

## 4. Fluxo recomendado no programa final

1. Carregar os recursos uma única vez.
2. Receber farm, nível e prints.
3. Executar `recognize`.
4. Mostrar primeiro apenas detecções com `decision.needsReview === true` ou `batchConflict === true`.
5. Na conferência, exibir o segmento do print ao lado do PNG selecionado.
6. Registrar correções com `reviewItem` ou `reviewQuantity`.
7. Somente quando `inventoryReady === true`, gravar `report.inventory` no banco da farm.

## 5. Regras importantes

- Itens acima do nível da farm não participam da comparação.
- Quantidade zero impede o reconhecimento do ícone e não entra no inventário.
- O mesmo item e a mesma quantidade em prints sobrepostos contam uma única vez.
- O mesmo item com quantidades diferentes no mesmo lote gera conflito.
- Memória forte pode aceitar automaticamente uma correção já aprendida.
- Se MobileNet e OpenCV discordarem, ou se a margem visual for pequena, o motor volta à busca completa.
- A primeira execução cria cache das assinaturas; as seguintes tendem a ser mais rápidas.
- A página pode rodar em segundo plano, mas o sistema operacional e o navegador ainda podem reduzir recursos de abas invisíveis.

## 6. Estrutura principal do relatório

- `farm`: nome e nível usados.
- `candidateCatalog`: total e itens elegíveis.
- `summary`: prints, células, zeros, duplicatas, inventário e tempos.
- `images`: resultado detalhado de cada print.
- `inventory`: lista final pronta para persistência.
- `inventoryReady`: indica se todos os conflitos foram resolvidos.
- `reviewSummary`: estado da conferência.
- `quantityRecognitionSummary`: resultado dos números.
- `memorySummary`: correções e votos fortes.
- `speedSummary`: atalhos da memória, peneira rápida e fallbacks.

Cada detecção possui `finalPredicted`, `quantity`, `decision`, `review`, `memory`, candidatos e informações de tempo. Campos `analysis`, Canvas e referências de template existem apenas em `getRuntimeRuns()` e não são gravados no JSON.

## 7. Preparação dos PNGs — resultado do benchmark

O conjunto atual contém imagens de até 5120 × 5120. Por isso foi avaliada a criação de uma coleção já recortada e reduzida. O resultado mostrou que **ainda não vale substituir nem duplicar os PNGs originais**.

- Com limite de 384 pixels, Gold Bar virou Butter e Silver Bar virou Platinum Bar no benchmark.
- Com tratamento conservador de 1024 pixels, os 60 segmentos voltaram a ficar idênticos à v0.8.0.
- Porém, a coleção conservadora cresceu de 47,66 MB para 128,31 MB por causa da recompressão dos PNGs.
- O motor já recorta pela transparência e guarda assinaturas no cache, reduzindo a vantagem prática de uma coleção nova.

A ferramenta experimental `tools/prepare-icons.py`:

- preserva o canal alfa;
- recorta somente transparência comprovada;
- não adiciona margem nova, pois o próprio motor já normaliza o enquadramento;
- limita somente imagens muito grandes, mantendo até 1024 pixels no maior lado;
- não amplia arquivos pequenos;
- não remove preto, branco ou sombras;
- cria manifesto com dimensões e SHA-256;
- recusa usar a pasta original como saída.

Exemplo:

```powershell
python tools/prepare-icons.py "C:\caminho\icones" "C:\caminho\icones-preparados"
```

Ela permanece no pacote para futuros experimentos, mas a configuração recomendada da v1.0.0 é usar os PNGs originais. Uma alternativa futura é testar um formato lossless mais eficiente, sempre repetindo o benchmark integral antes da adoção.

## 8. Memória e migração

A memória é criada automaticamente depois que `reviewItem` recebe uma correção (`status: "incorrect"`). Acertos apenas confirmados não são guardados. Internamente ela fica no IndexedDB do navegador, no banco `hayday-local-recognition`, nas coleções `visualMemory` e `confusionHistory`. Por isso nenhum arquivo aparece sozinho na pasta.

Trocar de navegador, limpar os dados do site ou mudar a origem da página pode criar um banco vazio. Para o programa final, exporte a memória e guarde o objeto no banco da aplicação:

```js
const learningData = await HayDayRecognizer.exportLearningData();
await meuBanco.salvar("hayday-recognition-memory", learningData);
```

Ao iniciar o reconhecedor em outra instalação ou origem, restaure-a:

```js
const learningData = await meuBanco.ler("hayday-recognition-memory");
if (learningData) {
  await HayDayRecognizer.importLearningData(learningData, { replace: true });
}
```

Se quiser oferecer download manual, basta converter o retorno de `exportLearningData()` com `JSON.stringify`. O módulo não baixa arquivo sem que a interface hospedeira peça, evitando downloads inesperados.

## 9. Formato mínimo do catálogo JSON

O catálogo deve ser um array com exatamente 374 objetos. O motor usa estes quatro campos:

```json
[
  {
    "id": 89,
    "slug": "iron-bar",
    "name_original": "Iron Bar",
    "level": 34
  }
]
```

- `id`: número único e estável; identifica o item no inventário, na conferência, na memória e na deduplicação.
- `slug`: texto único; deve ser exatamente o nome do PNG sem `.png`.
- `name_original`: nome exibido para a pessoa conferir.
- `level`: nível em que o item é desbloqueado; itens acima do nível da farm não entram na busca.

Outros campos podem existir no JSON, mas são ignorados. O arquivo enxuto incluído no pacote é `assets/hayday-items-374.json`.

## 10. Critérios para considerar um lote pronto

- Nenhuma falha de print.
- Todos os números reconhecidos ou corrigidos.
- Nenhuma detecção `unreviewed`.
- Nenhum conflito de quantidade.
- `inventoryReady === true`.

Quando esses critérios forem atendidos, o programa pode atualizar o inventário da farm usando `report.inventory`.
