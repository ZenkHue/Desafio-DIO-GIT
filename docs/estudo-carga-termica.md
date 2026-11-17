# Estudo: carga térmica e posicionamento de ar-condicionado

Documento de apoio da **Calculadora Térmica** (`ar-condicionado.html`). Explica o método, as premissas, de onde vêm os números, o que o modelo **não** faz e como o app sugere a posição do aparelho. Complementa o código em `js/thermal.js` e `js/placement.js`.

> **Aviso.** O app é uma ferramenta de **pré-dimensionamento**. Não substitui projeto de profissional habilitado conforme a série ABNT NBR 16401. Vários coeficientes são valores de referência aproximados (a seção 9 diz quais e com que grau de confiança).

---

## 1. Resumo

- **Problema.** Escolher um ar-condicionado pela regra "600 BTU/h por m²" ignora sol, cobertura, janelas e ocupação. O erro pode passar de 30% para mais ou para menos.
- **Solução adotada.** Soma de cargas por componente na hora de pico (paredes, janelas, cobertura, pessoas, equipamentos, iluminação, ar externo), separando calor **sensível** e **latente**, com margem de segurança e escolha da capacidade comercial.
- **Diferencial.** O app também (a) mostra o ambiente em 3D com mapa de calor, (b) pontua posições candidatas para a evaporadora e (c) simula "e se?" (proteção solar, isolamento, LED) para mostrar o quanto cada melhoria reduz a carga.
- **Resultado típico.** Sala 4×5 m com janela a oeste: **11.154 BTU/h** (regra de bolso: 12.000). Com a janela a oeste de 2,5 m e laje exposta: **16.428 BTU/h**, bem acima da regra, porque o sol pesa.

## 2. Fundamentos

### 2.1 Calor sensível, latente e total

- **Sensível**: muda a temperatura do ar (condução pelas paredes, sol nos vidros, pessoas, equipamentos, luz).
- **Latente**: calor associado ao vapor d'água (respiração e suor das pessoas, umidade do ar externo que entra).
- **SHR** (*sensible heat ratio*) = sensível ÷ total. SHR baixo (muita umidade) exige equipamento que desumidifique bem e **não** deve ser sobredimensionado.

### 2.2 Unidades

| Grandeza | Conversão |
|---|---|
| 1 W | 3,412 BTU/h |
| 1 TR (tonelada de refrigeração) | 12.000 BTU/h = 3,517 kW |
| 1 BTU/h | 0,293 W |

### 2.3 Psicrometria usada

Pressão de saturação (Magnus–Tetens), em kPa, com T em °C:

```
p_sat(T) = 0,61094 · exp( 17,625·T / (T + 243,04) )
```

Umidade absoluta (g de vapor por kg de ar seco) a 101,325 kPa:

```
w = 622 · p_v / (101,325 − p_v),   p_v = p_sat(T) · UR
```

Conferência: 24 °C e 50% UR dão w ≈ 9,28 g/kg, o valor conhecido do ar interno de conforto.

O ar externo que entra (infiltração ou renovação), com vazão `V` em m³/h:

```
Q_sensível = 0,335 · V · ΔT        [W]   (≈ ρ·cp / 3600, ρ = 1,2 kg/m³, cp = 1,006 kJ/kg·K)
Q_latente  = 0,8336 · V · Δw       [W]   (≈ ρ·h_lv / 3600, h_lv ≈ 2.501 kJ/kg, Δw em g/kg)
```

Se o ar externo for mais seco que o interno, a carga latente é zerada (nunca negativa).

## 3. Normas e referências

| Referência | Para que serve aqui |
|---|---|
| **ABNT NBR 16401-1** (projeto das instalações) | Método geral de projeto e condições de projeto. Há uma edição de 2024 segundo fontes secundárias. |
| **ABNT NBR 16401-2** (parâmetros de conforto térmico) | Condições internas de conforto. Fontes citam, para verão, faixas em torno de 23 °C a 26 °C. |
| **ABNT NBR 16401-3** (qualidade do ar interior) | Vazões mínimas de ar externo. |
| **ABNT NBR 15220** (desempenho térmico de edificações) | Cálculo de transmitância térmica U e zoneamento bioclimático. |
| **ASHRAE Handbook – Fundamentals** | Cargas de resfriamento (métodos CLTD/CLF e RTS), ganhos de pessoas, ganhos solares. |
| **ASHRAE 62.1** | Ar externo: 2,5 L/s por pessoa + 0,3 L/s por m² em escritórios (usado quando há renovação mecânica). |
| **ASHRAE 55** | Conforto térmico. |
| **NBR 5410** | Instalações elétricas de baixa tensão (circuito do ar-condicionado). |
| **INMETRO/PROCEL (ENCE, IDRC)** | Classes de eficiência energética. |

