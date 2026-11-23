# Mapa mental e árvore de decisões da Calculadora de BTUs

Feito pelo agente `especialista-produto-simples` para desenhar o **modo rápido**: o que a pessoa precisa, o que ela sabe de cabeça e quais perguntas valem a pena.

## Mapa mental

```mermaid
mindmap
  root((Qual ar-condicionado eu compro?))
    Necessidades do usuário
      Um número só, em BTUs, igual ao da loja
      Saber se vai gelar no dia mais quente
      Entender o porquê em 2 ou 3 motivos
      Não gastar demais na compra nem na luz
      Saber onde instalar
      Mostrar para a família ou levar à loja
    O que a pessoa sabe de cabeça
      Que cômodo é
      Casa, sobrado ou apartamento
      Se bate sol à tarde
      A cidade
      Quantas pessoas e o que fica ligado
      Em que horário liga o ar
    O que a pessoa não sabe
      Metros quadrados exatos
      Norte, sul, leste, oeste
      Se tem laje em cima do forro
      Material e espessura das paredes
      O que é BTU por hora, carga térmica, pé-direito
    Fatores que mudam o resultado
      Tamanho do cômodo, o maior de todos
      O que tem em cima: telha, forro, laje, outro andar
      Sol da tarde e janela grande ou porta de vidro
      Cidade quente: Cuiabá, Teresina, Rio, Manaus
      Horário: ar desligado de dia acumula calor
      Pessoas, fogão, computador, videogame
      Temperatura desejada e pressa para gelar
    Medos
      Comprar pequeno e o ar não dar conta
      Comprar grande demais e pagar caro
      Conta de luz alta
      Ser enganado pelo vendedor
      Instalação errada ou barulho
      Errar a conta e passar vergonha
    Contexto de uso
      Celular, muitas vezes na loja ou no calor do momento
      Pressa: quer a resposta em 1 minuto
      Pessoa idosa, letra pequena atrapalha
      Internet ruim ou nenhuma: PWA offline
      Decisão em família pelo WhatsApp
    O que gera confiança
      Bater com a regra das lojas ou explicar por que não
      Motivos em português do dia a dia
      Mostrar o que foi suposto e deixar corrigir
      Refinar com detalhes depois
      Fontes e aviso honesto de pré-dimensionamento
```

## Árvore de decisões do modo rápido

Cada resposta pula as perguntas que não fazem sentido: apartamento não pergunta o teto; "não bate sol" não pergunta a janela. Por isso são **7 a 9 perguntas**. "Não sei" usa a opção mais segura para a construção (que esquenta mais) e a típica para o uso. ★ = resposta já marcada.

```mermaid
flowchart TD
  INI(["Início do Modo rápido<br/>estado = cópia de N.PADRAO<br/>avancado.criterio = maior"]) --> Q1
  Q1["1. Em que cômodo vai ficar o ar?<br/>Quarto ★ · Sala · Escritório ou home office · Cozinha · Loja ou comércio · Outro<br/>→ N.aplicarTipo: pessoas, uso, aparelhos, iluminacao, infiltracao"] --> Q2
  Q2["2. Qual o tamanho do cômodo?<br/>até 9 · 12 · 16 · 20 · 25 · 30 · 40 m² · digitar · não sei medir<br/>★ típico do cômodo · → ambiente.largura e ambiente.comprimento"] --> Q3
  Q3{"3. É casa ou apartamento?"}
  Q3 -->|"Casa térrea ★<br/>piso = terreo"| Q3C
  Q3 -->|"Sobrado, andar de cima<br/>piso = andar"| Q3C
  Q3 -->|"Sobrado, andar de baixo<br/>cobertura.tipo = apartamento, piso = terreo"| Q4
  Q3 -->|"Apartamento<br/>cobertura.tipo = apartamento, piso = andar"| Q4
  Q3 -->|"Último andar ou cobertura<br/>piso = andar"| Q3P
  Q3 -->|"Loja ou sala comercial<br/>piso = terreo"| Q3M
  Q3 -->|"Não sei<br/>piso = terreo, cobertura.tipo = telha"| Q4
  Q3C["3b. Olhe para o teto. O que você vê?<br/>Teto liso de laje, com telhado em cima ★ → laje_telhado<br/>Laje sem telhado, pegando sol → laje_exposta<br/>Forro de PVC, gesso ou madeira → forro<br/>As telhas e as madeiras → telha<br/>Não sei → telha"] --> Q4
  Q3P["3b. O que tem em cima do apartamento?<br/>Laje com o telhado do prédio ★ → laje_telhado<br/>Laje ou terraço pegando sol → laje_exposta<br/>Não sei → laje_exposta"] --> Q4
  Q3M["3b. O que tem em cima da loja ou sala?<br/>Outro andar ★ → apartamento · Laje com telhado → laje_telhado<br/>Forro → forro · Telhado à vista ou galpão → telha<br/>Laje pegando sol → laje_exposta · Não sei → telha"] --> Q4
  Q4{"4. Bate sol no cômodo?<br/>→ paredes.A.tipo = externa e paredes.A.sol"}
  Q4 -->|"Não bate sol direto<br/>sol = nao"| Q5
  Q4 -->|"Sol da tarde · Só de manhã · O dia todo · Não sei ★<br/>sol = tarde, manha, diatodo, naosei"| Q4B
  Q4B["4b. Como é a janela que pega esse sol?<br/>Pequena 1,0 m · Comum 1,2 m ★ · Grande 2,0 m<br/>Porta ou parede de vidro 2,4 × 2,1 m · Sem janela · Não sei 1,5 m<br/>→ paredes.A.janela.largura, altura, peitoril"] --> Q5
  Q5["5. Em que cidade?<br/>busca + Usar minha localização<br/>★ última cidade usada ou sao-paulo · → cidade"] --> Q6
  Q6["6. Quando o ar vai ficar ligado?<br/>À noite 21h às 7h · Tarde e noite 12h à 0h · Durante o dia 8h às 18h · 24 horas<br/>★ e Não sei = horário típico do cômodo · → uso.inicio e uso.fim"] --> Q7
  Q7["7. Quem e o que fica no cômodo com o ar ligado?<br/>Pessoas 1 a 10 · TV · Computador · Notebook · Videogame · PC gamer · Geladeira ou frigobar · Fogão<br/>★ e Não sei = típico do cômodo · → pessoas.quantidade e aparelhos"] --> RES
  RES(["Resultado: recomendado = maior entre regra das lojas e cálculo hora a hora<br/>3 motivos · comparação · o que supusemos · Refinar com detalhes"])
```

## Regra do resultado

```mermaid
flowchart LR
  A["Respostas"] --> B["Método de mercado<br/>600 ou 800 BTU/m² + pessoas + aparelhos<br/>+ telhado/forro + cozinha"]
  A --> C["Cálculo hora a hora<br/>sol, paredes, teto, vidro, horário, cidade"]
  B --> D{"Qual é maior?"}
  C --> D
  D --> E["Recomendação = o maior<br/>arredondado para o tamanho comercial"]
```

Errar para menos é o que deixa o ar sem dar conta nos dias quentes; por isso o app nunca recomenda menos do que a conta que as lojas e os fabricantes ensinam. No modo detalhado, em "Avançado", dá para escolher só o cálculo físico ou só o de mercado.
