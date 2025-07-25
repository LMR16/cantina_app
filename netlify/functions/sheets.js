// Importa a biblioteca oficial do Google
const { google } = require('googleapis');

// O ID da sua planilha. Pode encontrá-lo na URL da sua planilha Google.
// Ex: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
const SPREADSHEET_ID = '1fjxn9_C9n3TRaV9NmNdtbVlMOX__kZO_FDxLKQLN45g';

// As credenciais da sua conta de serviço.
// Estas serão guardadas de forma segura nas variáveis de ambiente do Netlify.
const credentials = {
  client_email: process.env.GOOGLE_CLIENT_EMAIL,
  private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Corrige a formatação da chave privada
};

// Função principal que o Netlify irá executar
exports.handler = async (event) => {
  try {
    // Configura o cliente de autenticação
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // Pega o nome da aba a partir dos parâmetros da URL (ex: ?sheet=produtos)
    const sheetName = event.queryStringParameters.sheet;
    if (!sheetName) {
      throw new Error("Parâmetro 'sheet' é obrigatório.");
    }

    // Lê os dados da planilha
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: sheetName, // Lê a aba inteira
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify([]),
      };
    }

    // Converte as linhas para objetos JSON, tal como o seu código original fazia
    const headers = rows.shift();
    const json = rows.map(row => {
      let obj = {};
      headers.forEach((header, i) => {
        if (header) {
          obj[header] = row[i];
        }
      });
      return obj;
    });

    // Retorna os dados com sucesso
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(json),
    };
  } catch (error) {
    console.error('Erro ao aceder à planilha:', error);
    // Retorna uma mensagem de erro clara
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Falha ao aceder aos dados da planilha.', message: error.message }),
    };
  }
};