> **Não tive acesso ao texto integral das normas ABNT** (são pagas) nem às tabelas de clima de projeto da NBR 16401-1. Por isso as temperaturas por cidade são **aproximadas** e editáveis na interface. Se você tem a norma, informe o valor oficial.

## 4. Métodos de cálculo (panorama)

| Método | Como funciona | Quando usar | Limitação |
|---|---|---|---|
| **Regra de bolso** (600 BTU/h·m²) | Fator único por área, com acréscimos por pessoa/equipamento | Triagem rápida | Ignora sol, cobertura, janelas, clima |
| **CLTD/SCL/CLF** (ASHRAE, manual) | Diferença de temperatura equivalente por hora do dia, tabelada | Projeto manual | Tabelas por latitude/horário, trabalhoso |
| **RTS – Radiant Time Series** (ASHRAE) | Converte ganhos instantâneos em carga por séries de resposta no tempo | Projeto com planilha/software | Exige dados horários detalhados |
| **Balanço de calor / simulação horária** (EnergyPlus etc.) | Resolve o balanço térmico a cada hora com clima real | Projetos grandes, eficiência energética | Modelagem pesada |
| **Este app** | Soma de cargas **de pico** por componente com ΔT equivalente simplificado | Pré-dimensionamento de ambiente único | Veja seção 8 |

O app escolhe o método simplificado de propósito: é auditável, rápido e suficiente para decidir entre 9.000, 12.000, 18.000 BTU/h… com a ressalva de que a incerteza das entradas (clima, infiltração, U real da parede) costuma ser maior que a diferença entre os métodos.

## 5. Modelo adotado

### 5.1 Geometria e convenções

Largura = dimensão **leste–oeste**; comprimento = **norte–sul**. As quatro paredes ficam alinhadas aos pontos cardeais. Cada parede pode ser **externa**, **interna para área não climatizada** ou **interna para ambiente climatizado** (sem carga). Cada parede aceita uma **janela** e uma **porta**; a posição de ambas é dada em % do comprimento da parede, contado a partir do canto oeste (paredes Norte e Sul) ou norte (paredes Leste e Oeste). Se a porta bater na janela, o motor desloca a porta para o lado que couber.

### 5.2 Equações por componente

**Parede externa opaca** (área líquida = área total − janela):

```
Q = U · A · [ (T_ext − T_int) + ΔT_sol(orientação) · f_cor · f_amort · f_noite ]
```

**Parede para área não climatizada:** `Q = U · A · max(0, T_ext − T_int − 3)`. A hipótese de "−3 K" é usual para espaços vizinhos sem climatização.

**Janela:**

```
Q = U_v · A · (T_ext − T_int)  +  A · SHGF(orientação) · FS_vidro · F_proteção · f_noite
```

**Porta:** a área da porta (largura × 2,1 m) é descontada da parede e entra com U próprio: 2,5 W/m²K em porta externa (mesmo ΔT equivalente da parede) e 2,0 W/m²K em porta para área não climatizada (ΔT − 3 K). Porta para ambiente climatizado não gera carga, mas continua no desenho e na avaliação de posição.

**Cobertura:** mesma forma da parede, com U e ΔT_sol próprios: telhado direto (telha à vista, sem laje nem forro), laje descoberta, laje ou forro com telhado por cima (ático), cobertura isolada, outro andar acima sem ar-condicionado e outro andar acima climatizado (sem carga). Para uma casa com telha à vista, o app sugere em primeiro lugar isolar ou instalar forro.

**Pessoas:** `N · (q_sensível + q_latente)` conforme a atividade.

**Equipamentos:** `Σ qtd · W` (100% sensível). **Iluminação:** `W/m² · área` (100% sensível).

**Ar externo:** infiltração `V = volume · ACH`; renovação mecânica opcional `V = 9·N + 1,08·A` m³/h. Aplica `Q_sensível` e `Q_latente` da seção 2.3.

**Total:** `Q_total = (Σ sensível + Σ latente) · (1 + margem)`; margem padrão **10%**.

### 5.3 Tabela de premissas (valores do código)

