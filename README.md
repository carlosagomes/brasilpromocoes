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
- **Banco de Dados**: MySQL
- **Estilização**: CSS moderno com animações
- **Deploy**: Docker

## ⚙️ Configuração

### 1. Instalar Dependências
```bash
npm install
```

### 2. Configurar Variáveis de Ambiente
```bash
# Copiar arquivo de exemplo
cp .env.example .env

# Editar o arquivo .env com suas credenciais
nano .env
```

### 3. Variáveis de Ambiente Obrigatórias
```env
# Configurações do Banco de Dados MySQL
DB_HOST=seu_host_mysql
DB_PORT=3306
DB_DATABASE=nome_do_banco
DB_USER=usuario_mysql
DB_PASSWORD=senha_mysql

# Configurações da Aplicação
PORT=3000
NODE_ENV=development
```

### 4. Executar a Aplicação
```bash
# Desenvolvimento
npm start

# Produção
npm run start:prod
```

## 🐳 Deploy com Docker

### 1. Construir e executar com Docker Compose
```bash
# Construir e executar
docker-compose up --build -d

# Parar os containers
docker-compose down
```

### 2. Acessar a aplicação
- **URL**: http://localhost:3000
- **API Health**: http://localhost:3000/api/health

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
├── .env               # Variáveis de ambiente (não commitado)
├── .env.example       # Template de variáveis de ambiente
├── .dockerignore      # Arquivos ignorados no Docker
├── .gitignore         # Arquivos ignorados no Git
├── config.js          # Configurações do banco de dados
├── database.js        # Lógica de acesso ao banco MySQL
├── docker-compose.yml # Configuração Docker Compose
├── Dockerfile         # Imagem Docker
├── index.html         # Página principal
├── package.json       # Dependências Node.js
├── package-lock.json  # Lock das dependências
├── README.md          # Este arquivo
├── script.js          # Lógica frontend JavaScript
├── server.js          # Servidor Express
└── styles.css         # Estilos CSS
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