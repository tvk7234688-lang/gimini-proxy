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
            id: "gemini-pro",
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
        const requestData = await request.json();
        const { messages } = requestData;
        
        if (!messages || !Array.isArray(messages)) {
          return new Response(JSON.stringify({ error: 'No messages provided' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // 从环境变量获取 API 密钥
        const apiKey = env.GEMINI_API_KEY;
        if (!apiKey) {
          return new Response(JSON.stringify({ error: 'API key not configured' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // 构建提示
        const prompt = messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');

        // 调用 Gemini API
        const geminiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 2048,
              }
            })
          }
        );

        if (!geminiResponse.ok) {
          const errorText = await geminiResponse.text();
          return new Response(JSON.stringify({ 
            error: `Gemini API error: ${geminiResponse.status}` 
          }), {
            status: geminiResponse.status,
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

        // 转换为 OpenAI 格式
        const openAIResponse = {
          id: 'chatcmpl-' + Date.now(),
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: 'gemini-pro',
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

        return new Response(JSON.stringify(openAIResponse), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (error) {
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
