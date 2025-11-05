export default {
  async fetch(request, env) {
    // 设置 CORS 头
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // 处理预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // 处理模型列表请求
    if ((path === '/models' || path === '/v1/models') && request.method === 'GET') {
      const modelsResponse = {
        object: "list",
        data: [
          {
            id: "gemini-1.5-flash",
            object: "model",
            created: 1677610602,
            owned_by: "google"
          },
          {
            id: "gemini-1.5-pro",
            object: "model",
            created: 1677610602,
            owned_by: "google"
          },
          {
            id: "gemini-1.0-pro",
            object: "model",
            created: 1677610602,
            owned_by: "google"
          }
        ]
      };
      
      return new Response(JSON.stringify(modelsResponse), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 处理聊天请求
    if ((path === '/chat/completions' || path === '/v1/chat/completions') && request.method === 'POST') {
      try {
        // 检查环境变量
        if (!env.GEMINI_API_KEY) {
          return new Response(JSON.stringify({ 
            error: 'API key not configured in environment variables'
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const requestData = await request.json();
        const { messages } = requestData;
        
        if (!messages || !Array.isArray(messages)) {
          return new Response(JSON.stringify({ error: 'No messages provided' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // 构建提示
        const prompt = messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');

        // 尝试不同的模型和 API 版本
        const endpoints = [
          // 最新的模型
          `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
          `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent?key=${env.GEMINI_API_KEY}`,
          // 传统模型
          `https://generativelanguage.googleapis.com/v1/models/gemini-1.0-pro:generateContent?key=${env.GEMINI_API_KEY}`,
          // 旧版 API
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${env.GEMINI_API_KEY}`,
        ];

        let geminiResponse;
        let lastError;
        let successfulEndpoint;

        for (const endpoint of endpoints) {
          try {
            console.log('尝试端点:', endpoint);
            geminiResponse = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                  temperature: 0.7,
                  maxOutputTokens: 2048,
                }
              })
            });
            
            if (geminiResponse.ok) {
              successfulEndpoint = endpoint;
              break;
            } else {
              const errorText = await geminiResponse.text();
              lastError = { endpoint, status: geminiResponse.status, error: errorText };
              console.log(`端点失败 ${endpoint}:`, geminiResponse.status);
            }
          } catch (error) {
            lastError = { endpoint, error: error.message };
            console.log(`端点错误 ${endpoint}:`, error.message);
          }
        }

        if (!geminiResponse || !geminiResponse.ok) {
          console.error('所有端点都失败了:', lastError);
          return new Response(JSON.stringify({ 
            error: 'All Gemini API endpoints failed',
            details: lastError
          }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const geminiData = await geminiResponse.json();
        
        if (!geminiData.candidates || !geminiData.candidates[0]) {
          return new Response(JSON.stringify({ error: 'No response from Gemini' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const text = geminiData.candidates[0].content.parts[0].text;
        
        // 从成功的端点提取模型名称
        const modelName = successfulEndpoint.includes('gemini-1.5-flash') ? 'gemini-1.5-flash' :
                         successfulEndpoint.includes('gemini-1.5-pro') ? 'gemini-1.5-pro' :
                         successfulEndpoint.includes('gemini-1.0-pro') ? 'gemini-1.0-pro' : 'gemini-pro';

        // 转换为 OpenAI 格式
        const openAIResponse = {
          id: 'chatcmpl-' + Date.now(),
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: modelName,
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: text
            },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0
          }
        };

        console.log(`成功使用端点: ${successfulEndpoint}`);
        return new Response(JSON.stringify(openAIResponse), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (error) {
        console.error('处理请求时出错:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // 处理根路径
    if (path === '/' && request.method === 'GET') {
      return new Response(JSON.stringify({ 
        status: 'Gemini Proxy is running',
        endpoints: ['GET /v1/models', 'POST /v1/chat/completions']
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Endpoint not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};
