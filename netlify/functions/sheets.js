const { google } = require('googleapis');

// As credenciais e o ID da planilha são lidos das variáveis de ambiente do Netlify
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const credentials = {
  client_email: process.env.GOOGLE_CLIENT_EMAIL,
  private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
};

// Helper para inicializar a autenticação
function getAuth() {
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

// =============================================
// FUNÇÕES DE MANIPULAÇÃO DA PLANILHA
// =============================================

async function getSheetData(sheets, range) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: range,
  });
  return response.data.values || [];
}

async function appendRow(sheets, range, values) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: range,
    valueInputOption: 'USER_ENTERED',
    resource: { values: [values] },
  });
}

async function updateRow(sheets, range, values) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: range,
    valueInputOption: 'USER_ENTERED',
    resource: { values: [values] },
  });
}

async function findRowById(sheets, sheetName, id, idColumnIndex = 0) {
    const rows = await getSheetData(sheets, sheetName);
    const headers = rows.shift();
    for (let i = 0; i < rows.length; i++) {
        if (rows[i][idColumnIndex] === id) {
            return { rowIndex: i + 2, headers, rowData: rows[i] };
        }
    }
    return { rowIndex: -1, headers: null, rowData: null };
}

async function deleteRow(sheets, sheetId, rowIndex) {
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: {
            requests: [{
                deleteDimension: {
                    range: {
                        sheetId: sheetId,
                        dimension: 'ROWS',
                        startIndex: rowIndex - 1,
                        endIndex: rowIndex,
                    },
                },
            }],
        },
    });
}

// =============================================
// FUNÇÃO PRINCIPAL (HANDLER)
// =============================================

exports.handler = async (event) => {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  // Lógica para requisições GET (Leitura)
  if (event.httpMethod === 'GET') {
    try {
      const sheetName = event.queryStringParameters.sheet;
      if (!sheetName) throw new Error("Parâmetro 'sheet' é obrigatório.");

      const rows = await getSheetData(sheets, sheetName);
      if (rows.length === 0) {
        return { statusCode: 200, body: JSON.stringify([]) };
      }

      const headers = rows.shift();
      const json = rows.map(row => headers.reduce((obj, header, i) => {
        obj[header] = row[i];
        return obj;
      }, {}));

      return { statusCode: 200, body: JSON.stringify(json) };
    } catch (error) {
      console.error('Erro em GET:', error);
      return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
  }

  // Lógica para requisições POST (Escrita)
  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body);
      const { action, payload } = body;

      switch (action) {
        case 'saveSale': {
          const { novaVenda, itensCarrinho } = payload;
          const vendasHeaders = (await getSheetData(sheets, 'vendas!1:1'))[0];
          const itensHeaders = (await getSheetData(sheets, 'itens_venda!1:1'))[0];
          
          const vendaRow = vendasHeaders.map(h => novaVenda[h] || '');
          await appendRow(sheets, 'vendas', vendaRow);

          for (const item of itensCarrinho) {
              const itemRow = itensHeaders.map(h => item[h] || '');
              await appendRow(sheets, 'itens_venda', itemRow);
          }
          return { statusCode: 200, body: JSON.stringify({ message: 'Venda salva com sucesso.' }) };
        }

        case 'createProduct': {
          const productHeaders = (await getSheetData(sheets, 'produtos!1:1'))[0];
          const productRow = productHeaders.map(h => payload[h] || '');
          await appendRow(sheets, 'produtos', productRow);
          return { statusCode: 200, body: JSON.stringify({ message: 'Produto criado com sucesso.' }) };
        }

        case 'updateProduct': {
          const { rowIndex, headers } = await findRowById(sheets, 'produtos', payload.Produto_ID);
          if (rowIndex === -1) throw new Error('Produto não encontrado.');
          const productRow = headers.map(h => payload[h] || '');
          await updateRow(sheets, `produtos!A${rowIndex}`, productRow);
          return { statusCode: 200, body: JSON.stringify({ message: 'Produto atualizado com sucesso.' }) };
        }
        
        // NOVA LÓGICA DE APAGAR PRODUTO
        case 'handleDeleteProduct': {
            const { productId, productSheetGid } = payload;
            
            // 1. Verificar se o produto existe em 'itens_venda'
            const itensVendaData = await getSheetData(sheets, 'itens_venda');
            const itensHeaders = itensVendaData.shift();
            const produtoRefIndex = itensHeaders.indexOf('Produto_Ref');
            const isProductSold = itensVendaData.some(row => row[produtoRefIndex] === productId);

            // 2. Encontrar o produto na aba 'produtos'
            const { rowIndex, headers, rowData } = await findRowById(sheets, 'produtos', productId);
            if (rowIndex === -1) throw new Error('Produto não encontrado para apagar.');

            if (isProductSold) {
                // 3a. Se já foi vendido, INATIVAR
                const statusIndex = headers.indexOf('Status');
                if (statusIndex === -1) throw new Error("Coluna 'Status' não encontrada na aba de produtos.");
                
                let updatedProductData = [...rowData];
                updatedProductData[statusIndex] = 'Inativo';
                
                await updateRow(sheets, `produtos!A${rowIndex}`, updatedProductData);
                return { statusCode: 200, body: JSON.stringify({ message: 'Produto inativado pois possui histórico de vendas.' }) };
            } else {
                // 3b. Se nunca foi vendido, APAGAR
                await deleteRow(sheets, productSheetGid, rowIndex);
                return { statusCode: 200, body: JSON.stringify({ message: 'Produto excluído permanentemente.' }) };
            }
        }

        default:
          throw new Error('Ação desconhecida.');
      }
    } catch (error) {
      console.error('Erro em POST:', error);
      return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
  }

  return { statusCode: 405, body: JSON.stringify({ error: 'Método não permitido.' }) };
};