| Item | Valor | Observação |
|---|---|---|
| Condição interna | 24 °C / 50% UR | Editável |
| U alvenaria cerâmica rebocada | 2,4 W/m²K | Faixa de fontes: ~2,1 a ~2,5 conforme espessura/reboco |
| U concreto 15 cm | 3,2 W/m²K | Aproximado |
| U drywall com lã | 0,9 W/m²K | Aproximado |
| U parede isolada | 0,6 W/m²K | Aproximado |
| U vidro simples / duplo low-e | 5,8 / 2,8 W/m²K | Valores típicos |
| U porta de madeira (externa / interna) | 2,5 / 2,0 W/m²K | Aproximado |
| Fator solar do vidro (FS) | comum 1,0 · fumê 0,6 · película 0,5 · duplo 0,45 | Relativo ao vidro simples |
| Proteção solar | cortina 0,65 · externa 0,35 | Redutor do ganho solar |
| ΔT_sol parede (K, cor média) | N 3 · S 1 · L 5 · O 8 | Simplificação de pico, ~23 °S |
| Fator de cor | clara 0,6 · média 1,0 · escura 1,3 | |
| Amortecimento (massa) | alvenaria 0,85 · concreto 0,75 · drywall 1,0 | Massa atrasa e reduz o pico |
| SHGF vidro comum (W/m²) | N 170 · S 110 · L 300 · O 420 | Ganho solar de projeto simplificado |
| Cobertura (U / ΔT_sol) | **telhado direto, sem laje nem forro 4,5 / 20** · laje descoberta 3,0 / 18 · laje ou forro com telhado por cima 1,5 / 8 · isolada 0,6 / 8 | A telha à vista deixa passar bem mais calor que uma laje de concreto (U da ordem de 4,5 W/m²K) |
| Pessoa, escritório | 75 W sensível + 65 W latente | Coerente com ASHRAE (≈140 W total) |
| Pessoa, repouso | 72 + 45 W | ASHRAE "sentado, trabalho muito leve" ≈ 245 + 155 BTU/h |
| Iluminação | LED 6 · fluorescente 12 · incandescente 20 W/m² | Inclui perdas de reator |
| Infiltração | 0,3 · 0,5 · 1,0 troca/h | Residencial/comercial pequeno |
| Uso noturno | T_ext −3 K, efeito solar ×0,35 | Calor armazenado ainda é devolvido |
| Capacidades comerciais | 7.500 · 9.000 · 12.000 · 18.000 · 24.000 · 30.000 · 36.000 · 48.000 · 60.000 BTU/h | Tolerância de 5% para escolher |

### 5.4 Escolha do equipamento

A capacidade é o **menor modelo comercial que atende a carga com tolerância de 5%**. Acima de 60.000 BTU/h o app divide em várias unidades. O app avisa quando:

- a menor unidade (7.500) já excede a carga (cômodos pequenos e bem protegidos), recomendando **inverter**;
- a carga passa de 36.000 BTU/h ou a área de 45 m², sugerindo piso-teto, cassete ou 2 unidades;
- a maior dimensão supera o alcance típico do jato;
- o SHR é baixo (muita carga latente).

### 5.5 Consultor "e se?"

Para cada melhoria candidata, o app **recalcula o ambiente inteiro** com a alteração e mostra a redução real em BTU/h e em % (e se ela reduz a capacidade do equipamento): proteção solar externa ou película por janela, isolamento ou cor clara na cobertura, parede clara, troca por LED, melhor vedação. Só aparecem melhorias com efeito de pelo menos 300 BTU/h e 2%.

## 6. Exemplos e conferência

Resultados do próprio motor (`node scripts/carga-termica.js scripts/exemplos/<caso>.json`):

| Caso | Carga | Regra 600/m² | Equipamento | Comentário |
|---|---|---|---|---|
| **Sala 4×5 m, janela 1,5×1,2 oeste, telhado com forro, São Paulo** | 11.154 BTU/h (558/m²) | 12.000 | 12.000 | A janela oeste responde por ~28% da carga |
| **Mesma sala, janela oeste 2,5 m e laje exposta** | 16.428 BTU/h | 12.000 | 18.000 | O sol faz a regra de bolso subdimensionar em ~27% |
| **Quarto 3×4 m, janela leste, à noite, vizinhos não climatizados** | 3.270 BTU/h | 7.200 | 7.500 inverter | Modelo fica bem abaixo da regra; veja nota abaixo |
| **Escritório 6×5 m, 6 pessoas, janelas oeste e sul, renovação de ar, Rio** | 25.285 BTU/h (843/m²) | 24.000 | 30.000 | Equipamentos e ar externo dominam |

