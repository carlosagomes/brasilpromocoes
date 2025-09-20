# Brasil Promoções

Site moderno para busca de promoções comerciais autorizadas no Brasil, baseado na API do SCPC (Sistema de Controle de Promoções Comerciais).

## 🚀 Funcionalidades

- **Busca Inteligente**: Filtros por ano, UF, modalidade, nome da promoção e mandatário
- **Interface Moderna**: Design responsivo e intuitivo
- **Dados Oficiais**: Integração direta com a API do SCPC
- **Filtros Avançados**: Busca por data de início, data de fim e situação da promoção
- **Cards Simplificados**: Visualização clara das informações principais
- **Modal de Detalhes**: Informações completas ao clicar em uma promoção

## 🛠️ Tecnologias

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Node.js, Express.js
- **API**: Integração com SCPC API
- **Estilização**: CSS moderno com animações
- **Deploy**: Vercel

## 🚀 Deploy no Vercel

### Opção 1: Deploy via Vercel CLI

1. **Instale o Vercel CLI**
   ```bash
   npm i -g vercel
   ```

2. **Faça login**
   ```bash
   vercel login
   ```

3. **Deploy**
   ```bash
   vercel
   ```

4. **Deploy de produção**
   ```bash
   vercel --prod
   ```

### Opção 2: Deploy via GitHub

1. **Conecte seu repositório ao Vercel**
2. **Configure as variáveis de ambiente** (se necessário)
3. **Deploy automático** a cada push

## 📱 Como Usar

### Busca Básica
1. Selecione o ano da promoção
2. Clique em "Buscar Promoções"

### Filtros Avançados
1. **Filtros de Data**:
   - Data de início: Promoções que começam a partir desta data
   - Data de fim: Promoções que terminam até esta data
   - Período rápido: Opções pré-definidas (Hoje, Este Mês, etc.)

2. **Filtros de Conteúdo**:
   - Nome da promoção: Busca por texto no nome
   - Mandatário: Nome do responsável pela promoção
   - Modalidade: Tipo de promoção (Sorteio, Concurso, etc.)
   - UF: Estado de abrangência
   - Situação: Status da promoção (AUTORIZADA, etc.)

### Visualização
- **Cards**: Informações principais em formato de cartão
- **Modal**: Clique em qualquer card para ver detalhes completos
- **Responsivo**: Funciona em desktop, tablet e mobile

## 🏗️ Estrutura do Projeto

```
brasil-promocoes/
├── server.js          # Servidor Express
├── index.html         # Página principal
├── styles.css         # Estilos CSS
├── script.js          # Lógica frontend
├── package.json       # Dependências Node.js
├── vercel.json        # Configuração Vercel
├── .gitignore         # Arquivos ignorados
└── README.md          # Este arquivo
```

## 🔌 API Endpoints

### GET /api/promocoes
Busca promoções com filtros opcionais.

**Parâmetros de Query:**
- `anoPromocao` (obrigatório): Ano da promoção
- `uf`: Unidade federativa
- `nomePromocao`: Nome ou trecho da promoção
- `nomeMandatario`: Nome do mandatário
- `modalidade`: Tipo de promoção
- `dataInicio`: Data de início (YYYY-MM-DD)
- `dataFim`: Data de fim (YYYY-MM-DD)
- `situacao`: Situação da promoção

**Exemplo:**
```
GET /api/promocoes?anoPromocao=2025&nomePromocao=Natal&dataInicio=2025-09-01
```

### GET /api/health
Verifica status da API.

## 🚀 Desenvolvimento Local

1. **Clone o repositório**
   ```bash
   git clone <url-do-repositorio>
   cd brasil-promocoes
   ```

2. **Instale as dependências**
   ```bash
   npm install
   ```

3. **Execute o projeto**
   ```bash
   npm start
   ```

4. **Acesse no navegador**
   ```
   http://localhost:3000
   ```

## 📄 Licença

Este projeto está sob a licença MIT.

---

**Desenvolvido com ❤️ para facilitar a busca de promoções comerciais no Brasil**