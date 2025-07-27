const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const credentials = {
  client_email: process.env.GOOGLE_CLIENT_EMAIL,
  private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
};

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

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

async function batchDeleteRows(sheets, requests) {
    if (requests.length === 0) return;
    // As exclusões devem ser ordenadas de forma decrescente para não afetar os índices das linhas seguintes
    requests.sort((a, b) => b.deleteDimension.range.startIndex - a.deleteDimension.range.startIndex);
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: { requests },
    });
}

exports.handler = async (event) => {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  if (event.httpMethod === 'GET') {
    try {
      const sheetName = event.queryStringParameters.sheet;
      if (!sheetName) throw new Error("Parâmetro 'sheet' é obrigatório.");
      const rows = await getSheetData(sheets, sheetName);
      if (rows.length === 0) return { statusCode: 200, body: JSON.stringify([]) };
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

  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body);
      const { action, payload } = body;

      switch (action) {
        case 'saveSale': {
          // ... (código inalterado)
          return { statusCode: 200, body: JSON.stringify({ message: 'Venda salva com sucesso.' }) };
        }
        case 'createProduct': {
          // ... (código inalterado)
          return { statusCode: 200, body: JSON.stringify({ message: 'Produto criado com sucesso.' }) };
        }
        case 'updateProduct': {
          // ... (código inalterado)
          return { statusCode: 200, body: JSON.stringify({ message: 'Produto atualizado com sucesso.' }) };
        }
        case 'updateSale': {
          // ... (código inalterado)
          return { statusCode: 200, body: JSON.stringify({ message: 'Venda atualizada com sucesso.' }) };
        }
        case 'handleDeleteProduct': {
          // ... (código inalterado)
        }
        
        // NOVA AÇÃO PARA APAGAR VENDAS
        case 'deleteSale': {
            const { saleId, salesSheetGid, itemsSheetGid } = payload;
            let deleteRequests = [];

            // 1. Encontrar e marcar para apagar a venda principal
            const { rowIndex: saleRowIndex } = await findRowById(sheets, 'vendas', saleId);
            if (saleRowIndex > -1) {
                deleteRequests.push({
                    deleteDimension: {
                        range: { sheetId: salesSheetGid, dimension: 'ROWS', startIndex: saleRowIndex - 1, endIndex: saleRowIndex }
                    }
                });
            }

            // 2. Encontrar e marcar para apagar todos os itens da venda
            const itemsData = await getSheetData(sheets, 'itens_venda');
            const itemsHeaders = itemsData.shift();
            const vendaRefIndex = itemsHeaders.indexOf('Venda_Ref');
            
            itemsData.forEach((row, index) => {
                if (row[vendaRefIndex] === saleId) {
                    const rowIndexToDelete = index + 2; // +1 para o cabeçalho, +1 porque o índice é base 0
                    deleteRequests.push({
                        deleteDimension: {
                            range: { sheetId: itemsSheetGid, dimension: 'ROWS', startIndex: rowIndexToDelete - 1, endIndex: rowIndexToDelete }
                        }
                    });
                }
            });

            // 3. Executar todas as exclusões de uma vez
            await batchDeleteRows(sheets, deleteRequests);

            return { statusCode: 200, body: JSON.stringify({ message: 'Venda e itens associados foram excluídos.' }) };
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
