# Simuladores: Salário Líquido CLT e Calculadora de Ar-condicionado

Duas ferramentas em um PWA, feitas em HTML, CSS e JavaScript puros, sem build e sem backend:

1. **Salário líquido (CLT)**: `index.html`
2. **Calculadora térmica de ar-condicionado** com 3D e sugestão de instalação: `ar-condicionado.html`

---

## Simulador de Salário Líquido (CLT)

Simula o salário líquido de um trabalhador CLT, com as tabelas de **2026**.

## O que calcula

- **INSS** com alíquotas progressivas (7,5% / 9% / 12% / 14%, teto de R$ 8.475,55).
- **IRRF** pela tabela progressiva, com desconto simplificado ou deduções legais (o mais vantajoso), dependentes e pensão alimentícia, mais a **isenção até R$ 5.000 e o redutor até R$ 7.350** (Lei 15.270/2025).
- **Adicionais**: horas extras 50% e 100%, adicional noturno, periculosidade, insalubridade e DSR sobre as variáveis.
- **Descontos**: vale-transporte (6%, limitado ao custo real), vale-refeição, plano de saúde, pensão e outros.
- **FGTS** (8%, depósito do empregador), **13º salário** (1ª e 2ª parcelas) e **férias + 1/3**.

## Calculadora de BTUs (ar-condicionado)

Diz **quantos BTUs** o ambiente precisa, mostra **de onde vem o calor hora a hora** e **onde instalar** o aparelho, com o ambiente em 3D.

- **Qualquer cidade do Brasil:** busca entre os 5.570 municípios (sem precisar de acento). O sol usa a latitude exata, e o clima é estimado pelas cidades de referência mais próximas, com a origem mostrada na tela.
- **Do jeito que o brasileiro fala:** tipo de ambiente (quarto, sala, cozinha…), "a parede pega sol de manhã, à tarde ou o dia todo?", "o que tem em cima? laje com telhado, só telha, outro andar…", "quando o ar fica ligado?". Quem sabe a orientação pode usar a bússola.
- **Cálculo hora a hora (0h–23h)**, como os softwares profissionais: sol na posição real para a latitude da cidade, temperatura variando no dia, atraso térmico das paredes (o sol da tarde vira calor à noite), sol pelas janelas com séries radiantes (RTS), vizinhos e andares, pessoas, aparelhos com horário de uso, ar de fora e **carga de partida** (o calor acumulado quando o ar fica desligado).
- **Rendimento real do aparelho:** a etiqueta vale para 27 °C dentro e 35 °C fora; a 23 °C ele rende ~10% menos, e o app já desconta isso.
- **Resultado em tamanhos comerciais** (7.500 a 60.000 BTUs), lado a lado com a **regra das lojas** (600/800 BTU/m²) e a explicação da diferença, incluindo o aviso de "no limite" entre dois tamanhos.
- **Gráfico do calor por hora**, com o que o aparelho entrega e as horas com o ar desligado; tabela hora a hora.
- **3D** com o sol andando conforme a hora escolhida, mapa de calor por parede, janelas, portas, móveis, jato de ar, condensadora e alternativas clicáveis; **planta 2D** com móveis arrastáveis.
- **Onde instalar:** nota 0–100 para cada parede (alcance do ar, conforto, condensadora fora do sol da tarde, tubulação, portas).
- **Como gastar menos:** o app recalcula tudo para cada melhoria (toldo, película, isolar o teto, forro, cor clara…) e diz se ela permite comprar um aparelho menor.
- **Link do cenário:** o botão "Copiar link deste cenário" gera um endereço que abre exatamente o mesmo ambiente em outro aparelho.

Leia o **[estudo técnico](docs/estudo-carga-termica.md)**: método, fórmulas, comparação com as ferramentas de mercado, cenários de referência e grau de confiança de cada dado.

### Agente especialista

`.claude/agents/especialista-ar-condicionado.md` define um subagente do Claude Code. Ele levanta os dados do ambiente, calcula pelo **mesmo motor do app** e responde com BTUs, motivo, comparação com as lojas, onde instalar e melhorias.

```bash
node scripts/carga-termica.js scripts/exemplos/quarto.json        # resumo em texto
node scripts/carga-termica.js --link "https://…/ar-condicionado.html#c=…"   # cenário de um link do app
node scripts/carga-termica.js caso.json --json                    # resultado completo
```

## Como usar

```bash
npm start        # serve em http://localhost:8080 (python3 -m http.server)
npm test         # testes do núcleo de cálculo (Node 18+)
```

As páginas usam módulos ES e importmap (3D), então sirva por HTTP (`npm start`) em vez de abrir o arquivo direto.

## Instalar no Android (PWA)

O app é um PWA: funciona offline e instala na tela inicial, com ícone próprio e sem barra do navegador.
O PWA exige **HTTPS** (ou `localhost`). Publique a pasta em qualquer hospedagem estática,
por exemplo o GitHub Pages (Settings → Pages → branch `main`, pasta `/ (root)`).

1. Abra a URL publicada no **Chrome** do Android.
2. Menu ⋮ → **Instalar app** (ou **Adicionar à tela inicial**).

Para testar no celular durante o desenvolvimento, rode `npm start` e abra `http://IP-DO-PC:8080`.
Por ser HTTP e não localhost, nesse caso o Chrome não instala nem ativa o offline. Use
`chrome://inspect/#devices` com redirecionamento de porta, ou publique em HTTPS.

Ao mudar qualquer arquivo do app, incremente `CACHE` em `sw.js` para os aparelhos receberem a nova versão.

## Estrutura

| Arquivo | Função |
|---|---|
| `js/calc.js`, `js/app.js` | Salário líquido: regras e tabelas (`TABELAS`) e interface |
| `js/ar/nucleo.js` | Cálculo hora a hora: sol, clima, paredes, janelas, pessoas, aparelhos, partida, dimensionamento, "e se?" e link (sem DOM) |
| `js/ar/posicao.js` | Onde instalar: nota de cada posição (sem DOM) |
| `js/ar/app.js`, `grafico.js`, `visual3d.js`, `planta.js` | Interface, gráfico hora a hora, 3D e planta |
| `vendor/` | three.js r170 e OrbitControls (MIT), embarcados para funcionar offline |
| `scripts/carga-termica.js` | CLI do motor térmico (usada pelo agente) |
| `docs/estudo-carga-termica.md` | Estudo técnico |
| `.claude/agents/` | Agente especialista |
| `tests/*.test.js` | Testes (`node:test`) dos três módulos de cálculo |
| `manifest.webmanifest`, `sw.js`, `icons/` | PWA: instalação, cache offline e ícones |

Para atualizar a cada ano, edite apenas o objeto `TABELAS` em `js/calc.js`.

## Premissas e limitações

- O IRRF do 13º é calculado de forma exclusiva e separada, **sem** o redutor da Lei 15.270.
- Em férias, INSS e IRRF são calculados isoladamente. Na folha real, o INSS soma férias e salário do mês e respeita o teto.
- O 13º e as férias usam como base a remuneração bruta do mês simulado.
- Não cobre contribuição sindical, consignado, abono pecuniário, adiantamentos e regras de convenção coletiva.

Ferramenta informativa. Confirme os valores com o RH ou um contador.
