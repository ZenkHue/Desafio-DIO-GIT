# Simulador de Salário Líquido (CLT)

App web que simula o salário líquido de um trabalhador CLT, com as tabelas de **2026**.
Feito em HTML, CSS e JavaScript puros, sem build e sem dependências.

## O que calcula

- **INSS** com alíquotas progressivas (7,5% / 9% / 12% / 14%, teto de R$ 8.475,55).
- **IRRF** pela tabela progressiva, com desconto simplificado ou deduções legais (o mais vantajoso), dependentes e pensão alimentícia, mais a **isenção até R$ 5.000 e o redutor até R$ 7.350** (Lei 15.270/2025).
- **Adicionais**: horas extras 50% e 100%, adicional noturno, periculosidade, insalubridade e DSR sobre as variáveis.
- **Descontos**: vale-transporte (6%, limitado ao custo real), vale-refeição, plano de saúde, pensão e outros.
- **FGTS** (8%, depósito do empregador), **13º salário** (1ª e 2ª parcelas) e **férias + 1/3**.

## Como usar

```bash
npm start        # serve em http://localhost:8080 (python3 -m http.server)
npm test         # testes do núcleo de cálculo (Node 18+)
```

Também dá para abrir o `index.html` direto no navegador.

## Estrutura

| Arquivo | Função |
|---|---|
| `js/calc.js` | Regras de cálculo e tabelas (`TABELAS`), sem acesso ao DOM |
| `js/app.js` | Interface: leitura do formulário e renderização |
| `tests/calc.test.js` | Testes (`node:test`) |

Para atualizar a cada ano, edite apenas o objeto `TABELAS` em `js/calc.js`.

## Premissas e limitações

- O IRRF do 13º é calculado de forma exclusiva e separada, **sem** o redutor da Lei 15.270.
- Em férias, INSS e IRRF são calculados isoladamente. Na folha real, o INSS soma férias e salário do mês e respeita o teto.
- O 13º e as férias usam como base a remuneração bruta do mês simulado.
- Não cobre contribuição sindical, consignado, abono pecuniário, adiantamentos e regras de convenção coletiva.

Ferramenta informativa. Confirme os valores com o RH ou um contador.
