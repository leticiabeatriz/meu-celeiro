# Meu Celeiro v0.6.0

Inventário pessoal de Hay Day com persistência no Supabase e reconhecimento de prints inteiramente local no navegador.

## Como usar

1. Entre com a conta do Supabase e informe o PIN da interface.
2. Abra **Celeiros → Conferir farm**.
3. Escolha a farm e vários prints do mesmo celeiro.
4. Clique em **Reconhecer**. A primeira execução é mais lenta porque cria o cache local.
5. Compare cada segmento do print com o PNG escolhido. Corrija item ou quantidade quando necessário.
6. Clique em **Aplicar no inventário**. Somente os itens presentes no lote são atualizados; os demais permanecem como estavam.

O reconhecimento usa OpenCV.js, TensorFlow.js e MobileNet locais. Os prints não são enviados ao Supabase nem a uma API externa. Os 374 PNGs ficam em `assets/icons/`, portanto o site não depende da wiki para exibi-los.

## Memória

Correções de item ficam no IndexedDB para acelerar o navegador atual e são sincronizadas na tabela `recognition_memory` do Supabase. Acertos não são armazenados. Prints e recortes nunca são gravados na memória.

## Banco

- `settings`, `items`, `farms` e `inventory`: dados existentes do aplicativo.
- `recognition_memory`: assinaturas compactas das correções e pares de confusão.
- `apply_recognized_inventory(uuid, jsonb)`: aplica um lote reconhecido em uma única transação, com RLS.

O SQL correspondente está em `supabase/recognition-upgrade.sql` e foi aplicado como a migration `add_local_recognition_support`.

As policies das quatro tabelas antigas já estão vinculadas à conta proprietária no projeto. O patch antigo com um UID desatualizado foi removido para impedir que alguém o execute por engano.

## Desenvolvimento e testes

Sirva a raiz com HTTP; alguns navegadores restringem modelos e módulos abertos diretamente com `file://`.

```powershell
python -m http.server 8080
```

Depois abra `http://localhost:8080`. Teste rápido do catálogo:

```powershell
node test-catalog.mjs
```

Mais detalhes do motor estão em `docs/RECONHECIMENTO-LOCAL.md`.

## Segurança

A URL e a chave publicável do Supabase podem ficar no frontend porque o acesso real é protegido por Auth, privilégios e RLS. Nunca coloque `service_role`, `sb_secret_...` ou senha do banco no navegador. Mantenha novos cadastros desativados se o aplicativo continuar sendo de uma única conta.
