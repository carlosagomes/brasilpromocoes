const mysql = require('mysql2/promise');
const { dbConfig } = require('./config');

// Pool de conexões para melhor performance
const pool = mysql.createPool(dbConfig);

// Função para testar a conexão
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Conexão com banco de dados estabelecida com sucesso');
    connection.release();
    return true;
  } catch (error) {
    console.error('❌ Erro ao conectar com banco de dados:', error.message);
    return false;
  }
}

// Função para buscar campanhas com filtros e paginação
async function buscarCampanhas(filtros = {}) {
  try {
    let query = `
      SELECT 
        c.CampanhaId,
        c.NumeroPromocao,
        c.Nome,
        c.Modalidade,
        c.NumeroCertificadoAutorizacao,
        c.CodigoAutenticidade,
        c.DataInicio,
        c.DataFim,
        c.QuantidadePremios,
        c.ValorTotal,
        c.QuantidadeSeries,
        c.AbrangenciaNacional,
        c.AbrangenciaEstados,
        c.SituacaoAtual,
        c.SituacaoAtualDataHora,
        c.RegulamentoNomeArquivoAtual,
        c.RegulamentoAtualDataHora,
        c.RegulamentoAtualTamanho,
        m.MandatarioId,
        m.Cnpj,
        m.NomeFantasia,
        m.RazaoSocial,
        m.Endereco,
        m.Numero,
        m.Complemento,
        m.Bairro,
        m.Cidade,
        m.Estado,
        m.Cep
      FROM Campanha c
      LEFT JOIN Mandatario m ON c.MandatarioId = m.MandatarioId
      WHERE 1=1
    `;
    
    const params = [];
    
    // Aplicar filtros
    if (filtros.anoPromocao) {
      query += ` AND YEAR(c.DataInicio) = ?`;
      params.push(filtros.anoPromocao);
    }
    
    if (filtros.uf) {
      query += ` AND m.Estado = ?`;
      params.push(filtros.uf);
    }
    
    if (filtros.cnpjMandatario) {
      query += ` AND m.Cnpj = ?`;
      params.push(filtros.cnpjMandatario);
    }
    
    if (filtros.nomeMandatario) {
      query += ` AND (m.NomeFantasia LIKE ? OR m.RazaoSocial LIKE ?)`;
      const nomeLike = `%${filtros.nomeMandatario}%`;
      params.push(nomeLike, nomeLike);
    }
    
    if (filtros.modalidade) {
      query += ` AND c.Modalidade = ?`;
      params.push(filtros.modalidade);
    }
    
    if (filtros.numeroCertificado) {
      query += ` AND c.NumeroCertificadoAutorizacao = ?`;
      params.push(filtros.numeroCertificado);
    }
    
    if (filtros.nomePromocao) {
      query += ` AND c.Nome LIKE ?`;
      params.push(`%${filtros.nomePromocao}%`);
    }
    
    if (filtros.dataInicio) {
      query += ` AND c.DataInicio >= ?`;
      params.push(filtros.dataInicio);
    }
    
    if (filtros.dataFim) {
      query += ` AND c.DataFim <= ?`;
      params.push(filtros.dataFim);
    }
    
    if (filtros.situacao) {
      query += ` AND c.SituacaoAtual = ?`;
      params.push(filtros.situacao);
    }
    
    query += ` ORDER BY c.DataInicio DESC`;
    
    // Aplicar paginação
    const page = parseInt(filtros.page) || 1;
    const limit = parseInt(filtros.limit) || 100;
    const offset = (page - 1) * limit;
    
    query += ` LIMIT ${limit} OFFSET ${offset}`;
    
    console.log('🔍 SQL Executado:');
    console.log(query);
    console.log('📋 Parâmetros:', params);
    console.log(`📄 Página: ${page}, Limite: ${limit}, Offset: ${offset}`);
    
    const [rows] = await pool.execute(query, params);
    console.log(`📊 Resultados encontrados: ${rows.length}`);
    return rows;
  } catch (error) {
    console.error('Erro ao buscar campanhas:', error);
    throw error;
  }
}

