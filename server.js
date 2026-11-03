const express = require('express');
const cors = require('cors');
const axios = require('axios');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// API SCPC base URL
const SCPC_API_URL = 'https://api.scpc.estaleiro.serpro.gov.br/v1/promocao-comercial/export/json';

// Primeiro ano com dados na API SCPC
const PRIMEIRO_ANO = 2017;

// A exportação sem filtro de nome vem de uma cópia desatualizada da base.
// Com um filtro de nome a API consulta a base ao vivo; "___" (curinga de
// 3 caracteres quaisquer) casa com todos os nomes e traz o mesmo total do
// site oficial do SCPC.
const NOME_CURINGA = '___';

// Na base da API a modalidade é gravada como "Assemelhada a Sorteio"
const MODALIDADES_API = {
  'Assemelhado a Sorteio': 'Assemelhada a Sorteio'
};

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"]
    }
  }
}));

app.use(compression());
app.use(morgan('combined'));
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : true,
  credentials: true
}));
app.use(express.json());

// Cache simples das respostas da API SCPC (10 minutos). Um ano completo passa
// de 20 MB, então só as últimas consultas ficam guardadas.
const cache = new Map();
const CACHE_DURATION = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 4;

// Relatórios já calculados são pequenos e podem ficar mais tempo
const relatoriosCache = new Map();
const RELATORIOS_CACHE_DURATION = 30 * 60 * 1000;
const RELATORIOS_CACHE_MAX_ENTRIES = 300;

// Ano atual no fuso de Brasília, para virar o ano sem depender do servidor
function anoAtual() {
  return Number(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric' }));
}

// Arquivos do site (apenas estes são servidos; o resto do diretório fica privado)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/styles.css', (req, res) => {
  res.sendFile(path.join(__dirname, 'styles.css'));
});

app.get('/script.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'script.js'));
});

app.get('/comum.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'comum.js'));
});

app.get('/relatorios', (req, res) => {
  res.sendFile(path.join(__dirname, 'relatorios.html'));
});

app.get('/relatorios.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'relatorios.js'));
});

app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// Lista de anos disponíveis, gerada automaticamente a partir do ano atual
app.get('/api/anos', (req, res) => {
  const atual = anoAtual();
  const anos = [];
  for (let ano = atual + 1; ano >= PRIMEIRO_ANO; ano--) anos.push(ano);
  res.json({ atual, anos });
});

// Busca na API SCPC, com cache por URL
async function fetchFromSCPC(params) {
  const apiUrl = new URL(SCPC_API_URL);
  Object.entries(params).forEach(([key, value]) => {
    if (value) apiUrl.searchParams.append(key, value);
  });
  const url = apiUrl.toString();

  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.promocoes;
  }

  console.log('Buscando na API SCPC:', url);
  const response = await axios.get(url, {
    timeout: 60000,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Brasil-Promocoes/1.0'
    }
  });

  const promocoes = normalizarResposta(response.data);

  if (cache.size >= CACHE_MAX_ENTRIES) {
    cache.delete(cache.keys().next().value);
  }
  cache.set(url, { promocoes, timestamp: Date.now() });

  return promocoes;
}

function normalizarResposta(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.promocoes)) return data.promocoes;
  if (data && Array.isArray(data.data)) return data.data;
  return [];
}

// Busca todas as promoções de um ano. O filtro "uf" da API deixa de fora as
// promoções nacionais (abrangência "BR"), então o estado é filtrado aqui.
async function buscarAno(ano, filtros) {
  const { uf, ...outros } = filtros;
  const resultado = await buscarNaAPI(ano, outros);
  if (!uf) return resultado;
  return {
    ...resultado,
    promocoes: resultado.promocoes.filter(p => ufsDaAbrangencia(p.abrangencia).includes(uf))
  };
}

