// Arquivo: netlify/functions/googleScriptProxy.js (Versão Corrigida)

const https = require("https");

// URL do seu script do Google. Mantenha em um só lugar para fácil manutenção.
const GOOGLE_SCRIPT_URL = new URL("https://script.google.com/macros/s/AKfycbwAqhngS9Zauy_ffzEDgojv5ef9-Z19TAWaHH4qY7hyea1imjVjOxCSs2yaF6IPh9sW/exec");

exports.handler = async function (event, context) {
  
  // 1. Lida com a requisição preflight (CORS), que é sempre OPTIONS.
  // Seu código para isso já estava correto.
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204, // 204 No Content é o padrão para preflights bem-sucedidos
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: "",
    };
  }

  // 2. Prepara a requisição para o Google Script
  const options = {
    hostname: GOOGLE_SCRIPT_URL.hostname,
    path: GOOGLE_SCRIPT_URL.pathname, // Começa com o caminho base do script
    method: event.httpMethod, // Usa o método original (GET ou POST)
    headers: {
      "Content-Type": "application/json",
    },
  };

  // 3. Se a requisição original for GET, anexa os parâmetros da URL
  // Ex: Transforma ?sheet=produtos em /.../exec?sheet=produtos
  if (event.httpMethod === "GET" && event.queryStringParameters) {
    const params = new URLSearchParams(event.queryStringParameters);
    options.path += `?${params.toString()}`;
  }

  // 4. Cria a requisição e retorna uma Promise
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*", // Garante CORS na resposta final
          },
          body: body,
        });
      });
    });

    req.on("error", (e) => {
      console.error("Proxy Error:", e);
      resolve({
        statusCode: 500,
        body: JSON.stringify({ error: `Proxy request failed: ${e.message}` }),
      });
    });

    // Se for POST, escreve o corpo da requisição original no request para o Google
    if (event.httpMethod === "POST" && event.body) {
      req.write(event.body);
    }

    req.end();
  });
};