// Função para contar total de campanhas com filtros
async function contarCampanhas(filtros = {}) {
  try {
    let query = `
      SELECT COUNT(*) as total
      FROM Campanha c
      LEFT JOIN Mandatario m ON c.MandatarioId = m.MandatarioId
      WHERE 1=1
    `;
    
    const params = [];
    
    // Aplicar os mesmos filtros da busca principal
    if (filtros.anoPromocao) {
      query += ` AND YEAR(c.DataInicio) = ?`;
      params.push(filtros.anoPromocao);
    }
    
    if (filtros.uf) {
      query += ` AND m.Estado = ?`;
      params.push(filtros.uf);
    }
    
    if (filtros.cnpjMandatario) {
      query += ` AND m.Cnpj = ?`;
      params.push(filtros.cnpjMandatario);
    }
    
    if (filtros.nomeMandatario) {
      query += ` AND (m.NomeFantasia LIKE ? OR m.RazaoSocial LIKE ?)`;
      const nomeLike = `%${filtros.nomeMandatario}%`;
      params.push(nomeLike, nomeLike);
    }
    
    if (filtros.modalidade) {
      query += ` AND c.Modalidade = ?`;
      params.push(filtros.modalidade);
    }
    
    if (filtros.numeroCertificado) {
      query += ` AND c.NumeroCertificadoAutorizacao = ?`;
      params.push(filtros.numeroCertificado);
    }
    
    if (filtros.nomePromocao) {
      query += ` AND c.Nome LIKE ?`;
      params.push(`%${filtros.nomePromocao}%`);
    }
    
    if (filtros.dataInicio) {
      query += ` AND c.DataInicio >= ?`;
      params.push(filtros.dataInicio);
    }
    
    if (filtros.dataFim) {
      query += ` AND c.DataFim <= ?`;
      params.push(filtros.dataFim);
    }
    
    if (filtros.situacao) {
      query += ` AND c.SituacaoAtual = ?`;
      params.push(filtros.situacao);
    }
    
    const [rows] = await pool.execute(query, params);
    return rows[0].total;
  } catch (error) {
    console.error('Erro ao contar campanhas:', error);
    throw error;
  }
}

// Função para buscar apurações de uma campanha
async function buscarApuracoes(campanhaId) {
  try {
    const query = `
      SELECT 
        a.ApuracaoId,
        a.IdApuracao,
        a.LocalApuracao,
        a.InicioApuracao,
        a.FimApuracao,
        a.InicioParticipacao,
        a.FimParticipacao,
        a.Endereco,
        a.Numero,
        a.Complemento,
        a.Bairro,
        a.Cidade,
        a.Estado,
        a.Cep
      FROM Apuracao a
      WHERE a.CampanhaId = ?
      ORDER BY a.IdApuracao
    `;
    
    const [rows] = await pool.execute(query, [campanhaId]);
    return rows;
  } catch (error) {
    console.error('Erro ao buscar apurações:', error);
    throw error;
  }
}

// Função para buscar prêmios de uma apuração
async function buscarPremios(apuracaoId) {
  try {
    const query = `
      SELECT 
        p.PremioId,
        p.Descricao,
        p.Quantidade,
        p.ValorUnitario,
        p.ValorTotal,
        p.Ordem,
        p.DataEntrega
      FROM Premio p
      WHERE p.ApuracaoId = ?
      ORDER BY p.Ordem, p.Descricao
    `;
    
    const [rows] = await pool.execute(query, [apuracaoId]);
    return rows;
  } catch (error) {
    console.error('Erro ao buscar prêmios:', error);
    throw error;
  }
}

// Função para buscar histórico de situações de uma campanha
async function buscarSituacaoHistorico(campanhaId) {
  try {
    const query = `
      SELECT 
        sh.SituacaoHistoricoId,
        sh.Situacao,
        sh.DataHoraCriacao
      FROM SituacaoHistorico sh
      WHERE sh.CampanhaId = ?
      ORDER BY sh.DataHoraCriacao DESC
    `;
    
    const [rows] = await pool.execute(query, [campanhaId]);
    return rows;
  } catch (error) {
    console.error('Erro ao buscar histórico de situações:', error);
    throw error;
  }
}

// Função para buscar histórico de regulamentos de uma campanha
async function buscarRegulamentoHistorico(campanhaId) {
  try {
    const query = `
      SELECT 
        rh.RegulamentoHistoricoId,
        rh.RegulamentoNomeArquivo,
        rh.Tamanho,
        rh.DataHoraCriacao
      FROM RegulamentoHistorico rh
      WHERE rh.CampanhaId = ?
      ORDER BY rh.DataHoraCriacao DESC
    `;
    
    const [rows] = await pool.execute(query, [campanhaId]);
    return rows;
  } catch (error) {
    console.error('Erro ao buscar histórico de regulamentos:', error);
    throw error;
  }
}

