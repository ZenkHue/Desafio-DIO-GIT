# Estudo: carga térmica hora a hora e onde instalar o ar-condicionado (v2)

Documento técnico da **Calculadora de BTUs** (`ar-condicionado.html`). Explica o método, as fórmulas, de onde vêm os números, como o app se compara com as ferramentas do mercado e o que ele **não** faz. O código está em `js/ar/nucleo.js` (cálculo) e `js/ar/posicao.js` (onde instalar).

> **Aviso.** O app faz **pré-dimensionamento**. Não substitui projeto de profissional habilitado conforme a ABNT NBR 16401. Vários coeficientes são aproximados; a seção 9 diz quais e com que grau de confiança.

---

## 1. O que mudou da v1 para a v2, e por quê

A v1 somava o calor de cada parede, janela e pessoa num **único instante de pico**. Isso gerou três problemas, que apareceram no uso real:

1. **Resultados abaixo do que o brasileiro espera.** Um quarto de 12 m² com sol da tarde dava ~7.500 BTUs, enquanto qualquer loja indica 12.000. Investigando, faltavam duas coisas físicas, não "margem":
   - **Vizinhos quentes.** Cômodos e andares vizinhos sem ar eram tratados como mais frios que a rua. Numa noite de verão eles estão a ~28 °C e mandam calor pelas paredes e lajes.
   - **Carga de partida.** Quando o ar fica desligado durante o dia, o ambiente chega a 30 °C ou mais e acumula calor no ar, nos móveis e na "pele" das paredes. Ao ligar, é preciso tirar esse calor, além da carga normal.
2. **O sol não era tratado do jeito que as pessoas percebem.** O app pedia Norte/Sul/Leste/Oeste. A maioria das pessoas sabe dizer "bate sol à tarde", mas não a orientação.
3. **O pico real depende da hora.** O sol da manhã e o da tarde não acontecem juntos, e as paredes devolvem à noite o calor da tarde. Somar picos de horários diferentes erra para mais; ignorar o atraso erra para menos.

A v2 calcula **as 24 horas de um dia quente de projeto** e dimensiona pelo pior horário **em que o ar está ligado**, como fazem os softwares profissionais.

## 2. O que as ferramentas do mercado fazem

| Ferramenta | Método | Uso |
|---|---|---|
| Calculadoras de lojas e fabricantes (Midea, LG, Electrolux, WebArCondicionado, Buscapé, Zoom) | **600 BTU/m²**, ou **800 BTU/m² com sol da tarde**, **+600 por pessoa** a partir da 2ª e **+600 por eletrônico** | Escolha rápida na compra |
| Carrier HAP | Cálculo **hora a hora** por balanço térmico (ASHRAE), com simulação de energia em 8.760 h | Projeto comercial |
| Trane TRACE 700, Elite CHVAC | Hora a hora; opções RTS ou CLTD | Projeto comercial |
| Elite RHVAC | ACCA Manual J (residencial, EUA) | Residencial |
| **Este app (v2)** | **Hora a hora simplificado**: sol real + sol-ar + atraso térmico + RTS + partida | Pré-dimensionamento residencial e comércio pequeno |

A regra das lojas é simples e conservadora para a maioria dos cômodos, mas **não enxerga** teto que pega sol, vidro grande, fogão ou cidade muito quente. Por isso o app sempre mostra **as duas respostas lado a lado** e explica a diferença.

## 3. Fundamentos

- **Calor sensível** muda a temperatura. **Calor latente** é a umidade (respiração, cozinha, ar de fora).
- **Unidades:** 1 W = 3,412 BTU/h. 1 TR = 12.000 BTU/h. No Brasil, "BTUs" na prática significa BTU/h.
- **Psicrometria:** pressão de saturação por Magnus–Tetens, `p_sat = 0,61094·exp(17,625·T/(T+243,04))` kPa, e umidade absoluta `w = 622·p_v/(101,325 − p_v)` g/kg.

## 4. O método da v2, passo a passo

### 4.1 Cidade e clima do dia de projeto