**Nota sobre o quarto.** A regra de bolso embute folgas generosas e é conservadora para cômodos pequenos. O modelo dá um valor mais baixo porque o ambiente recebe pouco calor externo. A menor unidade comercial (7.500 BTU/h) já cobre a carga com sobra, então a recomendação prática coincide com a da regra, mas o app orienta a usar **inverter** para evitar liga/desliga.

**Testes automatizados** (`npm test`, 62 testes): conversões, equações de psicrometria, cada componente contra cálculo à mão, ordem de importância das orientações (oeste > leste > norte > sul), monotonicidade, entradas inválidas sem `NaN`, escolha de capacidade e coerência entre "e se?" e recálculo direto.

## 7. Posicionamento da evaporadora

### 7.1 Princípios físicos e de instalação

1. **Jato e alcance.** Hi-walls projetam o ar a cerca de 5 a 13 m conforme a capacidade (o app usa valores típicos de mercado; o manual do modelo prevalece). O ar frio tende a descer e se espalhar; o ideal é que o jato percorra a **maior dimensão** do ambiente.
2. **Conforto.** Evitar correnteza direta sobre onde as pessoas ficam (cama, mesa, sofá).
3. **Altura e folga.** Montar alto na parede, com **pelo menos 15 cm do teto** segundo instaladoras (a Daikin cita 30 mm no FAQ). O manual do fabricante manda.
4. **Tubulação.** Quanto mais curta, melhor e mais barata, desde que respeite os limites do modelo (comprimento mínimo e máximo e desnível variam por fabricante; uma instaladora cita mínimo de ~3 m).
5. **Condensadora.** Fora do sol direto e de locais abafados, com folgas de ventilação, e fácil acesso para manutenção.
6. **Porta.** Evitar perto da porta (ar frio escapa e entra ar quente).

### 7.2 Pontuação (0–100)

| Critério | Pontos | Como é medido |
|---|---|---|
| **Cobertura** | 25 | Fração do piso alcançada pelo jato (amostragem em grade de 0,25 m, cone de ±55° e alcance do equipamento) |
| **Conforto** | 25 | Penaliza correnteza direta sobre cama (peso 0,6), mesa (0,45) e sofá (0,35), e unidade acima da cabeceira |
| **Instalação** | 20 | Parede externa 14 (interna não climatizada 7, vizinho climatizado 2) + bônus pela fachada da condensadora (S +6, L +4, N +2, O 0) |
| **Proximidade da carga** | 15 | Distância até a maior fonte de calor (janela/parede mais carregada) |
| **Layout** | 15 | Distância de **cada** porta, do canto e jato apontado para alguma porta |

Para cada parede o app mostra a **melhor posição**, com motivos e alertas em português. Ele **recomenda** a de maior nota e permite comparar as demais no 3D ou na planta.

### 7.3 Limitações do posicionamento

- É uma **heurística geométrica**, não CFD: não resolve o escoamento real, o efeito Coanda no teto nem a recirculação.
- Móveis são caixas; pessoas são representadas pelos móveis (cama, mesa, sofá), não por posição real de cada pessoa.
- O app não conhece vigas, shafts, tubulação de água ou vizinhos. Valide no local com o instalador.

## 8. Limitações do modelo térmico

1. **Hora de pico simplificada.** Não simula as 24 horas nem a defasagem térmica real das paredes pesadas.
2. **Ambiente isolado.** Não há troca de calor com ambientes vizinhos além da hipótese "−3 K".
3. **Sem sombreamento externo** de prédios, árvores e beirais (só proteções declaradas por janela).
4. **Piso** é desprezado (térreo sobre solo ou andar intermediário).
5. **Infiltração** é uma estimativa por trocas/hora. Em edifícios altos e com vento ela varia muito.
6. **Altitude** não corrige a pressão (usa 101,325 kPa). Em cidades altas (Brasília ~1.100 m) o ar é menos denso, o que reduz a capacidade real do equipamento em alguns por cento.
7. **Simultaneidade** de pessoas e equipamentos: o app assume uso integral.
8. **Cargas latentes extras** (cozinha, banheiro, piscina) não estão modeladas.
9. **Conforto** é tratado só por temperatura e umidade; velocidade do ar, temperatura radiante e vestimenta não entram.

## 9. Confiabilidade dos dados do app