// Função principal para buscar promoções completas com paginação
async function buscarPromocoesCompletas(filtros = {}) {
  try {
    console.log('🔍 Filtros recebidos:', filtros);
    
    // Buscar total de registros para paginação
    const totalRegistros = await contarCampanhas(filtros);
    console.log(`📊 Total de registros no banco: ${totalRegistros}`);
    
    // Buscar campanhas com paginação
    const campanhas = await buscarCampanhas(filtros);
    console.log(`📊 Campanhas na página atual: ${campanhas.length}`);
    
    const promocoes = [];
    
    for (let i = 0; i < campanhas.length; i++) {
      const campanha = campanhas[i];
      
      if (i < 5) { // Log apenas das primeiras 5 para debug
        console.log(`🔄 Processando campanha ${i + 1}/${campanhas.length}: ${campanha.NumeroPromocao} - ${campanha.Nome}`);
      }
      
      // Por enquanto, vamos pular as consultas pesadas para melhorar performance
      // TODO: Implementar busca lazy de apurações e prêmios
      const apuracoes = [];
      const situacaoHistorico = [];
      const regulamentoHistorico = [];
      
      // Montar objeto da promoção no formato esperado pelo frontend
      const promocao = {
        numeroPromocao: campanha.NumeroPromocao,
        nome: campanha.Nome,
        modalidade: campanha.Modalidade,
        numeroCA: campanha.NumeroCertificadoAutorizacao,
        codigoAutenticidade: campanha.CodigoAutenticidade,
        situacao: campanha.SituacaoAtual,
        dataInicio: campanha.DataInicio ? campanha.DataInicio.toISOString().split('T')[0] : null,
        dataFim: campanha.DataFim ? campanha.DataFim.toISOString().split('T')[0] : null,
        quantidadePremios: campanha.QuantidadePremios,
        valorTotal: parseFloat(campanha.ValorTotal),
        quantidadeSeries: campanha.QuantidadeSeries,
        abrangencia: campanha.AbrangenciaNacional ? 'Nacional' : campanha.AbrangenciaEstados,
        mandatario: {
          cnpj: campanha.Cnpj,
          nomeFantasia: campanha.NomeFantasia,
          razaoSocial: campanha.RazaoSocial,
          endereco: campanha.Endereco,
          numero: campanha.Numero,
          complemento: campanha.Complemento,
          bairro: campanha.Bairro,
          cidade: campanha.Cidade,
          uf: campanha.Estado,
          cep: campanha.Cep
        },
        apuracoes: apuracoes.map(apuracao => ({
          idApuracao: apuracao.IdApuracao,
          localApuracao: apuracao.LocalApuracao,
          inicioApuracao: apuracao.InicioApuracao ? apuracao.InicioApuracao.toISOString() : null,
          fimApuracao: apuracao.FimApuracao ? apuracao.FimApuracao.toISOString() : null,
          inicioParticipacao: apuracao.InicioParticipacao ? apuracao.InicioParticipacao.toISOString() : null,
          fimParticipacao: apuracao.FimParticipacao ? apuracao.FimParticipacao.toISOString() : null,
          endereco: apuracao.Endereco,
          numero: apuracao.Numero,
          complemento: apuracao.Complemento,
          bairro: apuracao.Bairro,
          cidade: apuracao.Cidade,
          uf: apuracao.Estado,
          cep: apuracao.Cep,
          premios: apuracao.premios.map(premio => ({
            descricao: premio.Descricao,
            quantidade: premio.Quantidade,
            valor_unitario: parseFloat(premio.ValorUnitario),
            valor_total: parseFloat(premio.ValorTotal),
            ordem: premio.Ordem,
            data_entrega: premio.DataEntrega ? premio.DataEntrega.toISOString().split('T')[0] : null
          }))
        })),
        situacaoHistorico: situacaoHistorico.map(sit => ({
          situacao: sit.Situacao,
          dataHora: sit.DataHoraCriacao ? sit.DataHoraCriacao.toISOString() : null
        })),
        regulamentoHistorico: regulamentoHistorico.map(reg => ({
          nomeArquivo: reg.RegulamentoNomeArquivo,
          tamanho: reg.Tamanho,
          dataHora: reg.DataHoraCriacao ? reg.DataHoraCriacao.toISOString() : null
        }))
      };
      
      promocoes.push(promocao);
    }
    
    console.log(`🎉 Total de promoções processadas: ${promocoes.length}`);
    if (promocoes.length > 0) {
      console.log(`📝 Primeira promoção: ${promocoes[0].numeroPromocao} - ${promocoes[0].nome}`);
    }
    
    // Calcular informações de paginação
    const page = parseInt(filtros.page) || 1;
    const limit = parseInt(filtros.limit) || 20;
    const totalPages = Math.ceil(totalRegistros / limit);
    
    return {
      promocoes: promocoes,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalRecords: totalRegistros,
        recordsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    };
  } catch (error) {
    console.error('Erro ao buscar promoções completas:', error);
    throw error;
  }
}

// Função para fechar o pool de conexões
async function closePool() {
  try {
    await pool.end();
    console.log('Pool de conexões fechado');
  } catch (error) {
    console.error('Erro ao fechar pool de conexões:', error);
  }
}

module.exports = {
  testConnection,
  buscarCampanhas,
  contarCampanhas,
  buscarApuracoes,
  buscarPremios,
  buscarSituacaoHistorico,
  buscarRegulamentoHistorico,
  buscarPromocoesCompletas,
  closePool
};