- **Qualquer um dos 5.570 municípios** pode ser escolhido. A busca ignora acentos e aceita "Cidade/UF". A base de nomes e coordenadas vem de [kelvins/municipios-brasileiros](https://github.com/kelvins/municipios-brasileiros) (licença MIT).
- **O sol usa a latitude exata do município.**
- **Clima:** há 86 **cidades de referência** (capitais e polos regionais do interior) com máxima, variação diária e umidade aproximadas. Para os demais municípios:
  - a menos de 15 km de uma referência, usa a dela;
  - mais longe, faz a **média das 3 referências mais próximas, pesada por 1/distância²**.
  - O app mostra quais cidades e distâncias foram usadas. Exemplo: Salto de Pirapora (SP) usa Sorocaba (21 km), São Paulo (96 km) e Campinas (97 km), com máxima ~32 °C.
- **Limitação:** a base não tem altitude. Cidade de **serra** pode sair mais quente que a realidade; Campos do Jordão, por exemplo, herda o clima do vale. Ajuste a máxima em "Ajustes avançados".
- **Temperatura hora a hora:** `T(h) = T_máx − amplitude × f(h)`, com o perfil-padrão da ASHRAE (máxima às 15h, mínima às 5h). A umidade do ar de fora fica constante no dia, calculada na hora mais quente.

### 4.2 Sol de verdade

- **Posição do sol:** declinação para 21 de janeiro; altitude e azimute pela latitude da cidade e pela hora solar.
- **Radiação de céu claro** (modelo ASHRAE): `I_DN = A·exp(−B/sen β)`, com A = 1202 W/m², B = 0,141 e C = 0,103 (janeiro), multiplicada por 0,9 de "clareza" para a névoa tropical. A difusa em parede vertical usa o fator Y da ASHRAE, mais 20% de reflexão do chão.
- **Conferência:** em São Paulo, o sol do meio-dia de janeiro fica a 86,6° (quase a pino), nasce a ESE (109°) e a parede oeste recebe ~600 W/m² às 15h.

### 4.3 Sol nas paredes do jeito que o brasileiro fala

| Escolha no app | Como o motor trata |
|---|---|
| Não pega sol | Só luz difusa e refletida (sombra) |
| Sol da manhã | Parede voltada a leste (90°) |
| Sol da tarde | Parede voltada a oeste (270°) |
| Sol o dia todo | Pior caso hora a hora entre leste e oeste |
| Não sei | Sol da tarde (conservador) |
| Modo bússola | Orientação real: a parede A virada para N, NE, L, SE, S, SO, O ou NO; as outras giram 90° em sentido horário; opção "fica na sombra" |

### 4.4 Paredes e teto: temperatura sol-ar e atraso térmico

- **Sol-ar:** `T_sa(h) = T(h) + α·I(h)/17` (no teto, −3,9 K pela troca com o céu). α vem da cor: clara 0,3, média 0,6, escura 0,85.
- **Condução com atraso** (método da admitância / fator de decremento): `Q(h) = U·A·[(T̄_sa − T_i) + f·(T_sa(h − φ) − T̄_sa)]`, com atraso φ do material e `f = e^(−φ/4,5)`.
- **Efeito:** uma parede comum com sol da tarde tem o pico de calor dentro do cômodo por volta de 19h–21h. É por isso que quartos que pegam sol da tarde ficam quentes à noite.

### 4.5 Janelas

- **Condução:** `U_vidro·A·(T(h) − T_i)`.
- **Sol:** `A·FS·[k(θ)·I_direta·f_dir + 0,9·I_difusa·f_dif]`. FS é o fator solar do vidro; k(θ) reduz o sol rasante; f vem da proteção: cortina 0,65; toldo, brise ou varanda 0,2 no direto e 0,7 no difuso.
- **Atraso:** o sol que entra aquece primeiro piso e móveis, que devolvem o calor ao ar ao longo de horas. Isso usa as **séries temporais radiantes (RTS)** da ASHRAE para construção leve, média ou pesada.

### 4.6 Vizinhos, andares de cima e de baixo

Um cômodo vizinho sem ar segue só metade da variação de fora, em torno da média do dia + 2 °C: `T_viz(h) = 0,5·T(h) + 0,5·(T̄ + 2)`. Isso vale para paredes internas, portas internas, teto com outro andar em cima e piso com outro andar embaixo. Térreo direto no chão não conta; pilotis ou garagem aberta usam a temperatura de fora.

### 4.7 Pessoas, aparelhos e luz

- **Pessoas** (ASHRAE, aproximado), em W sensível + latente: dormindo 60 + 30, sentado 70 + 45, escritório 75 + 55, em pé 75 + 75, exercício 150 + 250. 60% do sensível é radiante e passa pelas RTS.
- **Aparelhos:** calor **médio** liberado enquanto em uso, já considerando quanto tempo ficam de fato ligados. Exemplos:

| Aparelho | W | Quando |
|---|---|---|
| TV até 43" / 50"+ | 70 / 130 | Com o ar ligado |
| Notebook / PC + monitor / PC gamer | 50 / 180 / 400 | Com o ar ligado |
| Videogame | 160 | Com o ar ligado |
| Geladeira / frigobar / freezer | 90 / 50 / 110 | 24 h |
| Micro-ondas / air fryer / forno | 150 / 400 / 700 | Nas refeições (11h, 12h, 18h, 19h) |
| Fogão a gás cozinhando | 1.500 + 400 de vapor | Nas refeições |
| Lâmpada incandescente | 60 cada | Com o ar ligado |

- **Luz:** LED 5 W/m², fluorescente 10, incandescente 20. Acesa à noite; em escritório, loja, cozinha e academia, também de dia.

### 4.8 Ar de fora

Infiltração por trocas de ar por hora (0,3 / 0,6 / 1,2): `Q_s = 0,335·V·ΔT`, `Q_l = 0,8336·V·Δw`.

### 4.9 Carga de partida (ar desligado parte do dia)

Na hora antes de ligar, o ambiente "flutua" acima do desejado em `ΔT = ganhos / condutância total`, limitado a 8 K. Ao ligar, é preciso tirar o calor acumulado: `Q = ΔT·[(ar + móveis)/3600 + 0,3·h_i·A_superfícies]`, com móveis ≈ 15 kJ/K por m² de piso e h_i = 8 W/m²K. O usuário escolhe quanto disso o aparelho vence na 1ª hora: rápido (100%), sem pressa (50%) ou não considerar.

### 4.10 Do calor ao aparelho

1. **Pior horário com o ar ligado** = carga de pico.
2. **Margem de segurança** (padrão 10%).
3. **Rendimento real.** A capacidade da etiqueta é medida com **27 °C dentro e 35 °C fora**, condição que também aparece em normas de ensaio de splits. Com o ambiente mais frio o aparelho rende menos: o app usa −2,5% por °C abaixo de 27 °C (a 23 °C ≈ 90%) e −1,2% por °C acima de 35 °C lá fora. **Este é um dos motivos de a v1 parecer "baixa".**
4. **Tamanho comercial:** 7.500 · 9.000 · 12.000 · 18.000 · 22.000 · 24.000 · 30.000 · 36.000 · 48.000 · 60.000. Escolhe o menor que atende com tolerância de 5%. Acima de 60.000, divide em vários aparelhos.
5. **No limite:** se o necessário fica até 15% acima do tamanho menor, o app avisa e diz qual melhoria traz o aparelho menor de volta.

## 5. Cenários de referência (calculados pelo próprio motor)

| Cenário | Pior hora | Calor no pico (BTU/h) | Necessário (BTU/h) | **Aparelho** | Regra das lojas |
|---|---|---|---|---|---|
| Quarto 3×4 m, apartamento, sol da tarde, ar à noite (21h–7h) | 21h | 10.151 | 12.407 | **12.000** | 10.800 → 12.000 |
| O mesmo quarto, parede sem sol | 21h | 7.196 | 8.795 | **9.000** | 8.400 → 9.000 |
| O mesmo quarto com o ar ligado 24 h | 17h | 7.094 | 8.670 | **9.000** | 10.800 → 12.000 |
| Sala 4×5 m, apartamento, janela de 2 m com sol da tarde, 12h–0h | 12h | 14.123 | 17.261 | **18.000** | 18.400 → 18.000 |
| Sala 4×5 m de último andar (laje sem telhado), Rio de Janeiro | 12h | 25.188 | 30.786 | **30.000** | 18.400 → 18.000 |
| Home office 3×3 m sem sol, 8h–18h | 15h | 5.057 | 6.181 | **7.500** | 6.600 → 7.500 |
| Cozinha 3×3,5 m com telha à vista e fogão a gás, Cuiabá | 12h | 21.261 | 26.133 | **30.000** | 9.600 → 12.000 |

**Leitura:**
- Nos cômodos comuns, o cálculo hora a hora **bate com a regra das lojas**.
- Onde diverge, é por um motivo físico identificável: laje pegando sol, fogão, cidade muito quente. Ou porque o ar fica ligado o dia todo (sem carga de partida).
- O quarto com ar 24 h precisa de menos que o quarto que só liga à noite. Parece contraintuitivo, mas é real: ligado o tempo todo, o ambiente nunca acumula calor.

Os testes automatizados (`npm test`) travam esses cenários e verificam a física de cada parte: geometria solar, perfil de temperatura, atraso e amortecimento das paredes, conservação de energia nas RTS, sol da manhã contra sol da tarde, proteções das janelas, aparelhos 24 h contra aparelhos de cozinha, partida, rendimento, escolha do tamanho, regra das lojas, "e se?" e entradas inválidas.

## 6. Onde instalar

Cada posição em cada parede recebe 0–100 pontos:

| Critério | Pontos | Como mede |
|---|---|---|
| Cobertura | 25 | Fração do piso que o jato alcança (grade de 0,25 m, abertura de ±55°, alcance típico do tamanho escolhido) |
| Conforto | 25 | Penaliza vento direto na cama (peso 0,6), mesa (0,45) e sofá (0,35), e aparelho sobre a cabeceira |
| Instalação | 20 | Parede que dá para fora 14 (interna 7, vizinho com ar 2) + condensadora: sem sol +6, manhã +4, dia todo +1, tarde 0 |
| Fonte de calor | 15 | Proximidade da parede que mais esquenta no pico |
| Layout | 15 | Longe de portas e cantos |

O aparelho nunca é colocado em cima de uma janela que chega à altura dele. Boas práticas de fabricantes e instaladoras:
- deixar pelo menos 15 cm do teto (há manuais que pedem 30 mm ou mais; vale o do modelo);
- tubulação dentro dos limites do modelo (instaladoras citam mínimo de ~3 m);
- condensadora na sombra e ventilada;
- circuito dedicado (NBR 5410).

É heurística, não simulação de escoamento (CFD).

## 7. Limitações

1. Dia de projeto único (verão, céu claro), sem os 8.760 h do ano.
2. Clima por cidade aproximado (86 referências, sem altitude); os outros municípios são interpolados. Não há tabela oficial da NBR 16401-1.
3. "Sol o dia todo" usa o pior caso entre leste e oeste em cada hora (conservador).
4. Sem sombreamento de prédios e árvores além das opções "não pega sol" e "fica na sombra".
5. A carga de partida é uma estimativa simplificada do calor guardado. O tempo real para gelar depende da massa térmica real.
6. Temperatura dos vizinhos estimada (sem simular o prédio).
7. O rendimento do aparelho por temperatura é genérico; cada modelo tem sua tabela de capacidade no manual técnico.
8. Altitude não corrigida (Brasília, Curitiba): o ar mais rarefeito reduz um pouco a capacidade real.

## 8. Eficiência e consumo

O consumo estimado soma a carga das horas de uso dividida pelo COP (inverter ~3,8; convencional ~2,8), num dia de verão médio (65% do dia de projeto), × 30 dias. Na prática, **proteger janelas do sol e isolar o teto** costuma economizar mais que trocar de aparelho, e às vezes permite comprar um tamanho menor. O consultor do app calcula isso refazendo a conta inteira para cada melhoria.

## 9. Grau de confiança dos dados

| Dado | Origem | Confiança |
|---|---|---|
| Geometria solar, psicrometria, conversões, balanço do ar | Física | **Alta** |
| Modelo de céu claro (A, B, C de janeiro) | ASHRAE (via EnergyPlus Engineering Reference) | Alta (céu claro); real é nublado parte do tempo |
| Perfil horário de temperatura | Perfil-padrão ASHRAE | Média-alta |
| Calor de pessoas | ASHRAE (fontes secundárias) | Média-alta |
| U e atraso das paredes e coberturas | Na linha da NBR 15220-3 e da literatura (ex.: tijolo de 6 furos ~2,1–2,5 W/m²K, atraso ~3,8 h) | Média |
| Condição de ensaio 27 °C/35 °C e queda de rendimento por °C | Normas de ensaio e tabelas de fabricantes (genérico) | Média |
| Calor médio de aparelhos | Estimativa de engenharia (potência × tempo ligado) | Média |
| Temperatura dos vizinhos e carga de partida | Modelo simplificado próprio | **Média-baixa**: o usuário controla a partida |
| Clima por cidade | 86 referências aproximadas + interpolação por distância | **Média-baixa**: editável; pior em serra |
| Coordenadas dos municípios | Base pública kelvins/municipios-brasileiros (MIT) | Alta |
| COP e consumo | Ordem de grandeza | Baixa |

## 10. Fontes consultadas

- Regra de mercado: [Midea – Calculadora de BTUs](https://www.midea.com.br/calculadora-de-btu), [Buscapé – BTUs por m²](https://www.buscape.com.br/ar-condicionado/conteudo/como-calcular-a-potencia-do-ar-condicionado), [Buscapé – quarto](https://www.buscape.com.br/ar-condicionado/conteudo/qual-a-potencia-do-ar-condicionado-para-um-quarto), [Zoom](https://www.zoom.com.br/ar-condicionado/deumzoom/saiba-como-escolher-ar-condicionado-na-potencia-certa), [LG](https://www.lg.com/br/sobre-a-lg/press-media/como-calcular-a-potencia-ideal-do-ar-condicionado/), [Electrolux](https://loja.electrolux.com.br/homepedia/ambientes/casa/o-que-e-btu), [WebArCondicionado](https://webarcondicionado.com.br/calculo-de-btu)
- Ferramentas profissionais: [Carrier HAP](https://www.carrier.com/commercial/en/au/hourly-analysis-program/), [Carrier HAP v6](https://www.carrier.com/commercial/en/us/news/news-article/carrier-releases-hap-v6--a-major-upgrade-to-hvac-system-design-software.html), [comparação TRACE 700 × HAP × CHVAC](https://industrialmonitordirect.com/blogs/knowledgebase/hvac-load-calculation-software-trace-700-vs-carrier-hap-vs-elite-chvac)
- Céu claro ASHRAE: [EnergyPlus Engineering Reference – Climate Calculations](https://bigladdersoftware.com/epx/docs/9-6/engineering-reference/climate-calculations.html)
- Condição de ensaio 27 °C/19 °C dentro e 35 °C fora: [IS 1391-2 (norma indiana de splits)](https://www.scribd.com/document/665301751/1391-2-2018-AMD4-Reff2022) e [ISO 5151](https://online.standard.no/en/iso-5151-2017)
- Paredes e coberturas: [NBR 15220-3 (cópia acadêmica, Anexo D)](https://edisciplinas.usp.br/pluginfile.php/5660736/mod_folder/content/0/NBR%2015220/NBR15220-3.pdf), [ENTAC – tijolos de 6 furos](https://eventos.antac.org.br/index.php/entac/article/download/883/544/1767), [LabEEE/UFSC – componentes construtivos](https://labeee.ufsc.br/sites/default/files/publicacoes/relatorios_pesquisa/Biblioteca_ComponentesConstrutivos_0.pdf), [Univates – protótipos](https://www.univates.br/revistas/index.php/destaques/article/download/2009/1446)
- Carga que varia ao longo do dia: [UFPR – Carga térmica em climatização](https://docs.ufpr.br/~rudmar/clima/material/5_CARGA%20TERMICA%20EM%20CLIMATIZACAO.pdf)
- Pessoas: [Autodesk/Revit – tabela ASHRAE](https://help.autodesk.com/cloudhelp/2014/ENU/Revit/files/GUID-7668C78B-7B33-4D60-B838-57D2656D8AD5.htm), [Engineering Toolbox](https://www.engineeringtoolbox.com/metabolic-heat-persons-d_706.html)
- Instalação: [Engehall](https://engehall.com.br/instalacao-de-ar-condicionado/), [FAQ Daikin](https://www.reclameaqui.com.br/empresa/daikin-mcquay-ar-condicionado/faq/), [WebArCondicionado – hi-wall](https://webarcondicionado.com.br/split-hi-wall)
- Conforto e NBR 16401: [Target Normas – NBR 16401-1:2024](https://www.normas.com.br/visualizar/genius-faq/12193/conforme-nbr16401-1-de-11-2024-como-avaliar-as-fontes-internas-de-calor-e-umidade)

As tabelas oficiais (NBR 16401-1, ASHRAE Fundamentals) são pagas e não foram lidas na íntegra. Onde o valor veio de fonte secundária ou de estimativa própria, a seção 9 diz isso.