// Consulta a API com os filtros que ela aplica corretamente
async function buscarNaAPI(ano, filtros) {
  const params = {
    anoPromocao: ano,
    cnpjMandatario: filtros.cnpjMandatario,
    nomeMandatario: filtros.nomeMandatario,
    modalidade: MODALIDADES_API[filtros.modalidade] || filtros.modalidade,
    nomePromocao: filtros.nomePromocao || NOME_CURINGA
  };

  try {
    return { promocoes: await fetchFromSCPC(params), fonte: 'ao-vivo' };
  } catch (primeiroErro) {
    // A API às vezes responde 502 de forma momentânea; tenta mais uma vez
    let error = primeiroErro;
    if (!(error.response && error.response.status === 422)) {
      try {
        return { promocoes: await fetchFromSCPC(params), fonte: 'ao-vivo' };
      } catch (segundoErro) {
        error = segundoErro;
      }
    }

    // Erros de validação (ex.: nome muito curto) não devem cair no fallback
    if (error.response && error.response.status === 422) throw error;
    if (filtros.nomePromocao) throw error;

    // Sem filtro de nome, tenta a exportação padrão (pode estar desatualizada)
    console.error('Consulta ao vivo falhou, usando exportação padrão:', error.message);
    const { nomePromocao, ...semNome } = params;
    return { promocoes: await fetchFromSCPC(semNome), fonte: 'exportacao' };
  }
}

function anoDe(data) {
  return data ? Number(String(data).slice(0, 4)) : NaN;
}

function apenasDigitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

// Versão enxuta para a listagem (apurações e prêmios vão no endpoint de detalhes)
function resumo(promocao) {
  const mandatario = promocao.mandatario || {};
  return {
    numeroPromocao: promocao.numeroPromocao,
    nome: promocao.nome,
    modalidade: promocao.modalidade,
    numeroCA: promocao.numeroCA,
    situacao: promocao.situacao,
    dataInicio: promocao.dataInicio,
    dataFim: promocao.dataFim,
    quantidadePremios: promocao.quantidadePremios,
    valorTotal: promocao.valorTotal,
    abrangencia: promocao.abrangencia,
    segmento: segmentoDe(promocao),
    mandatario: {
      cnpj: mandatario.cnpj,
      nomeFantasia: mandatario.nomeFantasia,
      razaoSocial: mandatario.razaoSocial,
      cidade: mandatario.cidade,
      uf: mandatario.uf
    }
  };
}

function validarAno(valor) {
  const ano = Number(valor);
  if (!Number.isInteger(ano) || ano < PRIMEIRO_ANO || ano > anoAtual() + 1) return null;
  return ano;
}

function responderErro(res, error) {
  console.error('Erro ao buscar promoções:', error.message);

  if (error.response && error.response.status === 422) {
    const detalhes = (error.response.data && error.response.data.errors) || [];
    return res.status(400).json({
      error: 'Filtro inválido',
      message: detalhes.map(e => e.message).join(' ') || 'Verifique os filtros informados.'
    });
  }

  res.status(502).json({
    error: 'API SCPC indisponível',
    message: 'Não foi possível consultar a base do SCPC agora. Tente novamente em instantes.'
  });
}

