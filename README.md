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

## Calculadora Térmica de Ar-condicionado

Calcula a **carga térmica (BTU/h)** de um ambiente e recomenda a capacidade comercial, **mostra o ambiente em 3D** e **sugere onde instalar** a evaporadora e a condensadora.

- **Carga por componente** na hora de pico: paredes (por orientação, cor e material), janelas (vidro e proteção solar), cobertura, pessoas (sensível + latente), equipamentos, iluminação, infiltração e renovação de ar. Margem de segurança ajustável.
- **Clima de projeto** por cidade (valores de referência aproximados, editáveis), uso diurno ou noturno.
- **Visualização 3D** (Three.js): paredes com **mapa de calor**, janelas e proteções, móveis, evaporadora com **jato de ar animado**, condensadora, tubulação e alternativas clicáveis. Vistas isométrica, superior e frontal.
- **Planta 2D interativa**: arraste cama, mesa e sofá; o sugestor evita soprar direto neles.
- **Onde instalar**: pontua posições em cada parede (cobertura do ar, conforto, instalação e tubulação, proximidade da carga, porta e cantos) e explica motivos e alertas.
- **Consultor "e se?"**: quanto cada melhoria (proteção solar externa, película, isolar a cobertura, LED...) reduz a carga, recalculando o ambiente inteiro.
- **Energia**: estimativa de consumo e custo mensal (inverter × convencional).

Leia o **[estudo técnico](docs/estudo-carga-termica.md)** com método, equações, premissas e o grau de confiança de cada dado.

### Agente especialista

`.claude/agents/especialista-ar-condicionado.md` define um subagente do Claude Code (invoque pelo nome ou peça "use o especialista em ar-condicionado") que levanta os dados do ambiente, calcula pelo **mesmo motor do app** via CLI e responde com carga, equipamento, posição e melhorias, sempre explicitando premissas e incertezas.

```bash
node scripts/carga-termica.js scripts/exemplos/sala-oeste.json   # resumo em texto
node scripts/carga-termica.js caso.json --json                    # resultado completo
node scripts/carga-termica.js --exemplo                           # modelo de entrada
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
| `js/thermal.js` | Carga térmica, psicrometria, dimensionamento, "e se?" e energia (sem DOM) |
| `js/placement.js` | Pontuação das posições da evaporadora (sem DOM) |
| `js/room3d.js`, `js/planta.js`, `js/ar-app.js` | Visualização 3D, planta 2D e interface da calculadora térmica |
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