| Dado | Origem | Confiança |
|---|---|---|
| Equações de psicrometria, conversões, 0,335 e 0,8336 | Física/termodinâmica | **Alta** |
| Calor de pessoas em escritório (≈75 + 65 W) | ASHRAE Fundamentals, via fontes secundárias | Média-alta |
| U de alvenaria cerâmica (2,1 a 2,5) | NBR 15220 / estudos da UFSC (LabEEE) e artigos | Média |
| U de concreto, drywall, isolada, vidro, porta | Valores típicos de catálogo/literatura | Média-baixa |
| **ΔT_sol e SHGF por orientação** | **Simplificação minha** (inspirada no CLTD/SHGF da ASHRAE para ~23 °S) | **Baixa a média** — valide em projeto |
| **Clima de projeto por cidade** | **Aproximado** (não extraí as tabelas da NBR 16401-1) | **Baixa a média** — ajuste na interface |
| Iluminação em W/m², ACH | Valores usuais | Média |
| Alcance do jato por capacidade | Faixas típicas de mercado | Média (varia por modelo) |
| COP 2,9 / 3,8 e fator de carga 0,6 | Ordem de grandeza | Baixa (só para estimar consumo) |

## 10. Eficiência e custo

- **Inverter × convencional.** O inverter modula a rotação do compressor e opera longos períodos em carga parcial, com menos liga/desliga e melhor desumidificação. O app usa COP ~3,8 (inverter) e ~2,9 (convencional) para uma **estimativa** de consumo: `kWh/mês = (carga · 0,6 / COP) · horas/dia · 30`.
- **Etiqueta ENCE/IDRC.** Compare o IDRC (índice de desempenho em condição de carga parcial) ao escolher o modelo.
- **Sombreamento e isolamento valem mais que eficiência do aparelho.** No cenário padrão, proteção solar externa na janela oeste reduz ~17% da carga e isolar a cobertura mais ~9%.

## 11. Como o agente especialista usa isto

O agente `especialista-ar-condicionado` (`.claude/agents/`) conduz o mesmo método de forma conversacional: levanta os dados do ambiente, roda `scripts/carga-termica.js` (o **mesmo motor** do app) e devolve carga, equipamento, posição e melhorias, deixando claras as premissas e incertezas. Ele **não inventa números**: quando falta dado, pergunta ou assume o padrão e avisa.

## 12. Próximos passos sugeridos

- Importar a tabela oficial de clima da NBR 16401-1 por cidade (com licença da norma).
- Carga **horária** (24 h) com perfil de ocupação e gráfico.
- Vários ambientes e rateio de carga, com sugestão de multi-split/VRF.
- Altitude e correção de capacidade.
- Exportar relatório em PDF com premissas.

## 13. Fontes consultadas nesta pesquisa

As buscas encontraram principalmente fontes **secundárias**. Foram usadas para conferir ordens de grandeza; os valores exatos devem ser checados nas normas e nos manuais.

- Calor de pessoas (ASHRAE, compilado): [Autodesk/Revit – tabela ASHRAE](https://help.autodesk.com/cloudhelp/2014/ENU/Revit/files/GUID-7668C78B-7B33-4D60-B838-57D2656D8AD5.htm) e [Engineering Toolbox – Metabolic Heat Gain from Persons](https://www.engineeringtoolbox.com/metabolic-heat-persons-d_706.html)
- Transmitância térmica de alvenaria: [Univates – estudo de protótipos de bloco](https://www.univates.br/revistas/index.php/destaques/article/download/2009/1446), [LabEEE/UFSC – transmitância](https://labeee.ufsc.br/sites/default/files/documents/transmitancia_site.pdf) e [Biblioteca de componentes construtivos](https://labeee.ufsc.br/sites/default/files/publicacoes/relatorios_pesquisa/Biblioteca_ComponentesConstrutivos_0.pdf)
- Condições internas de conforto e NBR 16401: [memorial descritivo de projeto (23 ± 2 °C)](https://www.transparencia.crmdf.org.br/images/Licitacao_Contrato/Tomada_Preco/Projetos-VersaoII/2---AR-COND.-Memorial-Descritivo.pdf) e [Target Normas – FAQ sobre a NBR 16401-1 de 11/2024](https://www.normas.com.br/visualizar/genius-faq/12193/conforme-nbr16401-1-de-11-2024-como-avaliar-as-fontes-internas-de-calor-e-umidade)
- Instalação de split hi-wall: [Engehall – instalação de ar-condicionado](https://engehall.com.br/instalacao-de-ar-condicionado/), [FAQ Daikin](https://www.reclameaqui.com.br/empresa/daikin-mcquay-ar-condicionado/faq/) e [WebArCondicionado – split hi-wall](https://webarcondicionado.com.br/split-hi-wall)