// Rota da API para buscar promoções
app.get('/api/promocoes', async (req, res) => {
  const {
    anoPromocao,
    uf,
    cnpjMandatario,
    nomeMandatario,
    modalidade,
    numeroCertificado,
    nomePromocao,
    dataInicio,
    dataFim,
    situacao,
    vigentes
  } = req.query;
  const segmento = validarSegmento(req.query.segmento);

  const ano = validarAno(anoPromocao);
  if (!ano) {
    return res.status(400).json({
      error: 'Parâmetro anoPromocao inválido',
      message: `Informe um ano entre ${PRIMEIRO_ANO} e ${anoAtual() + 1}.`
    });
  }

  for (const [campo, valor] of [['Nome da promoção', nomePromocao], ['Nome do mandatário', nomeMandatario]]) {
    if (valor && valor.trim().length < 3) {
      return res.status(400).json({
        error: 'Filtro inválido',
        message: `${campo} deve ter pelo menos 3 caracteres.`
      });
    }
  }

  const filtros = {
    uf,
    cnpjMandatario: apenasDigitos(cnpjMandatario),
    nomeMandatario: nomeMandatario && nomeMandatario.trim(),
    modalidade,
    nomePromocao: nomePromocao && nomePromocao.trim()
  };

  try {
    const atual = await buscarAno(ano, filtros);
    let promocoes = atual.promocoes;
    let fonte = atual.fonte;

    // Inclui promoções iniciadas no ano anterior que continuam vigentes neste ano
    if (vigentes === '1' && ano > PRIMEIRO_ANO) {
      const anterior = await buscarAno(ano - 1, filtros);
      if (anterior.fonte !== 'ao-vivo') fonte = anterior.fonte;
      const numeros = new Set(promocoes.map(p => p.numeroPromocao));
      const continuam = anterior.promocoes.filter(p => anoDe(p.dataFim) >= ano && !numeros.has(p.numeroPromocao));
      promocoes = promocoes.concat(continuam);
    }

    // O filtro de certificado da API não funciona, então é aplicado aqui
    if (numeroCertificado) {
      const certificado = apenasDigitos(numeroCertificado);
      promocoes = promocoes.filter(p => apenasDigitos(p.numeroCA).includes(certificado));
    }

    if (segmento) {
      promocoes = promocoes.filter(p => segmentoDe(p) === segmento);
    }

    if (dataInicio || dataFim || situacao) {
      promocoes = promocoes.filter(promocao => {
        // Promoção deve começar a partir da data de início
        if (dataInicio && promocao.dataInicio && new Date(promocao.dataInicio) < new Date(dataInicio + 'T00:00:00.000Z')) {
          return false;
        }
        // Promoção deve terminar até a data de fim
        if (dataFim && promocao.dataFim && new Date(promocao.dataFim) > new Date(dataFim + 'T23:59:59.999Z')) {
          return false;
        }
        if (situacao && promocao.situacao !== situacao) {
          return false;
        }
        return true;
      });
    }

    // Mesma ordem do site oficial: registros mais recentes primeiro
    promocoes = promocoes
      .slice()
      .sort((a, b) => String(b.numeroPromocao).localeCompare(String(a.numeroPromocao)));

    console.log(`Encontradas ${promocoes.length} promoções (${fonte})`);
    res.json({
      promocoes: promocoes.map(resumo),
      metadata: {
        total: promocoes.length,
        ano,
        vigentes: vigentes === '1',
        fonte,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    responderErro(res, error);
  }
});

// Detalhes completos (apurações e prêmios) de uma promoção
app.get('/api/promocoes/detalhe', async (req, res) => {
  const ano = validarAno(req.query.ano);
  const { numero } = req.query;

  if (!ano || !numero) {
    return res.status(400).json({
      error: 'Parâmetros inválidos',
      message: 'Informe o ano de início e o número da promoção.'
    });
  }

  try {
    const { promocoes } = await buscarAno(ano, {});
    const promocao = promocoes.find(p => p.numeroPromocao === numero);
    if (!promocao) {
      return res.status(404).json({
        error: 'Promoção não encontrada',
        message: `A promoção ${numero} não foi encontrada em ${ano}.`
      });
    }
    res.json({ ...promocao, segmento: segmentoDe(promocao) });
  } catch (error) {
    responderErro(res, error);
  }
});

// ===== Segmentos =====

// A API não informa o setor da empresa, então o segmento é deduzido pelo nome
// do mandatário. As regras são testadas em ordem e a primeira que casar vence
// (ex.: "Associação dos Lojistas do Shopping X" é shopping, não associação comercial).
const SEGMENTOS = [
  { segmento: 'Shoppings', regex: /shopping|\bmall\b|outlet|\bfundo\b|\bfpp\b|associacao dos loj|lojistas do|subcondominio|condominio (civil |do |de )?(.* )?(center|plaza|park|shop|boulevard|patio|centro)|centro comercial/ },
  { segmento: 'CDLs e associações comerciais', regex: /\bcdl\b|dirigentes lojistas|associacao (comercial|empresarial|dos comerciantes|de lojistas)|\baci[a-z]{0,3}\b|sindilojas|sindicato do comercio|federacao do comercio|fecomercio|camara de comercio|camara de dirigentes|\bspc\b/ },
  { segmento: 'Rádio, TV e mídia', regex: /\bradio\b|televisao|\btv\b|emissora|comunicacao|comunicacoes|jornal|editora|\bmidia\b|\bfm\b|globo|record|\bsbt\b/ },
  { segmento: 'Bancos, cartões e capitalização', regex: /banco\b|\bbank\b|sicoob|sicredi|cresol|unicred|cooperativa de credito|credito|capitalizacao|seguros|seguradora|financeira|consorcio|\bvisa\b|mastercard|pagamento|cartao|cartoes|itau|bradesco|santander|caixa economica|nubank|investimento|previdencia|serasa|mercado financeiro/ },
  { segmento: 'Postos e combustíveis', regex: /\bposto\b|\bpostos\b|combustive|petroleo|ipiranga|raizen|\bvibra\b|lubrificante/ },
  { segmento: 'Farmácias', regex: /farmacia|drogaria|\bdroga\b|\bfarma\b|pague menos|panvel|drogasil|raia|venancio/ },
  { segmento: 'Supermercados e atacarejos', regex: /supermercado|super mercado|hipermercado|atacarejo|atacadista|atacadao|mercantil|mercearia|emporio|acougue|padaria|panificadora|hortifruti|\bmercado\b(?! (livre|pago|financeiro))|assai|carrefour|sendas|savegnago|\bsuper(?!intend)/ },
  { segmento: 'Beleza e cosméticos', regex: /cosmetic|perfumaria|boticario|natura\b|eudora|\bavon\b|beleza|wepink|savi\b|wella|loreal|l oreal|\bcoty\b/ },
  { segmento: 'Automotivo', regex: /veiculos|automoveis|automotiv|\bmotos\b|honda|yamaha|toyota|volkswagen|\bfiat\b|chevrolet|general motors|scania|volvo|\bpneus?\b|renault|hyundai|nissan|\bbyd\b|autopecas|auto pecas|caminhoes|diesel/ },
  { segmento: 'Construção, casa e eletro', regex: /construc|construtora|materiais|tintas|home center|leroy|telhanorte|moveis|eletromoveis|magazine|casas bahia|eletrodomestic|colchoes|decoracao|tramontina|realty|incorporadora|vidros/ },
  { segmento: 'Moda e calçados', regex: /calcados|grendene|\bmoda\b|confeccoes|vestuario|renner|riachuelo|havaianas|arezzo|textil|jeans|otica|joias|relojoaria|hennes|zara/ },
  { segmento: 'Telecom e tecnologia', regex: /telecom|telefonica|\bvivo\b|\bclaro\b|\btim\b|internet|tecnologia|software|fibra|provedor|\bnet\b|eletronicos|informatica|digital|samsung|motorola|xiaomi|\blg\b/ },
  { segmento: 'Energia e saneamento', regex: /eletricidade|energia|saneamento|agua e esgoto|distribuidora de gas|\bgas\b|copel|cemig|enel|equatorial|neoenergia|sabesp/ },
  { segmento: 'Agronegócio', regex: /\bagro|agricola|agricultura|agropecuaria|rural|sementes|fertiliz|veterinari|saude animal|nutricao animal|racoes|maquinas agricolas/ },
  { segmento: 'Indústria de alimentos e bebidas', regex: /alimentos|alimenticio|bebidas|cervejaria|cerveja|frigorifico|laticinio|unilever|nestle|ambev|coca|recofarma|pepsico|campari|seara|\bbrf\b|\bcafe\b|chocolate|biscoito|massas|moinho|sorvete|mondelez|bauducco|ferrero|heineken/ },
  { segmento: 'Outras indústrias e marcas', regex: /industria|industrial|fabrica|procter|gamble|brands|bens de consumo|farmaceutic|laboratorio|isdin|kimberly|colgate|reckitt|johnson|braskem|importacao|importadora/ },
  { segmento: 'Turismo e lazer', regex: /turismo|viagens|\bhotel|resort|cinema|parque aquatico|entretenimento/ },
  { segmento: 'Educação', regex: /universidade|faculdade|\bescola\b|colegio|ensino|educacional|educacao|idiomas|\bccaa\b|wizard/ },
  { segmento: 'Clubes e esporte', regex: /\bclube\b|regatas|futebol|esporte clube|sport club|\bfc\b|flamengo|corinthians|palmeiras|athletico|atletico|gremio|vasco|\bsaf\b|academia|skyfit/ },
  { segmento: 'Igrejas e entidades', regex: /paroquia|mitra|diocese|arquidiocese|igreja|santuario|apae|santa casa|\bhospital\b|beneficente|assistencial|fundacao|\bong\b|lions|rotary|associacao (de pais|cultural)/ },
  { segmento: 'Varejo e comércio em geral', regex: /comercio|comercial|\blojas?\b|varejo|varejista|atacado|distribuidora|distribuicao|franchising|franquia|quiosque|\brede\b/ },
  { segmento: 'Agências de marketing e promoção', regex: /propaganda|publicidade|marketing|promocao|promocoes|\bpromo|agencia|engajamento|incentivo|eventos|fidelidade|fidelizacao|entertainment|intermediacao|lecupon|consultoria/ }
];

// Pistas no nome da promoção, usadas só quando o nome da empresa não diz nada
const PISTAS_PROMOCAO = [
  { segmento: 'Shoppings', regex: /shopping|\bmall\b|outlet/ },
  { segmento: 'CDLs e associações comerciais', regex: /\bcdl\b|\baci[a-z]{0,3}\b|comercio local|compre no comercio/ },
  { segmento: 'Igrejas e entidades', regex: /acao entre amigos|quermesse|paroquia|festa (do|da|de) (padroeir|sao|santo|santa|nossa senhora)/ },
  { segmento: 'Supermercados e atacarejos', regex: /supermercado|atacarejo/ },
  { segmento: 'Postos e combustíveis', regex: /\bposto\b|\bpostos\b/ },
  { segmento: 'Farmácias', regex: /farmacia|drogaria/ }
];

const SEGMENTO_OUTROS = 'Outros';
const NOMES_SEGMENTOS = [...SEGMENTOS.map(s => s.segmento), SEGMENTO_OUTROS];

function segmentoDe(promocao) {
  const mandatario = promocao.mandatario || {};
  const empresa = normalizarTexto(`${mandatario.nomeFantasia || ''} ${mandatario.razaoSocial || ''}`);
  const encontrado = SEGMENTOS.find(({ regex }) => regex.test(empresa));
  if (encontrado) return encontrado.segmento;

  const nome = normalizarTexto(promocao.nome);
  const pista = PISTAS_PROMOCAO.find(({ regex }) => regex.test(nome));
  return pista ? pista.segmento : SEGMENTO_OUTROS;
}

function validarSegmento(valor) {
  return NOMES_SEGMENTOS.includes(valor) ? valor : '';
}

app.get('/api/segmentos', (req, res) => {
  res.json({ segmentos: NOMES_SEGMENTOS });
});

// ===== Relatórios =====

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

// Classificação dos prêmios por palavras da descrição, na ordem em que são testadas
// (moto vem antes de carro porque a descrição de motos costuma citar "veículo")
const TIPOS_PREMIO = [
  { tipo: 'Imóveis', regex: /\b(apartamento|imovel|imoveis|casa propria|casa mobiliada|terreno)\b/ },
  { tipo: 'Motos', regex: /\b(moto|motos|motocicleta|motoneta|scooter)\b/ },
  { tipo: 'Carros', regex: /\b(automovel|automoveis|carro|carros|veiculo|veiculos|caminhonete|picape|pick-?up|suv)\b|\b0 ?km\b/ },
  { tipo: 'Viagens', regex: /\b(viagem|viagens|cruzeiro|passagens?|pacote turistico|hospedagem|resort)\b/ },
  { tipo: 'Eletrônicos', regex: /\b(celular|smartphone|iphone|galaxy|notebook|tablet|ipad|kindle|smart ?tv|tv|televisor|videogame|playstation|xbox|nintendo|fone|airpods|smartwatch|alexa|echo dot|camera)\b/ },
  { tipo: 'Eletrodomésticos', regex: /\b(geladeira|refrigerador|fogao|lavadora|maquina de lavar|micro-?ondas|air ?fryer|fritadeira|cafeteira|liquidificador|aspirador|ar[- ]condicionado|climatizador|churrasqueira eletrica|secador|batedeira)\b/ },
  { tipo: 'Vales, cartões e créditos', regex: /\b(vales?[- ]?compras?|vale[- ]?presente|gift ?card|cartao|cartoes|credito|creditos|pix|dinheiro|voucher|pontos|cashback|dotz|combustivel)\b/ },
  { tipo: 'Ingressos e experiências', regex: /\b(ingresso|ingressos|convite|convites|show|camarote|experiencia|jantar|almoco)\b/ }
];
const TIPO_OUTROS = 'Produtos e brindes';

const FAIXAS_VALOR = [
  { faixa: 'Até R$ 10 mil', max: 10000 },
  { faixa: 'R$ 10 mil a 50 mil', max: 50000 },
  { faixa: 'R$ 50 mil a 100 mil', max: 100000 },
  { faixa: 'R$ 100 mil a 500 mil', max: 500000 },
  { faixa: 'R$ 500 mil a 1 milhão', max: 1000000 },
  { faixa: 'Acima de R$ 1 milhão', max: Infinity }
];

function normalizarTexto(texto) {
  return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function tipoDoPremio(descricao) {
  const texto = normalizarTexto(descricao);
  const encontrado = TIPOS_PREMIO.find(({ regex }) => regex.test(texto));
  return encontrado ? encontrado.tipo : TIPO_OUTROS;
}

// Mês (0-11) no fuso de Brasília
function mesDe(data) {
  const mes = new Date(data).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', month: 'numeric' });
  return Number(mes) - 1;
}

function ufsDaAbrangencia(abrangencia) {
  const texto = String(abrangencia || '').toUpperCase();
  if (texto.trim() === 'BR') return UFS;
  return texto.split(',').map(uf => uf.trim()).filter(uf => UFS.includes(uf));
}

function topN(mapa, ordenarPor, n) {
  return [...mapa.values()].sort((a, b) => b[ordenarPor] - a[ordenarPor]).slice(0, n);
}

function calcularRelatorio(promocoes, ano) {
  const agora = Date.now();
  const porMes = Array.from({ length: 12 }, (_, mes) => ({ mes, total: 0, valor: 0 }));
  const porModalidade = new Map();
  const porSituacao = new Map();
  const porUF = new Map(UFS.map(uf => [uf, { uf, total: 0, regionais: 0 }]));
  const empresas = new Map();
  const tipos = new Map();
  const faixas = FAIXAS_VALOR.map(f => ({ faixa: f.faixa, total: 0 }));
  const valores = [];

  let valorTotal = 0;
  let quantidadePremios = 0;
  let emAndamento = 0;
  let nacionais = 0;

  for (const promocao of promocoes) {
    const valor = Number(promocao.valorTotal) || 0;
    valorTotal += valor;
    valores.push(valor);
    quantidadePremios += Number(promocao.quantidadePremios) || 0;

    const inicio = new Date(promocao.dataInicio).getTime();
    const fim = new Date(promocao.dataFim).getTime();
    if (inicio <= agora && agora <= fim) emAndamento++;

    if (promocao.dataInicio && anoDe(promocao.dataInicio) === ano) {
      const mes = porMes[mesDe(promocao.dataInicio)];
      mes.total++;
      mes.valor += valor;
    }

    const modalidade = String(promocao.modalidade || 'Não informada').replace(/^Assemelhada/, 'Assemelhado');
    const m = porModalidade.get(modalidade) || { modalidade, total: 0, valor: 0 };
    m.total++;
    m.valor += valor;
    porModalidade.set(modalidade, m);

    const situacao = promocao.situacao || 'NAO_INFORMADA';
    porSituacao.set(situacao, (porSituacao.get(situacao) || 0) + 1);

    const ufs = ufsDaAbrangencia(promocao.abrangencia);
    const nacional = ufs.length === UFS.length;
    if (nacional) nacionais++;
    ufs.forEach(uf => {
      const item = porUF.get(uf);
      item.total++;
      if (!nacional) item.regionais++;
    });

    const mandatario = promocao.mandatario || {};
    const chave = mandatario.cnpj || mandatario.nomeFantasia || mandatario.razaoSocial;
    if (chave) {
      const empresa = empresas.get(chave) || {
        cnpj: mandatario.cnpj,
        nome: mandatario.nomeFantasia || mandatario.razaoSocial,
        total: 0,
        valor: 0
      };
      empresa.total++;
      empresa.valor += valor;
      empresas.set(chave, empresa);
    }

    const faixa = FAIXAS_VALOR.findIndex(f => valor <= f.max);
    faixas[faixa].total++;

    // Cada promoção conta uma vez por tipo de prêmio que oferece
    const tiposDaPromocao = new Map();
    (promocao.apuracoes || []).forEach(apuracao => {
      (apuracao.premios || []).forEach(premio => {
        const tipo = tipoDoPremio(premio.descricao);
        tiposDaPromocao.set(tipo, (tiposDaPromocao.get(tipo) || 0) + (Number(premio.valor_total) || 0));
      });
    });
    tiposDaPromocao.forEach((valorTipo, tipo) => {
      const t = tipos.get(tipo) || { tipo, promocoes: 0, valor: 0 };
      t.promocoes++;
      t.valor += valorTipo;
      tipos.set(tipo, t);
    });
  }

  valores.sort((a, b) => a - b);
  const meio = Math.floor(valores.length / 2);
  const mediana = valores.length === 0 ? 0
    : valores.length % 2 ? valores[meio] : (valores[meio - 1] + valores[meio]) / 2;

  const maiores = promocoes
    .slice()
    .sort((a, b) => (Number(b.valorTotal) || 0) - (Number(a.valorTotal) || 0))
    .slice(0, 10)
    .map(p => ({
      numeroPromocao: p.numeroPromocao,
      nome: p.nome,
      numeroCA: p.numeroCA,
      empresa: p.mandatario && (p.mandatario.nomeFantasia || p.mandatario.razaoSocial),
      modalidade: p.modalidade,
      valor: Number(p.valorTotal) || 0
    }));

  return {
    ano,
    total: promocoes.length,
    valorTotal,
    quantidadePremios,
    emAndamento,
    empresas: empresas.size,
    mediana,
    nacionais,
    porMes,
    porModalidade: [...porModalidade.values()].sort((a, b) => b.total - a.total),
    porSituacao: [...porSituacao.entries()].map(([situacao, total]) => ({ situacao, total })).sort((a, b) => b.total - a.total),
    porUF: [...porUF.values()].sort((a, b) => b.regionais - a.regionais),
    tiposPremio: [...tipos.values()].sort((a, b) => b.promocoes - a.promocoes),
    faixasValor: faixas,
    maioresPromocoes: maiores,
    topEmpresas: topN(empresas, 'total', 10),
    topEmpresasValor: topN(empresas, 'valor', 10)
  };
}

app.get('/api/relatorios', async (req, res) => {
  const ano = validarAno(req.query.ano);
  if (!ano) {
    return res.status(400).json({
      error: 'Parâmetro ano inválido',
      message: `Informe um ano entre ${PRIMEIRO_ANO} e ${anoAtual() + 1}.`
    });
  }

  const uf = UFS.includes(req.query.uf) ? req.query.uf : '';
  const segmento = validarSegmento(req.query.segmento);
  const resumo = req.query.resumo === '1';
  const chave = `${ano}|${uf}|${segmento}`;

  try {
    let entrada = relatoriosCache.get(chave);
    if (!entrada || Date.now() - entrada.timestamp > RELATORIOS_CACHE_DURATION) {
      const { promocoes, fonte } = await buscarAno(ano, { uf });

      // A divisão por segmento usa todas as promoções do recorte, para o
      // gráfico continuar mostrando os demais segmentos quando um é escolhido
      const porSegmento = new Map(NOMES_SEGMENTOS.map(nome => [nome, { segmento: nome, total: 0, valor: 0 }]));
      const doSegmento = [];
      promocoes.forEach(promocao => {
        const nome = segmentoDe(promocao);
        const item = porSegmento.get(nome);
        item.total++;
        item.valor += Number(promocao.valorTotal) || 0;
        if (!segmento || nome === segmento) doSegmento.push(promocao);
      });

      const relatorio = {
        ...calcularRelatorio(doSegmento, ano),
        uf,
        segmento,
        fonte,
        totalRecorte: promocoes.length,
        porSegmento: [...porSegmento.values()]
          .filter(s => s.total > 0)
          .sort((a, b) => (a.segmento === SEGMENTO_OUTROS) - (b.segmento === SEGMENTO_OUTROS) || b.total - a.total)
      };
      entrada = { relatorio, timestamp: Date.now() };

      if (relatoriosCache.size >= RELATORIOS_CACHE_MAX_ENTRIES) {
        relatoriosCache.delete(relatoriosCache.keys().next().value);
      }
      relatoriosCache.set(chave, entrada);
    }

    const { relatorio } = entrada;
    if (resumo) {
      // Versão curta usada no histórico anual
      return res.json({ ano, uf, segmento, total: relatorio.total, valorTotal: relatorio.valorTotal, fonte: relatorio.fonte });
    }
    res.json({ ...relatorio, timestamp: new Date(entrada.timestamp).toISOString() });
  } catch (error) {
    responderErro(res, error);
  }
});

// Rota para obter estatísticas do cache
app.get('/api/cache/stats', (req, res) => {
  res.json({
    cacheSize: cache.size,
    cacheKeys: Array.from(cache.keys()),
    timestamp: new Date().toISOString()
  });
});

// Rota para limpar cache
app.delete('/api/cache', (req, res) => {
  cache.clear();
  relatoriosCache.clear();
  res.json({ message: 'Cache limpo com sucesso' });
});

// Rota de health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cache: {
      size: cache.size
    }
  });
});

// Middleware de tratamento de erros
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'production' ? 'Algo deu errado' : err.message
  });
});

// Middleware para rotas não encontradas
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Rota não encontrada',
    message: 'A rota solicitada não existe'
  });
});

// Iniciar servidor
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`📱 Acesse: http://localhost:${PORT}`);
    console.log(`🔗 API: http://localhost:${PORT}/api/promocoes`);
    console.log(`💊 Health: http://localhost:${PORT}/api/health`);
  });
}

// Exportar para Vercel
module.exports = app;

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM recebido, encerrando servidor...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT recebido, encerrando servidor...');
  process.exit(0);
});
